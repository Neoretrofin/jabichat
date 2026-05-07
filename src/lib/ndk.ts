import NDK, { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'

export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://nostr.wine',
]

export function createNDK(nsec: string): NDK {
  const signer = new NDKPrivateKeySigner(nsec)
  return new NDK({
    explicitRelayUrls: DEFAULT_RELAYS,
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
