import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Loader2, Copy, CheckCheck, Reply, X, Smile } from 'lucide-react'
import { useNostrStore } from '../store/nostrStore'
import { useGroupStore } from '../store/groupStore'
import { useChatStore } from '../store/chatStore'
import { sendChannelMessage } from '../lib/channel'
import { useChannelSubscription } from '../hooks/useChannelSubscription'
import Avatar from '../components/Avatar'
import MessageContextMenu from '../components/MessageContextMenu'
import EmojiPicker from '../components/EmojiPicker'
import { renderMessageContent } from '../lib/customEmojis'
import type { GroupMessage } from '../types/group'
import { contactDisplayName, type Contact } from '../types/chat'

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

function senderName(
  pubkey: string,
  contacts: Record<string, Contact>,
  myPubkey: string | null,
  myName: string
): string {
  if (myPubkey && pubkey === myPubkey) return myName
  return contactDisplayName(contacts[pubkey])
}

interface BubbleProps {
  msg: GroupMessage
  mine: boolean
  replyTarget: GroupMessage | null
  contacts: Record<string, Contact>
  myPubkey: string | null
  myName: string
  isCoarse: boolean
  onOpenMenu: (msg: GroupMessage, x: number, y: number) => void
}

function GroupMessageBubble({
  msg, mine, replyTarget, contacts, myPubkey, myName, isCoarse, onOpenMenu,
}: BubbleProps) {
  const senderLabel = senderName(msg.senderPubkey, contacts, myPubkey, myName)
  const replyAuthorLabel = replyTarget
    ? senderName(replyTarget.senderPubkey, contacts, myPubkey, myName)
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
        }`}
      >
        {!mine && (
          <p className="text-frog-skin text-xs mb-1 font-medium">{senderLabel}</p>
        )}

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
                {renderMessageContent(snippetOf(replyTarget.content))}
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

        <p className="leading-relaxed break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{renderMessageContent(msg.content)}</p>
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
  const { ndk, profileName } = useNostrStore()
  const {
    groups, messages, addGroupMessage, clearUnread, setActiveChannel,
  } = useGroupStore()
  const { contacts } = useChatStore()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)
  const [myPubkey, setMyPubkey] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null)
  const [menuTarget, setMenuTarget] = useState<{ msg: GroupMessage; x: number; y: number } | null>(null)
  const [showEmoji, setShowEmoji] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const emojiBtnRef = useRef<HTMLButtonElement>(null)

  useChannelSubscription(channelId)

  // See ChatPage for the rationale — coarse pointer (mobile/tablet) opens
  // the menu on a single tap; on desktops we restrict to right-click so
  // ordinary clicks don't fight with text selection.
  const isCoarse = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    []
  )

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
  const messageById = useMemo(() => {
    const list = channelId ? (messages[channelId] ?? []) : []
    const m = new Map<string, GroupMessage>()
    for (const msg of list) m.set(msg.id, msg)
    return m
  }, [channelId, messages])
  const myName = profileName || 'Вы'

  const copyChannelId = async () => {
    if (!channelId) return
    await navigator.clipboard.writeText(channelId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpenMenu = (msg: GroupMessage, x: number, y: number) => {
    setMenuTarget({ msg, x, y })
  }

  const handleReplyFromMenu = () => {
    if (!menuTarget) return
    setReplyTo(menuTarget.msg)
    inputRef.current?.focus()
  }

  const handleSend = async () => {
    if (!text.trim() || !ndk || !channelId || sending || !myPubkey) return
    const content = text.trim()
    const replyId = replyTo?.id
    setText('')
    setReplyTo(null)
    setSending(true)
    try {
      const event = await sendChannelMessage(ndk, channelId, content, replyId)
      if (event.id) {
        addGroupMessage({
          id: event.id,
          channelId,
          content,
          senderPubkey: myPubkey,
          createdAt: event.created_at ?? Math.floor(Date.now() / 1000),
          ...(replyId ? { replyToId: replyId } : {}),
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

  const replyAuthorLabel = replyTo
    ? senderName(replyTo.senderPubkey, contacts, myPubkey, myName)
    : ''

  return (
    <div className="flex flex-col h-[calc(100svh-56px-64px)]">
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

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
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
            replyTarget={msg.replyToId ? messageById.get(msg.replyToId) ?? null : null}
            contacts={contacts}
            myPubkey={myPubkey}
            myName={myName}
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
              <p className="text-lily-green/60 text-xs truncate">{renderMessageContent(snippetOf(replyTo.content, 100))}</p>
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
            excludeRef={emojiBtnRef}
          />
        )}
        <button
          ref={emojiBtnRef}
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
