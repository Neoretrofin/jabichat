import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  PhoneOff, Mic, MicOff, Video, VideoOff,
  ScreenShare, ScreenShareOff, Settings, Volume2, Maximize2, Wand2,
} from 'lucide-react'
import { useCallStore } from '../store/callStore'
import { useChatStore } from '../store/chatStore'
import { useDeviceStore } from '../store/deviceStore'
import { useNostrStore } from '../store/nostrStore'
import { useHangup } from '../hooks/useHangup'
import {
  startScreenShare,
  stopScreenShare,
  enableCamera,
  disableCamera,
  setAudioInputDevice,
  setVideoInputDevice,
  setNoiseSuppression,
  supportsAudioOutputSelection,
} from '../lib/webrtc'
import { sendSignal } from '../lib/signaling'
import { isMobileUA } from '../lib/platform'
import { startOutgoingRing, stopOutgoingRing } from '../lib/sound'
import Avatar from '../components/Avatar'
import { contactDisplayName } from '../types/chat'

function formatDuration(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

export default function CallPage() {
  const { pubkey: urlPubkey } = useParams<{ pubkey: string }>()
  const navigate = useNavigate()

  const status = useCallStore((s) => s.status)
  const callId = useCallStore((s) => s.callId)
  const peerPubkey = useCallStore((s) => s.peerPubkey)
  const peerIsMobile = useCallStore((s) => s.peerIsMobile)
  const micStream = useCallStore((s) => s.micStream)
  const camStream = useCallStore((s) => s.camStream)
  const screenStream = useCallStore((s) => s.screenStream)
  const remoteAudio = useCallStore((s) => s.remoteAudio)
  const remoteScreenAudio = useCallStore((s) => s.remoteScreenAudio)
  const remoteScreenAudioActive = useCallStore((s) => s.remoteScreenAudioActive)
  const remoteVideo = useCallStore((s) => s.remoteVideo)
  const remoteVideoActive = useCallStore((s) => s.remoteVideoActive)
  const shareHasAudio = useCallStore((s) => s.shareHasAudio)
  const micEnabled = useCallStore((s) => s.micEnabled)
  const camEnabled = useCallStore((s) => s.camEnabled)
  const voiceVolume = useCallStore((s) => s.voiceVolume)
  const screenVolume = useCallStore((s) => s.screenVolume)
  const connectedAt = useCallStore((s) => s.connectedAt)
  const error = useCallStore((s) => s.error)
  const setMicEnabled = useCallStore((s) => s.setMicEnabled)
  const setCamEnabled = useCallStore((s) => s.setCamEnabled)
  const setCamStream = useCallStore((s) => s.setCamStream)
  const setScreenStream = useCallStore((s) => s.setScreenStream)
  const setShareHasAudio = useCallStore((s) => s.setShareHasAudio)
  const setVoiceVolume = useCallStore((s) => s.setVoiceVolume)
  const setScreenVolume = useCallStore((s) => s.setScreenVolume)
  const setRemoteVideoActive = useCallStore((s) => s.setRemoteVideoActive)
  const setRemoteScreenAudioActive = useCallStore((s) => s.setRemoteScreenAudioActive)

  const { contacts } = useChatStore()
  const devicePrefs = useDeviceStore()
  const { ndk } = useNostrStore()
  const hangup = useHangup()

  const [duration, setDuration] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([])
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([])
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([])
  const sinkSupported = supportsAudioOutputSelection()

  const [remoteVideoEl, setRemoteVideoEl] = useState<HTMLVideoElement | null>(null)
  const [remoteAudioEl, setRemoteAudioEl] = useState<HTMLAudioElement | null>(null)
  const [remoteScreenAudioEl, setRemoteScreenAudioEl] = useState<HTMLAudioElement | null>(null)
  const [localVideoEl, setLocalVideoEl] = useState<HTMLVideoElement | null>(null)
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)

  const effectivePubkey = peerPubkey ?? urlPubkey ?? null
  const sharing = screenStream !== null
  const localVideoStream = screenStream ?? camStream

  useEffect(() => {
    if (status === 'idle' || status === 'ended') {
      navigate('/chats', { replace: true })
    }
  }, [status, navigate])

  useEffect(() => {
    if (localVideoEl) localVideoEl.srcObject = localVideoStream ?? null
  }, [localVideoEl, localVideoStream])

  useEffect(() => {
    if (remoteVideoEl) remoteVideoEl.srcObject = remoteVideo ?? null
  }, [remoteVideoEl, remoteVideo])

  // Set srcObject AND explicitly call play() — autoplay can be blocked on
  // some browsers (mobile especially), and the receiver-side <audio> tags
  // won't start without it. The user-gesture context from clicking Accept /
  // Call is enough to unlock playback if we kick it off promptly.
  useEffect(() => {
    if (!remoteAudioEl) return
    remoteAudioEl.srcObject = remoteAudio ?? null
    if (remoteAudio) remoteAudioEl.play().catch((e) => console.warn('voice play() blocked:', e))
  }, [remoteAudioEl, remoteAudio])

  useEffect(() => {
    if (!remoteScreenAudioEl) return
    remoteScreenAudioEl.srcObject = remoteScreenAudio ?? null
    if (remoteScreenAudio) remoteScreenAudioEl.play().catch((e) => console.warn('screen-audio play() blocked:', e))
  }, [remoteScreenAudioEl, remoteScreenAudio])

  useEffect(() => {
    if (remoteAudioEl) remoteAudioEl.volume = voiceVolume
  }, [remoteAudioEl, voiceVolume])

  useEffect(() => {
    if (remoteScreenAudioEl) remoteScreenAudioEl.volume = screenVolume
  }, [remoteScreenAudioEl, screenVolume])

  useEffect(() => {
    if (!sinkSupported || !devicePrefs.audioOutputId) return
    const apply = (el: HTMLAudioElement | null) => {
      if (!el) return
      const sinkable = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
      sinkable.setSinkId?.(devicePrefs.audioOutputId!).catch((e) => {
        console.warn('setSinkId failed:', e)
      })
    }
    apply(remoteAudioEl)
    apply(remoteScreenAudioEl)
  }, [remoteAudioEl, remoteScreenAudioEl, devicePrefs.audioOutputId, sinkSupported])

  // Bug 1 fix — track.onmute/onunmute can miss events on some browsers,
  // leaving the receiver staring at a frozen last-frame after the peer ends
  // their share/cam. Polling track.muted brings the avatar overlay back
  // within 500ms of the peer stopping the stream.
  useEffect(() => {
    if (!remoteVideo) return
    const track = remoteVideo.getVideoTracks()[0]
    if (!track) return
    const sync = () => setRemoteVideoActive(!track.muted)
    sync()
    const t = window.setInterval(sync, 500)
    return () => clearInterval(t)
  }, [remoteVideo, setRemoteVideoActive])

  useEffect(() => {
    if (!remoteScreenAudio) return
    const track = remoteScreenAudio.getAudioTracks()[0]
    if (!track) return
    const sync = () => setRemoteScreenAudioActive(!track.muted)
    sync()
    const t = window.setInterval(sync, 500)
    return () => clearInterval(t)
  }, [remoteScreenAudio, setRemoteScreenAudioActive])

  useEffect(() => {
    if (status === 'calling') startOutgoingRing()
    else stopOutgoingRing()
    return () => stopOutgoingRing()
  }, [status])

  useEffect(() => {
    if (status !== 'connected' || !connectedAt) {
      setDuration(0)
      return
    }
    const tick = () => setDuration(Math.floor((Date.now() - connectedAt) / 1000))
    tick()
    const t = window.setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [status, connectedAt])

  useEffect(() => {
    if (!micStream) return
    let cancelled = false
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      if (cancelled) return
      setAudioInputs(devices.filter((d) => d.kind === 'audioinput'))
      setVideoInputs(devices.filter((d) => d.kind === 'videoinput'))
      setAudioOutputs(devices.filter((d) => d.kind === 'audiooutput'))
    })
    return () => { cancelled = true }
  }, [micStream])

  const toggleMic = () => {
    const next = !micEnabled
    micStream?.getAudioTracks().forEach((t) => { t.enabled = next })
    setMicEnabled(next)
  }

  const toggleCam = async () => {
    if (camEnabled) {
      await disableCamera()
      setCamStream(null)
      setCamEnabled(false)
    } else {
      try {
        const stream = await enableCamera(devicePrefs.videoInputId)
        setCamStream(stream)
        setCamEnabled(true)
      } catch (err) {
        if (!(err instanceof Error && err.name === 'NotAllowedError')) {
          console.error('Camera enable failed:', err)
        }
      }
    }
  }

  const toggleScreenShare = async () => {
    if (sharing) {
      await stopScreenShare()
      setScreenStream(null)
      setShareHasAudio(false)
      return
    }
    try {
      // Multi-track audio (separate broadcast volume) only works PC↔PC.
      // Android mobile peers get the screen audio mixed into the voice
      // stream, which keeps SDP single-audio-m-line — Android-safe.
      const peerIsDesktop = !peerIsMobile && !isMobileUA()
      const { stream, withSystemAudio, renegotiationOffer } = await startScreenShare({
        peerIsDesktop,
        onEnded: () => {
          setScreenStream(null)
          setShareHasAudio(false)
        },
      })
      setScreenStream(stream)
      setShareHasAudio(withSystemAudio)

      // If the multi-track path was used, addTrack created a fresh m-line —
      // we must send the offer to the peer and let them answer.
      if (renegotiationOffer && ndk && peerPubkey && callId) {
        await sendSignal(ndk, peerPubkey, {
          type: 'sdp-offer',
          callId,
          data: renegotiationOffer,
        }).catch((e) => console.warn('sdp-offer send failed:', e))
      }
    } catch (err) {
      if (!(err instanceof Error && err.name === 'NotAllowedError')) {
        console.error('Screen share failed:', err)
      }
    }
  }

  const toggleNoiseSuppression = async () => {
    const next = !devicePrefs.noiseSuppression
    devicePrefs.setNoiseSuppression(next)
    try { await setNoiseSuppression(next) } catch (e) { console.warn(e) }
  }

  const handleAudioInput = async (id: string) => {
    devicePrefs.setAudioInput(id)
    try { await setAudioInputDevice(id, devicePrefs.noiseSuppression) } catch (e) { console.warn(e) }
  }

  const handleVideoInput = async (id: string) => {
    devicePrefs.setVideoInput(id)
    try { await setVideoInputDevice(id) } catch (e) { console.warn(e) }
  }

  const handleAudioOutput = (id: string) => {
    devicePrefs.setAudioOutput(id)
  }

  const enterFullscreen = async () => {
    const target = remoteVideoEl ?? containerEl
    if (!target) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await target.requestFullscreen()
    } catch (e) {
      console.warn('fullscreen failed:', e)
    }
  }

  const label = effectivePubkey ? contactDisplayName(contacts[effectivePubkey]) : '?'
  const callStatusText =
    status === 'connected' ? formatDuration(duration)
    : status === 'calling' ? 'Вызов...'
    : status === 'accepting' ? 'Соединение...'
    : 'Подключение...'

  if (error) {
    return (
      <div className="flex flex-col h-[calc(100svh-56px-64px)] items-center justify-center gap-4 p-6">
        <p className="text-3xl">🐸</p>
        <p className="text-lily-green/70 text-sm text-center">{error}</p>
        <button
          onClick={hangup}
          className="px-6 py-2 rounded-full bg-red-600 text-white text-sm"
        >
          Назад
        </button>
      </div>
    )
  }

  return (
    <div ref={setContainerEl} className="relative flex flex-col h-[calc(100svh-56px-64px)] bg-swamp-darker overflow-hidden">
      <audio ref={setRemoteAudioEl} autoPlay playsInline className="hidden" />
      <audio ref={setRemoteScreenAudioEl} autoPlay playsInline className="hidden" />

      <video
        ref={setRemoteVideoEl}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-contain bg-black"
      />

      {!remoteVideoActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-swamp-darker">
          <Avatar
            src={effectivePubkey ? contacts[effectivePubkey]?.picture : null}
            size={96}
            className="border-2 border-frog-skin/40"
          />
          <p className="text-lily-green font-semibold text-lg">{label}</p>
          <p className="text-lily-green/50 text-sm">{callStatusText}</p>
        </div>
      )}

      {remoteVideoActive && (
        <div className="absolute top-3 left-0 right-0 flex flex-col items-center gap-0.5 pointer-events-none">
          <p className="text-white text-sm font-medium drop-shadow">{label}</p>
          <p className="text-white/70 text-xs drop-shadow">{callStatusText}</p>
        </div>
      )}

      {sharing && !shareHasAudio && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 max-w-[90%] bg-swamp-darker/95 backdrop-blur border border-frog-skin/40 rounded-2xl px-4 py-2 text-center text-xs text-lily-green shadow-xl z-10">
          Экран без звука. Чтобы передать аудио — выбери «Весь экран» и поставь галочку «Звук системы» в окне браузера.
        </div>
      )}

      {localVideoStream && (
        <div className="absolute bottom-24 right-4 w-32 h-24 rounded-2xl overflow-hidden border-2 border-frog-skin/40 shadow-xl bg-black">
          <video
            ref={setLocalVideoEl}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          {sharing && (
            <div className="absolute top-1 left-1 bg-frog-skin text-swamp-darker text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1">
              Экран{shareHasAudio && <Volume2 size={10} />}
            </div>
          )}
        </div>
      )}

      {/* Voice slider as long as the call has a remote audio stream. Broadcast
          slider as long as the screen-audio transceiver exists — track.muted
          polling is unreliable on some browsers, but the stream's mere presence
          is enough to know we have a separate screen-audio channel. */}
      {(remoteAudio || remoteScreenAudio) && (
        <div className="absolute bottom-24 left-4 flex flex-col gap-2 bg-swamp-darker/80 backdrop-blur border border-frog-dark/30 rounded-2xl px-3 py-2 z-10">
          {remoteAudio && (
            <div className="flex items-center gap-2 w-44">
              <Volume2 size={14} className="text-lily-green/60 shrink-0" />
              <span className="text-lily-green/60 text-[10px] uppercase tracking-wider w-16">Голос</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={voiceVolume}
                onChange={(e) => setVoiceVolume(parseFloat(e.target.value))}
                className="flex-1 accent-frog-skin"
              />
            </div>
          )}
          {remoteScreenAudio && (
            <div className="flex items-center gap-2 w-44">
              <Volume2 size={14} className={remoteScreenAudioActive ? 'text-frog-skin shrink-0' : 'text-lily-green/40 shrink-0'} />
              <span className={(remoteScreenAudioActive ? 'text-frog-skin' : 'text-lily-green/40') + ' text-[10px] uppercase tracking-wider w-16'}>Экран</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={screenVolume}
                onChange={(e) => setScreenVolume(parseFloat(e.target.value))}
                className="flex-1 accent-frog-skin"
              />
            </div>
          )}
        </div>
      )}

      {remoteVideoActive && (
        <button
          onClick={enterFullscreen}
          title="На весь экран"
          className="absolute top-3 right-14 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur flex items-center justify-center text-white z-10"
        >
          <Maximize2 size={16} />
        </button>
      )}

      {showSettings && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-swamp-darker/95 backdrop-blur border border-frog-dark/40 rounded-2xl p-4 z-20 w-72 max-w-[calc(100vw-2rem)] shadow-2xl">
          <p className="text-lily-green/50 text-xs uppercase tracking-wider mb-1.5">Микрофон</p>
          <select
            value={devicePrefs.audioInputId ?? audioInputs[0]?.deviceId ?? ''}
            onChange={(e) => handleAudioInput(e.target.value)}
            className="w-full bg-swamp-dark border border-frog-dark/40 rounded-xl px-3 py-2 text-lily-green text-sm outline-none mb-3"
          >
            {audioInputs.length === 0 && <option value="">Не найдено</option>}
            {audioInputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Микрофон (${d.deviceId.slice(0, 6)})`}
              </option>
            ))}
          </select>

          <label className="flex items-center justify-between gap-2 mb-3 cursor-pointer">
            <span className="flex items-center gap-1.5 text-lily-green text-sm">
              <Wand2 size={14} className="text-frog-skin" />
              Шумоподавление
            </span>
            <input
              type="checkbox"
              checked={devicePrefs.noiseSuppression}
              onChange={toggleNoiseSuppression}
              className="accent-frog-skin w-4 h-4"
            />
          </label>

          <p className="text-lily-green/50 text-xs uppercase tracking-wider mb-1.5">Камера</p>
          <select
            value={devicePrefs.videoInputId ?? videoInputs[0]?.deviceId ?? ''}
            onChange={(e) => handleVideoInput(e.target.value)}
            className="w-full bg-swamp-dark border border-frog-dark/40 rounded-xl px-3 py-2 text-lily-green text-sm outline-none mb-3"
          >
            {videoInputs.length === 0 && <option value="">Не найдено</option>}
            {videoInputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Камера (${d.deviceId.slice(0, 6)})`}
              </option>
            ))}
          </select>

          {sinkSupported ? (
            <>
              <p className="text-lily-green/50 text-xs uppercase tracking-wider mb-1.5">Динамики</p>
              <select
                value={devicePrefs.audioOutputId ?? audioOutputs[0]?.deviceId ?? ''}
                onChange={(e) => handleAudioOutput(e.target.value)}
                className="w-full bg-swamp-dark border border-frog-dark/40 rounded-xl px-3 py-2 text-lily-green text-sm outline-none"
              >
                {audioOutputs.length === 0 && <option value="">Не найдено</option>}
                {audioOutputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Выход (${d.deviceId.slice(0, 6)})`}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <p className="text-lily-green/30 text-xs italic">
              Выбор динамиков доступен только в Chrome/Edge
            </p>
          )}
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-3 py-6 bg-gradient-to-t from-black/60 to-transparent z-10">
        <button
          onClick={toggleMic}
          title={micEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
            micEnabled ? 'bg-white/20 hover:bg-white/30' : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          {micEnabled ? <Mic size={20} className="text-white" /> : <MicOff size={20} className="text-white" />}
        </button>

        <button
          onClick={toggleCam}
          title={camEnabled ? 'Выключить камеру' : 'Включить камеру'}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
            camEnabled ? 'bg-white/20 hover:bg-white/30' : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          {camEnabled ? <Video size={20} className="text-white" /> : <VideoOff size={20} className="text-white" />}
        </button>

        <button
          onClick={hangup}
          title="Завершить"
          className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors"
        >
          <PhoneOff size={26} className="text-white" />
        </button>

        <button
          onClick={toggleScreenShare}
          title={sharing ? 'Прекратить показ экрана' : 'Показать экран (1080p60, со звуком)'}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
            sharing ? 'bg-frog-skin hover:bg-frog-dark text-swamp-darker' : 'bg-white/20 hover:bg-white/30 text-white'
          }`}
        >
          {sharing ? <ScreenShareOff size={20} /> : <ScreenShare size={20} />}
        </button>

        <button
          onClick={() => setShowSettings((v) => !v)}
          title="Устройства"
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
            showSettings ? 'bg-frog-skin text-swamp-darker' : 'bg-white/20 hover:bg-white/30 text-white'
          }`}
        >
          <Settings size={20} />
        </button>
      </div>

      <button
        onClick={() => navigate('/chats')}
        title="Свернуть"
        className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur flex items-center justify-center text-white text-xs z-10"
      >
        ✕
      </button>
    </div>
  )
}
