import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import NDK, { NDKEvent } from '@nostr-dev-kit/ndk'
import { createNDK, generateNsec, nsecToNpub } from '../lib/ndk'

interface NostrState {
  nsec: string | null
  npub: string | null
  profileName: string
  avatar: string | null
  ndk: NDK | null
  isConnected: boolean
  isConnecting: boolean

  generateKey: () => { nsec: string; npub: string }
  login: (nsec: string) => Promise<void>
  logout: () => void
  setProfileName: (name: string) => void
  setAvatar: (url: string | null) => void
  publishMetadata: () => Promise<void>
}

export const useNostrStore = create<NostrState>()(
  persist(
    (set, get) => ({
      nsec: null,
      npub: null,
      profileName: 'Аноним',
      avatar: null,
      ndk: null,
      isConnected: false,
      isConnecting: false,

      setProfileName: (name) => set({ profileName: name }),

      setAvatar: (url) => set({ avatar: url }),

      generateKey: () => {
        return generateNsec()
      },

      login: async (nsec: string) => {
        const trimmed = nsec.trim()
        const npub = nsecToNpub(trimmed)
        const ndk = createNDK(trimmed)

        set({ nsec: trimmed, npub, ndk, isConnecting: true, isConnected: false })

        try {
          await ndk.connect(3000)
          set({ isConnected: true, isConnecting: false })
        } catch {
          set({ isConnecting: false })
        }
      },

      logout: () => {
        const { ndk } = get()
        if (ndk) {
          ndk.pool?.relays.forEach((relay) => relay.disconnect())
        }
        set({ nsec: null, npub: null, ndk: null, isConnected: false, isConnecting: false, avatar: null })
      },

      publishMetadata: async () => {
        const { ndk, profileName, avatar } = get()
        if (!ndk) return
        const event = new NDKEvent(ndk)
        event.kind = 0
        event.content = JSON.stringify({
          name: profileName,
          display_name: profileName,
          picture: avatar ?? undefined,
        })
        event.tags = []
        await event.publish()
      },
    }),
    {
      name: 'jabichat-identity',
      partialize: (state) => ({
        nsec: state.nsec,
        npub: state.npub,
        profileName: state.profileName,
        avatar: state.avatar,
      }),
    }
  )
)
