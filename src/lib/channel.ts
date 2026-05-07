import NDK, { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk'
import type { Group } from '../types/group'

export async function createChannel(ndk: NDK, name: string, about?: string): Promise<Group> {
  const event = new NDKEvent(ndk)
  event.kind = 40 as NDKKind
  event.content = JSON.stringify({ name, about: about ?? '', picture: '' })
  event.tags = []
  await event.publish()
  return {
    id: event.id!,
    name,
    about,
    createdAt: event.created_at!,
    creatorPubkey: event.pubkey,
  }
}

export async function joinChannel(ndk: NDK, channelId: string): Promise<Group | null> {
  const event = await ndk.fetchEvent(channelId)
  if (!event || event.kind !== (40 as NDKKind)) return null
  let name = `${channelId.slice(0, 8)}...`
  let about: string | undefined
  try {
    const meta = JSON.parse(event.content) as { name?: string; about?: string }
    if (meta.name) name = meta.name
    if (meta.about) about = meta.about
  } catch { /* malformed content — use fallback name */ }
  return {
    id: event.id!,
    name,
    about,
    createdAt: event.created_at!,
    creatorPubkey: event.pubkey,
  }
}

export async function sendChannelMessage(
  ndk: NDK,
  channelId: string,
  text: string,
  replyToId?: string
): Promise<NDKEvent> {
  const event = new NDKEvent(ndk)
  event.kind = 42 as NDKKind
  event.content = text
  const tags: string[][] = [['e', channelId, '', 'root']]
  if (replyToId) tags.push(['e', replyToId, '', 'reply'])
  event.tags = tags
  await event.publish()
  return event
}

