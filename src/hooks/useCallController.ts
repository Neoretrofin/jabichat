import { useEffect, useRef } from 'react'
import { useCallStore } from '../store/callStore'
import { useNostrStore } from '../store/nostrStore'
import { useDeviceStore } from '../store/deviceStore'
import { sendSignal } from '../lib/signaling'
import {
  acquireMic,
  applyRemoteDescription,
  createPeerConnection,
  cleanup,
  enhanceOpusSdp,
  setMediaControlHandler,
  type RemoteTrackKind,
  type MediaControlMsg,
} from '../lib/webrtc'
import { useHangup } from './useHangup'

const NO_ANSWER_TIMEOUT_MS = 30000

export function useCallController() {
  const { ndk } = useNostrStore()
  const status = useCallStore((s) => s.status)
  const callId = useCallStore((s) => s.callId)
  const peerPubkey = useCallStore((s) => s.peerPubkey)
  const pendingOffer = useCallStore((s) => s.pendingOffer)
  const audioInputId = useDeviceStore((s) => s.audioInputId)
  const hangup = useHangup()

  const setupKey = useRef<string | null>(null)

  useEffect(() => {
    if (status === 'idle' || status === 'ended') {
      setupKey.current = null
    }
  }, [status])

  // Bridge DataChannel media-control messages into callStore. Registered
  // once for the lifetime of the controller (mounted in Layout for the whole
  // app) — must NOT live inside the call-setup effect, because that effect
  // re-runs whenever any of its deps change. The handler captures a closure;
  // a cleanup that sets cancelled=true on an old closure combined with the
  // setupKey early-return would leave a permanently dead handler installed.
  useEffect(() => {
    setMediaControlHandler((msg: MediaControlMsg) => {
      const cs = useCallStore.getState()
      if (msg.type === 'hello') {
        cs.setPeerSupportsMediaControl(msg.features.includes('remote-volume'))
      } else if (msg.type === 'screen-audio') {
        cs.setPeerScreenAudioActive(msg.active)
        // When the peer stops their screen share, our cached gain for it
        // becomes stale — reset so the slider returns to neutral if/when
        // they share again.
        if (!msg.active) cs.setPeerScreenGain(1)
      }
      // set-*-gain messages are for the SENDER end (their own gain) and are
      // applied directly inside webrtc.ts. Nothing to do here.
    })
    return () => setMediaControlHandler(null)
  }, [])

  useEffect(() => {
    if (!ndk || !callId || !peerPubkey) return
    if (status !== 'calling' && status !== 'accepting') return
    if (setupKey.current === callId) return
    setupKey.current = callId

    let cancelled = false
    const role: 'offerer' | 'answerer' = status === 'calling' ? 'offerer' : 'answerer'

    async function setup() {
      try {
        const onRemoteTrack = (kind: RemoteTrackKind, stream: MediaStream, track: MediaStreamTrack) => {
          if (cancelled) return
          const cs = useCallStore.getState()
          if (kind === 'voice') {
            cs.setRemoteAudio(stream)
          } else if (kind === 'video') {
            cs.setRemoteVideo(stream)
            cs.setRemoteVideoActive(!track.muted)
            track.onmute = () => useCallStore.getState().setRemoteVideoActive(false)
            track.onunmute = () => useCallStore.getState().setRemoteVideoActive(true)
          }
        }

        const pc = createPeerConnection(
          role,
          (candidate) => {
            if (cancelled) return
            sendSignal(ndk!, peerPubkey!, {
              type: 'ice-candidate',
              callId: callId!,
              data: candidate,
            }).catch(() => {})
          },
          onRemoteTrack,
          (state) => {
            if (cancelled) return
            const cs = useCallStore.getState()
            if (state === 'connected') {
              cs.setStatus('connected')
            } else if (state === 'disconnected' || state === 'failed') {
              cleanup()
              cs.reset()
            }
          }
        )

        if (role === 'answerer' && pendingOffer) {
          await applyRemoteDescription(pendingOffer)
        }

        const micStream = await acquireMic({ deviceId: audioInputId })
        if (cancelled) return
        useCallStore.getState().setMicStream(micStream)

        if (role === 'offerer') {
          const offer = await pc.createOffer()
          // Patch Opus fmtp to hi-fi BEFORE setLocalDescription so the local
          // encoder and the peer both see the same negotiated parameters.
          const enhanced: RTCSessionDescriptionInit = {
            type: offer.type,
            sdp: enhanceOpusSdp(offer.sdp ?? ''),
          }
          await pc.setLocalDescription(enhanced)
          if (cancelled) return
          await sendSignal(ndk!, peerPubkey!, {
            type: 'call-offer',
            callId: callId!,
            data: enhanced,
          })
        } else {
          const answer = await pc.createAnswer()
          const enhanced: RTCSessionDescriptionInit = {
            type: answer.type,
            sdp: enhanceOpusSdp(answer.sdp ?? ''),
          }
          await pc.setLocalDescription(enhanced)
          if (cancelled) return
          await sendSignal(ndk!, peerPubkey!, {
            type: 'call-answer',
            callId: callId!,
            data: enhanced,
          })
          useCallStore.getState().setStatus('connected')
        }
      } catch (err) {
        if (cancelled) return
        console.error('Call setup error:', err)
        const msg =
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Нет доступа к микрофону'
            : 'Ошибка соединения'
        useCallStore.getState().setError(msg)
      }
    }

    setup()

    return () => {
      cancelled = true
    }
  }, [ndk, callId, status, peerPubkey, pendingOffer, audioInputId])

  useEffect(() => {
    if (status !== 'calling') return
    const t = window.setTimeout(() => {
      const cs = useCallStore.getState()
      if (cs.status === 'calling') {
        cs.setError('Жабка не отвечает')
        hangup()
      }
    }, NO_ANSWER_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [status, hangup])
}
