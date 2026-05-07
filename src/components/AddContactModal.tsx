import { useState } from 'react'
import { X, UserPlus, AlertCircle } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import { npubToHex, hexToNpub } from '../lib/dm'

interface Props {
  onClose: () => void
}

export default function AddContactModal({ onClose }: Props) {
  const [keyInput, setKeyInput] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [error, setError] = useState('')
  const { addContact, contacts } = useChatStore()

  const handleAdd = () => {
    const value = keyInput.trim()
    setError('')

    try {
      const pubkey = value.startsWith('npub1') ? npubToHex(value) : value
      if (!/^[0-9a-f]{64}$/i.test(pubkey)) throw new Error('bad key')

      if (contacts[pubkey]) {
        setError('Эта жабка уже в твоём списке!')
        return
      }

      const npub = value.startsWith('npub1') ? value : hexToNpub(pubkey)
      const name = nameInput.trim() || undefined

      addContact({ pubkey, npub, name })
      onClose()
    } catch {
      setError('Неверный npub или hex-ключ. Проверь и попробуй снова.')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-swamp-darker border border-frog-dark/30 rounded-2xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lily-green font-semibold">Добавить жабку</h3>
          <button onClick={onClose} className="text-lily-green/50 hover:text-lily-green">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <p className="text-lily-green/50 text-xs mb-1.5">Ключ (npub или hex) *</p>
            <input
              autoFocus
              type="text"
              value={keyInput}
              onChange={(e) => { setKeyInput(e.target.value); setError('') }}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="npub1..."
              className="w-full bg-swamp-dark border border-frog-dark/30 rounded-xl px-4 py-3 text-lily-green text-sm font-mono placeholder-lily-green/30 outline-none focus:border-frog-skin transition-colors"
            />
          </div>

          <div>
            <p className="text-lily-green/50 text-xs mb-1.5">Имя / никнейм (необязательно)</p>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Например: Жабка Дружище"
              maxLength={32}
              className="w-full bg-swamp-dark border border-frog-dark/30 rounded-xl px-4 py-3 text-lily-green text-sm placeholder-lily-green/30 outline-none focus:border-frog-skin transition-colors"
            />
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-xs mt-2 flex items-center gap-1">
            <AlertCircle size={12} /> {error}
          </p>
        )}

        <button
          onClick={handleAdd}
          disabled={!keyInput.trim()}
          className="mt-4 w-full flex items-center justify-center gap-2 bg-frog-skin hover:bg-frog-dark text-swamp-darker font-bold py-3 rounded-full transition-colors disabled:opacity-50"
        >
          <UserPlus size={18} />
          Добавить
        </button>
      </div>
    </div>
  )
}
