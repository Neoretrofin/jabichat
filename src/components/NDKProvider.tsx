import { useEffect, useRef } from 'react'
import { useNostrStore } from '../store/nostrStore'
import { useRelayStore } from '../store/relayStore'
import { createNDK } from '../lib/ndk'

export default function NDKProvider({ children }: { children: React.ReactNode }) {
  const { nsec, ndk, isConnected } = useNostrStore()
  const relayUrls = useRelayStore((s) => s.relayUrls)
  const relayKey = relayUrls.join('|')
  const lastKeyRef = useRef<string>('')

  useEffect(() => {
    if (!nsec) {
      lastKeyRef.current = ''
      return
    }

    // Если NDK уже создан с теми же реле — ничего не делаем.
    if (ndk && lastKeyRef.current === relayKey) return

    // Реле поменялись или это первый коннект после рестора nsec.
    // Гасим старый pool, создаём новый — NDK не любит горячее изменение
    // explicitRelayUrls.
    if (ndk) {
      try {
        ndk.pool?.relays.forEach((r) => r.disconnect())
      } catch { /* ignore */ }
    }

    const instance = createNDK(nsec, relayUrls)
    lastKeyRef.current = relayKey
    useNostrStore.setState({ ndk: instance, isConnecting: true, isConnected: false })
    instance.connect(3000).then(() => {
      // useRelayStatus подвинет isConnected, когда фактически кто-то поднимется,
      // но и здесь подстрахуемся флагом «попытка завершилась».
      useNostrStore.setState({ isConnecting: false })
      const anyConnected = Array.from(instance.pool?.relays.values() ?? []).some(
        (r) => r.status === 5 /* CONNECTED */ || r.status === 8 /* AUTHENTICATED */,
      )
      useNostrStore.setState({ isConnected: anyConnected })
    }).catch(() => {
      useNostrStore.setState({ isConnecting: false })
    })
  }, [nsec, relayKey, ndk, relayUrls])

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
