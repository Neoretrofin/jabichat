import NDK, { NDKEvent, NDKKind, NDKUser, giftWrap, giftUnwrap } from '@nostr-dev-kit/ndk'
import { nip19 } from 'nostr-tools'

export function npubToHex(npub: string): string {
  const decoded = nip19.decode(npub)
  if (decoded.type !== 'npub') throw new Error('Not a valid npub')
  return decoded.data as string
}

export function hexToNpub(hex: string): string {
  return nip19.npubEncode(hex)
}

export async function sendDM(ndk: NDK, recipientPubkey: string, text: string): Promise<NDKEvent> {
  const rumor = new NDKEvent(ndk)
  rumor.kind = NDKKind.PrivateDirectMessage
  rumor.content = text
  rumor.tags = [['p', recipientPubkey]]
  rumor.created_at = Math.floor(Date.now() / 1000)

  const recipient = new NDKUser({ pubkey: recipientPubkey })
  const wrapped = await giftWrap(rumor, recipient)
  wrapped.ndk = ndk
  await wrapped.publish()
  return rumor
}

export async function decryptDM(event: NDKEvent): Promise<NDKEvent | null> {
  try {
    return await giftUnwrap(event)
  } catch {
    return null
  }
}

export function peerPubkey(myPubkey: string, event: NDKEvent): string {
  const pTag = event.tags.find((t) => t[0] === 'p' && t[1] !== myPubkey)
  return pTag?.[1] ?? event.pubkey
}
