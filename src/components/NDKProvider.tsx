import { useEffect } from 'react'
import { useNostrStore } from '../store/nostrStore'
import { createNDK } from '../lib/ndk'

export default function NDKProvider({ children }: { children: React.ReactNode }) {
  const { nsec, ndk, isConnected } = useNostrStore()

  useEffect(() => {
    if (nsec && !ndk) {
      const instance = createNDK(nsec)
      useNostrStore.setState({ ndk: instance, isConnecting: true })
      instance.connect(3000).then(() => {
        useNostrStore.setState({ isConnected: true, isConnecting: false })
      }).catch(() => {
        useNostrStore.setState({ isConnecting: false })
      })
    }
  }, [nsec, ndk])

  // Pull our own kind:0 once relays are reachable. Covers both fresh login
  // (login() sets isConnected) and app restart with persisted nsec (the
  // effect above sets isConnected). Without this, avatar/name stay stale
  // (or empty) after logout+relogin.
  useEffect(() => {
    if (isConnected) {
      useNostrStore.getState().refreshOwnMetadata()
    }
  }, [isConnected])

  return <>{children}</>
}
