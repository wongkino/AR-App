import type { Reaction } from '../types'

let currentAudio: HTMLAudioElement | null = null
/** Single player primed inside a user gesture — required for iOS programmatic play. */
let unlockedPlayer: HTMLAudioElement | null = null
let settleCurrentPlay: (() => void) | null = null
let activeSource: AudioBufferSourceNode | null = null
let voicesReady: Promise<void> | null = null
let audioUnlocked = false
let unlockAudioContext: AudioContext | null = null
let previewResumer: (() => void) | null = null

const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'

const ttsBlobCache = new Map<string, Blob>()

export function isAudioUnlocked(): boolean {
  return audioUnlocked
}

/** App registers this so we can un-pause the camera after audio on iOS. */
export function setPreviewResumer(fn: (() => void) | null): void {
  previewResumer = fn
}

function resumePreviewSoon(): void {
  window.setTimeout(() => previewResumer?.(), 0)
  window.setTimeout(() => previewResumer?.(), 120)
  window.setTimeout(() => previewResumer?.(), 400)
}

function finishCurrentPlay(): void {
  const settle = settleCurrentPlay
  settleCurrentPlay = null

  if (activeSource) {
    try {
      activeSource.stop()
    } catch {
      // ignore
    }
    activeSource.disconnect()
    activeSource = null
  }

  if (currentAudio) {
    currentAudio.onended = null
    currentAudio.onerror = null
    currentAudio.onplaying = null
    currentAudio.onloadedmetadata = null
    try {
      currentAudio.pause()
      currentAudio.currentTime = 0
    } catch {
      // ignore
    }
    // Keep unlockedPlayer alive — never dispose the gesture-primed element
    if (currentAudio !== unlockedPlayer) {
      currentAudio = null
    }
  }

  settle?.()
}

export function stopReactions(): void {
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.cancel()
  }
  finishCurrentPlay()
}

function isLikelyIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

function ensureAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!unlockAudioContext) unlockAudioContext = new AC()
  return unlockAudioContext
}

function playUnlockBeep(ctx: AudioContext): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = 880
  gain.gain.setValueAtTime(0.0001, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.15)
}

export type UnlockAudioOptions = {
  /** Short confirmation beep; off by default for auto-start. */
  beep?: boolean
}

/**
 * Must run from a user gesture on iOS.
 * Primes a persistent HTMLAudioElement + AudioContext so later gesture-match
 * playback (no user gesture) is still allowed.
 */
export async function unlockAudio(options?: UnlockAudioOptions): Promise<void> {
  if (typeof window === 'undefined') return
  const beep = options?.beep === true

  // 1) Persistent <audio> unlocked by this gesture (關鍵：之後不能 new Audio)
  if (!unlockedPlayer) {
    unlockedPlayer = new Audio()
    unlockedPlayer.setAttribute('playsinline', 'true')
    unlockedPlayer.preload = 'auto'
  }
  try {
    unlockedPlayer.src = SILENT_WAV
    unlockedPlayer.volume = 0.01
    await unlockedPlayer.play()
    unlockedPlayer.pause()
    unlockedPlayer.currentTime = 0
    unlockedPlayer.volume = 1
  } catch {
    // may still succeed later after a real tap
  }

  // 2) AudioContext (best path for programmatic TTS after unlock)
  try {
    const ctx = ensureAudioContext()
    if (ctx) {
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }
      if (beep) {
        playUnlockBeep(ctx)
      } else {
        const buffer = ctx.createBuffer(1, 1, 22050)
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(ctx.destination)
        source.start(0)
      }
    }
  } catch {
    // ignore
  }

  if (!isLikelyIOS() && typeof speechSynthesis !== 'undefined') {
    try {
      const warm = new SpeechSynthesisUtterance(' ')
      warm.volume = 0
      warm.rate = 2
      speechSynthesis.speak(warm)
    } catch {
      // ignore
    }
  }

  audioUnlocked = true
  resumePreviewSoon()
}

export async function runReaction(reaction: Reaction): Promise<void> {
  stopReactions()

  if (reaction.kind === 'speak') {
    if (!audioUnlocked) {
      throw new Error('請先點一下畫面啟用語音（iPhone / iPad 需要）')
    }
    await speak(reaction.text)
    return
  }

  if (!audioUnlocked) {
    throw new Error('請先點一下畫面啟用聲音（iPhone / iPad 需要）')
  }
  await playUrl(reaction.url)
}

function ensureVoices(): Promise<void> {
  if (typeof speechSynthesis === 'undefined') {
    return Promise.resolve()
  }
  if (speechSynthesis.getVoices().length > 0) {
    return Promise.resolve()
  }
  if (!voicesReady) {
    voicesReady = new Promise((resolve) => {
      const done = () => {
        speechSynthesis.removeEventListener('voiceschanged', done)
        resolve()
      }
      speechSynthesis.addEventListener('voiceschanged', done)
      speechSynthesis.getVoices()
      window.setTimeout(done, 800)
    })
  }
  return voicesReady
}

function pickSpeechVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null
  const voices = speechSynthesis.getVoices()
  if (voices.length === 0) return null

  const scored = voices
    .map((v) => {
      const lang = v.lang.toLowerCase()
      const name = v.name.toLowerCase()
      let score = 0
      if (lang === 'zh-hk' || lang.startsWith('zh-hk')) score += 100
      if (lang.includes('yue')) score += 90
      if (name.includes('sinji') || name.includes('雲杰') || name.includes('雲珍')) score += 80
      if (
        name.includes('cantonese') ||
        name.includes('粵語') ||
        name.includes('广东话') ||
        name.includes('廣東話')
      ) {
        score += 70
      }
      if (lang === 'zh-yue' || lang.startsWith('yue')) score += 60
      if (lang.startsWith('zh-tw') || lang === 'zh-tw') score += 40
      if (lang.startsWith('zh-cn') || lang === 'zh-cn') score += 30
      if (lang.startsWith('zh')) score += 20
      return { v, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored[0]?.v ?? null
}

async function speak(text: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) return

  let ttsError: string | null = null
  try {
    await playTtsAudio(trimmed)
    return
  } catch (err) {
    ttsError = err instanceof Error ? err.message : 'TTS 失敗'
  }

  try {
    await speakViaSynthesis(trimmed)
    return
  } catch (err) {
    const synthError = err instanceof Error ? err.message : '系統朗讀失敗'
    throw new Error(
      ttsError?.includes('阻擋') || ttsError?.includes('NotAllowed')
        ? '語音被瀏覽器阻擋，請點一下畫面後再試'
        : `無法播放語音（${ttsError ?? '網路'}／${synthError}）`,
    )
  }
}

async function fetchTtsBlob(text: string): Promise<Blob> {
  const cached = ttsBlobCache.get(text)
  if (cached) return cached

  const langs = ['yue', 'zh-TW', 'zh-CN']
  let lastErr = 'TTS 服務無回應'

  for (const lang of langs) {
    try {
      const res = await fetch(
        `/api/tts?text=${encodeURIComponent(text.slice(0, 180))}&lang=${encodeURIComponent(lang)}`,
      )
      if (!res.ok) {
        let detail = `HTTP ${res.status}`
        try {
          const body = (await res.json()) as { error?: string }
          if (body.error) detail = body.error
        } catch {
          // ignore
        }
        lastErr = detail
        continue
      }
      const type = res.headers.get('content-type') ?? ''
      const next = await res.blob()
      if (next.size < 64) {
        lastErr = 'TTS 音訊為空'
        continue
      }
      if (type.includes('json') || type.includes('text/html')) {
        lastErr = 'TTS 回應格式錯誤'
        continue
      }
      if (ttsBlobCache.size >= 40) {
        const oldest = ttsBlobCache.keys().next().value
        if (oldest) ttsBlobCache.delete(oldest)
      }
      ttsBlobCache.set(text, next)
      return next
    } catch (err) {
      lastErr = err instanceof Error ? err.message : '網路錯誤'
    }
  }

  throw new Error(lastErr)
}

async function playTtsAudio(text: string): Promise<void> {
  const blob = await fetchTtsBlob(text)

  // Prefer AudioContext: stays unlocked after gesture; works from camera callbacks
  try {
    await playBlobViaAudioContext(blob)
    return
  } catch {
    // fall through to primed HTMLAudioElement
  }

  const objectUrl = URL.createObjectURL(blob)
  try {
    await playUrl(objectUrl)
  } finally {
    // Delay revoke so playback can start
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000)
  }
}

async function playBlobViaAudioContext(blob: Blob): Promise<void> {
  const ctx = ensureAudioContext()
  if (!ctx) throw new Error('無 AudioContext')
  if (ctx.state === 'suspended') {
    await ctx.resume()
  }
  if (ctx.state !== 'running') {
    throw new Error('AudioContext 未解鎖')
  }

  finishCurrentPlay()

  const raw = await blob.arrayBuffer()
  // decodeAudioData may detach the buffer; copy first
  const copy = raw.slice(0)
  const audioBuf = await ctx.decodeAudioData(copy)
  const source = ctx.createBufferSource()
  source.buffer = audioBuf
  source.connect(ctx.destination)
  activeSource = source

  await new Promise<void>((resolve, reject) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      if (activeSource === source) activeSource = null
      resumePreviewSoon()
      resolve()
    }
    source.onended = done
    try {
      source.start(0)
    } catch (err) {
      if (activeSource === source) activeSource = null
      reject(err instanceof Error ? err : new Error('AudioContext 播放失敗'))
      return
    }
    // Safety
    window.setTimeout(done, Math.ceil(audioBuf.duration * 1000) + 500)
  })
}

async function speakViaSynthesis(text: string): Promise<void> {
  if (typeof speechSynthesis === 'undefined') {
    throw new Error('此瀏覽器不支援語音朗讀')
  }

  await ensureVoices()

  if (speechSynthesis.speaking || speechSynthesis.pending) {
    speechSynthesis.cancel()
  }
  if (speechSynthesis.paused) {
    speechSynthesis.resume()
  }

  await new Promise<void>((resolve, reject) => {
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'zh-HK'
    utter.rate = 1
    utter.volume = 1

    const voice = pickSpeechVoice()
    if (voice) {
      utter.voice = voice
      utter.lang = voice.lang || 'zh-HK'
    }

    const resumeTimer = window.setInterval(() => {
      if (speechSynthesis.paused) speechSynthesis.resume()
    }, 250)

    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearInterval(resumeTimer)
      resumePreviewSoon()
      resolve()
    }

    utter.onend = finish
    utter.onerror = (event) => {
      if (settled) return
      settled = true
      window.clearInterval(resumeTimer)
      resumePreviewSoon()
      const err = event.error
      if (err === 'interrupted' || err === 'canceled') {
        resolve()
        return
      }
      reject(new Error('系統朗讀失敗'))
    }

    speechSynthesis.speak(utter)
    speechSynthesis.resume()

    window.setTimeout(() => {
      if (settled) return
      if (!speechSynthesis.speaking && !speechSynthesis.pending) {
        settled = true
        window.clearInterval(resumeTimer)
        resumePreviewSoon()
        reject(new Error('系統朗讀未開始'))
      }
    }, 450)

    window.setTimeout(finish, 12_000)
  })
}

function scheduleDurationSettle(
  audio: HTMLAudioElement,
  settle: () => void,
): number {
  const d = audio.duration
  if (!Number.isFinite(d) || d <= 0 || d > 120) return 0
  return window.setTimeout(() => settle(), Math.ceil(d * 1000) + 400)
}

function playUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    finishCurrentPlay()

    // Reuse the gesture-primed element — new Audio() is blocked on iOS after unlock
    const audio = unlockedPlayer ?? new Audio()
    if (!unlockedPlayer) {
      unlockedPlayer = audio
      audio.setAttribute('playsinline', 'true')
      audio.preload = 'auto'
    }
    currentAudio = audio

    let settled = false
    let safetyTimer = 0
    let durationTimer = 0

    const settle = (err?: Error) => {
      if (settled) return
      settled = true
      settleCurrentPlay = null
      window.clearTimeout(safetyTimer)
      window.clearTimeout(durationTimer)
      resumePreviewSoon()
      if (err) reject(err)
      else resolve()
    }

    settleCurrentPlay = () => settle()

    audio.onplaying = () => {
      resumePreviewSoon()
      window.clearTimeout(durationTimer)
      durationTimer = scheduleDurationSettle(audio, () => settle())
    }

    audio.onloadedmetadata = () => {
      window.clearTimeout(durationTimer)
      durationTimer = scheduleDurationSettle(audio, () => settle())
    }

    audio.onended = () => settle()
    audio.onerror = () => settle(new Error('音訊解碼或載入失敗'))

    safetyTimer = window.setTimeout(() => settle(), 12_000)

    const start = () => {
      void audio.play().catch((err: unknown) => {
        const name = err instanceof DOMException ? err.name : ''
        if (name === 'NotAllowedError') {
          settle(new Error('播放被瀏覽器阻擋，請點一下畫面'))
          return
        }
        settle(err instanceof Error ? err : new Error('播放失敗'))
      })
    }

    if (audio.src === url) {
      try {
        audio.currentTime = 0
      } catch {
        // ignore
      }
      start()
      return
    }

    audio.src = url
    audio.load()
    start()
  })
}
