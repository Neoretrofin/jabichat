import { useEffect } from 'react'
import { NDKKind } from '@nostr-dev-kit/ndk'
import { useNostrStore } from '../store/nostrStore'
import { useGroupStore } from '../store/groupStore'
import { playMessageSound } from '../lib/sound'
import { npubToHex } from '../lib/dm'
import type { GroupMessage } from '../types/group'

export function useAllGroupsSubscription() {
  const { ndk, npub, isConnected } = useNostrStore()
  const groupIds = Object.keys(useGroupStore((s) => s.groups))

  useEffect(() => {
    if (!ndk || !npub || !isConnected || groupIds.length === 0) return

    const myPubkey = npubToHex(npub)
    const since = Math.floor(Date.now() / 1000) - 30 * 24 * 3600

    const sub = ndk.subscribe(
      { kinds: [42 as NDKKind], '#e': groupIds, since },
      { closeOnEose: false }
    )

    sub.on('event', (event) => {
      if (!event.id) return
      const store = useGroupStore.getState()
      if (store.hasGroupMessage(event.id)) return

      // Find the channel ID this message belongs to
      const channelId = event.tags.find((t) => t[0] === 'e')?.[1]
      if (!channelId || !store.groups[channelId]) return

      const createdAt = event.created_at ?? Math.floor(Date.now() / 1000)
      // Skip relay replays of messages from before the user deleted this group.
      if (store.isDeletedBefore(channelId, createdAt)) return

      const replyToId = event.tags.find(
        (t) => t[0] === 'e' && t[3] === 'reply'
      )?.[1]

      const msg: GroupMessage = {
        id: event.id,
        channelId,
        content: event.content,
        senderPubkey: event.pubkey,
        createdAt,
        ...(replyToId ? { replyToId } : {}),
      }

      const isFromMe = event.pubkey === myPubkey
      store.addGroupMessage(msg, { incrementUnread: !isFromMe })

      if (!isFromMe && store.activeChannel !== channelId) {
        playMessageSound()
      }
    })

    return () => sub.stop()
  }, [ndk, npub, isConnected, groupIds.join(',')])
}
