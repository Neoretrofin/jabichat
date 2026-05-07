import { create } from 'zustand'
import type { CallStatus } from '../types/call'

interface CallStore {
  status: CallStatus
  peerPubkey: string | null
  callId: string | null
  pendingOffer: RTCSessionDescriptionInit | null
  role: 'offerer' | 'answerer' | null

  // Local media split into separate streams so the call survives navigation.
  micStream: MediaStream | null
  camStream: MediaStream | null
  screenStream: MediaStream | null

  // Remote audio carries voice + (mixed-in) screen audio when the peer is
  // sharing. Single audio stream by design — see webrtc.ts for the rationale.
  remoteAudio: MediaStream | null
  remoteVideo: MediaStream | null
  remoteVideoActive: boolean

  shareHasAudio: boolean
  micEnabled: boolean
  camEnabled: boolean

  voiceVolume: number

  // ms timestamp of when the connection first reached 'connected'. Used by
  // the duration timer so it survives CallPage unmount/remount.
  connectedAt: number | null

  error: string | null

  setStatus: (status: CallStatus) => void
  startOutgoing: (peerPubkey: string, callId: string) => void
  setIncoming: (peerPubkey: string, callId: string, offer: RTCSessionDescriptionInit) => void
  accept: () => void

  setMicStream: (s: MediaStream | null) => void
  setCamStream: (s: MediaStream | null) => void
  setScreenStream: (s: MediaStream | null) => void
  setRemoteAudio: (s: MediaStream | null) => void
  setRemoteVideo: (s: MediaStream | null) => void
  setRemoteVideoActive: (v: boolean) => void
  setShareHasAudio: (v: boolean) => void
  setMicEnabled: (v: boolean) => void
  setCamEnabled: (v: boolean) => void
  setVoiceVolume: (v: number) => void
  setError: (msg: string | null) => void

  reset: () => void
}

const initial = {
  status: 'idle' as CallStatus,
  peerPubkey: null,
  callId: null,
  pendingOffer: null,
  role: null,
  micStream: null,
  camStream: null,
  screenStream: null,
  remoteAudio: null,
  remoteVideo: null,
  remoteVideoActive: false,
  shareHasAudio: false,
  micEnabled: true,
  camEnabled: false,
  voiceVolume: 1,
  connectedAt: null,
  error: null,
}

export const useCallStore = create<CallStore>()((set) => ({
  ...initial,

  setStatus: (status) =>
    set((s) => {
      if (status === 'connected' && !s.connectedAt) {
        return { status, connectedAt: Date.now() }
      }
      return { status }
    }),

  startOutgoing: (peerPubkey, callId) =>
    set({ ...initial, status: 'calling', peerPubkey, callId, role: 'offerer' }),

  setIncoming: (peerPubkey, callId, offer) =>
    set({
      ...initial,
      status: 'ringing',
      peerPubkey,
      callId,
      pendingOffer: offer,
      role: 'answerer',
    }),

  accept: () =>
    set((s) => (s.status === 'ringing' ? { status: 'accepting' } : s)),

  setMicStream: (s) => set({ micStream: s }),
  setCamStream: (s) => set({ camStream: s }),
  setScreenStream: (s) => set({ screenStream: s }),
  setRemoteAudio: (s) => set({ remoteAudio: s }),
  setRemoteVideo: (s) => set({ remoteVideo: s }),
  setRemoteVideoActive: (v) => set({ remoteVideoActive: v }),
  setShareHasAudio: (v) => set({ shareHasAudio: v }),
  setMicEnabled: (v) => set({ micEnabled: v }),
  setCamEnabled: (v) => set({ camEnabled: v }),
  setVoiceVolume: (v) => set({ voiceVolume: Math.max(0, Math.min(1, v)) }),
  setError: (msg) => set({ error: msg }),

  reset: () => set(initial),
}))
