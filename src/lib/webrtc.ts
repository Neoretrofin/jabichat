// STUN alone is not enough for mobile carrier NAT (CGNAT) or strict
// corporate firewalls — peers can complete DTLS but media RTP gets dropped.
// openrelay.metered.ca is a free public TURN service (UDP+TCP+TLS variants);
// no API key required.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

// Single audio + single video transceiver for the entire call. Screen audio
// is mixed into the mic track at the Web Audio layer on the sender side, so
// the SDP shape never changes after the initial offer/answer. This avoids
// SDP renegotiation entirely — Android Chrome and some desktop builds had
// trouble carrying media on a second audio m-line added mid-call.
let _pc: RTCPeerConnection | null = null
let _audioSender: RTCRtpSender | null = null
let _videoSender: RTCRtpSender | null = null

let _micStream: MediaStream | null = null
let _camStream: MediaStream | null = null
let _screenStream: MediaStream | null = null

// Mix pipeline:  [mic] → [voiceGain] ─┐
//                                      ├→ [destination] → audio sender
//                [sys] → [screenGain] ─┘
// Built lazily when the local user starts a screen share (with audio); torn
// down when the share ends. Outside screen share, the raw mic track is sent
// directly — no Web Audio overhead. Voice/screen gains are therefore only
// adjustable while screen share is active, which matches the movie-watching
// use case the feature was designed for.
let _audioMixContext: AudioContext | null = null
let _voiceGainNode: GainNode | null = null
let _screenGainNode: GainNode | null = null

// DataChannel "media-control" carries Remote Volume Control commands and the
// screen-audio-active signal. Created by the offerer alongside the offer so
// the answerer receives it from the very first SDP — no renegotiation. Lives
// for the duration of the call; new call → new channel.
let _dataChannel: RTCDataChannel | null = null
let _onMediaControl: OnMediaControl | null = null

let _pendingCandidates: RTCIceCandidateInit[] = []
let _remoteDescReady = false

export type RemoteTrackKind = 'voice' | 'video'
export type OnIceCandidate = (candidate: RTCIceCandidateInit) => void
export type OnRemoteTrack = (kind: RemoteTrackKind, stream: MediaStream, track: MediaStreamTrack) => void
export type OnConnectionState = (state: RTCPeerConnectionState) => void

export type MediaControlMsg =
  | { type: 'hello'; features: string[] }
  | { type: 'screen-audio'; active: boolean }
  | { type: 'set-voice-gain'; value: number }
  | { type: 'set-screen-gain'; value: number }

export type OnMediaControl = (msg: MediaControlMsg) => void

const MEDIA_CONTROL_FEATURES = ['remote-volume', 'screen-audio-signal']

interface AudioConstraints extends MediaTrackConstraints {
  noiseSuppression?: ConstrainBoolean
  echoCancellation?: ConstrainBoolean
  autoGainControl?: ConstrainBoolean
}

// Echo cancellation is non-optional — without it the caller hears themselves
// looped through the receiver's speakers. Noise suppression and AGC ride on
// top because browser implementations bundle them; toggling them off does
// nothing useful in practice and confuses users.
function buildAudioConstraints(deviceId: string | null | undefined): AudioConstraints {
  const c: AudioConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  }
  if (deviceId) c.deviceId = { exact: deviceId }
  return c
}

function isAudioTransceiver(t: RTCRtpTransceiver): boolean {
  return t.receiver.track?.kind === 'audio' || t.sender.track?.kind === 'audio'
}

export function setMediaControlHandler(handler: OnMediaControl | null): void {
  _onMediaControl = handler
}

function parseMediaControlMsg(data: unknown): MediaControlMsg | null {
  if (typeof data !== 'string') return null
  try {
    return JSON.parse(data) as MediaControlMsg
  } catch {
    return null
  }
}

function attachDataChannel(dc: RTCDataChannel): void {
  _dataChannel = dc
  dc.onopen = () => {
    try {
      const hello: MediaControlMsg = { type: 'hello', features: MEDIA_CONTROL_FEATURES }
      dc.send(JSON.stringify(hello))
    } catch (e) {
      console.warn('[webrtc] datachannel hello failed:', e)
    }
  }
  dc.onmessage = (e) => {
    const msg = parseMediaControlMsg(e.data)
    if (!msg) return
    // Apply gain locally if it's for us (we are the sender being told to
    // adjust). Then notify the controller for UI/store side effects.
    if (msg.type === 'set-voice-gain') {
      applyLocalVoiceGain(msg.value)
    } else if (msg.type === 'set-screen-gain') {
      applyLocalScreenGain(msg.value)
    }
    _onMediaControl?.(msg)
  }
  dc.onerror = (e) => console.warn('[webrtc] datachannel error:', e)
  dc.onclose = () => { /* expected on hangup */ }
}

export function sendMediaControl(msg: MediaControlMsg): void {
  const dc = _dataChannel
  if (!dc || dc.readyState !== 'open') return
  try {
    dc.send(JSON.stringify(msg))
  } catch (e) {
    console.warn('[webrtc] sendMediaControl failed:', e)
  }
}

function clampGain(v: number): number {
  if (!Number.isFinite(v)) return 1
  if (v < 0) return 0
  if (v > 2) return 2
  return v
}

function applyLocalVoiceGain(value: number): void {
  if (_voiceGainNode) _voiceGainNode.gain.value = clampGain(value)
}

function applyLocalScreenGain(value: number): void {
  if (_screenGainNode) _screenGainNode.gain.value = clampGain(value)
}

export function createPeerConnection(
  role: 'offerer' | 'answerer',
  onIceCandidate: OnIceCandidate,
  onRemoteTrack: OnRemoteTrack,
  onConnectionState: OnConnectionState
): RTCPeerConnection {
  if (_pc) {
    _pc.close()
  }
  _audioSender = null
  _videoSender = null
  _dataChannel = null
  // Keep _pendingCandidates intact: when answering, ICE candidates from the
  // peer may have arrived while we were still in 'ringing' (no pc yet).
  // Dropping them here was the cause of phone→PC calls hanging on 'checking'.
  _remoteDescReady = false

  const pc = new RTCPeerConnection({
    iceServers: ICE_SERVERS,
    // max-bundle keeps every m-line on a single ICE/DTLS transport — fewer
    // NAT pinholes, less to fail across phone↔PC.
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  })
  _pc = pc

  pc.onicecandidate = (e) => {
    if (e.candidate) onIceCandidate(e.candidate.toJSON())
  }

  pc.ontrack = (e) => {
    if (e.track.kind === 'audio') {
      onRemoteTrack('voice', new MediaStream([e.track]), e.track)
    } else if (e.track.kind === 'video') {
      onRemoteTrack('video', new MediaStream([e.track]), e.track)
    }
  }

  pc.onconnectionstatechange = () => {
    console.log('[webrtc] connectionState=', pc.connectionState)
    onConnectionState(pc.connectionState)
  }

  pc.oniceconnectionstatechange = () => {
    console.log('[webrtc] iceConnectionState=', pc.iceConnectionState)
  }

  if (role === 'offerer') {
    pc.addTransceiver('audio', { direction: 'sendrecv' })
    pc.addTransceiver('video', { direction: 'sendrecv' })
    refreshSenders(pc)
    // Create the media-control DataChannel BEFORE createOffer so the channel
    // appears in the SDP and the answerer receives it via ondatachannel.
    const dc = pc.createDataChannel('media-control', { ordered: true })
    attachDataChannel(dc)
  } else {
    pc.ondatachannel = (event) => {
      if (event.channel.label === 'media-control') {
        attachDataChannel(event.channel)
      }
    }
  }

  return pc
}

function refreshSenders(pc: RTCPeerConnection): void {
  const ts = pc.getTransceivers()
  _audioSender = null
  _videoSender = null
  for (const t of ts) {
    if (t.direction === 'recvonly' || t.direction === 'inactive') t.direction = 'sendrecv'
    if (isAudioTransceiver(t)) {
      if (!_audioSender) _audioSender = t.sender
    } else if (t.receiver.track?.kind === 'video' || t.sender.track?.kind === 'video') {
      if (!_videoSender) _videoSender = t.sender
    }
  }
}

export async function acquireMic(opts: {
  deviceId?: string | null
}): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: buildAudioConstraints(opts.deviceId),
  })
  _micStream = stream
  const track = stream.getAudioTracks()[0]
  if (_audioSender && track) {
    await _audioSender.replaceTrack(track)
  }
  return stream
}

export async function enableCamera(deviceId?: string | null): Promise<MediaStream> {
  if (_camStream) return _camStream
  const video: MediaTrackConstraints = { width: 1280, height: 720 }
  if (deviceId) video.deviceId = { exact: deviceId }
  else video.facingMode = 'user'
  const stream = await navigator.mediaDevices.getUserMedia({ video })
  _camStream = stream
  const track = stream.getVideoTracks()[0]
  if (_videoSender && !_screenStream && track) {
    await _videoSender.replaceTrack(track)
  }
  return stream
}

export async function disableCamera(): Promise<void> {
  _camStream?.getTracks().forEach((t) => t.stop())
  _camStream = null
  if (_videoSender && !_screenStream) {
    await _videoSender.replaceTrack(null)
  }
}

export interface ScreenShareResult {
  stream: MediaStream
  withSystemAudio: boolean
}

// Default cap when caller passes no preference. 15 Mbps gives near-source
// quality for 1080p60 screen content with strong diminishing returns above —
// users with weak receivers are auto-throttled by Google Congestion Control.
const DEFAULT_SCREEN_BITRATE = 15_000_000

export async function startScreenShare(opts: {
  onEnded?: () => void
  /** Encoder max bitrate ceiling in bits/s. WebRTC adapts down on
   *  congestion; this is a ceiling, not a floor. */
  bitrate?: number
}): Promise<ScreenShareResult> {
  const dmOpts = {
    video: {
      displaySurface: 'monitor' as const,
      frameRate: { ideal: 60 },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: { suppressLocalAudioPlayback: false },
    systemAudio: 'include' as const,
    selfBrowserSurface: 'exclude' as const,
    surfaceSwitching: 'include' as const,
  } as DisplayMediaStreamOptions
  const stream = await navigator.mediaDevices.getDisplayMedia(dmOpts)
  _screenStream = stream

  const screenVideo = stream.getVideoTracks()[0]
  const screenAudio = stream.getAudioTracks()[0]

  if (_videoSender && screenVideo) {
    await _videoSender.replaceTrack(screenVideo)
    try {
      const params = _videoSender.getParameters()
      if (!params.encodings) params.encodings = [{}]
      params.encodings[0].maxBitrate = opts.bitrate ?? DEFAULT_SCREEN_BITRATE
      params.encodings[0].maxFramerate = 60
      await _videoSender.setParameters(params)
    } catch (e) {
      console.warn('[webrtc] could not raise screen-share bitrate:', e)
    }
  }

  // Always mix screen audio into the existing mic track. Single audio m-line
  // means no SDP renegotiation, no second-transceiver classification edge
  // cases — works the same on PC↔PC and PC↔mobile. Side effect: receiver
  // hears voice + screen audio mixed; cannot adjust them independently from
  // their side without our Remote Volume Control DataChannel protocol.
  let withSystemAudio = false
  if (screenAudio) {
    await mixScreenAudioIntoMic(screenAudio)
    withSystemAudio = !!_audioMixContext
  }

  // Tell the peer whether this share carries audio so they can show/hide
  // the screen-audio volume slider. We send even when no audio (active:false)
  // so the receiver clears any stale state.
  sendMediaControl({ type: 'screen-audio', active: withSystemAudio })

  if (screenVideo && opts.onEnded) {
    screenVideo.addEventListener('ended', opts.onEnded)
  }
  return { stream, withSystemAudio }
}

/**
 * Adjust the screen-share encoder's max bitrate on the fly. No-op if we're
 * not currently sharing a screen (cam stream uses its own implicit ceiling).
 * Lets the user re-pick a quality preset mid-share without restarting.
 */
export async function updateScreenShareBitrate(bitrate: number): Promise<void> {
  if (!_videoSender || !_screenStream) return
  try {
    const params = _videoSender.getParameters()
    if (!params.encodings) params.encodings = [{}]
    params.encodings[0].maxBitrate = bitrate
    params.encodings[0].maxFramerate = 60
    await _videoSender.setParameters(params)
  } catch (e) {
    console.warn('[webrtc] updateScreenShareBitrate failed:', e)
  }
}

async function mixScreenAudioIntoMic(screenAudio: MediaStreamTrack): Promise<void> {
  if (!_audioSender || !_micStream) return
  try {
    const ctx = new AudioContext()
    const mic = ctx.createMediaStreamSource(new MediaStream(_micStream.getAudioTracks()))
    const sys = ctx.createMediaStreamSource(new MediaStream([screenAudio]))
    const voiceGain = ctx.createGain()
    const screenGain = ctx.createGain()
    voiceGain.gain.value = 1
    screenGain.gain.value = 1
    const dest = ctx.createMediaStreamDestination()
    mic.connect(voiceGain).connect(dest)
    sys.connect(screenGain).connect(dest)
    const mixed = dest.stream.getAudioTracks()[0]
    if (mixed) {
      await _audioSender.replaceTrack(mixed)
      _audioMixContext = ctx
      _voiceGainNode = voiceGain
      _screenGainNode = screenGain
    } else {
      await ctx.close().catch(() => {})
    }
  } catch (e) {
    console.warn('[webrtc] audio mix failed, sending mic only:', e)
  }
}

export async function stopScreenShare(): Promise<void> {
  if (_screenStream) {
    _screenStream.getTracks().forEach((t) => t.stop())
    _screenStream = null
  }
  if (_videoSender) {
    const camTrack = _camStream?.getVideoTracks()[0] ?? null
    await _videoSender.replaceTrack(camTrack)
    try {
      const params = _videoSender.getParameters()
      if (params.encodings?.[0]) {
        delete params.encodings[0].maxBitrate
        delete params.encodings[0].maxFramerate
        await _videoSender.setParameters(params)
      }
    } catch { /* ignore */ }
  }
  // Tear the mix down, restore mic-only audio on the existing audio sender.
  if (_audioMixContext) {
    await _audioMixContext.close().catch(() => {})
    _audioMixContext = null
    _voiceGainNode = null
    _screenGainNode = null
    if (_audioSender && _micStream) {
      const micTrack = _micStream.getAudioTracks()[0] ?? null
      await _audioSender.replaceTrack(micTrack)
    }
  }
  sendMediaControl({ type: 'screen-audio', active: false })
}

export async function setAudioInputDevice(deviceId: string): Promise<void> {
  const newStream = await navigator.mediaDevices.getUserMedia({
    audio: buildAudioConstraints(deviceId),
  })
  const newTrack = newStream.getAudioTracks()[0]
  if (!newTrack) return
  const wasEnabled = _micStream?.getAudioTracks()[0]?.enabled ?? true
  newTrack.enabled = wasEnabled
  if (!_audioMixContext && _audioSender) {
    await _audioSender.replaceTrack(newTrack)
  }
  if (_micStream) {
    _micStream.getAudioTracks().forEach((t) => {
      _micStream!.removeTrack(t)
      t.stop()
    })
    _micStream.addTrack(newTrack)
  } else {
    _micStream = newStream
  }
}

export async function setVideoInputDevice(deviceId: string): Promise<void> {
  if (!_camStream) return
  const newStream = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: deviceId }, width: 1280, height: 720 },
  })
  const newTrack = newStream.getVideoTracks()[0]
  if (!newTrack) return
  if (_videoSender && !_screenStream) {
    await _videoSender.replaceTrack(newTrack)
  }
  _camStream.getVideoTracks().forEach((t) => {
    _camStream!.removeTrack(t)
    t.stop()
  })
  _camStream.addTrack(newTrack)
}

/**
 * Patch the Opus fmtp parameters in an SDP so the encoder runs in hi-fi
 * (stereo, 128 kbps, no DTX, CBR, full 48 kHz playback) instead of the
 * default voice-call config (mono, ~32 kbps, DTX on). Required to make
 * screen-share audio sound like music rather than a phone call.
 *
 * fmtp parameters are descriptive of the side that emitted them — they
 * tell the OTHER side how to configure ITS encoder. So both offer and
 * answer SDPs must be patched for hi-fi to work in both directions.
 *
 * Idempotent. No-op if the SDP has no Opus m-line.
 */
export function enhanceOpusSdp(sdp: string): string {
  if (!sdp) return sdp
  const overrides: Record<string, string> = {
    'stereo': '1',
    'sprop-stereo': '1',
    'maxaveragebitrate': '128000',
    'maxplaybackrate': '48000',
    'useinbandfec': '1',
    'usedtx': '0',
    'cbr': '1',
  }

  const lines = sdp.split(/\r?\n/)

  // Find Opus payload types (there can be more than one in theory).
  const opusPts: string[] = []
  for (const line of lines) {
    const m = line.match(/^a=rtpmap:(\d+) opus\/48000\/2/i)
    if (m) opusPts.push(m[1])
  }
  if (opusPts.length === 0) return sdp

  const parseFmtp = (s: string): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const part of s.split(/;\s*/)) {
      const eq = part.indexOf('=')
      if (eq > 0) out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim()
    }
    return out
  }
  const formatFmtp = (params: Record<string, string>): string =>
    Object.entries(params).map(([k, v]) => `${k}=${v}`).join(';')

  // Walk: rewrite existing fmtp lines for Opus PTs, track which were seen.
  const seenFmtp = new Set<string>()
  const rewritten = lines.map((line) => {
    for (const pt of opusPts) {
      const m = line.match(new RegExp(`^a=fmtp:${pt} (.*)$`))
      if (m) {
        const merged = { ...parseFmtp(m[1]), ...overrides }
        seenFmtp.add(pt)
        return `a=fmtp:${pt} ${formatFmtp(merged)}`
      }
    }
    return line
  })

  // For any Opus PT that lacked an fmtp line, insert one right after its
  // rtpmap. Walk back-to-front so indices remain stable.
  const result = [...rewritten]
  for (const pt of opusPts) {
    if (seenFmtp.has(pt)) continue
    const idx = result.findIndex((l) => l.startsWith(`a=rtpmap:${pt} `))
    if (idx >= 0) {
      result.splice(idx + 1, 0, `a=fmtp:${pt} ${formatFmtp(overrides)}`)
    }
  }

  return result.join('\r\n')
}

export async function applyRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
  if (!_pc) return
  await _pc.setRemoteDescription(new RTCSessionDescription(desc))
  refreshSenders(_pc)
  _remoteDescReady = true
  for (const c of _pendingCandidates) {
    try { await _pc.addIceCandidate(new RTCIceCandidate(c)) } catch { /* ignore */ }
  }
  _pendingCandidates = []
}

export async function addRemoteCandidate(candidate: RTCIceCandidateInit): Promise<void> {
  // Buffer until pc exists AND remote description is set. The pc may still be
  // null on the answerer side while the user hasn't pressed Accept yet — those
  // candidates must be kept, not dropped, or trickle ICE never converges.
  if (_pc && _remoteDescReady) {
    try { await _pc.addIceCandidate(new RTCIceCandidate(candidate)) } catch { /* ignore */ }
  } else {
    _pendingCandidates.push(candidate)
  }
}

export function cleanup(): void {
  _micStream?.getTracks().forEach((t) => t.stop())
  _camStream?.getTracks().forEach((t) => t.stop())
  _screenStream?.getTracks().forEach((t) => t.stop())
  _audioMixContext?.close().catch(() => {})
  if (_dataChannel) {
    try { _dataChannel.close() } catch { /* ignore */ }
  }
  _pc?.close()
  _pc = null
  _micStream = null
  _camStream = null
  _screenStream = null
  _audioSender = null
  _videoSender = null
  _audioMixContext = null
  _voiceGainNode = null
  _screenGainNode = null
  _dataChannel = null
  // Intentionally NOT touching _onMediaControl — its lifecycle is owned by
  // useCallController (mounted in Layout, lives across calls). Clearing it
  // here would silently break the handshake on the second call.
  _pendingCandidates = []
  _remoteDescReady = false
}

export const getPc = () => _pc
export const isScreenSharing = () => _screenStream !== null

export const supportsAudioOutputSelection = (): boolean =>
  typeof HTMLAudioElement !== 'undefined' && 'setSinkId' in HTMLAudioElement.prototype
