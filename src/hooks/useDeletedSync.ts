import { useEffect } from 'react'
import { useNostrStore } from '../store/nostrStore'
import { useChatStore } from '../store/chatStore'
import { useGroupStore } from '../store/groupStore'
import {
  DELETED_RECORD_KIND,
  DELETED_D_TAG,
  decodeDeletedRecord,
} from '../lib/syncDeleted'
import { npubToHex } from '../lib/dm'

// Pulls our own NIP-78 deleted-record event from relays and merges its
// tombstones into chatStore + groupStore so chats deleted on one device
// stay deleted everywhere — addresses the "old chats reappear after relogin
// on another device" problem.
export function useDeletedSync() {
  const { ndk, npub, isConnected } = useNostrStore()

  useEffect(() => {
    if (!ndk || !npub || !isConnected) return

    const myPubkey = npubToHex(npub)
    const sub = ndk.subscribe(
      {
        kinds: [DELETED_RECORD_KIND],
        authors: [myPubkey],
        '#d': [DELETED_D_TAG],
      },
      { closeOnEose: false }
    )

    sub.on('event', async (event) => {
      const rec = await decodeDeletedRecord(ndk, event)
      if (!rec) return
      useChatStore.getState().mergeDeletedAt(rec.chats)
      useGroupStore.getState().mergeDeletedAt(rec.groups)
    })

    return () => sub.stop()
  }, [ndk, npub, isConnected])
}
