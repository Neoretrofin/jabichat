import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Loader2, Pencil, Check, X, Phone } from 'lucide-react'
import { useNostrStore } from '../store/nostrStore'
import { useChatStore } from '../store/chatStore'
import { useCallStore } from '../store/callStore'
import { sendDM } from '../lib/dm'
import Avatar from '../components/Avatar'
import { contactDisplayName, type Message } from '../types/chat'

function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}

function MessageBubble({ msg, mine }: { msg: Message; mine: boolean }) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm ${
          mine
            ? 'bg-frog-skin text-swamp-darker rounded-br-sm'
            : 'bg-swamp-darker border border-frog-dark/30 text-lily-green rounded-bl-sm'
        } ${msg.pending ? 'opacity-60' : ''}`}
      >
        <p className="leading-relaxed break-words">{msg.content}</p>
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
  const { ndk } = useNostrStore()
  const { contacts, messages, addMessage, updateMessage, updateContactName, clearUnread, setActiveChat } = useChatStore()
  const { startOutgoing } = useCallStore()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const contact = pubkey ? contacts[pubkey] : undefined
  const chatMessages: Message[] = pubkey ? (messages[pubkey] ?? []) : []

  const displayName = contactDisplayName(contact)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages.length])

  // Mark chat active + clear unread on entry; release on exit
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

  const handleSend = async () => {
    if (!text.trim() || !ndk || !pubkey || sending) return

    const content = text.trim()
    setText('')
    setSending(true)

    // Unique temp ID that won't collide with real event IDs
    const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const senderPubkey = (await ndk.signer!.user()).pubkey

    addMessage(pubkey, {
      id: tempId,
      content,
      senderPubkey,
      createdAt: Math.floor(Date.now() / 1000),
      pending: true,
    })

    try {
      await sendDM(ndk, pubkey, content)
      // Mark the optimistic message as delivered — never remove it
      updateMessage(pubkey, tempId, { pending: false })
    } catch (e) {
      console.error('Failed to send DM:', e)
      // Leave the message visible but keep pending so user sees it wasn't delivered
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

  return (
    <div className="flex flex-col h-[calc(100svh-56px-64px)]">
      {/* Header */}
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {chatMessages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">🪷</p>
            <p className="text-lily-green/40 text-sm">Ква! Начни разговор</p>
          </div>
        )}
        {chatMessages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} mine={msg.senderPubkey !== pubkey} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-frog-dark/20 bg-swamp-dark flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Квакни что-нибудь..."
          rows={1}
          className="flex-1 bg-swamp-darker border border-frog-dark/30 rounded-2xl px-4 py-2.5 text-lily-green text-sm placeholder-lily-green/30 outline-none focus:border-frog-skin transition-colors resize-none max-h-32"
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
    </div>
  )
}
