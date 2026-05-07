import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Loader2, Copy, CheckCheck } from 'lucide-react'
import { useNostrStore } from '../store/nostrStore'
import { useGroupStore } from '../store/groupStore'
import { useChatStore } from '../store/chatStore'
import { sendChannelMessage } from '../lib/channel'
import { useChannelSubscription } from '../hooks/useChannelSubscription'
import Avatar from '../components/Avatar'
import type { GroupMessage } from '../types/group'
import { contactDisplayName, type Contact } from '../types/chat'

function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}

function resolveSender(pubkey: string, contacts: Record<string, Contact>): string {
  return contactDisplayName(contacts[pubkey])
}

function GroupMessageBubble({
  msg,
  mine,
  senderLabel,
}: {
  msg: GroupMessage
  mine: boolean
  senderLabel: string
}) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm ${
          mine
            ? 'bg-frog-skin text-swamp-darker rounded-br-sm'
            : 'bg-swamp-darker border border-frog-dark/30 text-lily-green rounded-bl-sm'
        }`}
      >
        {!mine && (
          <p className="text-frog-skin text-xs mb-1 font-medium">{senderLabel}</p>
        )}
        <p className="leading-relaxed break-words">{msg.content}</p>
        <p className={`text-xs mt-1 ${mine ? 'text-swamp-darker/60' : 'text-lily-green/40'} text-right`}>
          {formatTime(msg.createdAt)}
        </p>
      </div>
    </div>
  )
}

export default function GroupChatPage() {
  const { channelId } = useParams<{ channelId: string }>()
  const navigate = useNavigate()
  const { ndk } = useNostrStore()
  const { groups, messages, addGroupMessage, clearUnread, setActiveChannel } = useGroupStore()
  const { contacts } = useChatStore()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)
  const [myPubkey, setMyPubkey] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useChannelSubscription(channelId)

  useEffect(() => {
    ndk?.signer?.user().then((u) => setMyPubkey(u.pubkey))
  }, [ndk])

  useEffect(() => {
    if (!channelId) return
    setActiveChannel(channelId)
    clearUnread(channelId)
    return () => setActiveChannel(null)
  }, [channelId, setActiveChannel, clearUnread])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages[channelId ?? '']?.length])

  const group = channelId ? groups[channelId] : undefined
  const chatMessages: GroupMessage[] = channelId ? (messages[channelId] ?? []) : []

  const copyChannelId = async () => {
    if (!channelId) return
    await navigator.clipboard.writeText(channelId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSend = async () => {
    if (!text.trim() || !ndk || !channelId || sending || !myPubkey) return
    const content = text.trim()
    setText('')
    setSending(true)
    try {
      const event = await sendChannelMessage(ndk, channelId, content)
      // add immediately — subscription will deduplicate when relay echoes it back
      if (event.id) {
        addGroupMessage({
          id: event.id,
          channelId,
          content,
          senderPubkey: myPubkey,
          createdAt: event.created_at ?? Math.floor(Date.now() / 1000),
        })
      }
    } catch (e) {
      console.error('Failed to send group message:', e)
      setText(content)
    } finally {
      setSending(false)
    }
  }

  if (!group) {
    return (
      <div className="flex flex-col h-[calc(100svh-56px-64px)] items-center justify-center gap-2">
        <p className="text-lily-green/50">Группа не найдена</p>
        <button onClick={() => navigate('/groups')} className="text-frog-skin text-sm">
          ← Назад
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100svh-56px-64px)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-frog-dark/20 bg-swamp-dark">
        <button onClick={() => navigate('/groups')} className="text-lily-green/70 hover:text-lily-green">
          <ArrowLeft size={20} />
        </button>
        <Avatar src={group.picture} size={36} fallback="🌿" />
        <div className="flex-1 min-w-0">
          <p className="text-lily-green font-medium text-sm truncate">{group.name}</p>
          <button
            onClick={copyChannelId}
            className="flex items-center gap-1 text-lily-green/40 text-xs hover:text-frog-skin transition-colors"
          >
            {copied ? (
              <CheckCheck size={11} className="text-frog-skin" />
            ) : (
              <Copy size={11} />
            )}
            <span>{copied ? 'Скопировано!' : 'Скопировать ID группы'}</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {chatMessages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">🌿</p>
            <p className="text-lily-green/40 text-sm">Ква! Начни разговор в группе</p>
            {group.about && (
              <p className="text-lily-green/30 text-xs mt-1">{group.about}</p>
            )}
          </div>
        )}
        {chatMessages.map((msg) => (
          <GroupMessageBubble
            key={msg.id}
            msg={msg}
            mine={msg.senderPubkey === myPubkey}
            senderLabel={resolveSender(msg.senderPubkey, contacts)}
          />
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
