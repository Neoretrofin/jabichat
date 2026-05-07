import { useEffect } from 'react'
import { NDKKind } from '@nostr-dev-kit/ndk'
import { useNostrStore } from '../store/nostrStore'
import { useCallStore } from '../store/callStore'
import { decryptSignal, sendSignal } from '../lib/signaling'
import {
  applyRemoteDescription,
  addRemoteCandidate,
  cleanup,
} from '../lib/webrtc'
import { startRingtone, stopRingtone } from '../lib/sound'
import { npubToHex } from '../lib/dm'

// Anything older than 30 s is treated as a phantom replay. Calls and ICE
// candidates are inherently fresh — if the inner rumor's created_at is
// further in the past, the relay is replaying old gift-wraps from when
// the user last connected. NIP-17 randomizes the OUTER created_at for
// privacy, so we filter on the inner rumor timestamp.
const MAX_SIGNAL_AGE_S = 30

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
    // Relays return outer gift-wraps whose created_at is randomized up to
    // ~2 days in the past, so we can't tighten `since` past that without
    // missing live signals. The strict age filter on the inner rumor below
    // is what actually rejects replays.
    const since = Math.floor(Date.now() / 1000) - 2 * 24 * 3600

    // Same gift-wrap can be delivered by multiple relays — dedupe by event id.
    // (Event id is a hash, identical across relays for the same signal.)
    const seen = new Set<string>()

    console.log('[signal] subscribing as', myPubkey.slice(0, 12), 'since', new Date(since * 1000).toISOString())

    const sub = ndk.subscribe(
      { kinds: [NDKKind.GiftWrap as number], '#p': [myPubkey], since },
      { closeOnEose: false }
    )

    sub.on('eose', () => {
      console.log('[signal] EOSE — live mode')
    })

    sub.on('event', async (event) => {
      if (event.id) {
        if (seen.has(event.id)) return
        seen.add(event.id)
      }
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
          break
        }

        case 'call-answer': {
          if (store.callId !== payload.callId) return
          await applyRemoteDescription(payload.data as RTCSessionDescriptionInit)
          store.setStatus('connected')
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
