import type { FifteenCall } from '../game/fifteenTypes'
import { FIFTEEN_CALLS } from '../game/fifteenTypes'

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechCtor(): SpeechRecognitionCtor | null {
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function speechRecognitionSupported(): boolean {
  return getSpeechCtor() !== null
}

/** Parse Cantonese / Mandarin / digits into a legal call. */
export function parseFifteenCall(transcript: string): FifteenCall | null {
  const raw = transcript.trim().toLowerCase().replace(/\s+/g, '')
  if (!raw) return null

  // Prefer longer phrases first
  const phrases: [RegExp, FifteenCall][] = [
    [/十五|15|onefive|fifteen/, 15],
    [/二十|廿|20|twenty/, 20],
    [/十|10|ten/, 10],
    [/五|5|five/, 5],
  ]

  for (const [re, call] of phrases) {
    if (re.test(raw)) return call
  }

  const digits = raw.match(/\d+/)
  if (digits) {
    const n = Number(digits[0])
    if ((FIFTEEN_CALLS as number[]).includes(n)) return n as FifteenCall
  }

  return null
}

type CallListener = (call: FifteenCall, transcript: string) => void

/**
 * Continuous speech listener preferring zh-HK then zh-TW.
 * Call start() after a user gesture (mic permission).
 */
export class FifteenSpeechListener {
  private recognition: SpeechRecognitionLike | null = null
  private active = false
  private onCall: CallListener | null = null
  private langs = ['zh-HK', 'zh-TW', 'zh-CN']
  private langIndex = 0

  get supported(): boolean {
    return speechRecognitionSupported()
  }

  start(onCall: CallListener): boolean {
    const Ctor = getSpeechCtor()
    if (!Ctor) return false

    this.stop()
    this.onCall = onCall
    this.active = true
    this.langIndex = 0
    this.begin(Ctor)
    return true
  }

  private begin(Ctor: SpeechRecognitionCtor): void {
    if (!this.active) return

    const rec = new Ctor()
    this.recognition = rec
    rec.lang = this.langs[this.langIndex] ?? 'zh-HK'
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 3

    rec.onresult = (event) => {
      for (let i = 0; i < event.results.length; i++) {
        const alt = event.results[i]?.[0]
        if (!alt) continue
        const call = parseFifteenCall(alt.transcript)
        if (call != null) {
          this.onCall?.(call, alt.transcript)
          return
        }
      }
    }

    rec.onerror = (event) => {
      // aborted / no-speech are normal when we restart or user pauses
      if (event.error === 'aborted' || event.error === 'no-speech') return
      if (event.error === 'language-not-supported' && this.langIndex < this.langs.length - 1) {
        this.langIndex += 1
        try {
          rec.abort()
        } catch {
          // ignore
        }
        this.begin(Ctor)
      }
    }

    rec.onend = () => {
      if (!this.active) return
      // Restart while throwing window is open
      window.setTimeout(() => {
        if (!this.active) return
        try {
          this.begin(Ctor)
        } catch {
          // ignore restart failures
        }
      }, 120)
    }

    try {
      rec.start()
    } catch {
      // already started
    }
  }

  stop(): void {
    this.active = false
    this.onCall = null
    const rec = this.recognition
    this.recognition = null
    if (!rec) return
    rec.onresult = null
    rec.onerror = null
    rec.onend = null
    try {
      rec.abort()
    } catch {
      try {
        rec.stop()
      } catch {
        // ignore
      }
    }
  }
}
