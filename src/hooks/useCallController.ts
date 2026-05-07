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
  type RemoteTrackKind,
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
  const noiseSuppression = useDeviceStore((s) => s.noiseSuppression)
  const hangup = useHangup()

  const setupKey = useRef<string | null>(null)

  useEffect(() => {
    if (status === 'idle' || status === 'ended') {
      setupKey.current = null
    }
  }, [status])

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

        const micStream = await acquireMic({
          deviceId: audioInputId,
          noiseSuppression,
        })
        if (cancelled) return
        useCallStore.getState().setMicStream(micStream)

        if (role === 'offerer') {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          if (cancelled) return
          await sendSignal(ndk!, peerPubkey!, {
            type: 'call-offer',
            callId: callId!,
            data: offer,
          })
        } else {
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          if (cancelled) return
          await sendSignal(ndk!, peerPubkey!, {
            type: 'call-answer',
            callId: callId!,
            data: answer,
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
  }, [ndk, callId, status, peerPubkey, pendingOffer, audioInputId, noiseSuppression])

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
