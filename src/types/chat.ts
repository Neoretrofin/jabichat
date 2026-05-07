export interface Contact {
  pubkey: string
  npub: string
  // User-assigned alias. Highest display priority — once set (via the rename
  // UI or AddContactModal), kind:0 metadata updates do NOT override it.
  name?: string
  // Latest display name from the peer's kind:0 metadata. Updates whenever
  // the peer republishes. Falls back to "Аноним" if absent.
  publishedName?: string
  picture?: string
}

// Display name resolution: manual alias > peer's published kind:0 name >
// "Аноним". Picture has no manual override — it always comes from kind:0.
export function contactDisplayName(c: Contact | undefined): string {
  return c?.name ?? c?.publishedName ?? 'Аноним'
}

export interface Message {
  id: string
  content: string
  senderPubkey: string
  createdAt: number
  pending?: boolean
  replyToId?: string
}
