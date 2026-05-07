import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface DeviceStore {
  audioInputId: string | null
  videoInputId: string | null
  audioOutputId: string | null
  noiseSuppression: boolean
  setAudioInput: (id: string | null) => void
  setVideoInput: (id: string | null) => void
  setAudioOutput: (id: string | null) => void
  setNoiseSuppression: (v: boolean) => void
}

export const useDeviceStore = create<DeviceStore>()(
  persist(
    (set) => ({
      audioInputId: null,
      videoInputId: null,
      audioOutputId: null,
      noiseSuppression: true,
      setAudioInput: (id) => set({ audioInputId: id }),
      setVideoInput: (id) => set({ videoInputId: id }),
      setAudioOutput: (id) => set({ audioOutputId: id }),
      setNoiseSuppression: (v) => set({ noiseSuppression: v }),
    }),
    { name: 'jabichat-devices' }
  )
)
