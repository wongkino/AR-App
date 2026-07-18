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
  resultIndex: number
  results: ArrayLike<{ isFinal?: boolean; length: number } & ArrayLike<{ transcript: string }>>
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

function normalizeTranscript(transcript: string): string {
  return transcript
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/拾/g, '十')
    .replace(/伍/g, '五')
    .replace(/貳|贰/g, '二')
}

/** Parse Cantonese / Mandarin / digits into a legal call. */
export function parseFifteenCall(transcript: string): FifteenCall | null {
  const raw = normalizeTranscript(transcript)
  if (!raw) return null

  // Longer phrases first (no lookbehind — Safari-safe)
  if (/十五|一十五|15|fifteen/.test(raw)) return 15
  if (/二十|廿|贰十|貳十|20|twenty/.test(raw)) return 20
  if (/10|ten/.test(raw) || /(^|[^一二三四五六七八九])十([^一二三四五六七八九]|$)/.test(raw)) return 10
  if (/5|five/.test(raw) || /(^|[^一二三四五六七八九十])五([^一二三四五六七八九十]|$)/.test(raw)) return 5

  const digits = raw.match(/\d+/)
  if (digits) {
    const n = Number(digits[0])
    if ((FIFTEEN_CALLS as number[]).includes(n)) return n as FifteenCall
  }

  return null
}

type CallListener = (call: FifteenCall, transcript: string) => void
export type SpeechStatus = { listening: boolean; lastHeard: string | null; error: string | null }
type StatusListener = (status: SpeechStatus) => void

/**
 * Speech listener for 十五二十.
 * Non-continuous + restart works more reliably on iOS Safari.
 */
export class FifteenSpeechListener {
  private recognition: SpeechRecognitionLike | null = null
  private active = false
  private onCall: CallListener | null = null
  private onStatus: StatusListener | null = null
  private langs = ['zh-HK', 'zh-TW', 'zh-CN']
  private langIndex = 0
  private restartTimer: number | null = null
  private lastCallAt = 0
  private lastHeard: string | null = null

  get supported(): boolean {
    return speechRecognitionSupported()
  }

  start(onCall: CallListener, onStatus?: StatusListener): boolean {
    const Ctor = getSpeechCtor()
    if (!Ctor) {
      onStatus?.({ listening: false, lastHeard: null, error: '此瀏覽器不支援語音辨識' })
      return false
    }

    this.hardStop(false)
    this.onCall = onCall
    this.onStatus = onStatus ?? null
    this.active = true
    this.langIndex = 0
    this.begin(Ctor)
    return true
  }

  private emitStatus(error: string | null = null): void {
    this.onStatus?.({
      listening: this.active,
      lastHeard: this.lastHeard,
      error,
    })
  }

  private begin(Ctor: SpeechRecognitionCtor): void {
    if (!this.active) return

    const rec = new Ctor()
    this.recognition = rec
    rec.lang = this.langs[this.langIndex] ?? 'zh-HK'
    rec.continuous = false
    rec.interimResults = true
    rec.maxAlternatives = 5

    rec.onresult = (event) => {
      const start = typeof event.resultIndex === 'number' ? event.resultIndex : 0
      for (let i = start; i < event.results.length; i++) {
        const row = event.results[i]
        if (!row) continue
        const altCount = row.length || 1
        for (let a = 0; a < Math.min(altCount, 5); a++) {
          const alt = row[a]
          if (!alt?.transcript) continue
          const heard = alt.transcript.trim()
          if (!heard) continue
          this.lastHeard = heard
          this.emitStatus(null)

          const call = parseFifteenCall(heard)
          if (call == null) continue

          const now = Date.now()
          if (now - this.lastCallAt < 700) return
          this.lastCallAt = now
          this.onCall?.(call, heard)
          return
        }
      }
    }

    rec.onerror = (event) => {
      const err = event.error ?? 'error'
      if (err === 'aborted' || err === 'no-speech') return

      if (err === 'language-not-supported' && this.langIndex < this.langs.length - 1) {
        this.langIndex += 1
        this.scheduleRestart(Ctor, 80)
        return
      }

      if (err === 'audio-capture' || err === 'not-allowed' || err === 'service-not-allowed') {
        this.emitStatus('語音辨識搶唔到咪高峰，請用下方按鈕叫數')
        return
      }

      if (err === 'network') {
        this.emitStatus('語音服務網絡錯誤，請用按鈕叫數')
        return
      }

      this.scheduleRestart(Ctor, 280)
    }

    rec.onend = () => {
      if (!this.active) return
      this.scheduleRestart(Ctor, 160)
    }

    try {
      rec.start()
      this.emitStatus(null)
    } catch {
      this.scheduleRestart(Ctor, 400)
    }
  }

  private scheduleRestart(Ctor: SpeechRecognitionCtor, delayMs: number): void {
    if (this.restartTimer) window.clearTimeout(this.restartTimer)
    this.restartTimer = window.setTimeout(() => {
      this.restartTimer = null
      if (!this.active) return
      if (this.recognition) {
        const old = this.recognition
        this.recognition = null
        old.onresult = null
        old.onerror = null
        old.onend = null
        try {
          old.stop()
        } catch {
          // ignore
        }
      }
      this.begin(Ctor)
    }, delayMs)
  }

  private hardStop(clearStatus: boolean): void {
    this.active = false
    if (this.restartTimer) {
      window.clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    const rec = this.recognition
    this.recognition = null
    this.onCall = null
    if (rec) {
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
    if (clearStatus) {
      this.onStatus?.({ listening: false, lastHeard: this.lastHeard, error: null })
      this.onStatus = null
    }
  }

  stop(): void {
    this.hardStop(true)
  }
}
