import { useNavigate } from 'react-router-dom'
import { Phone, PhoneOff } from 'lucide-react'
import { useCallStore } from '../store/callStore'
import { useChatStore } from '../store/chatStore'
import { useNostrStore } from '../store/nostrStore'
import { sendSignal } from '../lib/signaling'
import { cleanup } from '../lib/webrtc'
import { stopRingtone } from '../lib/sound'
import { hexToNpub } from '../lib/dm'
import Avatar from './Avatar'

function callerLabel(pubkey: string, contacts: Record<string, { name?: string; npub: string }>): string {
  const c = contacts[pubkey]
  if (c?.name) return c.name
  const npub = c?.npub ?? hexToNpub(pubkey)
  return `${npub.slice(0, 10)}...${npub.slice(-6)}`
}

export default function IncomingCallModal() {
  const { status, peerPubkey, callId, accept: acceptCall, reset } = useCallStore()
  const { contacts } = useChatStore()
  const { ndk } = useNostrStore()
  const navigate = useNavigate()

  if (status !== 'ringing' || !peerPubkey || !callId) return null

  const label = callerLabel(peerPubkey, contacts)
  const contact = contacts[peerPubkey]

  const accept = () => {
    stopRingtone()
    acceptCall()
    navigate(`/call/${peerPubkey}`)
  }

  const decline = async () => {
    stopRingtone()
    if (ndk) {
      await sendSignal(ndk, peerPubkey, { type: 'call-reject', callId }).catch(() => {})
    }
    cleanup()
    reset()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-swamp-darker border border-frog-dark/30 rounded-3xl w-full max-w-xs p-6 text-center">
        <div className="flex justify-center mb-4">
          <Avatar src={contact?.picture} size={80} className="border-2 border-frog-skin/40 animate-pulse" />
        </div>

        <p className="text-lily-green/50 text-xs mb-1 uppercase tracking-wider">Входящий звонок</p>
        <p className="text-lily-green font-semibold text-lg mb-6">{label}</p>

        <div className="flex gap-4 justify-center">
          <button
            onClick={decline}
            className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors"
          >
            <PhoneOff size={26} className="text-white" />
          </button>
          <button
            onClick={accept}
            className="w-16 h-16 rounded-full bg-frog-skin hover:bg-frog-dark flex items-center justify-center transition-colors"
          >
            <Phone size={26} className="text-swamp-darker" />
          </button>
        </div>
      </div>
    </div>
  )
}
