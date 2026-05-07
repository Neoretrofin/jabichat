export interface Contact {
  pubkey: string
  npub: string
  name?: string
  picture?: string
}

export interface Message {
  id: string
  content: string
  senderPubkey: string
  createdAt: number
  pending?: boolean
}
