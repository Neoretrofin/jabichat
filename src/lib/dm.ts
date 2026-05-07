import NDK, { NDKEvent, NDKKind, NDKUser, giftWrap, giftUnwrap } from '@nostr-dev-kit/ndk'
import { getEventHash, nip19 } from 'nostr-tools'

export function npubToHex(npub: string): string {
  const decoded = nip19.decode(npub)
  if (decoded.type !== 'npub') throw new Error('Not a valid npub')
  return decoded.data as string
}

export function hexToNpub(hex: string): string {
  return nip19.npubEncode(hex)
}

export interface DMRumor {
  id: string
  pubkey: string
  kind: number
  created_at: number
  tags: string[][]
  content: string
}

// Deterministic rumor id so the optimistic message in ChatPage and the
// self-wrap that comes back through useDMSubscription share the same id —
// hasMessage() then dedups naturally without content-matching heuristics.
export function buildDMRumor(senderPubkey: string, recipientPubkey: string, text: string): DMRumor {
  const created_at = Math.floor(Date.now() / 1000)
  const raw = {
    pubkey: senderPubkey,
    kind: NDKKind.PrivateDirectMessage,
    created_at,
    tags: [['p', recipientPubkey]],
    content: text,
  }
  const id = getEventHash(raw as Parameters<typeof getEventHash>[0])
  return { ...raw, id }
}

// NIP-17 says publish the gift-wrap to BOTH the recipient AND yourself.
// Without the self-wrap, the relay only stores a wrap addressed to the
// recipient, so the sender's `'#p': [me]` subscription on another device
// (or after a relogin) never sees their own outgoing history.
export async function publishDM(
  ndk: NDK,
  recipientPubkey: string,
  rumor: DMRumor
): Promise<void> {
  const rumorEvent = new NDKEvent(ndk, rumor as unknown as ConstructorParameters<typeof NDKEvent>[1])
  const recipient = new NDKUser({ pubkey: recipientPubkey })
  const me = new NDKUser({ pubkey: rumor.pubkey })
  const [wrapForRecipient, wrapForSelf] = await Promise.all([
    giftWrap(rumorEvent, recipient),
    giftWrap(rumorEvent, me),
  ])
  wrapForRecipient.ndk = ndk
  wrapForSelf.ndk = ndk
  await Promise.all([wrapForRecipient.publish(), wrapForSelf.publish()])
}

export async function sendDM(ndk: NDK, recipientPubkey: string, text: string): Promise<DMRumor> {
  const senderPubkey = (await ndk.signer!.user()).pubkey
  const rumor = buildDMRumor(senderPubkey, recipientPubkey, text)
  await publishDM(ndk, recipientPubkey, rumor)
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
