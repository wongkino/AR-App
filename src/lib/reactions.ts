import type { Reaction } from '../types'

let currentAudio: HTMLAudioElement | null = null
let voicesReady: Promise<void> | null = null
let audioUnlocked = false
let unlockAudioContext: AudioContext | null = null
let resumeKeepAlive: number | null = null

const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'

export function isAudioUnlocked(): boolean {
  return audioUnlocked
}

export function stopReactions(): void {
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.cancel()
  }
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    currentAudio = null
  }
}

function startSpeechKeepAlive(): void {
  if (resumeKeepAlive != null) return
  resumeKeepAlive = window.setInterval(() => {
    if (typeof speechSynthesis === 'undefined') return
    if (speechSynthesis.paused) speechSynthesis.resume()
  }, 250)
}

function isLikelyIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  // iPadOS 13+ may report as Macintosh
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/**
 * Must be called from a user gesture (tap/click).
 * On iOS, speechSynthesis.speak() must run synchronously in that gesture
 * (before any await), or later programmatic speak() stays silent.
 */
export async function unlockAudio(): Promise<void> {
  if (typeof window === 'undefined') return

  // 1) Unlock HTMLAudio (reliable path for /api/tts fallback)
  try {
    const silent = new Audio(SILENT_WAV)
    silent.volume = 0.01
    void silent.play().catch(() => undefined)
  } catch {
    // ignore
  }

  // 2) Unlock Web Speech — MUST be synchronous (no await above this speak)
  if (typeof speechSynthesis !== 'undefined') {
    try {
      speechSynthesis.cancel()
      const warm = new SpeechSynthesisUtterance('叮')
      warm.rate = 1.15
      warm.volume = 1
      warm.lang = 'zh-HK'
      const voice = pickSpeechVoice()
      if (voice) {
        warm.voice = voice
        warm.lang = voice.lang || 'zh-HK'
      }
      speechSynthesis.speak(warm)
      speechSynthesis.resume()
    } catch {
      // ignore
    }
  }

  audioUnlocked = true
  startSpeechKeepAlive()

  // 3) AudioContext after sync speak (await is OK now)
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (AC) {
      if (!unlockAudioContext) unlockAudioContext = new AC()
      if (unlockAudioContext.state === 'suspended') {
        await unlockAudioContext.resume()
      }
      const buffer = unlockAudioContext.createBuffer(1, 1, 22050)
      const source = unlockAudioContext.createBufferSource()
      source.buffer = buffer
      source.connect(unlockAudioContext.destination)
      source.start(0)
    }
  } catch {
    // ignore
  }

  await ensureVoices()
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
      // Prime voice list on Safari
      speechSynthesis.getVoices()
      window.setTimeout(done, 800)
    })
  }
  return voicesReady
}

/** Prefer Cantonese, then any Chinese voice (iOS often only has zh-TW / zh-CN). */
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

  // iOS: HTMLAudio after unlock is more reliable than speechSynthesis from camera frames
  if (isLikelyIOS()) {
    try {
      await playTtsAudio(trimmed)
      return
    } catch {
      // fall through to Web Speech
    }
  }

  try {
    await speakViaSynthesis(trimmed)
    return
  } catch {
    await playTtsAudio(trimmed)
  }
}

function playTtsAudio(text: string): Promise<void> {
  const url = `/api/tts?text=${encodeURIComponent(text.slice(0, 180))}&lang=yue`
  return playUrl(url)
}

async function speakViaSynthesis(text: string): Promise<void> {
  if (typeof speechSynthesis === 'undefined') {
    throw new Error('此瀏覽器不支援語音朗讀')
  }

  await ensureVoices()

  // Avoid cancel() on a cold engine when nothing is speaking (hurts some iOS builds)
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
      resolve()
    }

    utter.onend = finish
    utter.onerror = (event) => {
      if (settled) return
      settled = true
      window.clearInterval(resumeTimer)
      const err = event.error
      if (err === 'interrupted' || err === 'canceled') {
        resolve()
        return
      }
      reject(new Error('朗讀失敗，請確認裝置未靜音並已允許聲音'))
    }

    speechSynthesis.speak(utter)
    speechSynthesis.resume()

    // iOS may swallow speak() with no error — detect and fail over
    window.setTimeout(() => {
      if (settled) return
      if (!speechSynthesis.speaking && !speechSynthesis.pending) {
        settled = true
        window.clearInterval(resumeTimer)
        reject(new Error('speech-not-started'))
      }
    }, 450)
  })
}

function playUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url)
    currentAudio = audio
    audio.onended = () => {
      currentAudio = null
      resolve()
    }
    audio.onerror = () => {
      currentAudio = null
      reject(new Error('無法播放音訊，請檢查網址或格式'))
    }
    void audio.play().catch((err: unknown) => {
      currentAudio = null
      reject(err instanceof Error ? err : new Error('播放被瀏覽器阻擋，請先點一下畫面'))
    })
  })
}
