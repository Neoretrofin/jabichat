const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
]

// One audio transceiver + one video transceiver by default. Adding a second
// audio transceiver for screen audio is done lazily via `addScreenAudioTrackForRenegotiation`
// and only when both peers self-identify as desktop, since some Android
// Chrome builds break on >1 audio m-line.
let _pc: RTCPeerConnection | null = null
let _audioSender: RTCRtpSender | null = null
let _videoSender: RTCRtpSender | null = null
let _screenAudioSender: RTCRtpSender | null = null

let _micStream: MediaStream | null = null
let _camStream: MediaStream | null = null
let _screenStream: MediaStream | null = null
let _audioMixContext: AudioContext | null = null

let _pendingCandidates: RTCIceCandidateInit[] = []
let _remoteDescReady = false

export type RemoteTrackKind = 'voice' | 'screen-audio' | 'video'
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

// Classify an audio transceiver by its position among audio transceivers.
// First audio = voice (always present); second audio = screen-audio
// (created lazily by renegotiation when both peers are desktop).
function classifyAudio(pc: RTCPeerConnection, transceiver: RTCRtpTransceiver): 'voice' | 'screen-audio' {
  const audios = pc.getTransceivers().filter((t) => isAudioTransceiver(t))
  return audios.indexOf(transceiver) === 0 ? 'voice' : 'screen-audio'
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
  _screenAudioSender = null
  _pendingCandidates = []
  _remoteDescReady = false

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
  _pc = pc

  pc.onicecandidate = (e) => {
    if (e.candidate) onIceCandidate(e.candidate.toJSON())
  }

  pc.ontrack = (e) => {
    if (e.track.kind === 'audio') {
      const kind = classifyAudio(pc, e.transceiver)
      onRemoteTrack(kind, new MediaStream([e.track]), e.track)
    } else if (e.track.kind === 'video') {
      onRemoteTrack('video', new MediaStream([e.track]), e.track)
    }
  }

  pc.onconnectionstatechange = () => {
    onConnectionState(pc.connectionState)
  }

  if (role === 'offerer') {
    pc.addTransceiver('audio', { direction: 'sendrecv' })
    pc.addTransceiver('video', { direction: 'sendrecv' })
    refreshSenders(pc)
  }

  return pc
}

function refreshSenders(pc: RTCPeerConnection): void {
  // Walk transceivers to identify senders by kind + position. The screen-
  // audio sender (if any) is the second audio transceiver.
  const ts = pc.getTransceivers()
  let audioSeen = 0
  _audioSender = null
  _videoSender = null
  _screenAudioSender = null
  for (const t of ts) {
    if (t.direction === 'recvonly') t.direction = 'sendrecv'
    if (isAudioTransceiver(t)) {
      if (audioSeen === 0) _audioSender = t.sender
      else if (audioSeen === 1) _screenAudioSender = t.sender
      audioSeen += 1
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
  /** True when screen audio is sent on a separate transceiver. False = mixed into mic. */
  separateAudioChannel: boolean
  /** When non-null, caller MUST send this offer to the peer via signaling and
   *  apply the answer by calling applyRemoteDescription, to complete renegotiation. */
  renegotiationOffer: RTCSessionDescriptionInit | null
}

export async function startScreenShare(opts: {
  peerIsDesktop: boolean
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

  let withSystemAudio = false
  let separateAudioChannel = false
  let renegotiationOffer: RTCSessionDescriptionInit | null = null

  if (screenAudio) {
    if (opts.peerIsDesktop && _pc) {
      // Desktop ↔ desktop: send screen audio on its own transceiver so the
      // listener can adjust voice and broadcast volume independently.
      try {
        if (!_screenAudioSender) {
          _screenAudioSender = _pc.addTrack(screenAudio, new MediaStream([screenAudio]))
          // addTrack creates a new transceiver — needs SDP renegotiation.
          const offer = await _pc.createOffer()
          await _pc.setLocalDescription(offer)
          renegotiationOffer = offer
        } else {
          await _screenAudioSender.replaceTrack(screenAudio)
        }
        withSystemAudio = true
        separateAudioChannel = true
      } catch (e) {
        console.warn('[webrtc] separate screen-audio channel failed, falling back to mix:', e)
        await mixScreenAudioIntoMic(screenAudio)
        withSystemAudio = !!_audioMixContext
      }
    } else {
      // Mobile peer (or no PC): mix screen audio into mic. Single audio
      // m-line — Android-safe.
      await mixScreenAudioIntoMic(screenAudio)
      withSystemAudio = !!_audioMixContext
    }
  }

  if (screenVideo && opts.onEnded) {
    screenVideo.addEventListener('ended', opts.onEnded)
  }
  return { stream, withSystemAudio, separateAudioChannel, renegotiationOffer }
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
  // Mixed-into-mic case: tear the mix down, restore mic-only audio
  if (_audioMixContext) {
    await _audioMixContext.close().catch(() => {})
    _audioMixContext = null
    if (_audioSender && _micStream) {
      const micTrack = _micStream.getAudioTracks()[0] ?? null
      await _audioSender.replaceTrack(micTrack)
    }
  }
  // Separate-channel case: drop the screen-audio track, keep the
  // transceiver alive so subsequent shares don't need another renegotiation.
  if (_screenAudioSender) {
    await _screenAudioSender.replaceTrack(null)
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

// Used by the answerer side of a renegotiation. Applies the incoming offer,
// produces a matching answer, and returns it for the caller to send.
export async function answerRenegotiation(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit | null> {
  if (!_pc) return null
  await applyRemoteDescription(offer)
  const answer = await _pc.createAnswer()
  await _pc.setLocalDescription(answer)
  return answer
}

export async function addRemoteCandidate(candidate: RTCIceCandidateInit): Promise<void> {
  if (!_pc) return
  if (_remoteDescReady) {
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
  _screenAudioSender = null
  _audioMixContext = null
  _pendingCandidates = []
  _remoteDescReady = false
}

export const getPc = () => _pc
export const isScreenSharing = () => _screenStream !== null

export const supportsAudioOutputSelection = (): boolean =>
  typeof HTMLAudioElement !== 'undefined' && 'setSinkId' in HTMLAudioElement.prototype
