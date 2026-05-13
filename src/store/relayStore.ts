import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_RELAYS, normalizeRelayUrl } from '../lib/ndk'

interface RelayState {
  /** Активный список реле — то, что NDK реально подключает. */
  relayUrls: string[]
  addRelay: (url: string) => { ok: boolean; reason?: string }
  removeRelay: (url: string) => void
  resetToDefaults: () => void
}

export const useRelayStore = create<RelayState>()(
  persist(
    (set, get) => ({
      relayUrls: DEFAULT_RELAYS,

      addRelay: (url) => {
        const normalized = normalizeRelayUrl(url)
        if (!normalized) return { ok: false, reason: 'Адрес должен начинаться с wss:// (или ws:// для локального реле)' }
        const cur = get().relayUrls
        if (cur.some((u) => u.toLowerCase() === normalized)) {
          return { ok: false, reason: 'Это реле уже добавлено' }
        }
        set({ relayUrls: [...cur, normalized] })
        return { ok: true }
      },

      removeRelay: (url) => {
        const normalized = normalizeRelayUrl(url) ?? url
        set({ relayUrls: get().relayUrls.filter((u) => u !== normalized && u !== url) })
      },

      resetToDefaults: () => set({ relayUrls: DEFAULT_RELAYS }),
    }),
    {
      name: 'jabichat-relays',
      partialize: (state) => ({ relayUrls: state.relayUrls }),
    }
  )
)
