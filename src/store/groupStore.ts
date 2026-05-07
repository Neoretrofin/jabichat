import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Group, GroupMessage } from '../types/group'

interface GroupState {
  groups: Record<string, Group>
  messages: Record<string, GroupMessage[]>
  unread: Record<string, number>
  lastActivity: Record<string, number>
  // Tombstone (channelId -> unix-seconds at deletion). Same purpose as
  // chatStore.deletedAt — stop relay replays from un-deleting a group.
  deletedAt: Record<string, number>
  activeChannel: string | null

  addGroup: (group: Group) => void
  removeGroup: (id: string) => void
  addGroupMessage: (msg: GroupMessage, opts?: { incrementUnread?: boolean }) => void
  hasGroupMessage: (id: string) => boolean
  isDeletedBefore: (channelId: string, createdAt: number) => boolean
  clearUnread: (channelId: string) => void
  setActiveChannel: (channelId: string | null) => void
  // Same role as chatStore.mergeDeletedAt — applies cross-device tombstones
  // from the user's NIP-78 sync record, dropping group history older than
  // the new tombstone.
  mergeDeletedAt: (remote: Record<string, number>) => void
}

export const useGroupStore = create<GroupState>()(
  persist(
    (set, get) => ({
      groups: {},
      messages: {},
      unread: {},
      lastActivity: {},
      deletedAt: {},
      activeChannel: null,

      addGroup: (group) =>
        set((s) => ({ groups: { ...s.groups, [group.id]: group } })),

      removeGroup: (id) =>
        set((s) => {
          const { [id]: _g, ...groups } = s.groups
          const { [id]: _m, ...messages } = s.messages
          const { [id]: _u, ...unread } = s.unread
          const { [id]: _a, ...lastActivity } = s.lastActivity
          return {
            groups,
            messages,
            unread,
            lastActivity,
            deletedAt: { ...s.deletedAt, [id]: Math.floor(Date.now() / 1000) },
            activeChannel: s.activeChannel === id ? null : s.activeChannel,
          }
        }),

      addGroupMessage: (msg, opts) =>
        set((s) => {
          const existing = s.messages[msg.channelId] ?? []
          if (existing.some((m) => m.id === msg.id)) return s
          const updated = [...existing, msg].sort((a, b) => a.createdAt - b.createdAt)
          const shouldIncrement =
            opts?.incrementUnread && s.activeChannel !== msg.channelId
          return {
            messages: { ...s.messages, [msg.channelId]: updated },
            lastActivity: { ...s.lastActivity, [msg.channelId]: msg.createdAt },
            unread: shouldIncrement
              ? { ...s.unread, [msg.channelId]: (s.unread[msg.channelId] ?? 0) + 1 }
              : s.unread,
          }
        }),

      hasGroupMessage: (id) => {
        const { messages } = get()
        return Object.values(messages).some((msgs) => msgs.some((m) => m.id === id))
      },

      isDeletedBefore: (channelId, createdAt) => {
        const t = get().deletedAt[channelId]
        return t !== undefined && createdAt < t
      },

      clearUnread: (channelId) =>
        set((s) => ({ unread: { ...s.unread, [channelId]: 0 } })),

      setActiveChannel: (channelId) => set({ activeChannel: channelId }),

      mergeDeletedAt: (remote) =>
        set((s) => {
          let changed = false
          const deletedAt = { ...s.deletedAt }
          const groups = { ...s.groups }
          const messages = { ...s.messages }
          const unread = { ...s.unread }
          const lastActivity = { ...s.lastActivity }
          let activeChannel = s.activeChannel

          for (const [channelId, t] of Object.entries(remote)) {
            const existing = deletedAt[channelId] ?? 0
            if (t <= existing) continue
            deletedAt[channelId] = t
            changed = true

            const oldMsgs = messages[channelId] ?? []
            const freshMsgs = oldMsgs.filter((m) => m.createdAt >= t)
            if (freshMsgs.length === 0) {
              delete groups[channelId]
              delete messages[channelId]
              delete unread[channelId]
              delete lastActivity[channelId]
              if (activeChannel === channelId) activeChannel = null
            } else if (freshMsgs.length !== oldMsgs.length) {
              messages[channelId] = freshMsgs
              lastActivity[channelId] = freshMsgs[freshMsgs.length - 1].createdAt
            }
          }
          if (!changed) return s
          return { deletedAt, groups, messages, unread, lastActivity, activeChannel }
        }),
    }),
    {
      name: 'jabichat-groups',
      partialize: (s) => ({
        groups: s.groups,
        messages: s.messages,
        lastActivity: s.lastActivity,
        unread: s.unread,
        deletedAt: s.deletedAt,
      }),
    }
  )
)
