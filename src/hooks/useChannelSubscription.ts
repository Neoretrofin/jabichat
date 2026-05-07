import { useEffect } from 'react'
import { NDKKind } from '@nostr-dev-kit/ndk'
import { useNostrStore } from '../store/nostrStore'
import { useGroupStore } from '../store/groupStore'
import type { GroupMessage } from '../types/group'

export function useChannelSubscription(channelId: string | undefined) {
  const { ndk } = useNostrStore()
  const { addGroupMessage, hasGroupMessage } = useGroupStore()

  useEffect(() => {
    if (!ndk || !channelId) return

    const since = Math.floor(Date.now() / 1000) - 30 * 24 * 3600
    const sub = ndk.subscribe(
      { kinds: [42 as NDKKind], '#e': [channelId], since },
      { closeOnEose: false }
    )

    sub.on('event', (event) => {
      if (!event.id || hasGroupMessage(event.id)) return
      const replyToId = event.tags.find(
        (t) => t[0] === 'e' && t[3] === 'reply'
      )?.[1]
      const msg: GroupMessage = {
        id: event.id,
        channelId,
        content: event.content,
        senderPubkey: event.pubkey,
        createdAt: event.created_at ?? Math.floor(Date.now() / 1000),
        ...(replyToId ? { replyToId } : {}),
      }
      addGroupMessage(msg)
    })

    return () => sub.stop()
  }, [ndk, channelId])
}
