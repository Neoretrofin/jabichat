import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Group, GroupMessage } from '../types/group'

interface GroupState {
  groups: Record<string, Group>
  messages: Record<string, GroupMessage[]>
  unread: Record<string, number>
  lastActivity: Record<string, number>
  activeChannel: string | null

  addGroup: (group: Group) => void
  removeGroup: (id: string) => void
  addGroupMessage: (msg: GroupMessage, opts?: { incrementUnread?: boolean }) => void
  hasGroupMessage: (id: string) => boolean
  clearUnread: (channelId: string) => void
  setActiveChannel: (channelId: string | null) => void
}

export const useGroupStore = create<GroupState>()(
  persist(
    (set, get) => ({
      groups: {},
      messages: {},
      unread: {},
      lastActivity: {},
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

      clearUnread: (channelId) =>
        set((s) => ({ unread: { ...s.unread, [channelId]: 0 } })),

      setActiveChannel: (channelId) => set({ activeChannel: channelId }),
    }),
    {
      name: 'jabichat-groups',
      partialize: (s) => ({
        groups: s.groups,
        messages: s.messages,
        lastActivity: s.lastActivity,
        unread: s.unread,
      }),
    }
  )
)
