import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Contact, Message } from '../types/chat'

interface ChatState {
  contacts: Record<string, Contact>
  messages: Record<string, Message[]>
  unread: Record<string, number>
  lastActivity: Record<string, number>
  // Tombstones (pubkey → unix-seconds at deletion). Incoming DMs older than
  // the tombstone are dropped so deleting a chat doesn't get undone by
  // relay replays of the same events.
  deletedAt: Record<string, number>
  activeChat: string | null

  addContact: (contact: Contact) => void
  removeContact: (pubkey: string) => void
  updateContactName: (pubkey: string, name: string) => void
  updateContactPublishedName: (pubkey: string, name: string) => void
  updateContactPicture: (pubkey: string, picture: string) => void
  addMessage: (peerPubkey: string, message: Message, opts?: { incrementUnread?: boolean }) => void
  updateMessage: (peerPubkey: string, messageId: string, patch: Partial<Omit<Message, 'id'>>) => void
  hasMessage: (id: string) => boolean
  isDeletedBefore: (pubkey: string, createdAt: number) => boolean
  clearUnread: (peerPubkey: string) => void
  setActiveChat: (peerPubkey: string | null) => void
  removeChat: (pubkey: string) => void
  // Merge tombstones from another device's NIP-78 record. For each pubkey
  // whose remote tombstone is newer than the local one, advance the local
  // tombstone and drop messages older than it (the chat itself is dropped
  // unless we already have fresh post-tombstone activity).
  mergeDeletedAt: (remote: Record<string, number>) => void
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      contacts: {},
      messages: {},
      unread: {},
      lastActivity: {},
      deletedAt: {},
      activeChat: null,

      addContact: (contact) =>
        set((s) => ({
          contacts: { ...s.contacts, [contact.pubkey]: contact },
        })),

      removeContact: (pubkey) =>
        set((s) => {
          const { [pubkey]: _, ...rest } = s.contacts
          return { contacts: rest }
        }),

      // Manual alias — sticky, never overwritten by kind:0.
      updateContactName: (pubkey, name) =>
        set((s) => {
          const contact = s.contacts[pubkey]
          if (!contact) return s
          return { contacts: { ...s.contacts, [pubkey]: { ...contact, name } } }
        }),

      // From peer's kind:0 metadata. Display logic prefers `name` when set.
      updateContactPublishedName: (pubkey, publishedName) =>
        set((s) => {
          const contact = s.contacts[pubkey]
          if (!contact) return s
          if (contact.publishedName === publishedName) return s
          return { contacts: { ...s.contacts, [pubkey]: { ...contact, publishedName } } }
        }),

      updateContactPicture: (pubkey, picture) =>
        set((s) => {
          const contact = s.contacts[pubkey]
          if (!contact) return s
          if (contact.picture === picture) return s
          return { contacts: { ...s.contacts, [pubkey]: { ...contact, picture } } }
        }),

      updateMessage: (peerPubkey, messageId, patch) =>
        set((s) => {
          const existing = s.messages[peerPubkey] ?? []
          const updated = existing.map((m) => m.id === messageId ? { ...m, ...patch } : m)
          return { messages: { ...s.messages, [peerPubkey]: updated } }
        }),

      addMessage: (peerPubkey, message, opts) =>
        set((s) => {
          const existing = s.messages[peerPubkey] ?? []
          if (existing.some((m) => m.id === message.id)) return s
          const updated = [...existing, message].sort((a, b) => a.createdAt - b.createdAt)
          const shouldIncrement =
            opts?.incrementUnread && s.activeChat !== peerPubkey
          return {
            messages: { ...s.messages, [peerPubkey]: updated },
            lastActivity: { ...s.lastActivity, [peerPubkey]: message.createdAt },
            unread: shouldIncrement
              ? { ...s.unread, [peerPubkey]: (s.unread[peerPubkey] ?? 0) + 1 }
              : s.unread,
          }
        }),

      hasMessage: (id) => {
        const { messages } = get()
        return Object.values(messages).some((msgs) => msgs.some((m) => m.id === id))
      },

      isDeletedBefore: (pubkey, createdAt) => {
        const t = get().deletedAt[pubkey]
        return t !== undefined && createdAt < t
      },

      clearUnread: (peerPubkey) =>
        set((s) => ({ unread: { ...s.unread, [peerPubkey]: 0 } })),

      setActiveChat: (peerPubkey) => set({ activeChat: peerPubkey }),

      removeChat: (pubkey) =>
        set((s) => {
          const { [pubkey]: _c, ...contacts } = s.contacts
          const { [pubkey]: _m, ...messages } = s.messages
          const { [pubkey]: _u, ...unread } = s.unread
          const { [pubkey]: _a, ...lastActivity } = s.lastActivity
          return {
            contacts,
            messages,
            unread,
            lastActivity,
            deletedAt: { ...s.deletedAt, [pubkey]: Math.floor(Date.now() / 1000) },
            activeChat: s.activeChat === pubkey ? null : s.activeChat,
          }
        }),

      mergeDeletedAt: (remote) =>
        set((s) => {
          let changed = false
          const deletedAt = { ...s.deletedAt }
          const contacts = { ...s.contacts }
          const messages = { ...s.messages }
          const unread = { ...s.unread }
          const lastActivity = { ...s.lastActivity }
          let activeChat = s.activeChat

          for (const [pubkey, t] of Object.entries(remote)) {
            const existing = deletedAt[pubkey] ?? 0
            if (t <= existing) continue
            deletedAt[pubkey] = t
            changed = true

            const oldMsgs = messages[pubkey] ?? []
            const freshMsgs = oldMsgs.filter((m) => m.createdAt >= t)
            if (freshMsgs.length === 0) {
              delete contacts[pubkey]
              delete messages[pubkey]
              delete unread[pubkey]
              delete lastActivity[pubkey]
              if (activeChat === pubkey) activeChat = null
            } else if (freshMsgs.length !== oldMsgs.length) {
              messages[pubkey] = freshMsgs
              lastActivity[pubkey] = freshMsgs[freshMsgs.length - 1].createdAt
            }
          }
          if (!changed) return s
          return { deletedAt, contacts, messages, unread, lastActivity, activeChat }
        }),
    }),
    {
      name: 'jabichat-chats',
      partialize: (s) => ({
        contacts: s.contacts,
        messages: s.messages,
        lastActivity: s.lastActivity,
        unread: s.unread,
        deletedAt: s.deletedAt,
      }),
    }
  )
)
