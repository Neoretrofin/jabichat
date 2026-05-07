import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus, MessageCircle, Users, Phone, Trash2 } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import { useGroupStore } from '../store/groupStore'
import { useCallStore } from '../store/callStore'
import AddContactModal from '../components/AddContactModal'
import CreateGroupModal from '../components/CreateGroupModal'
import ConfirmModal from '../components/ConfirmModal'
import Avatar from '../components/Avatar'
import { contactDisplayName } from '../types/chat'

type ListItem =
  | { kind: 'dm'; pubkey: string; name: string; picture?: string; lastContent?: string; lastAt: number; unread: number }
  | { kind: 'group'; channelId: string; name: string; picture?: string; lastContent?: string; lastAt: number; unread: number }

export default function ChatsPage() {
  const [showAdd, setShowAdd] = useState(false)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: 'dm'; pubkey: string; name: string }
    | { kind: 'group'; channelId: string; name: string }
    | null
  >(null)
  const { contacts, messages: dmMessages, lastActivity: dmActivity, unread: dmUnread, removeChat } = useChatStore()
  const { groups, messages: gMessages, lastActivity: gActivity, unread: gUnread, removeGroup } = useGroupStore()
  const { startOutgoing } = useCallStore()
  const navigate = useNavigate()

  const items: ListItem[] = [
    ...Object.values(contacts).map((c) => {
      const msgs = dmMessages[c.pubkey] ?? []
      const last = msgs[msgs.length - 1]
      return {
        kind: 'dm' as const,
        pubkey: c.pubkey,
        name: contactDisplayName(c),
        picture: c.picture,
        lastContent: last?.content,
        lastAt: dmActivity[c.pubkey] ?? 0,
        unread: dmUnread[c.pubkey] ?? 0,
      }
    }),
    ...Object.values(groups).map((g) => {
      const msgs = gMessages[g.id] ?? []
      const last = msgs[msgs.length - 1]
      return {
        kind: 'group' as const,
        channelId: g.id,
        name: g.name,
        picture: g.picture,
        lastContent: last?.content,
        lastAt: gActivity[g.id] ?? g.createdAt,
        unread: gUnread[g.id] ?? 0,
      }
    }),
  ].sort((a, b) => b.lastAt - a.lastAt)

  const open = (item: ListItem) => {
    if (item.kind === 'dm') navigate(`/chats/${item.pubkey}`)
    else navigate(`/groups/${item.channelId}`)
  }

  const startCall = (peerPubkey: string) => {
    const callId = `call-${Date.now()}-${Math.random().toString(36).slice(2)}`
    startOutgoing(peerPubkey, callId)
    navigate(`/call/${peerPubkey}`)
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="text-lg font-semibold text-lily-green">Чаты</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateGroup(true)}
            title="Создать или вступить в группу"
            className="flex items-center gap-1.5 bg-frog-skin/10 hover:bg-frog-skin/20 text-frog-skin px-3 py-1.5 rounded-full text-sm transition-colors"
          >
            <Users size={15} />
            Группа
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 bg-frog-skin/10 hover:bg-frog-skin/20 text-frog-skin px-3 py-1.5 rounded-full text-sm transition-colors"
          >
            <UserPlus size={15} />
            Жабка
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-swamp-darker rounded-2xl p-6 border border-frog-dark/20 text-center">
          <p className="text-4xl mb-3">🐸</p>
          <p className="text-lily-green/70 text-sm">Ква! Пока пусто.</p>
          <p className="text-lily-green/40 text-xs mt-1">
            Добавь жабку или создай Ква-группу
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const id = item.kind === 'dm' ? item.pubkey : item.channelId
            return (
              <div
                key={`${item.kind}-${id}`}
                onClick={() => open(item)}
                className="flex items-center gap-3 bg-swamp-darker hover:bg-swamp-darker/70 border border-frog-dark/20 rounded-2xl p-3 cursor-pointer transition-colors"
              >
                <Avatar
                  src={item.picture}
                  size={44}
                  fallback={item.kind === 'group' ? '🌿' : '🐸'}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {item.kind === 'group' && <Users size={11} className="text-frog-skin shrink-0" />}
                    <p className="text-lily-green font-medium text-sm truncate">{item.name}</p>
                  </div>
                  {item.lastContent ? (
                    <p className="text-lily-green/50 text-xs truncate mt-0.5">{item.lastContent}</p>
                  ) : (
                    <p className="text-lily-green/30 text-xs mt-0.5 flex items-center gap-1">
                      <MessageCircle size={11} /> Начни разговор
                    </p>
                  )}
                </div>

                <div className="flex gap-1 shrink-0">
                  {item.kind === 'dm' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); startCall(item.pubkey) }}
                      title="Позвонить"
                      className="w-8 h-8 rounded-full bg-frog-skin/10 hover:bg-frog-skin text-frog-skin hover:text-swamp-darker flex items-center justify-center transition-colors"
                    >
                      <Phone size={14} />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (item.kind === 'dm') {
                        setConfirmDelete({ kind: 'dm', pubkey: item.pubkey, name: item.name })
                      } else {
                        setConfirmDelete({ kind: 'group', channelId: item.channelId, name: item.name })
                      }
                    }}
                    title={item.kind === 'group' ? 'Удалить группу' : 'Удалить чат'}
                    className="w-8 h-8 rounded-full bg-red-900/20 hover:bg-red-600 text-red-400 hover:text-white flex items-center justify-center transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0 min-w-[40px]">
                  {item.lastAt > 0 && (
                    <span className="text-lily-green/30 text-xs">
                      {new Date(item.lastAt * 1000).toLocaleTimeString('ru', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                  {item.unread > 0 && (
                    <span className="bg-frog-skin text-swamp-darker text-xs font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
                      {item.unread > 99 ? '99+' : item.unread}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAdd && <AddContactModal onClose={() => setShowAdd(false)} />}
      {showCreateGroup && <CreateGroupModal onClose={() => setShowCreateGroup(false)} />}
      {confirmDelete && (
        <ConfirmModal
          title={
            confirmDelete.kind === 'dm'
              ? `Удалить чат с «${confirmDelete.name}»?`
              : `Удалить группу «${confirmDelete.name}»?`
          }
          description={
            confirmDelete.kind === 'dm'
              ? 'История сообщений и сам контакт будут удалены с этого устройства. Сами сообщения в реле останутся, но из приложения исчезнут.'
              : 'Группа исчезнет из твоего списка вместе с историей сообщений на этом устройстве. На реле канал и его сообщения сохранятся — другие участники их увидят.'
          }
          confirmLabel="Удалить"
          destructive
          onConfirm={() => {
            if (confirmDelete.kind === 'dm') removeChat(confirmDelete.pubkey)
            else removeGroup(confirmDelete.channelId)
            setConfirmDelete(null)
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
