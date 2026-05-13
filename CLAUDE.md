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
- `src/lib/webrtc.ts` — **синглтон-модуль** с module-level state (`_pc`, `_audioSender`, `_videoSender`, `_micStream`, `_camStream`, `_screenStream`, `_audioMixContext`, `_voiceGainNode`, `_screenGainNode`, `_dataChannel`, `_onMediaControl`, `_pendingCandidates`, `_remoteDescReady`). Один активный `RTCPeerConnection` на приложение. `cleanup()` обнуляет всё. Не превращай в класс/контекст — звонок должен переживать перерендеры/навигацию.
- Базовый layout: **один audio-transceiver + один video-transceiver**, выделяются у offerer'а в `createPeerConnection('offerer')`. Answerer получает их из remote SDP и `refreshSenders()` находит их по позиции.
- Камера и экран делят `_videoSender` через `replaceTrack()` — нет нового m-line, нет ренегациации.
- **Звук экрана**: всегда микшируется в микрофон через Web Audio API (`mixScreenAudioIntoMic`) — единственный audio m-line, никаких ренегациаций. Раньше для desktop↔desktop пробовали второй transceiver, но Android Chrome на >1 audio m-line молча терял media; теперь миксуем безусловно. **Никогда не возвращайся к двум audio m-line ради независимых ползунков — для этого есть Remote Volume Control через DataChannel (см. ниже).**
- **Mix-пайплайн с GainNode'ами:** `[mic] → [_voiceGainNode] → [destination]` и `[screen] → [_screenGainNode] → [destination]`. Поднимается лениво только когда стартует screen share с аудио, рушится в `stopScreenShare()`. Без screen share — `_audioSender` несёт сырой mic-track напрямую, без Web Audio (без лишней latency / контекста). Гейны клампятся в `[0, 2]` (можно усилить вдвое).
- **ICE-кандидаты буферизуются до готовности pc + remote desc.** `_pendingCandidates` НЕ сбрасывается в `createPeerConnection` (только в `cleanup()`) — критично для phone→PC, где трикл-ICE прилетает пока answerer ещё в `ringing` и пока юзер не нажал «Принять». Если сбросить буфер — ICE зависает на `checking`.
- **TURN обязателен.** `ICE_SERVERS` хардкодом включает `openrelay.metered.ca` (UDP/TCP/TLS варианты) поверх Google STUN. Только STUN не пробивает CGNAT мобильных операторов. Не выкидывай без замены.
- Удалённые треки классифицируются в `pc.ontrack`: audio = `voice`, video = `video`. Только один audio-track из-за миксования на стороне sender'а. Колбэк `onRemoteTrack(kind, stream, track)` идёт в `useCallController`, оттуда в `callStore`.

### Remote Volume Control (DataChannel)
- **Зачем:** receiver хочет балансировать голос собеседника vs звук фильма при screen share. Делать через 2 audio-трека нельзя (см. правило выше). Решение: receiver двигает ползунок → команда летит по DataChannel → sender применяет gain на своей стороне до отправки звука.
- **DataChannel `media-control`:** создаётся offerer'ом сразу в `createPeerConnection('offerer')` **до** `createOffer()` (чтобы попасть в SDP без renegotiation). Answerer ловит его через `pc.ondatachannel`. `ordered: true`, без `maxRetransmits` (надёжный TCP-стиль). На `cleanup()` закрывается.
- **Протокол:** JSON-сообщения типа `MediaControlMsg`:
  - `{ type: 'hello', features: string[] }` — handshake; шлётся обеими сторонами в `dc.onopen`. Receiver узнаёт о поддержке через `features.includes('remote-volume')` → `callStore.peerSupportsMediaControl`. Старые клиенты не пришлют hello → ползунки не показываются.
  - `{ type: 'screen-audio', active: boolean }` — sender шлёт автоматически в `startScreenShare` (`active = withSystemAudio`) и `stopScreenShare` (`active = false`). Receiver хранит в `callStore.peerScreenAudioActive`; ползунки voice/screen появляются только при `true`.
  - `{ type: 'set-voice-gain' | 'set-screen-gain', value: number }` — receiver шлёт sender'у. На стороне sender'а `attachDataChannel.onmessage` сразу применяет к `_voiceGainNode`/`_screenGainNode` локально; UI-сторону опционально обновляет `_onMediaControl` колбэк.
- **API:** `sendMediaControl(msg)` (no-op если канал не open), `setMediaControlHandler(handler)` — регистрация колбэка в `useCallController` для проброса в `callStore`.
- **Throttle в UI:** `CallPage` дросселит исходящие `set-*-gain` до ~60ms с trailing-send последнего значения. Локальный стор обновляется на каждом `onChange` (responsive UI), сеть ограничена.
- **Дефолты и ресет:** все гейны стартуют с 1.0. На `stopScreenShare` (или приходе `screen-audio: false`) receiver сбрасывает `peerScreenGain → 1`, чтобы при следующем шаринге ползунок был в нейтрали. Полный сброс — в `callStore.reset()` через `initial`.

### Сигналинг
- `src/lib/signaling.ts`: `sendSignal()` пакует `SignalPayload` в NDKEvent kind 25050, оборачивает gift-wrap'ом kind 1059 и публикует. `decryptSignal()` — обратная операция; ошибки расшифровки игнорируются (это gift-wrap'ы для других подписчиков, не для нас — нормальный шум).
- `src/hooks/useSignaling.ts` (mounted в Layout) подписан на kind 1059 с `'#p': [myPubkey]` и обрабатывает входящие: `call-offer` → `setIncoming`, `call-answer` → `applyRemoteDescription` + `connected`, `sdp-offer` → `answerRenegotiation`, `ice-candidate` → `addRemoteCandidate`, `call-end`/`call-reject` → cleanup.
- `src/hooks/useCallController.ts` (mounted в Layout) запускает setup ровно один раз на `callId` через `setupKey` ref: создаёт `RTCPeerConnection`, получает микрофон, посылает offer (или answer для answerer'а после `applyRemoteDescription(pendingOffer)`). 30-секундный no-answer timeout.

### Сообщения (DM + группы)
- **DM (NIP-17, kind 14 rumor → kind 1059 gift-wrap):** `src/lib/dm.ts:buildDMRumor()` собирает rumor с детерминированным `id` через `getEventHash` — оптимистичное сообщение в UI и эхо self-wrap'а из подписки получают одинаковый id, и `hasMessage` дедупит без content-эвристик. `publishDM()` обязательно публикует gift-wrap **и получателю, и себе** (две параллельные публикации). Без self-wrap другие устройства отправителя (или после relogin) не видят свою исходящую переписку.
- **Группы (NIP-28):** канал = kind 40 (метаданные), сообщение = kind 42 с `['e', channelId, '', 'root']`. Подписки: `useChannelSubscription` для активной группы, `useAllGroupsSubscription` (mounted в Layout) фоном по всем известным групп-id одной подпиской — нужно для уведомлений и unread-каунтеров.
- **Replies:** добавляется тег `['e', repliedId, '', 'reply']`. Для DM — внутри rumor рядом с `['p', recipient]`; для групп — рядом с `'root'`. Получатель парсит при разборе и сохраняет в `Message.replyToId`/`GroupMessage.replyToId`. Превью оригинала собирается локальным lookup в массиве сообщений того же чата; если не нашли (старее `since` или ещё не подтянулось) — рендерим «Исходное сообщение недоступно».
- **Триггер reply-меню:** `src/components/MessageContextMenu.tsx` рендерится с full-viewport прозрачным оверлеем `z-40` и самим меню `z-50`. Без оверлея тап «закрытия» доходил до пузыря под пальцем и реоткрывал меню. Различие десктоп/мобила: десктоп → `onContextMenu` (ПКМ), мобила/планшет → `onClick`, гейтится через `window.matchMedia('(pointer: coarse)').matches`. На обеих платформах при наличии выделенного текста (`window.getSelection`) меню **не** перехватывает — даём родное браузерное copy.

### Эмодзи
- **Стандартные Unicode-эмодзи:** курируемый список по категориям в `src/components/EmojiPicker.tsx` (`EMOJI_CATEGORIES: EmojiCategory[]`). Каждая категория — `{ id, label, icon, emojis[] }`; `icon` может быть строкой Unicode или `<img>`. Едут как обычный текст в `content`, никакого спец-протокола.
- **Кастомные «гноличка»-эмодзи:** PNG-файлы в `public/gnolichka_emoji/001.png` … `085.png`. Едут как шорткоды `:001:` … `:085:` внутри `content`. Раскрываются на render-time через `src/lib/customEmojis.tsx:renderMessageContent(content, opts?)`, которое сплитит по `/(:[^:\n]+:)/g` и для каждого узнанного шорткода рендерит `<img>` из `${import.meta.env.BASE_URL}gnolichka_emoji/{name}.png`. Незнакомые `:foo:` фрагменты возвращаются как текст. Опция `compact: true` ставит `w-4 h-4` (16px) вместо стандартных `w-6 h-6` (24px) — нужна в превью списка чатов под `text-xs`.
- **Recently-used:** хранится в `localStorage` под отдельным ключом `jabichat-recent-emoji` (не лезет в zustand-сторы).
- **Triggers:** `EmojiPicker` имеет `excludeRef` пропс — ref на toggle-кнопку. Без него document-mousedown handler закрывает панель прямо перед onClick'ом кнопки, и кнопка не может закрыть пикер. Передавай ref на смайл-button и в picker, и в `<button ref={...}>`.

### Удаление чатов и cross-device sync
- **Tombstone'ы локально:** `chatStore.deletedAt: Record<pubkey, unix-seconds>` и `groupStore.deletedAt: Record<channelId, unix-seconds>`. `removeChat`/`removeGroup` ставят tombstone на `now`. Все хуки подписок (`useDMSubscription`, `useChannelSubscription`, `useAllGroupsSubscription`) проверяют `isDeletedBefore(id, createdAt)` и роняют относительно реле replay'и старых сообщений — иначе при reconnect'е удалённый чат «оживает».
- **Cross-device sync (NIP-78):** `src/lib/syncDeleted.ts` публикует kind 30078 (parameterized replaceable) с d-тегом `jabichat-deleted-v1` и self-encrypted (NIP-44 to own pubkey) JSON `{ chats, groups }` где значения — наибольшие tombstone'ы. `useDeletedSync` (mounted в Layout) подписывается на этот же event и зовёт `mergeDeletedAt` в обоих сторах: для каждого id, чей remote tombstone новее локального, локальный продвигается, а сообщения старше нового tombstone — удаляются. Если после фильтра не осталось ни одного свежего сообщения, дроптся и контакт/группа целиком (но если есть свежая переписка — оставляем чат и просто чистим старое).
- Любое удаление в `ChatsPage` после `removeChat`/`removeGroup` дёргает `publishDeletedRecord(ndk, ...)` — replaceable event, реле хранит только последний.

### Стейт
Все стейты — Zustand с `persist` (кроме `callStore` — он эфемерный, чтобы перезагрузка страницы сбрасывала зависший звонок):
- `nostrStore` — nsec/npub/profile, NDK instance, connection state. Persist key: `jabichat-identity`.
- `chatStore` — DM contacts/messages/unread/lastActivity/**deletedAt**. Persist key: `jabichat-chats`.
- `groupStore` — NIP-28 группы + **deletedAt**. Persist key: `jabichat-groups`.
- `deviceStore` — выбранные input/output devices, noise-suppression toggle. Persist key: `jabichat-devices`.
- `themeStore` — `'jabi' | 'dark' | 'light'`. Persist key: `jabichat-theme`.
- `callStore` — звонок: status (`idle | calling | ringing | accepting | connected | ended`), peerPubkey, callId, **`role`**, локальные/удалённые стримы, `connectedAt` (стампится единожды на первом переходе в `connected` — таймер должен переживать перерендер CallPage), `voiceVolume` (локальный мастер для `<audio>.volume`), Remote Volume Control: `peerVoiceGain`/`peerScreenGain` (то, что я попросил у пира; 0-2), `peerScreenAudioActive` (пир сейчас шарит экран с аудио), `peerSupportsMediaControl` (получил ли hello). **Не персистится.**

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
