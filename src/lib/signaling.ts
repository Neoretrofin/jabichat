import NDK, { NDKEvent, NDKKind, NDKUser, giftWrap, giftUnwrap } from '@nostr-dev-kit/ndk'
import type { SignalPayload } from '../types/call'

// WebRTC signals ride a NIP-17 gift wrap (kind 1059) with our custom rumor kind.
// Same rail as DMs — relays we already trust deliver these reliably, unlike bare
// ephemeral kinds (25xxx) which many relays silently drop.
export const SIGNAL_RUMOR_KIND = 25050

export async function sendSignal(
  ndk: NDK,
  recipientPubkey: string,
  payload: SignalPayload
): Promise<void> {
  const rumor = new NDKEvent(ndk)
  rumor.kind = SIGNAL_RUMOR_KIND as NDKKind
  rumor.content = JSON.stringify(payload)
  rumor.tags = [['p', recipientPubkey]]
  rumor.created_at = Math.floor(Date.now() / 1000)

  const recipient = new NDKUser({ pubkey: recipientPubkey })
  const wrapped = await giftWrap(rumor, recipient)
  wrapped.ndk = ndk

  console.log('[signal] publish', payload.type, '→', recipientPubkey.slice(0, 12), 'wrapId=', wrapped.id?.slice(0, 12))
  const relays = await wrapped.publish()
  console.log('[signal] publish ack from', relays.size, 'relay(s)')
  if (relays.size === 0) {
    console.warn('[signal] WARNING: no relays accepted the publish — peer will not receive it')
  }
}

export interface DecryptedSignal {
  payload: SignalPayload
  senderPubkey: string
  createdAt: number
}

export async function decryptSignal(event: NDKEvent): Promise<DecryptedSignal | null> {
  try {
    const inner = await giftUnwrap(event)
    if (!inner || inner.kind !== SIGNAL_RUMOR_KIND) return null
    const payload = JSON.parse(inner.content) as SignalPayload
    return {
      payload,
      senderPubkey: inner.pubkey,
      createdAt: inner.created_at ?? Math.floor(Date.now() / 1000),
    }
  } catch (e) {
    // Most decrypt failures are gift-wraps for OTHER subscribers (not us) —
    // the relay matched #p but our key can't decrypt. That's normal noise.
    // Real failures (malformed events) will be caught below.
    if (e && typeof e === 'object' && 'message' in e && !String((e as Error).message).includes('decrypt')) {
      console.error('[signal] decryptSignal:', e)
    }
    return null
  }
}
