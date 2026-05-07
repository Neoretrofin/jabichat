import NDK, { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk'

const NOSTR_BUILD_URL = 'https://nostr.build/api/v2/nip96/upload'

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// btoa cannot encode non-ASCII; convert to bytes first
function base64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  bytes.forEach((b) => { bin += String.fromCharCode(b) })
  return btoa(bin)
}

export async function uploadImage(ndk: NDK, file: File): Promise<string> {
  if (!ndk.signer) throw new Error('Не подключён сигнер Nostr')

  const buffer = await file.arrayBuffer()
  const payloadHash = await sha256Hex(buffer)

  // NIP-98 HTTP auth event
  const authEvent = new NDKEvent(ndk)
  authEvent.kind = 27235 as NDKKind
  authEvent.created_at = Math.floor(Date.now() / 1000)
  authEvent.tags = [
    ['u', NOSTR_BUILD_URL],
    ['method', 'POST'],
    ['payload', payloadHash],
  ]
  authEvent.content = ''
  await authEvent.sign()

  const auth = base64Utf8(JSON.stringify(authEvent.rawEvent()))

  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(NOSTR_BUILD_URL, {
    method: 'POST',
    headers: { Authorization: `Nostr ${auth}` },
    body: formData,
  })

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  if (data.status !== 'success') {
    throw new Error(data.message ?? 'Upload failed')
  }

  const urlTag = data.nip94_event?.tags?.find((t: string[]) => t[0] === 'url')
  const url = urlTag?.[1]
  if (!url) throw new Error('Сервер не вернул URL изображения')

  return url
}
