import { useRef, useState } from 'react'
import {
  Copy, LogOut, Eye, EyeOff, CheckCheck, Wifi, WifiOff,
  Pencil, Check, Camera, Loader2, AlertCircle,
  Sun, Moon, Sprout, Radio, Settings2,
} from 'lucide-react'
import { useNostrStore } from '../store/nostrStore'
import { useThemeStore, type Theme } from '../store/themeStore'
import { uploadImage } from '../lib/upload'
import Avatar from '../components/Avatar'
import RelaySettingsModal from '../components/RelaySettingsModal'
import { useRelayStatus } from '../hooks/useRelayStatus'

const THEME_OPTIONS: { value: Theme; label: string; Icon: typeof Sprout }[] = [
  { value: 'jabi', label: 'Жаби', Icon: Sprout },
  { value: 'dark', label: 'Тёмная', Icon: Moon },
  { value: 'light', label: 'Светлая', Icon: Sun },
]

export default function ProfilePage() {
  const {
    npub, nsec, logout,
    profileName, setProfileName,
    avatar, setAvatar,
    publishMetadata, ndk,
  } = useNostrStore()
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  const [showNsec, setShowNsec] = useState(false)
  const [copied, setCopied] = useState<'npub' | 'nsec' | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(profileName)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [showRelaySettings, setShowRelaySettings] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { total: relayTotal, connected: relayConnected } = useRelayStatus()
  const anyConnected = relayConnected > 0

  const copy = async (text: string, type: 'npub' | 'nsec') => {
    await navigator.clipboard.writeText(text)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  const saveName = async () => {
    const trimmed = nameInput.trim()
    if (trimmed) {
      setProfileName(trimmed)
      await publishMetadata().catch(() => {})
    } else {
      setNameInput(profileName)
    }
    setEditingName(false)
  }

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !ndk) return

    if (!file.type.startsWith('image/')) {
      setUploadError('Файл должен быть изображением')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Файл слишком большой (>5MB)')
      return
    }

    setUploading(true)
    setUploadError(null)
    try {
      const url = await uploadImage(ndk, file)
      setAvatar(url)
      await publishMetadata().catch(() => {})
    } catch (err) {
      console.error('Upload failed:', err)
      setUploadError(err instanceof Error ? err.message : 'Не удалось загрузить картинку')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h2 className="text-lg font-semibold text-lily-green mb-4">Профиль жабки</h2>

      {/* Avatar + name */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative">
          <Avatar src={avatar} size={72} className="border-2 border-frog-skin/40" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="Загрузить аватар"
            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-frog-skin hover:bg-frog-dark text-swamp-darker flex items-center justify-center transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarPick}
            className="hidden"
          />
        </div>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
                maxLength={32}
                className="flex-1 bg-swamp-darker border border-frog-skin rounded-xl px-3 py-1.5 text-lily-green text-sm outline-none min-w-0"
              />
              <button onClick={saveName} className="text-frog-skin hover:text-frog-dark shrink-0">
                <Check size={18} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setNameInput(profileName); setEditingName(true) }}
              className="flex items-center gap-2 group"
            >
              <span className="text-lily-green font-medium">{profileName}</span>
              <Pencil size={13} className="text-lily-green/30 group-hover:text-frog-skin transition-colors" />
            </button>
          )}
          <div className="flex items-center gap-1.5 mt-1">
            {anyConnected ? (
              <>
                <Wifi size={12} className="text-frog-skin" />
                <span className="text-frog-skin text-xs">
                  Подключено {relayConnected} из {relayTotal} реле
                </span>
              </>
            ) : (
              <>
                <WifiOff size={12} className="text-lily-green/50" />
                <span className="text-lily-green/50 text-xs">
                  {relayTotal > 0
                    ? `Не подключён (0 из ${relayTotal})`
                    : 'Список реле пуст'}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {uploadError && (
        <div className="mb-4 bg-red-900/20 border border-red-900/40 rounded-xl p-3 flex items-center gap-2">
          <AlertCircle size={14} className="text-red-400 shrink-0" />
          <p className="text-red-400 text-xs">{uploadError}</p>
        </div>
      )}

      {/* Theme */}
      <div className="bg-swamp-darker rounded-2xl p-4 border border-frog-dark/20 mb-4">
        <p className="text-lily-green/50 text-xs font-semibold uppercase tracking-wider mb-3">Тема оформления</p>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map(({ value, label, Icon }) => {
            const active = theme === value
            return (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition-colors ${
                  active
                    ? 'bg-frog-skin text-swamp-darker border-frog-skin'
                    : 'bg-swamp-dark text-lily-green border-frog-dark/30 hover:border-frog-skin/40'
                }`}
              >
                <Icon size={20} />
                <span className="text-xs font-medium">{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Relays */}
      <div className="bg-swamp-darker rounded-2xl p-4 border border-frog-dark/20 mb-4">
        <p className="text-lily-green/50 text-xs font-semibold uppercase tracking-wider mb-3">Реле</p>
        <button
          onClick={() => setShowRelaySettings(true)}
          className="w-full flex items-center justify-between gap-3 bg-swamp-dark hover:bg-swamp-dark/60 border border-frog-dark/30 hover:border-frog-skin/40 rounded-xl px-3 py-2.5 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Radio size={16} className={anyConnected ? 'text-frog-skin' : 'text-lily-green/40'} />
            <div className="flex flex-col items-start min-w-0">
              <span className="text-lily-green text-sm">
                {relayTotal > 0
                  ? `${relayConnected} из ${relayTotal} подключено`
                  : 'Список реле пуст'}
              </span>
              <span className="text-lily-green/40 text-[11px]">
                Управление и кастомные URL
              </span>
            </div>
          </div>
          <Settings2 size={14} className="text-lily-green/50 shrink-0" />
        </button>
      </div>

      {/* Keys */}
      <div className="bg-swamp-darker rounded-2xl p-4 border border-frog-dark/20 mb-4">
        <p className="text-lily-green/50 text-xs font-semibold uppercase tracking-wider mb-3">Ключи Nostr</p>

        <div className="mb-4">
          <p className="text-lily-green/50 text-xs mb-1">Публичный ключ (npub)</p>
          <div className="flex items-center gap-2 bg-swamp-dark rounded-xl px-3 py-2">
            <p className="text-lily-green text-xs font-mono truncate flex-1">{npub}</p>
            <button onClick={() => copy(npub!, 'npub')} className="text-lily-green/50 hover:text-frog-skin shrink-0">
              {copied === 'npub' ? <CheckCheck size={14} className="text-frog-skin" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        <div>
          <p className="text-lily-green/50 text-xs mb-1">Приватный ключ (nsec) — НИКОМУ не давай!</p>
          <div className="flex items-center gap-2 bg-swamp-dark rounded-xl px-3 py-2">
            <p className={`text-lily-green text-xs font-mono truncate flex-1 ${!showNsec ? 'blur-sm select-none' : ''}`}>
              {nsec}
            </p>
            <button onClick={() => setShowNsec((v) => !v)} className="text-lily-green/50 hover:text-frog-skin shrink-0">
              {showNsec ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            {showNsec && (
              <button onClick={() => copy(nsec!, 'nsec')} className="text-lily-green/50 hover:text-frog-skin shrink-0">
                {copied === 'nsec' ? <CheckCheck size={14} className="text-frog-skin" /> : <Copy size={14} />}
              </button>
            )}
          </div>
        </div>
      </div>

      <button
        onClick={logout}
        className="w-full flex items-center justify-center gap-2 border border-red-900/50 text-red-400 hover:bg-red-900/20 py-3 rounded-full transition-colors"
      >
        <LogOut size={16} />
        Выйти из аккаунта
      </button>

      {showRelaySettings && <RelaySettingsModal onClose={() => setShowRelaySettings(false)} />}
    </div>
  )
}
