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
      const store = useChatStore.getState()
      if (store.hasMessage(event.id)) return

      const inner = await decryptDM(event)
      if (!inner || inner.kind !== NDKKind.PrivateDirectMessage) return

      const peer = peerPubkey(myPubkey, inner)

      // Auto-add unknown sender to contacts
      if (!store.contacts[peer]) {
        store.addContact({ pubkey: peer, npub: hexToNpub(peer) })
      }

      const message: Message = {
        id: event.id,
        content: inner.content,
        senderPubkey: inner.pubkey,
        createdAt: inner.created_at ?? Math.floor(Date.now() / 1000),
      }

      const isFromMe = inner.pubkey === myPubkey
      store.addMessage(peer, message, { incrementUnread: !isFromMe })

      // Sound notification only for messages from others into chats we're not viewing
      if (!isFromMe && store.activeChat !== peer) {
        playMessageSound()
      }
    })

    return () => sub.stop()
  }, [ndk, npub, isConnected])
}
