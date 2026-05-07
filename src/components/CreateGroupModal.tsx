import { useState } from 'react'
import { X, Users, LogIn, AlertCircle, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useNostrStore } from '../store/nostrStore'
import { useGroupStore } from '../store/groupStore'
import { createChannel, joinChannel } from '../lib/channel'

interface Props {
  onClose: () => void
}

export default function CreateGroupModal({ onClose }: Props) {
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [nameInput, setNameInput] = useState('')
  const [aboutInput, setAboutInput] = useState('')
  const [channelIdInput, setChannelIdInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { ndk } = useNostrStore()
  const { addGroup } = useGroupStore()
  const navigate = useNavigate()

  const handleCreate = async () => {
    if (!ndk || !nameInput.trim()) return
    setLoading(true)
    setError('')
    try {
      const group = await createChannel(ndk, nameInput.trim(), aboutInput.trim() || undefined)
      addGroup(group)
      onClose()
      navigate(`/groups/${group.id}`)
    } catch {
      setError('Не удалось создать группу. Проверь соединение.')
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = async () => {
    if (!ndk || !channelIdInput.trim()) return
    const channelId = channelIdInput.trim()
    if (!/^[0-9a-f]{64}$/i.test(channelId)) {
      setError('Неверный ID канала. Ожидается 64-символьный hex.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const group = await joinChannel(ndk, channelId)
      if (!group) {
        setError('Канал не найден. Проверь ID и попробуй снова.')
        return
      }
      addGroup(group)
      onClose()
      navigate(`/groups/${group.id}`)
    } catch {
      setError('Не удалось найти канал. Попробуй ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  const handleAction = tab === 'create' ? handleCreate : handleJoin
  const isDisabled = loading || (tab === 'create' ? !nameInput.trim() : !channelIdInput.trim())

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-swamp-darker border border-frog-dark/30 rounded-2xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lily-green font-semibold">Ква-группы</h3>
          <button onClick={onClose} className="text-lily-green/50 hover:text-lily-green">
            <X size={20} />
          </button>
        </div>

        <div className="flex gap-1 mb-4 bg-swamp-dark rounded-xl p-1">
          {(['create', 'join'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? 'bg-frog-skin text-swamp-darker' : 'text-lily-green/50 hover:text-lily-green'
              }`}
            >
              {t === 'create' ? 'Создать' : 'Вступить'}
            </button>
          ))}
        </div>

        {tab === 'create' ? (
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-lily-green/50 text-xs mb-1.5">Название группы *</p>
              <input
                autoFocus
                type="text"
                value={nameInput}
                onChange={(e) => { setNameInput(e.target.value); setError('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="Например: Ква-болото"
                maxLength={48}
                className="w-full bg-swamp-dark border border-frog-dark/30 rounded-xl px-4 py-3 text-lily-green text-sm placeholder-lily-green/30 outline-none focus:border-frog-skin transition-colors"
              />
            </div>
            <div>
              <p className="text-lily-green/50 text-xs mb-1.5">Описание (необязательно)</p>
              <input
                type="text"
                value={aboutInput}
                onChange={(e) => setAboutInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="О чём эта группа?"
                maxLength={128}
                className="w-full bg-swamp-dark border border-frog-dark/30 rounded-xl px-4 py-3 text-lily-green text-sm placeholder-lily-green/30 outline-none focus:border-frog-skin transition-colors"
              />
            </div>
          </div>
        ) : (
          <div>
            <p className="text-lily-green/50 text-xs mb-1.5">ID канала *</p>
            <input
              autoFocus
              type="text"
              value={channelIdInput}
              onChange={(e) => { setChannelIdInput(e.target.value); setError('') }}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="64-символьный hex..."
              className="w-full bg-swamp-dark border border-frog-dark/30 rounded-xl px-4 py-3 text-lily-green text-sm font-mono placeholder-lily-green/30 outline-none focus:border-frog-skin transition-colors"
            />
            <p className="text-lily-green/30 text-xs mt-1.5">
              ID можно скопировать в шапке группового чата
            </p>
          </div>
        )}

        {error && (
          <p className="text-red-400 text-xs mt-2 flex items-center gap-1">
            <AlertCircle size={12} /> {error}
          </p>
        )}

        <button
          onClick={handleAction}
          disabled={isDisabled}
          className="mt-4 w-full flex items-center justify-center gap-2 bg-frog-skin hover:bg-frog-dark text-swamp-darker font-bold py-3 rounded-full transition-colors disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : tab === 'create' ? (
            <><Users size={18} /> Создать группу</>
          ) : (
            <><LogIn size={18} /> Вступить</>
          )}
        </button>
      </div>
    </div>
  )
}
