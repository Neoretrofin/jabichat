import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Reply } from 'lucide-react'

interface Props {
  x: number
  y: number
  onReply: () => void
  onClose: () => void
}

// Floating context menu anchored at (x, y). Adjusts itself after first paint
// if it would overflow the viewport — measuring happens in a layout effect so
// the user never sees the unclamped position flash.
export default function MessageContextMenu({ x, y, onReply, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const margin = 8
    const vw = window.innerWidth
    const vh = window.innerHeight
    let nx = x
    let ny = y
    if (nx + rect.width > vw - margin) nx = vw - rect.width - margin
    if (ny + rect.height > vh - margin) ny = vh - rect.height - margin
    if (nx < margin) nx = margin
    if (ny < margin) ny = margin
    setPos({ x: nx, y: ny })
  }, [x, y])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Full-viewport overlay catches the dismiss tap *before* it reaches a
  // bubble underneath — without it, on mobile the same tap that closes the
  // menu would propagate to a bubble and re-open it.
  return (
    <div
      onClick={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose() }}
      className="fixed inset-0 z-40"
    >
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
        style={{ position: 'absolute', left: pos.x, top: pos.y }}
        className="bg-swamp-darker border border-frog-dark/50 rounded-2xl shadow-2xl py-1 min-w-[160px]"
      >
        <button
          onClick={() => { onReply(); onClose() }}
          className="w-full flex items-center gap-2.5 px-4 py-2 text-lily-green text-sm hover:bg-frog-skin/15 transition-colors"
        >
          <Reply size={14} className="text-frog-skin" />
          <span>Ответить</span>
        </button>
      </div>
    </div>
  )
}
