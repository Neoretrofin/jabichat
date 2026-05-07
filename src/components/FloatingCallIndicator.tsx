import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Phone, PhoneOff } from 'lucide-react'
import { useCallStore } from '../store/callStore'
import { useChatStore } from '../store/chatStore'
import { useHangup } from '../hooks/useHangup'
import { contactDisplayName } from '../types/chat'

function formatDuration(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

// Pill that appears when a call is active and the user has navigated away
// from /call. Tap the body to return; tap the red button to hang up.
// Hidden during 'ringing' (the IncomingCallModal handles that state).
export default function FloatingCallIndicator() {
  const status = useCallStore((s) => s.status)
  const peerPubkey = useCallStore((s) => s.peerPubkey)
  const connectedAt = useCallStore((s) => s.connectedAt)
  const { contacts } = useChatStore()
  const location = useLocation()
  const navigate = useNavigate()
  const hangup = useHangup()

  const [duration, setDuration] = useState(0)

  // connectedAt is the source of truth — survives this component's mount
  // and CallPage's mount independently.
  useEffect(() => {
    if (status !== 'connected' || !connectedAt) {
      setDuration(0)
      return
    }
    const tick = () => setDuration(Math.floor((Date.now() - connectedAt) / 1000))
    tick()
    const t = window.setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [status, connectedAt])

  const isActive = status === 'calling' || status === 'accepting' || status === 'connected'
  const onCallPage = location.pathname.startsWith('/call/')
  if (!isActive || onCallPage || !peerPubkey) return null

  const label = contactDisplayName(contacts[peerPubkey])

  const statusText = status === 'connected' ? formatDuration(duration) : 'Соединение...'

  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-frog-skin text-swamp-darker rounded-full pl-4 pr-1 py-1 shadow-xl">
      <button
        onClick={() => navigate(`/call/${peerPubkey}`)}
        className="flex items-center gap-2"
      >
        <Phone size={16} />
        <div className="text-left">
          <p className="text-xs font-semibold leading-tight">{label}</p>
          <p className="text-[10px] leading-tight">{statusText}</p>
        </div>
      </button>
      <button
        onClick={hangup}
        title="Завершить"
        className="w-8 h-8 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white shrink-0"
      >
        <PhoneOff size={14} />
      </button>
    </div>
  )
}
