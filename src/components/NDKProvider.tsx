import { useEffect } from 'react'
import { useNostrStore } from '../store/nostrStore'
import { createNDK } from '../lib/ndk'

export default function NDKProvider({ children }: { children: React.ReactNode }) {
  const { nsec, ndk } = useNostrStore()

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

  return <>{children}</>
}
