import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Loader2, Pencil, Check, X, Phone, Reply, Smile } from 'lucide-react'
import { useNostrStore } from '../store/nostrStore'
import { useChatStore } from '../store/chatStore'
import { useCallStore } from '../store/callStore'
import { buildDMRumor, publishDM, npubToHex } from '../lib/dm'
import Avatar from '../components/Avatar'
import MessageContextMenu from '../components/MessageContextMenu'
import EmojiPicker from '../components/EmojiPicker'
import { contactDisplayName, type Message, type Contact } from '../types/chat'

function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}

function snippetOf(text: string, max = 80): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

function hasTextSelection(): boolean {
  const sel = typeof window !== 'undefined' ? window.getSelection() : null
  return !!sel && sel.toString().length > 0
}

interface BubbleProps {
  msg: Message
  mine: boolean
  replyTarget: Message | null
  myPubkey: string | null
  peer: Contact | undefined
  myDisplayName: string
  isCoarse: boolean
  onOpenMenu: (msg: Message, x: number, y: number) => void
}

function MessageBubble({
  msg, mine, replyTarget, myPubkey, peer, myDisplayName, isCoarse, onOpenMenu,
}: BubbleProps) {
  const replyAuthorMine = replyTarget && myPubkey && replyTarget.senderPubkey === myPubkey
  const replyAuthorLabel = replyTarget
    ? (replyAuthorMine ? myDisplayName : contactDisplayName(peer))
    : ''

  const handleContextMenu = (e: React.MouseEvent) => {
    if (hasTextSelection()) return
    e.preventDefault()
    onOpenMenu(msg, e.clientX, e.clientY)
  }

  const handleClick = (e: React.MouseEvent) => {
    if (!isCoarse) return
    if (hasTextSelection()) return
    onOpenMenu(msg, e.clientX, e.clientY)
  }

  return (
    <div className={`mb-2 flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        onContextMenu={handleContextMenu}
        onClick={handleClick}
        className={`min-w-0 max-w-[78%] px-4 py-2.5 rounded-2xl text-sm cursor-pointer select-text ${
          mine
            ? 'bg-frog-skin text-swamp-darker rounded-br-sm'
            : 'bg-swamp-darker border border-frog-dark/30 text-lily-green rounded-bl-sm'
        } ${msg.pending ? 'opacity-60' : ''}`}
      >
        {msg.replyToId && (
          replyTarget ? (
            <div
              className={`mb-1.5 pl-2 pr-2 py-1 border-l-2 rounded ${
                mine
                  ? 'border-swamp-darker/40 bg-swamp-darker/15'
                  : 'border-frog-skin bg-frog-skin/10'
              }`}
            >
              <p className={`text-xs font-medium ${
                mine ? 'text-swamp-darker/70' : 'text-frog-skin'
              }`}>{replyAuthorLabel}</p>
              <p className={`text-xs break-words [overflow-wrap:anywhere] line-clamp-2 ${
                mine ? 'text-swamp-darker/60' : 'text-lily-green/70'
              }`}>
                {snippetOf(replyTarget.content)}
              </p>
            </div>
          ) : (
            <p className={`mb-1.5 text-xs italic ${
              mine ? 'text-swamp-darker/50' : 'text-lily-green/40'
            }`}>
              Исходное сообщение недоступно
            </p>
          )
        )}
        <p className="leading-relaxed break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{msg.content}</p>
        <p className={`text-xs mt-1 ${mine ? 'text-swamp-darker/60' : 'text-lily-green/40'} text-right`}>
          {msg.pending ? '⏳' : formatTime(msg.createdAt)}
        </p>
      </div>
    </div>
  )
}

export default function ChatPage() {
  const { pubkey } = useParams<{ pubkey: string }>()
  const navigate = useNavigate()
  const { ndk, npub, profileName } = useNostrStore()
  const {
    contacts, messages,
    addMessage, updateMessage,
    updateContactName, clearUnread, setActiveChat,
  } = useChatStore()
  const { startOutgoing } = useCallStore()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [menuTarget, setMenuTarget] = useState<{ msg: Message; x: number; y: number } | null>(null)
  const [showEmoji, setShowEmoji] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const myPubkey = useMemo(() => (npub ? npubToHex(npub) : null), [npub])
  const myDisplayName = profileName || 'Вы'

  // Touch / coarse-pointer devices use single-tap to open the menu; on
  // desktops the same tap would conflict with text selection, so there we
  // only react to right-click (onContextMenu).
  const isCoarse = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    []
  )

  const contact = pubkey ? contacts[pubkey] : undefined
  const chatMessages: Message[] = pubkey ? (messages[pubkey] ?? []) : []
  const messageById = useMemo(() => {
    const list = pubkey ? (messages[pubkey] ?? []) : []
    const m = new Map<string, Message>()
    for (const msg of list) m.set(msg.id, msg)
    return m
  }, [pubkey, messages])

  const displayName = contactDisplayName(contact)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages.length])

  useEffect(() => {
    if (!pubkey) return
    setActiveChat(pubkey)
    clearUnread(pubkey)
    return () => setActiveChat(null)
  }, [pubkey, setActiveChat, clearUnread])

  const startEditName = () => {
    setNameInput(contact?.name ?? '')
    setEditingName(true)
  }

  const saveName = () => {
    if (pubkey && nameInput.trim()) {
      updateContactName(pubkey, nameInput.trim())
    }
    setEditingName(false)
  }

  const handleOpenMenu = (msg: Message, x: number, y: number) => {
    setMenuTarget({ msg, x, y })
  }

  const handleReplyFromMenu = () => {
    if (!menuTarget) return
    setReplyTo(menuTarget.msg)
    inputRef.current?.focus()
  }

  const handleSend = async () => {
    if (!text.trim() || !ndk || !pubkey || sending || !myPubkey) return

    const content = text.trim()
    const replyId = replyTo?.id
    setText('')
    setReplyTo(null)
    setSending(true)

    try {
      const rumor = buildDMRumor(myPubkey, pubkey, content, replyId)

      addMessage(pubkey, {
        id: rumor.id,
        content,
        senderPubkey: myPubkey,
        createdAt: rumor.created_at,
        pending: true,
        ...(replyId ? { replyToId: replyId } : {}),
      })

      await publishDM(ndk, pubkey, rumor)
      updateMessage(pubkey, rumor.id, { pending: false })
    } catch (e) {
      console.error('Failed to send DM:', e)
    } finally {
      setSending(false)
    }
  }

  const startCall = () => {
    if (!pubkey) return
    const callId = `call-${Date.now()}-${Math.random().toString(36).slice(2)}`
    startOutgoing(pubkey, callId)
    navigate(`/call/${pubkey}`)
  }

  const replyAuthorLabel = replyTo
    ? (replyTo.senderPubkey === myPubkey ? myDisplayName : displayName)
    : ''

  return (
    <div className="flex flex-col h-[calc(100svh-56px-64px)]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-frog-dark/20 bg-swamp-dark">
        <button onClick={() => navigate('/chats')} className="text-lily-green/70 hover:text-lily-green">
          <ArrowLeft size={20} />
        </button>
        <Avatar src={contact?.picture} size={36} />
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
                maxLength={32}
                placeholder={displayName}
                className="flex-1 bg-swamp-darker border border-frog-skin rounded-lg px-2 py-1 text-lily-green text-sm outline-none min-w-0"
              />
              <button onClick={saveName} className="text-frog-skin shrink-0"><Check size={16} /></button>
              <button onClick={() => setEditingName(false)} className="text-lily-green/40 shrink-0"><X size={16} /></button>
            </div>
          ) : (
            <button onClick={startEditName} className="flex items-center gap-1.5 group w-full text-left">
              <span className="text-lily-green font-medium text-sm truncate">{displayName}</span>
              <Pencil size={12} className="text-lily-green/30 group-hover:text-frog-skin transition-colors shrink-0" />
            </button>
          )}
          <p className="text-lily-green/40 text-xs">Nostr DM · NIP-17</p>
        </div>
        <button
          onClick={startCall}
          title="Позвонить"
          className="w-9 h-9 rounded-full bg-frog-skin/10 hover:bg-frog-skin text-frog-skin hover:text-swamp-darker flex items-center justify-center transition-colors shrink-0"
        >
          <Phone size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
        {chatMessages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">🪷</p>
            <p className="text-lily-green/40 text-sm">Ква! Начни разговор</p>
          </div>
        )}
        {chatMessages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            mine={msg.senderPubkey !== pubkey}
            replyTarget={msg.replyToId ? messageById.get(msg.replyToId) ?? null : null}
            myPubkey={myPubkey}
            peer={contact}
            myDisplayName={myDisplayName}
            isCoarse={isCoarse}
            onOpenMenu={handleOpenMenu}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {replyTo && (
        <div className="px-4 pt-2 bg-swamp-dark">
          <div className="flex items-center gap-2 px-3 py-2 bg-swamp-darker border-l-2 border-frog-skin rounded-r-xl rounded-tl-xl">
            <Reply size={14} className="text-frog-skin shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-frog-skin text-xs font-medium truncate">{replyAuthorLabel}</p>
              <p className="text-lily-green/60 text-xs truncate">{snippetOf(replyTo.content, 100)}</p>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              title="Отменить ответ"
              className="text-lily-green/40 hover:text-lily-green shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="relative px-4 py-3 border-t border-frog-dark/20 bg-swamp-dark flex items-end gap-2">
        {showEmoji && (
          <EmojiPicker
            onSelect={(emoji) => {
              setText((prev) => prev + emoji)
              inputRef.current?.focus()
            }}
            onClose={() => setShowEmoji(false)}
          />
        )}
        <button
          onClick={() => setShowEmoji((v) => !v)}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0 ${
            showEmoji
              ? 'bg-frog-skin text-swamp-darker'
              : 'bg-swamp-darker border border-frog-dark/30 text-lily-green/50 hover:text-frog-skin hover:border-frog-skin'
          }`}
          title="Эмодзи"
        >
          <Smile size={18} />
        </button>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
            if (e.key === 'Escape' && replyTo) setReplyTo(null)
          }}
          placeholder="Квакни что-нибудь..."
          rows={1}
          className="flex-1 min-w-0 bg-swamp-darker border border-frog-dark/30 rounded-2xl px-4 py-2.5 text-lily-green text-sm placeholder-lily-green/30 outline-none focus:border-frog-skin transition-colors resize-none max-h-32"
          style={{ fieldSizing: 'content' } as React.CSSProperties}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="w-10 h-10 rounded-full bg-frog-skin hover:bg-frog-dark text-swamp-darker flex items-center justify-center transition-colors disabled:opacity-50 shrink-0"
        >
          {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
        </button>
      </div>

      {menuTarget && (
        <MessageContextMenu
          x={menuTarget.x}
          y={menuTarget.y}
          onReply={handleReplyFromMenu}
          onClose={() => setMenuTarget(null)}
        />
      )}
    </div>
  )
}
