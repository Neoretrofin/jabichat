import { useEffect } from 'react'
import { NDKKind } from '@nostr-dev-kit/ndk'
import { useNostrStore } from '../store/nostrStore'
import { useChatStore } from '../store/chatStore'

export function useContactMetadata() {
  const { ndk, isConnected } = useNostrStore()
  const { contacts, updateContactName, updateContactPicture } = useChatStore()

  useEffect(() => {
    if (!ndk || !isConnected) return

    const pubkeys = Object.keys(contacts)
    if (pubkeys.length === 0) return

    const sub = ndk.subscribe(
      { kinds: [NDKKind.Metadata], authors: pubkeys },
      { closeOnEose: true }
    )

    sub.on('event', (event) => {
      try {
        const profile = JSON.parse(event.content)
        const name: string = profile.display_name || profile.name || ''
        const picture: string = profile.picture || ''
        if (name) updateContactName(event.pubkey, name)
        if (picture) updateContactPicture(event.pubkey, picture)
      } catch {
        // malformed kind 0 — skip
      }
    })

    return () => sub.stop()
  }, [ndk, isConnected, Object.keys(contacts).join(',')])
}
