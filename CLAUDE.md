# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# jabichat 🐸 — Project Guidelines

## Описание проекта
Серверлес-мессенджер (PWA) с полностью децентрализованной архитектурой. Никаких серверов и баз данных — только P2P и Nostr. Развёрнут на GitHub Pages: https://neoretrofin.github.io/jabichat/.

## Стек
- React 19 + TypeScript + Vite 8
- Tailwind CSS v4 (через `@tailwindcss/vite`) + Lucide React
- `@nostr-dev-kit/ndk` для Nostr (DM, signaling, метаданные, группы)
- WebRTC (P2P аудио/видео/экран); сигналинг идёт через NIP-17 gift-wrap (kind 1059) с собственным rumor kind 25050
- Zustand (с `persist` middleware) для всего стейта
- `vite-plugin-pwa` (autoUpdate) + HashRouter для совместимости с GitHub Pages

## Команды
```
npm run dev       # vite dev server, HTTPS через basic-ssl, host 0.0.0.0:5173
npm run build     # tsc -b && vite build
npm run lint      # eslint .
npm run preview   # vite preview
npm run deploy    # gh-pages -d dist (предварительно запускает predeploy = build)
```
HTTPS в dev обязателен: `getUserMedia`, `crypto.subtle`, `navigator.clipboard` доступны только в secure context. На LAN IP (например `https://192.168.0.221:5173/`) self-signed certificate надо принять в браузере один раз. Plain HTTP работает только на localhost.

Тестов в репозитории нет — проверяй UI вручную в браузере.

## Дизайн-система (Toad Theme 🐸)
- Формы: максимальное скругление (`rounded-2xl`, `rounded-full`) — листья кувшинок (lily pads).
- Палитра задаётся как CSS-переменные в `src/index.css` через Tailwind v4 `@theme` и переопределяется под `[data-theme="jabi" | "dark" | "light"]`. Применяй цвета через утилиты Tailwind (`bg-swamp-dark`, `text-lily-green`, `bg-frog-skin`), а не хардкодом hex — иначе тема не переключится.
- Тема меняется в `ProfilePage` и хранится в `themeStore`; `App.tsx` пишет её в `document.documentElement.dataset.theme`.
- Настроение: уютное, болотное, милое (swampcore).

## Архитектурные правила
1. Строгий TypeScript, никакого `any`.
2. Мелкие компоненты — отдельно кнопки, аватарки, экраны.
3. Приватный ключ (`nsec`) живёт только в `localStorage` (через zustand persist) и никуда не уходит. Все DM и сигналы шифруются NIP-17 gift-wrap локально.
4. Перед изменением логики WebRTC или NDK обязательно продумай краевые случаи (офлайн, отказ реле, мобильный пир, повторный вход в звонок).

## Архитектура: главные узлы

### Звонок (WebRTC)
- `src/lib/webrtc.ts` — **синглтон-модуль** с module-level state (`_pc`, `_audioSender`, `_videoSender`, `_screenAudioSender`, `_micStream`, `_camStream`, `_screenStream`, `_audioMixContext`). Один активный `RTCPeerConnection` на приложение. `cleanup()` обнуляет всё. Не превращай в класс/контекст — звонок должен переживать перерендеры/навигацию.
- Базовый layout: **один audio-transceiver + один video-transceiver**, выделяются у offerer'а в `createPeerConnection('offerer')`. Answerer получает их из remote SDP и `refreshSenders()` находит их по позиции.
- Камера и экран делят `_videoSender` через `replaceTrack()` — нет нового m-line, нет ренегациации.
- **Звук экрана**: на десктоп↔десктоп добавляется второй audio-transceiver через `_pc.addTrack()` → SDP renegotiation (`sdp-offer`/`sdp-answer` сигналы). На мобильный пир микшируется в микрофон через Web Audio API (`mixScreenAudioIntoMic`). Причина: Android Chrome ломается на >1 audio m-line. Решение принимается по `peerIsMobile` (приходит в `call-offer`/`call-answer`) и `isMobileUA()` (`src/lib/platform.ts`).
- Удалённые треки классифицируются в `pc.ontrack` через `classifyAudio()`: первый audio = `voice`, второй = `screen-audio`. Видео всегда `video`. Колбэк `onRemoteTrack(kind, stream, track)` идёт в `useCallController`, оттуда в `callStore`.

### Сигналинг
- `src/lib/signaling.ts`: `sendSignal()` пакует `SignalPayload` в NDKEvent kind 25050, оборачивает gift-wrap'ом kind 1059 и публикует. `decryptSignal()` — обратная операция; ошибки расшифровки игнорируются (это gift-wrap'ы для других подписчиков, не для нас — нормальный шум).
- `src/hooks/useSignaling.ts` (mounted в Layout) подписан на kind 1059 с `'#p': [myPubkey]` и обрабатывает входящие: `call-offer` → `setIncoming`, `call-answer` → `applyRemoteDescription` + `connected`, `sdp-offer` → `answerRenegotiation`, `ice-candidate` → `addRemoteCandidate`, `call-end`/`call-reject` → cleanup.
- `src/hooks/useCallController.ts` (mounted в Layout) запускает setup ровно один раз на `callId` через `setupKey` ref: создаёт `RTCPeerConnection`, получает микрофон, посылает offer (или answer для answerer'а после `applyRemoteDescription(pendingOffer)`). 30-секундный no-answer timeout.

### Стейт
Все стейты — Zustand с `persist` (кроме `callStore` — он эфемерный, чтобы перезагрузка страницы сбрасывала зависший звонок):
- `nostrStore` — nsec/npub/profile, NDK instance, connection state. Persist key: `jabichat-identity`.
- `chatStore` — DM contacts/messages/unread/lastActivity. Persist key: `jabichat-chats`.
- `groupStore` — NIP-28 группы. Persist key: `jabichat-groups`.
- `deviceStore` — выбранные input/output devices, noise-suppression toggle. Persist key: `jabichat-devices`.
- `themeStore` — `'jabi' | 'dark' | 'light'`. Persist key: `jabichat-theme`.
- `callStore` — звонок: status (`idle | calling | ringing | accepting | connected | ended`), peerPubkey, callId, **`role`**, **`peerIsMobile`**, локальные/удалённые стримы, `connectedAt` (стампится единожды на первом переходе в `connected` — таймер должен переживать перерендер CallPage), volume sliders. **Не персистится.**

### Роутинг
- **HashRouter** (в `App.tsx` импортируется как `BrowserRouter as` alias). Нужен для GitHub Pages: один `index.html`, всё остальное — фрагмент `#/...`. Не меняй на BrowserRouter без серверной rewrite-логики.
- `vite.config.ts` ставит `base: '/jabichat/'` — подкаталог GitHub Pages. Все asset URL и `import.meta.env.BASE_URL` уходят с этим префиксом.
- При неавторизованном пользователе (`!nsec`) рендерится только `LoginPage`, иначе — `Layout` с вложенными страницами.

### CallPage и persistence звонка
- Звонок не должен прерываться при навигации в "Чаты"/"Профиль". Поэтому: WebRTC-синглтон в `webrtc.ts` живёт независимо, `useCallController` смонтирован в Layout (общий для всех страниц). `CallPage` — **view-only**: читает из `callStore`, не управляет PeerConnection напрямую.
- `<video>`/`<audio>` элементы привязываются через **callback refs в useState** (`const [el, setEl] = useState(...)`), потому что обычный `useRef` не вызывает re-render и `srcObject` не успевает прицепиться при mount/remount.
- `track.muted` поллится каждые 500ms — `onmute`/`onunmute` ненадёжны (особенно на завершении screen share), без поллинга остаётся "замороженный" последний кадр.
- `FloatingCallIndicator` появляется когда статус ≠ idle/ended и текущий путь не `/call/...` — клик возвращает в звонок, красная кнопка завершает.

### Реле
- `src/lib/ndk.ts` — `DEFAULT_RELAYS` хардкодом (damus, nos.lol, relay.nostr.band, nostr.wine). NIP-17 gift-wrap'ы и DM ходят через них же. Не трогай без причины — публичные реле часто молча дропают custom kinds, эти проверены.

## Деплой
- `npm run deploy` собирает в `dist/` и пушит в ветку `gh-pages` через `gh-pages` CLI.
- Перед деплоем убедись, что в `vite.config.ts` `base` совпадает с именем GitHub-репозитория.
- Service worker (vite-plugin-pwa, autoUpdate) сам обновляется при следующем визите.
