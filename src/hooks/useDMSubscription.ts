import { useEffect } from 'react'
import { NDKKind } from '@nostr-dev-kit/ndk'
import { useNostrStore } from '../store/nostrStore'
import { useChatStore } from '../store/chatStore'
import { decryptDM, peerPubkey, hexToNpub, npubToHex } from '../lib/dm'
import { playMessageSound } from '../lib/sound'
import type { Message } from '../types/chat'

export function useDMSubscription() {
  const { ndk, npub, isConnected } = useNostrStore()

  useEffect(() => {
    if (!ndk || !npub || !isConnected) return

    const myPubkey = npubToHex(npub)
    const since = Math.floor(Date.now() / 1000) - 30 * 24 * 3600

    const sub = ndk.subscribe(
      { kinds: [NDKKind.GiftWrap as number], '#p': [myPubkey], since },
      { closeOnEose: false }
    )

    sub.on('event', async (event) => {
      const inner = await decryptDM(event)
      if (!inner || inner.kind !== NDKKind.PrivateDirectMessage) return

      // Use the inner rumor id (deterministic from rumor fields), not the outer
      // gift-wrap id — same message via self-wrap + recipient-wrap shares the
      // same id, so `hasMessage` and the optimistic-add path agree.
      const messageId = inner.id ?? event.id
      if (!messageId) return

      const store = useChatStore.getState()
      if (store.hasMessage(messageId)) return

      const peer = peerPubkey(myPubkey, inner)
      const createdAt = inner.created_at ?? Math.floor(Date.now() / 1000)

      // If the user deleted this chat, drop relay replays of old messages
      // from before the deletion. Fresh messages still come through and
      // re-create the contact.
      if (store.isDeletedBefore(peer, createdAt)) return

      // Auto-add unknown peer (sender of incoming, or recipient of own self-wrap)
      if (!store.contacts[peer]) {
        store.addContact({ pubkey: peer, npub: hexToNpub(peer) })
      }

      const replyToId = inner.tags.find(
        (t: string[]) => t[0] === 'e' && t[3] === 'reply'
      )?.[1]

      const message: Message = {
        id: messageId,
        content: inner.content,
        senderPubkey: inner.pubkey,
        createdAt,
        ...(replyToId ? { replyToId } : {}),
      }

      const isFromMe = inner.pubkey === myPubkey
      store.addMessage(peer, message, { incrementUnread: !isFromMe })

      if (!isFromMe && store.activeChat !== peer) {
        playMessageSound()
      }
    })

    return () => sub.stop()
  }, [ndk, npub, isConnected])
}
