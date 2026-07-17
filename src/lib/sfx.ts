/** Lightweight Web Audio SFX for RPS countdown / win / lose. */

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!ctx) ctx = new AC()
  return ctx
}

/** Call from a user gesture so later programmatic playback works (esp. iOS). */
export async function unlockSfx(): Promise<void> {
  const audio = getCtx()
  if (!audio) return
  try {
    if (audio.state === 'suspended') await audio.resume()
    const buffer = audio.createBuffer(1, 1, 22050)
    const source = audio.createBufferSource()
    source.buffer = buffer
    source.connect(audio.destination)
    source.start(0)
  } catch {
    // ignore
  }
}

function withAudio(play: (audio: AudioContext) => void): void {
  const audio = getCtx()
  if (!audio) return
  if (audio.state === 'running') {
    play(audio)
    return
  }
  void audio.resume().then(() => {
    if (audio.state === 'running') play(audio)
  })
}

function tone(
  audio: AudioContext,
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = 'sine',
  peak = 0.18,
): void {
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain)
  gain.connect(audio.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

/** Countdown tick — higher pitch as it approaches 0. */
export function playCountdownTick(remaining: number): void {
  withAudio((audio) => {
    const t = audio.currentTime
    if (remaining <= 0) {
      tone(audio, 880, t, 0.12, 'triangle', 0.22)
      tone(audio, 1320, t + 0.08, 0.16, 'triangle', 0.2)
      return
    }
    const freq = remaining === 3 ? 660 : remaining === 2 ? 770 : 880
    tone(audio, freq, t, 0.11, 'sine', 0.2)
  })
}

export function playWin(): void {
  withAudio((audio) => {
    const t = audio.currentTime
    tone(audio, 523.25, t, 0.12, 'triangle', 0.2)
    tone(audio, 659.25, t + 0.1, 0.12, 'triangle', 0.2)
    tone(audio, 783.99, t + 0.2, 0.18, 'triangle', 0.22)
    tone(audio, 1046.5, t + 0.32, 0.28, 'sine', 0.18)
  })
}

export function playLose(): void {
  withAudio((audio) => {
    const t = audio.currentTime
    tone(audio, 392, t, 0.18, 'triangle', 0.18)
    tone(audio, 311.13, t + 0.14, 0.22, 'triangle', 0.16)
    tone(audio, 246.94, t + 0.3, 0.35, 'sine', 0.14)
  })
}

export function playDraw(): void {
  withAudio((audio) => {
    const t = audio.currentTime
    tone(audio, 440, t, 0.14, 'sine', 0.14)
    tone(audio, 440, t + 0.16, 0.14, 'sine', 0.12)
  })
}
