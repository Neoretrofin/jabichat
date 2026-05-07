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
let _audioMixContext: AudioContext | null = null

let _pendingCandidates: RTCIceCandidateInit[] = []
let _remoteDescReady = false

export type RemoteTrackKind = 'voice' | 'video'
export type OnIceCandidate = (candidate: RTCIceCandidateInit) => void
export type OnRemoteTrack = (kind: RemoteTrackKind, stream: MediaStream, track: MediaStreamTrack) => void
export type OnConnectionState = (state: RTCPeerConnectionState) => void

interface AudioConstraints extends MediaTrackConstraints {
  noiseSuppression?: ConstrainBoolean
  echoCancellation?: ConstrainBoolean
  autoGainControl?: ConstrainBoolean
}

function buildAudioConstraints(deviceId: string | null | undefined, noiseSuppression: boolean): AudioConstraints {
  const c: AudioConstraints = {
    echoCancellation: noiseSuppression,
    noiseSuppression: noiseSuppression,
    autoGainControl: noiseSuppression,
  }
  if (deviceId) c.deviceId = { exact: deviceId }
  return c
}

function isAudioTransceiver(t: RTCRtpTransceiver): boolean {
  return t.receiver.track?.kind === 'audio' || t.sender.track?.kind === 'audio'
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
  noiseSuppression: boolean
}): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: buildAudioConstraints(opts.deviceId, opts.noiseSuppression),
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

export async function startScreenShare(opts: {
  onEnded?: () => void
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
      params.encodings[0].maxBitrate = 8_000_000
      params.encodings[0].maxFramerate = 60
      await _videoSender.setParameters(params)
    } catch (e) {
      console.warn('[webrtc] could not raise screen-share bitrate:', e)
    }
  }

  // Always mix screen audio into the existing mic track. Single audio m-line
  // means no SDP renegotiation, no second-transceiver classification edge
  // cases — works the same on PC↔PC and PC↔mobile. Side effect: receiver
  // hears voice + screen audio mixed; cannot adjust them independently.
  let withSystemAudio = false
  if (screenAudio) {
    await mixScreenAudioIntoMic(screenAudio)
    withSystemAudio = !!_audioMixContext
  }

  if (screenVideo && opts.onEnded) {
    screenVideo.addEventListener('ended', opts.onEnded)
  }
  return { stream, withSystemAudio }
}

async function mixScreenAudioIntoMic(screenAudio: MediaStreamTrack): Promise<void> {
  if (!_audioSender || !_micStream) return
  try {
    const ctx = new AudioContext()
    const mic = ctx.createMediaStreamSource(new MediaStream(_micStream.getAudioTracks()))
    const sys = ctx.createMediaStreamSource(new MediaStream([screenAudio]))
    const dest = ctx.createMediaStreamDestination()
    mic.connect(dest)
    sys.connect(dest)
    const mixed = dest.stream.getAudioTracks()[0]
    if (mixed) {
      await _audioSender.replaceTrack(mixed)
      _audioMixContext = ctx
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
    if (_audioSender && _micStream) {
      const micTrack = _micStream.getAudioTracks()[0] ?? null
      await _audioSender.replaceTrack(micTrack)
    }
  }
}

export async function setNoiseSuppression(enabled: boolean): Promise<void> {
  const track = _micStream?.getAudioTracks()[0]
  if (!track) return
  try {
    await track.applyConstraints({
      echoCancellation: enabled,
      noiseSuppression: enabled,
      autoGainControl: enabled,
    } as AudioConstraints)
  } catch (e) {
    console.warn('[webrtc] applyConstraints (NS) failed:', e)
  }
}

export async function setAudioInputDevice(deviceId: string, noiseSuppression: boolean): Promise<void> {
  const newStream = await navigator.mediaDevices.getUserMedia({
    audio: buildAudioConstraints(deviceId, noiseSuppression),
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
  _pc?.close()
  _pc = null
  _micStream = null
  _camStream = null
  _screenStream = null
  _audioSender = null
  _videoSender = null
  _audioMixContext = null
  _pendingCandidates = []
  _remoteDescReady = false
}

export const getPc = () => _pc
export const isScreenSharing = () => _screenStream !== null

export const supportsAudioOutputSelection = (): boolean =>
  typeof HTMLAudioElement !== 'undefined' && 'setSinkId' in HTMLAudioElement.prototype
