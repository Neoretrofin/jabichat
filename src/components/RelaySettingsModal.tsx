import { useState } from 'react'
import { X, Plus, Trash2, RotateCcw, AlertCircle, AlertTriangle } from 'lucide-react'
import { useRelayStore } from '../store/relayStore'
import { CURATED_RELAYS } from '../lib/ndk'
import { useRelayStatus, type RelayLiveStatus } from '../hooks/useRelayStatus'

interface Props {
  onClose: () => void
}

function StatusDot({ status }: { status: RelayLiveStatus | undefined }) {
  const color =
    status === 'connected'
      ? 'bg-frog-skin'
      : status === 'connecting'
        ? 'bg-yellow-400 animate-pulse'
        : 'bg-red-500/70'
  const title =
    status === 'connected' ? 'Подключено' : status === 'connecting' ? 'Подключается...' : 'Не подключено'
  return <span title={title} className={`inline-block w-2 h-2 rounded-full shrink-0 ${color}`} />
}

export default function RelaySettingsModal({ onClose }: Props) {
  const { relayUrls, addRelay, removeRelay, resetToDefaults } = useRelayStore()
  const { perRelay } = useRelayStatus()

  const [customUrl, setCustomUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleAdd = (url: string) => {
    setError(null)
    const res = addRelay(url)
    if (!res.ok) {
      setError(res.reason ?? 'Не удалось добавить реле')
      return
    }
    setCustomUrl('')
  }

  const activeSet = new Set(relayUrls.map((u) => u.toLowerCase()))
  const suggestions = CURATED_RELAYS.filter((r) => !activeSet.has(r.url.toLowerCase()))

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-swamp-darker border border-frog-dark/30 rounded-2xl w-full max-w-md p-5 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h3 className="text-lily-green font-semibold">Настройка реле</h3>
          <button onClick={onClose} className="text-lily-green/50 hover:text-lily-green">
            <X size={20} />
          </button>
        </div>

        <p className="text-lily-green/50 text-xs mb-4 shrink-0">
          Чтобы сообщения и звонки доходили, у тебя и собеседника должно быть хотя бы одно общее реле.
        </p>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {/* Active relays */}
          <p className="text-lily-green/50 text-[10px] uppercase tracking-wider mb-2">
            Активные ({relayUrls.length})
          </p>
          <div className="flex flex-col gap-1.5 mb-5">
            {relayUrls.length === 0 && (
              <p className="text-lily-green/40 text-xs italic">Список пуст — добавь хотя бы одно реле.</p>
            )}
            {relayUrls.map((url) => (
              <div
                key={url}
                className="flex items-center gap-2 bg-swamp-dark border border-frog-dark/20 rounded-xl px-3 py-2"
              >
                <StatusDot status={perRelay[url]} />
                <span className="text-lily-green text-xs font-mono truncate flex-1" title={url}>
                  {url.replace(/^wss?:\/\//, '')}
                </span>
                <button
                  onClick={() => removeRelay(url)}
                  title="Удалить из списка"
                  className="text-red-400/70 hover:text-red-400 shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <>
              <p className="text-lily-green/50 text-[10px] uppercase tracking-wider mb-2">
                Рекомендуемые
              </p>
              <div className="flex flex-col gap-1.5 mb-5">
                {suggestions.map((r) => (
                  <div
                    key={r.url}
                    className="flex items-center gap-2 bg-swamp-dark/60 border border-frog-dark/20 rounded-xl px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-lily-green text-sm font-medium">{r.label}</span>
                        {r.ruFriendly && (
                          <span
                            title="Часто работает из РФ — но не гарантия"
                            className="text-[10px] bg-frog-skin/15 text-frog-skin px-1.5 py-0.5 rounded-full"
                          >
                            🇷🇺 RU-friendly
                          </span>
                        )}
                      </div>
                      {r.description && (
                        <p className="text-lily-green/40 text-[11px] truncate">{r.description}</p>
                      )}
                      <p className="text-lily-green/30 text-[10px] font-mono truncate">
                        {r.url.replace(/^wss?:\/\//, '')}
                      </p>
                    </div>
                    <button
                      onClick={() => handleAdd(r.url)}
                      title="Добавить"
                      className="shrink-0 w-8 h-8 rounded-full bg-frog-skin/10 hover:bg-frog-skin text-frog-skin hover:text-swamp-darker flex items-center justify-center transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5 items-start text-lily-green/40 text-[11px] mb-5">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <p>
                  Метка «RU-friendly» ориентировочна. Реле и блокировки меняются — потести с собеседником.
                </p>
              </div>
            </>
          )}

          {/* Custom URL */}
          <p className="text-lily-green/50 text-[10px] uppercase tracking-wider mb-2">
            Свой URL
          </p>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={customUrl}
              onChange={(e) => { setCustomUrl(e.target.value); setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(customUrl) }}
              placeholder="wss://relay.example.com"
              className="flex-1 bg-swamp-dark border border-frog-dark/30 rounded-xl px-3 py-2 text-lily-green text-xs font-mono placeholder-lily-green/30 outline-none focus:border-frog-skin transition-colors"
            />
            <button
              onClick={() => handleAdd(customUrl)}
              disabled={!customUrl.trim()}
              className="shrink-0 px-3 rounded-xl bg-frog-skin/10 hover:bg-frog-skin text-frog-skin hover:text-swamp-darker transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={16} />
            </button>
          </div>
          {error && (
            <p className="text-red-400 text-xs flex items-center gap-1 mb-2">
              <AlertCircle size={12} /> {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 mt-2 border-t border-frog-dark/20 shrink-0">
          <button
            onClick={() => { resetToDefaults(); setError(null) }}
            className="w-full flex items-center justify-center gap-2 text-lily-green/60 hover:text-frog-skin text-xs py-2 transition-colors"
          >
            <RotateCcw size={12} />
            Сбросить к стандартному набору
          </button>
        </div>
      </div>
    </div>
  )
}
