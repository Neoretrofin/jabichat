import { useState, useRef, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'

import { GNOLICHKA_EMOJIS_SHORTCODES } from '../lib/customEmojis'

interface EmojiCategory {
  id: string
  label: string
  icon: ReactNode
  emojis: string[]
}

// Curated emoji set grouped by category. Plain Unicode entries travel as
// regular text inside the Nostr message `content` field, so the
// decentralised architecture stays 100 % intact. Custom-emoji entries
// travel as `:NNN:` shortcodes which are resolved to PNGs at render time.
const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smiley',
    label: 'Смайлы',
    icon: '😀',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃',
      '😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙',
      '🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢',
      '🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏',
      '😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷',
      '🤒','🤕','🤢','🤮','🥴','😵','🤯','🥳','🥸','😎',
      '🤓','🧐','😕','🫤','😟','🙁','😮','😯','😲','😳',
      '🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱',
      '😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠',
      '🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻',
      '👽','👾','🤖',
    ],
  },
  {
    id: 'frogs',
    label: 'Жабки',
    icon: '🐸',
    emojis: [
      '🐸','🐊','🐢','🦎','🐍','🐲','🌿','🍀','🌱','🪷',
      '🌸','🌼','🌻','🌺','💐','🪴','🌵','🍃','🍂','🍁',
      '🍄','🪺','🦋','🐛','🐌','🐞','🐝','🦗','🪲','🪱',
    ],
  },
  {
    id: 'gestures',
    label: 'Жесты',
    icon: '👋',
    emojis: [
      '👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌',
      '🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉',
      '👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛',
      '🤜','👏','🙌','🫶','👐','🤲','🤝','🙏',
    ],
  },
  {
    id: 'hearts',
    label: 'Сердца',
    icon: '❤️',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔',
      '❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝',
      '💟','♥️','💋','💌',
    ],
  },
  {
    id: 'objects',
    label: 'Объекты',
    icon: '🎉',
    emojis: [
      '🎉','🎊','🎈','🎁','🎀','🏆','🥇','🥈','🥉','⚽',
      '🏀','🎮','🎯','🎲','🔔','🎵','🎶','🎤','🎧','📱',
      '💻','⌨️','🖥️','📷','💡','🔦','📚','✏️','📝','💰',
      '💎','🔑','🗝️','🔒','🔓','🛡️','⚙️','🔧','🧲','🧪',
    ],
  },
  {
    id: 'food',
    label: 'Еда',
    icon: '🍕',
    emojis: [
      '🍕','🍔','🍟','🌭','🌮','🌯','🥙','🧆','🍗','🥩',
      '🍖','🧀','🥚','🍳','🥞','🧇','🥐','🍞','🥖','🥨',
      '🍰','🎂','🧁','🍩','🍪','🍫','🍬','🍭','🍿','☕',
      '🍵','🧃','🥤','🍺','🍻','🥂','🍷','🍹','🧊',
    ],
  },
  {
    id: 'gnolichka',
    label: 'Гноличка',
    icon: (
      <img
        src={`${import.meta.env.BASE_URL}gnolichka_emoji/064.png`}
        alt="Гноличка"
        className="w-5 h-5 inline-block object-contain pointer-events-none"
      />
    ),
    emojis: GNOLICHKA_EMOJIS_SHORTCODES,
  },
]

const CATEGORY_BY_ID: Record<string, EmojiCategory> = Object.fromEntries(
  EMOJI_CATEGORIES.map((c) => [c.id, c])
)

// Recently-used emoji (persisted in localStorage under a dedicated key
// so it doesn't pollute the Nostr stores).
const RECENT_KEY = 'jabichat-recent-emoji'
const MAX_RECENT = 28

function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') }
  catch { return [] }
}
function saveRecent(list: string[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(list))
}

interface EmojiPickerProps {
  /** Insert emoji at cursor / append to input value. */
  onSelect: (emoji: string) => void
  onClose: () => void
  /** Toggle button — clicks on it must NOT count as outside-click,
   *  otherwise mousedown closes the picker right before onClick reopens it. */
  excludeRef?: React.RefObject<HTMLElement | null>
}

function renderEmojiItem(emoji: string) {
  if (emoji.startsWith(':') && emoji.endsWith(':')) {
    const name = emoji.slice(1, -1)
    const src = `${import.meta.env.BASE_URL}gnolichka_emoji/${name}.png`
    return <img src={src} alt={emoji} title={name} className="w-7 h-7 object-contain pointer-events-none" />
  }
  return emoji
}

export default function EmojiPicker({ onSelect, onClose, excludeRef }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState(EMOJI_CATEGORIES[0].id)
  const [search, setSearch] = useState('')
  const [recent, setRecent] = useState(loadRecent)
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (panelRef.current && panelRef.current.contains(target)) return
      if (excludeRef?.current && excludeRef.current.contains(target)) return
      onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, excludeRef])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handlePick = (emoji: string) => {
    onSelect(emoji)
    const updated = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, MAX_RECENT)
    setRecent(updated)
    saveRecent(updated)
  }

  // Flat filtered list when searching
  const filtered = useMemo(() => {
    if (!search.trim()) return null
    const all = EMOJI_CATEGORIES.flatMap((c) => c.emojis)
    return all.filter((e) => e.includes(search.trim()))
  }, [search])

  const visibleEmoji: string[] = filtered ?? CATEGORY_BY_ID[activeCategory]?.emojis ?? []

  return (
    <div
      ref={panelRef}
      className="absolute bottom-full left-0 mb-2 w-[340px] max-w-[calc(100vw-2rem)] bg-swamp-darker border border-frog-dark/30 rounded-2xl shadow-lg shadow-black/40 z-50 flex flex-col overflow-hidden"
      style={{ maxHeight: '360px' }}
    >
      {/* Search */}
      <div className="px-3 pt-3 pb-1">
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Найти эмодзи..."
          className="w-full bg-swamp-dark border border-frog-dark/30 rounded-xl px-3 py-1.5 text-lily-green text-sm placeholder-lily-green/30 outline-none focus:border-frog-skin transition-colors"
        />
      </div>

      {/* Category tabs */}
      {!search.trim() && (
        <div className="flex gap-0.5 px-2 pt-1 pb-1 overflow-x-auto scrollbar-none">
          {recent.length > 0 && (
            <button
              onClick={() => setActiveCategory('__recent')}
              className={`shrink-0 px-2 py-1 rounded-lg text-sm transition-colors ${
                activeCategory === '__recent'
                  ? 'bg-frog-skin/20 text-frog-skin'
                  : 'text-lily-green/50 hover:text-lily-green'
              }`}
              title="Недавние"
            >
              🕑
            </button>
          )}
          {EMOJI_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`shrink-0 px-2 py-1 rounded-lg text-sm transition-colors flex items-center justify-center ${
                activeCategory === cat.id
                  ? 'bg-frog-skin/20 text-frog-skin'
                  : 'text-lily-green/50 hover:text-lily-green'
              }`}
              title={cat.label}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 pt-1" style={{ minHeight: '140px' }}>
        {/* Recent section (when tab active) */}
        {activeCategory === '__recent' && !search.trim() && (
          <>
            <p className="text-lily-green/30 text-[10px] uppercase tracking-wider px-1 mb-1">Недавние</p>
            <div className="grid grid-cols-7 gap-0.5">
              {recent.map((emoji, i) => (
                <button
                  key={`r-${i}`}
                  onClick={() => handlePick(emoji)}
                  className="w-10 h-10 flex items-center justify-center text-xl rounded-lg hover:bg-frog-skin/15 transition-colors active:scale-90"
                >
                  {renderEmojiItem(emoji)}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Main grid */}
        {activeCategory !== '__recent' && (
          <div className="grid grid-cols-7 gap-0.5">
            {visibleEmoji.map((emoji, i) => (
              <button
                key={`e-${i}`}
                onClick={() => handlePick(emoji)}
                className="w-10 h-10 flex items-center justify-center text-xl rounded-lg hover:bg-frog-skin/15 transition-colors active:scale-90"
              >
                {renderEmojiItem(emoji)}
              </button>
            ))}
          </div>
        )}

        {visibleEmoji.length === 0 && activeCategory !== '__recent' && (
          <p className="text-center text-lily-green/30 text-sm py-8">Ничего не найдено 🐸</p>
        )}
      </div>
    </div>
  )
}
