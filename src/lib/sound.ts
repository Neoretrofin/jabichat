let _ctx: AudioContext | null = null

function ctx(): AudioContext {
  if (!_ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    _ctx = new AC()
  }
  if (_ctx.state === 'suspended') _ctx.resume().catch(() => {})
  return _ctx
}

function tone(freq: number, durationMs: number, gain = 0.08, when = 0): void {
  try {
    const ac = ctx()
    const osc = ac.createOscillator()
    const g = ac.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    g.gain.setValueAtTime(0, ac.currentTime + when)
    g.gain.linearRampToValueAtTime(gain, ac.currentTime + when + 0.01)
    g.gain.linearRampToValueAtTime(0, ac.currentTime + when + durationMs / 1000)
    osc.connect(g).connect(ac.destination)
    osc.start(ac.currentTime + when)
    osc.stop(ac.currentTime + when + durationMs / 1000 + 0.05)
  } catch {
    // audio context unavailable — ignore
  }
}

export function playMessageSound(): void {
  tone(880, 80)
  tone(1320, 80, 0.06, 0.09)
}

let _ringInterval: number | null = null

export function startRingtone(): void {
  if (_ringInterval !== null) return
  const ring = () => {
    tone(520, 220, 0.1)
    tone(660, 220, 0.1, 0.25)
  }
  ring()
  _ringInterval = window.setInterval(ring, 1500)
}

export function stopRingtone(): void {
  if (_ringInterval !== null) {
    clearInterval(_ringInterval)
    _ringInterval = null
  }
}

let _outgoingInterval: number | null = null

export function startOutgoingRing(): void {
  if (_outgoingInterval !== null) return
  const ring = () => tone(440, 800, 0.05)
  ring()
  _outgoingInterval = window.setInterval(ring, 3000)
}

export function stopOutgoingRing(): void {
  if (_outgoingInterval !== null) {
    clearInterval(_outgoingInterval)
    _outgoingInterval = null
  }
}
