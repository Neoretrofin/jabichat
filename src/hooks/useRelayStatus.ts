import { useEffect, useState } from 'react'
import { NDKRelayStatus } from '@nostr-dev-kit/ndk'
import type NDK from '@nostr-dev-kit/ndk'
import type { NDKRelay } from '@nostr-dev-kit/ndk'
import { useNostrStore } from '../store/nostrStore'

export type RelayLiveStatus = 'connected' | 'connecting' | 'disconnected'

export interface RelayStatusSnapshot {
  total: number
  connected: number
  perRelay: Record<string, RelayLiveStatus>
}

function classify(status: NDKRelayStatus): RelayLiveStatus {
  // 5 = CONNECTED, 8 = AUTHENTICATED — оба считаются «живыми».
  if (status === NDKRelayStatus.CONNECTED || status === NDKRelayStatus.AUTHENTICATED) {
    return 'connected'
  }
  // 2 = RECONNECTING, 4 = CONNECTING, 6/7 = AUTH* — в процессе.
  if (
    status === NDKRelayStatus.CONNECTING ||
    status === NDKRelayStatus.RECONNECTING ||
    status === NDKRelayStatus.AUTH_REQUESTED ||
    status === NDKRelayStatus.AUTHENTICATING
  ) {
    return 'connecting'
  }
  return 'disconnected'
}

function snapshot(ndk: NDK | null): RelayStatusSnapshot {
  const result: RelayStatusSnapshot = { total: 0, connected: 0, perRelay: {} }
  if (!ndk?.pool) return result
  ndk.pool.relays.forEach((relay: NDKRelay, url: string) => {
    const s = classify(relay.status)
    result.perRelay[url] = s
    result.total += 1
    if (s === 'connected') result.connected += 1
  })
  return result
}

/**
 * Подписывается на pool-события NDK и возвращает живой снимок статусов реле.
 * Также синхронизирует `isConnected` в `nostrStore` — true, если хотя бы одно
 * реле подключено. Старый бинарный индикатор продолжает работать.
 */
export function useRelayStatus(): RelayStatusSnapshot {
  const ndk = useNostrStore((s) => s.ndk)
  const [snap, setSnap] = useState<RelayStatusSnapshot>(() => snapshot(ndk))

  useEffect(() => {
    if (!ndk?.pool) {
      setSnap({ total: 0, connected: 0, perRelay: {} })
      return
    }

    const refresh = () => {
      const next = snapshot(ndk)
      setSnap(next)
      const storeConnected = useNostrStore.getState().isConnected
      const anyConnected = next.connected > 0
      if (storeConnected !== anyConnected) {
        useNostrStore.setState({ isConnected: anyConnected })
      }
    }

    refresh()

    const pool = ndk.pool
    pool.on('relay:connect', refresh)
    pool.on('relay:ready', refresh)
    pool.on('relay:disconnect', refresh)
    pool.on('relay:connecting', refresh)

    // Стартовая задержка: статусы могут меняться в ms-window'е до того, как
    // эффект подпишется. Лёгкий poll-таймер раз в 2с подстраховывает на
    // случай пропущенных событий (без поллинга, к сожалению, NDK иногда
    // отстаёт — но 2с не критично для UI).
    const interval = setInterval(refresh, 2000)

    return () => {
      pool.off('relay:connect', refresh)
      pool.off('relay:ready', refresh)
      pool.off('relay:disconnect', refresh)
      pool.off('relay:connecting', refresh)
      clearInterval(interval)
    }
  }, [ndk])

  return snap
}
