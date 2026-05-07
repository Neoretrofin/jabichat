import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'jabi' | 'dark' | 'light'

interface ThemeStore {
  theme: Theme
  setTheme: (t: Theme) => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'jabi',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'jabichat-theme' }
  )
)
