import { useCallback } from 'react'
import { useNostrStore } from '../store/nostrStore'
import { useCallStore } from '../store/callStore'
import { sendSignal } from '../lib/signaling'
import { cleanup } from '../lib/webrtc'
import { stopOutgoingRing, stopRingtone } from '../lib/sound'

// Single source of truth for ending a call. Used by CallPage's red button,
// FloatingCallIndicator's hangup, and the no-answer timeout. Sends call-end
// to the peer (best-effort), tears down the PeerConnection + tracks, and
// resets the store.
export function useHangup() {
  const { ndk } = useNostrStore()
  return useCallback(async () => {
    const { peerPubkey, callId } = useCallStore.getState()
    stopOutgoingRing()
    stopRingtone()
    if (ndk && peerPubkey && callId) {
      await sendSignal(ndk, peerPubkey, { type: 'call-end', callId }).catch(() => {})
    }
    cleanup()
    useCallStore.getState().reset()
  }, [ndk])
}
