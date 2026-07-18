import type { RtcSignalPayload } from '../game/fifteenTypes'

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

type SignalSend = (to: string, payload: RtcSignalPayload) => void

/**
 * Mesh audio: each player connects to every other player so everyone can hear calls.
 * Offer polarity: lexicographically smaller playerId always creates the offer.
 */
export class FifteenVoiceMesh {
  private localStream: MediaStream | null = null
  private peers = new Map<string, RTCPeerConnection>()
  private audios = new Map<string, HTMLAudioElement>()
  private myId: string | null = null
  private sendSignal: SignalSend | null = null
  private muted = false
  private starting = false

  get micReady(): boolean {
    return Boolean(this.localStream?.getAudioTracks().some((t) => t.readyState === 'live'))
  }

  async ensureMic(): Promise<boolean> {
    if (this.micReady) return true
    if (this.starting) return false
    this.starting = true
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })
      this.applyMute()
      return true
    } catch {
      this.localStream = null
      return false
    } finally {
      this.starting = false
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.applyMute()
  }

  private applyMute(): void {
    this.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !this.muted
    })
  }

  bind(myId: string, sendSignal: SignalSend): void {
    this.myId = myId
    this.sendSignal = sendSignal
  }

  /** Sync peer list with current room players (excluding self). */
  async syncPeers(peerIds: string[]): Promise<void> {
    if (!this.myId || !this.sendSignal) return
    const ok = await this.ensureMic()
    if (!ok || !this.localStream) return

    const wanted = new Set(peerIds.filter((id) => id !== this.myId))

    for (const id of [...this.peers.keys()]) {
      if (!wanted.has(id)) this.closePeer(id)
    }

    for (const peerId of wanted) {
      if (this.peers.has(peerId)) continue
      const shouldOffer = this.myId < peerId
      const pc = this.createPeer(peerId)
      if (shouldOffer) {
        try {
          const offer = await pc.createOffer({ offerToReceiveAudio: true })
          await pc.setLocalDescription(offer)
          this.sendSignal?.(peerId, { kind: 'offer', sdp: offer })
        } catch {
          this.closePeer(peerId)
        }
      }
    }
  }

  async handleSignal(from: string, payload: RtcSignalPayload): Promise<void> {
    if (!this.myId || !this.sendSignal) return
    const ok = await this.ensureMic()
    if (!ok || !this.localStream) return

    let pc = this.peers.get(from)
    if (!pc) pc = this.createPeer(from)

    try {
      if (payload.kind === 'offer') {
        await pc.setRemoteDescription(payload.sdp)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        this.sendSignal(from, { kind: 'answer', sdp: answer })
      } else if (payload.kind === 'answer') {
        await pc.setRemoteDescription(payload.sdp)
      } else if (payload.kind === 'ice') {
        if (payload.candidate) {
          await pc.addIceCandidate(payload.candidate)
        }
      }
    } catch {
      // Ignore race / stale signals
    }
  }

  private createPeer(peerId: string): RTCPeerConnection {
    const existing = this.peers.get(peerId)
    if (existing) return existing

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    this.peers.set(peerId, pc)

    this.localStream?.getAudioTracks().forEach((track) => {
      pc.addTrack(track, this.localStream!)
    })

    pc.onicecandidate = (event) => {
      this.sendSignal?.(peerId, {
        kind: 'ice',
        candidate: event.candidate ? event.candidate.toJSON() : null,
      })
    }

    pc.ontrack = (event) => {
      const [stream] = event.streams
      if (!stream) return
      let audio = this.audios.get(peerId)
      if (!audio) {
        audio = new Audio()
        audio.autoplay = true
        audio.setAttribute('playsinline', 'true')
        this.audios.set(peerId, audio)
      }
      audio.srcObject = stream
      void audio.play().catch(() => undefined)
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.closePeer(peerId)
      }
    }

    return pc
  }

  private closePeer(peerId: string): void {
    const pc = this.peers.get(peerId)
    if (pc) {
      try {
        pc.close()
      } catch {
        // ignore
      }
      this.peers.delete(peerId)
    }
    const audio = this.audios.get(peerId)
    if (audio) {
      audio.pause()
      audio.srcObject = null
      this.audios.delete(peerId)
    }
  }

  dispose(): void {
    for (const id of [...this.peers.keys()]) this.closePeer(id)
    this.localStream?.getTracks().forEach((t) => t.stop())
    this.localStream = null
    this.myId = null
    this.sendSignal = null
  }
}
