import NDK, { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk'

// NIP-78 application-specific data event. Parameterized-replaceable means
// the relay only keeps the latest record per (kind, author, d-tag), so we
// don't have to clean up old versions ourselves.
export const DELETED_RECORD_KIND = 30078
export const DELETED_D_TAG = 'jabichat-deleted-v1'

export interface DeletedRecord {
  chats: Record<string, number>
  groups: Record<string, number>
}

// Self-encrypted (NIP-44 to own pubkey) so relays only see ciphertext.
// Other devices owned by the user can decrypt with the same nsec and merge
// the tombstones into their local chatStore/groupStore.
export async function publishDeletedRecord(ndk: NDK, record: DeletedRecord): Promise<void> {
  const signer = ndk.signer
  if (!signer) return
  const user = await signer.user()
  const me = new NDKUser({ pubkey: user.pubkey })
  const cipher = await signer.encrypt(me, JSON.stringify(record), 'nip44')

  const ev = new NDKEvent(ndk)
  ev.kind = DELETED_RECORD_KIND
  ev.tags = [['d', DELETED_D_TAG]]
  ev.content = cipher
  ev.created_at = Math.floor(Date.now() / 1000)
  try {
    await ev.sign()
    await ev.publish()
  } catch (e) {
    console.warn('[deleted-sync] publish failed:', e)
  }
}

export async function decodeDeletedRecord(ndk: NDK, event: NDKEvent): Promise<DeletedRecord | null> {
  const signer = ndk.signer
  if (!signer) return null
  try {
    const me = new NDKUser({ pubkey: event.pubkey })
    const plain = await signer.decrypt(me, event.content, 'nip44')
    const parsed = JSON.parse(plain) as Partial<DeletedRecord>
    if (typeof parsed !== 'object' || parsed === null) return null
    return {
      chats: parsed.chats ?? {},
      groups: parsed.groups ?? {},
    }
  } catch {
    return null
  }
}
