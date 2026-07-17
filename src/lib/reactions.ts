import type { Reaction } from '../types'

let currentAudio: HTMLAudioElement | null = null
let voicesReady: Promise<void> | null = null

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

export async function runReaction(reaction: Reaction): Promise<void> {
  stopReactions()

  if (reaction.kind === 'speak') {
    await speak(reaction.text)
    return
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
      // Some browsers never fire voiceschanged if list is already cached empty
      window.setTimeout(done, 500)
    })
  }
  return voicesReady
}

/** Prefer Hong Kong Cantonese voices (zh-HK). */
function pickCantoneseVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices()
  const scored = voices
    .map((v) => {
      const lang = v.lang.toLowerCase()
      const name = v.name.toLowerCase()
      let score = 0
      if (lang === 'zh-hk' || lang.startsWith('zh-hk')) score += 100
      if (lang.includes('yue')) score += 90
      if (name.includes('sinji') || name.includes('雲杰') || name.includes('雲珍')) score += 80
      if (name.includes('cantonese') || name.includes('粵語') || name.includes('广东话') || name.includes('廣東話'))
        score += 70
      if (lang === 'zh-yue' || lang.startsWith('yue')) score += 60
      return { v, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored[0]?.v ?? null
}

async function speak(text: string): Promise<void> {
  if (typeof speechSynthesis === 'undefined') {
    throw new Error('此瀏覽器不支援語音朗讀')
  }

  await ensureVoices()

  return new Promise((resolve, reject) => {
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'zh-HK'
    utter.rate = 1

    const voice = pickCantoneseVoice()
    if (voice) {
      utter.voice = voice
      utter.lang = voice.lang || 'zh-HK'
    }

    utter.onend = () => resolve()
    utter.onerror = () => reject(new Error('朗讀失敗'))
    speechSynthesis.speak(utter)
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
      reject(err instanceof Error ? err : new Error('播放被瀏覽器阻擋'))
    })
  })
}
