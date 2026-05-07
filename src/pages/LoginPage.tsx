import { useState } from 'react'
import { KeyRound, Sparkles, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useNostrStore } from '../store/nostrStore'

export default function LoginPage() {
  const [mode, setMode] = useState<'landing' | 'import'>('landing')
  const [nsecInput, setNsecInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [generatedKeys, setGeneratedKeys] = useState<{ nsec: string; npub: string } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { generateKey, login } = useNostrStore()

  const handleGenerate = () => {
    const keys = generateKey()
    setGeneratedKeys(keys)
    setMode('landing')
  }

  const handleLoginWithGenerated = async () => {
    if (!generatedKeys) return
    setLoading(true)
    setError('')
    try {
      await login(generatedKeys.nsec)
    } catch (e) {
      setError('Не удалось подключиться. Попробуй ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  const handleLoginWithNsec = async () => {
    if (!nsecInput.trim()) return
    setLoading(true)
    setError('')
    try {
      await login(nsecInput.trim())
    } catch (e) {
      setError('Неверный ключ или ошибка подключения.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-svh bg-swamp-dark flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="text-center mb-10">
        <div className="text-7xl mb-4 animate-bounce">🐸</div>
        <h1 className="text-3xl font-bold text-lily-green">jabichat</h1>
        <p className="text-lily-green/60 text-sm mt-2">
          Децентрализованный мессенджер на Nostr
        </p>
      </div>

      {/* Generated keys display */}
      {generatedKeys && (
        <div className="w-full max-w-sm mb-6 bg-swamp-darker border border-frog-skin/30 rounded-2xl p-4">
          <p className="text-frog-skin text-xs font-semibold uppercase tracking-wider mb-3">
            🔑 Твои ключи жабки
          </p>

          <div className="mb-3">
            <p className="text-lily-green/50 text-xs mb-1">Публичный ключ (npub) — можно делиться</p>
            <p className="text-lily-green text-xs font-mono break-all bg-swamp-dark rounded-xl p-2">
              {generatedKeys.npub}
            </p>
          </div>

          <div className="mb-4">
            <p className="text-lily-green/50 text-xs mb-1">Приватный ключ (nsec) — НИКОМУ не давай!</p>
            <div className="relative">
              <p className={`text-lily-green text-xs font-mono break-all bg-swamp-dark rounded-xl p-2 pr-8 ${!showKey ? 'blur-sm select-none' : ''}`}>
                {generatedKeys.nsec}
              </p>
              <button
                onClick={() => setShowKey((v) => !v)}
                className="absolute top-2 right-2 text-lily-green/60 hover:text-lily-green"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className="bg-mud-light/20 rounded-xl p-3 mb-4 flex gap-2">
            <AlertCircle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-yellow-400/80 text-xs">
              Сохрани nsec в безопасном месте! Потеряешь — аккаунт не восстановить.
            </p>
          </div>

          <button
            onClick={handleLoginWithGenerated}
            disabled={loading}
            className="w-full bg-frog-skin hover:bg-frog-dark text-swamp-darker font-bold py-3 rounded-full transition-colors disabled:opacity-60"
          >
            {loading ? 'Подключаюсь к реле...' : 'Ква! Войти как эта жабка 🐸'}
          </button>
        </div>
      )}

      {/* Import mode */}
      {mode === 'import' && (
        <div className="w-full max-w-sm mb-6">
          <div className="bg-swamp-darker border border-frog-dark/30 rounded-2xl p-4">
            <p className="text-lily-green/70 text-sm mb-3">Вставь свой nsec-ключ:</p>
            <input
              type="password"
              value={nsecInput}
              onChange={(e) => setNsecInput(e.target.value)}
              placeholder="nsec1..."
              className="w-full bg-swamp-dark border border-frog-dark/30 rounded-xl px-4 py-3 text-lily-green text-sm font-mono placeholder-lily-green/30 outline-none focus:border-frog-skin transition-colors"
            />
            {error && (
              <p className="text-red-400 text-xs mt-2 flex items-center gap-1">
                <AlertCircle size={12} /> {error}
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { setMode('landing'); setNsecInput(''); setError('') }}
                className="flex-1 border border-frog-dark/50 text-lily-green/70 py-2.5 rounded-full text-sm hover:border-frog-skin transition-colors"
              >
                Назад
              </button>
              <button
                onClick={handleLoginWithNsec}
                disabled={!nsecInput.trim() || loading}
                className="flex-1 bg-frog-skin hover:bg-frog-dark text-swamp-darker font-bold py-2.5 rounded-full text-sm transition-colors disabled:opacity-60"
              >
                {loading ? 'Вход...' : 'Войти'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main buttons */}
      {mode === 'landing' && !generatedKeys && (
        <div className="w-full max-w-sm flex flex-col gap-3">
          <button
            onClick={handleGenerate}
            className="flex items-center justify-center gap-2 bg-frog-skin hover:bg-frog-dark text-swamp-darker font-bold py-4 rounded-full transition-colors"
          >
            <Sparkles size={20} />
            Создать жабку (новый аккаунт)
          </button>
          <button
            onClick={() => setMode('import')}
            className="flex items-center justify-center gap-2 border border-frog-dark/50 text-lily-green hover:border-frog-skin py-4 rounded-full transition-colors"
          >
            <KeyRound size={20} />
            Войти по ключу (nsec)
          </button>
        </div>
      )}
    </div>
  )
}
