import NDK, { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'

export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://nostr.wine',
]

export interface CuratedRelay {
  url: string
  label: string
  description?: string
  /** Эмпирически замечено, что реле часто проходит из РФ. Статус
   *  ориентировочный — провайдеры и реле меняются, юзер должен сам
   *  потестить. */
  ruFriendly?: boolean
}

export const CURATED_RELAYS: CuratedRelay[] = [
  { url: 'wss://relay.damus.io',          label: 'Damus',     description: 'Большое публичное реле' },
  { url: 'wss://nos.lol',                 label: 'nos.lol',   description: 'Стабильное, мало ограничений' },
  { url: 'wss://relay.nostr.band',        label: 'Nostr Band', description: 'Индексирующее, поиск' },
  { url: 'wss://nostr.wine',              label: 'Nostr Wine', description: 'Куратор для качества' },
  { url: 'wss://relay.snort.social',      label: 'Snort',     description: 'Реле клиента Snort' },
  { url: 'wss://nostr-pub.wellorder.net', label: 'Wellorder', description: 'Долгожитель, стабильное' },
  { url: 'wss://nostr.mom',               label: 'Nostr Mom', description: 'Небольшое, мало фильтров', ruFriendly: true },
  { url: 'wss://offchain.pub',            label: 'Offchain',  description: 'Часто работает из РФ', ruFriendly: true },
  { url: 'wss://relay.nostr.bg',          label: 'Nostr BG',  description: 'Болгарское реле', ruFriendly: true },
]

export function createNDK(nsec: string, relayUrls: string[] = DEFAULT_RELAYS): NDK {
  const signer = new NDKPrivateKeySigner(nsec)
  return new NDK({
    explicitRelayUrls: relayUrls.length > 0 ? relayUrls : DEFAULT_RELAYS,
    signer,
  })
}

export function generateNsec(): { nsec: string; npub: string } {
  const signer = NDKPrivateKeySigner.generate()
  return {
    nsec: signer.nsec,
    npub: signer.npub,
  }
}

export function nsecToNpub(nsec: string): string {
  const signer = new NDKPrivateKeySigner(nsec)
  return signer.npub
}

export function normalizeRelayUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  // Allow ws:// for self-hosted local relays, but recommend wss://
  if (!/^wss?:\/\//i.test(trimmed)) return null
  return trimmed.replace(/\/+$/, '').toLowerCase()
}
