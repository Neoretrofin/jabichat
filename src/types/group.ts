export interface Group {
  id: string
  name: string
  about?: string
  picture?: string
  createdAt: number
  creatorPubkey: string
}

export interface GroupMessage {
  id: string
  channelId: string
  content: string
  senderPubkey: string
  createdAt: number
}
