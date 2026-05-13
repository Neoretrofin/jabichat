import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ScreenShareQuality = 'low' | 'medium' | 'high' | 'max'

// Bitrate ceilings for each preset. WebRTC's congestion control treats these
// as upper bounds — actual sent bitrate auto-degrades when the receiver or
// network can't sustain them. So picking a high preset is safe even if the
// peer is on a weak link; they just get less than the cap. See webrtc.ts.
export const SCREEN_SHARE_BITRATES: Record<ScreenShareQuality, number> = {
  low: 5_000_000,
  medium: 10_000_000,
  high: 15_000_000,
  max: 25_000_000,
}

interface DeviceStore {
  audioInputId: string | null
  videoInputId: string | null
  audioOutputId: string | null
  screenShareQuality: ScreenShareQuality
  setAudioInput: (id: string | null) => void
  setVideoInput: (id: string | null) => void
  setAudioOutput: (id: string | null) => void
  setScreenShareQuality: (q: ScreenShareQuality) => void
}

export const useDeviceStore = create<DeviceStore>()(
  persist(
    (set) => ({
      audioInputId: null,
      videoInputId: null,
      audioOutputId: null,
      screenShareQuality: 'high',
      setAudioInput: (id) => set({ audioInputId: id }),
      setVideoInput: (id) => set({ videoInputId: id }),
      setAudioOutput: (id) => set({ audioOutputId: id }),
      setScreenShareQuality: (q) => set({ screenShareQuality: q }),
    }),
    { name: 'jabichat-devices' }
  )
)
