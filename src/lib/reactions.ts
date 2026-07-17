import type { Reaction } from '../types'

let currentAudio: HTMLAudioElement | null = null
let voicesReady: Promise<void> | null = null
let audioUnlocked = false
let unlockAudioContext: AudioContext | null = null
let previewResumer: (() => void) | null = null

const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'

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

function isLikelyIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
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

/**
 * Must be called from a user gesture (tap/click).
 * Never use speechSynthesis here while the camera is running — on iOS it
 * pauses the <video> element and/or breaks MediaPipe's detect loop.
 */
export async function unlockAudio(): Promise<void> {
  if (typeof window === 'undefined') return

  try {
    const silent = new Audio(SILENT_WAV)
    silent.volume = 0.01
    void silent.play().catch(() => undefined)
  } catch {
    // ignore
  }

  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (AC) {
      if (!unlockAudioContext) unlockAudioContext = new AC()
      if (unlockAudioContext.state === 'suspended') {
        await unlockAudioContext.resume()
      }
      playUnlockBeep(unlockAudioContext)
    }
  } catch {
    // ignore
  }

  // Warm Web Speech only on desktop; iOS camera + speechSynthesis conflict
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

  try {
    await playTtsAudio(trimmed)
    return
  } catch {
    // fall through
  }

  if (isLikelyIOS()) {
    throw new Error('無法播放語音，請確認網路與音量')
  }

  await speakViaSynthesis(trimmed)
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
      reject(new Error('朗讀失敗，請確認裝置未靜音並已允許聲音'))
    }

    speechSynthesis.speak(utter)
    speechSynthesis.resume()

    window.setTimeout(() => {
      if (settled) return
      if (!speechSynthesis.speaking && !speechSynthesis.pending) {
        settled = true
        window.clearInterval(resumeTimer)
        resumePreviewSoon()
        reject(new Error('speech-not-started'))
      }
    }, 450)
  })
}

function playUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url)
    // Keep camera session preferred: don't let media take exclusive focus longer than needed
    audio.setAttribute('playsinline', 'true')
    currentAudio = audio

    // Kick camera resume as soon as playback starts (iOS pauses video here)
    audio.onplaying = () => {
      resumePreviewSoon()
    }

    audio.onended = () => {
      currentAudio = null
      resumePreviewSoon()
      resolve()
    }
    audio.onerror = () => {
      currentAudio = null
      resumePreviewSoon()
      reject(new Error('無法播放音訊，請檢查網址或格式'))
    }
    void audio.play().catch((err: unknown) => {
      currentAudio = null
      resumePreviewSoon()
      reject(err instanceof Error ? err : new Error('播放被瀏覽器阻擋，請先點一下畫面'))
    })
  })
}
