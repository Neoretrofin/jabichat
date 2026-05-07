import { useEffect } from 'react'
import { NDKKind } from '@nostr-dev-kit/ndk'
import { useNostrStore } from '../store/nostrStore'
import { useCallStore } from '../store/callStore'
import { decryptSignal, sendSignal } from '../lib/signaling'
import {
  applyRemoteDescription,
  addRemoteCandidate,
  cleanup,
  answerRenegotiation,
} from '../lib/webrtc'
import { startRingtone, stopRingtone } from '../lib/sound'
import { npubToHex } from '../lib/dm'

const MAX_SIGNAL_AGE_S = 600

export function useSignaling() {
  const { ndk, npub, isConnected } = useNostrStore()
  const ringingStatus = useCallStore((s) => s.status)

  useEffect(() => {
    if (ringingStatus === 'ringing') startRingtone()
    else stopRingtone()
  }, [ringingStatus])

  useEffect(() => {
    if (!ndk || !npub || !isConnected) return

    const myPubkey = npubToHex(npub)
    const since = Math.floor(Date.now() / 1000) - 7 * 24 * 3600

    console.log('[signal] subscribing as', myPubkey.slice(0, 12), 'since', new Date(since * 1000).toISOString())

    const sub = ndk.subscribe(
      { kinds: [NDKKind.GiftWrap as number], '#p': [myPubkey], since },
      { closeOnEose: false }
    )

    sub.on('eose', () => {
      console.log('[signal] EOSE — live mode')
    })

    sub.on('event', async (event) => {
      console.log('[signal] gift-wrap arrived id=', event.id?.slice(0, 12))
      const result = await decryptSignal(event)
      if (!result) return

      const ageS = Math.abs(Math.floor(Date.now() / 1000) - result.createdAt)
      if (ageS > MAX_SIGNAL_AGE_S) {
        console.log('[signal] dropping stale', result.payload.type, 'age=', ageS, 's')
        return
      }

      const { payload, senderPubkey } = result
      const store = useCallStore.getState()

      console.log('[signal] →', payload.type, 'from', senderPubkey.slice(0, 12), 'callId=', payload.callId.slice(0, 16))

      switch (payload.type) {
        case 'call-offer': {
          if (store.status !== 'idle' && store.status !== 'ended') {
            console.log('[signal] busy, rejecting offer')
            await sendSignal(ndk, senderPubkey, {
              type: 'call-reject',
              callId: payload.callId,
            }).catch(() => {})
            return
          }
          console.log('[signal] ringing — opening incoming call modal')
          store.setIncoming(senderPubkey, payload.callId, payload.data as RTCSessionDescriptionInit)
          // Stash peer's platform — controller decides about multi-track audio later.
          store.setPeerIsMobile(payload.mobile === true)
          break
        }

        case 'call-answer': {
          if (store.callId !== payload.callId) return
          await applyRemoteDescription(payload.data as RTCSessionDescriptionInit)
          store.setStatus('connected')
          store.setPeerIsMobile(payload.mobile === true)
          break
        }

        case 'sdp-offer': {
          // Mid-call renegotiation initiated by the peer (e.g. they added a
          // screen-audio transceiver). Apply, answer, send back.
          if (store.callId !== payload.callId) return
          const answer = await answerRenegotiation(payload.data as RTCSessionDescriptionInit)
          if (answer) {
            await sendSignal(ndk, senderPubkey, {
              type: 'sdp-answer',
              callId: payload.callId,
              data: answer,
            }).catch(() => {})
          }
          break
        }

        case 'sdp-answer': {
          if (store.callId !== payload.callId) return
          await applyRemoteDescription(payload.data as RTCSessionDescriptionInit)
          break
        }

        case 'ice-candidate': {
          if (store.callId !== payload.callId) return
          await addRemoteCandidate(payload.data as RTCIceCandidateInit)
          break
        }

        case 'call-end':
        case 'call-reject': {
          if (store.callId !== payload.callId) return
          stopRingtone()
          cleanup()
          store.reset()
          break
        }
      }
    })

    return () => {
      console.log('[signal] unsubscribing')
      sub.stop()
    }
  }, [ndk, npub, isConnected])
}
