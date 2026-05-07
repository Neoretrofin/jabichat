import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import NDK, { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk'
import { createNDK, generateNsec, nsecToNpub } from '../lib/ndk'
import { npubToHex } from './../lib/dm'

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
  // Pulls the user's own latest kind:0 from relays and restores name + avatar.
  // Idempotent and safe to call after every connect (login or persisted-nsec
  // restore on app start). Does not overwrite locally-set values that don't
  // match the published metadata — local edits during this round-trip win.
  refreshOwnMetadata: () => Promise<void>
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
        // Also reset profile fields — relogin will repopulate from the new
        // account's published kind:0 (see refreshOwnMetadata).
        set({
          nsec: null,
          npub: null,
          ndk: null,
          isConnected: false,
          isConnecting: false,
          profileName: 'Аноним',
          avatar: null,
        })
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

      refreshOwnMetadata: async () => {
        const { ndk, npub } = get()
        if (!ndk || !npub) return
        try {
          const myPubkey = npubToHex(npub)
          const event = await ndk.fetchEvent({ kinds: [NDKKind.Metadata], authors: [myPubkey] })
          if (!event) return
          const profile = JSON.parse(event.content) as { name?: string; display_name?: string; picture?: string }
          const fetchedName = profile.display_name || profile.name
          const fetchedAvatar = profile.picture
          const cur = get()
          // Don't downgrade a name the user already typed locally to "Аноним".
          // Prefer fetched name over default; otherwise keep current.
          const nextName = fetchedName || cur.profileName
          const nextAvatar = fetchedAvatar ?? cur.avatar
          if (nextName !== cur.profileName || nextAvatar !== cur.avatar) {
            set({ profileName: nextName, avatar: nextAvatar ?? null })
          }
        } catch (e) {
          console.warn('[nostr] refreshOwnMetadata failed:', e)
        }
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
