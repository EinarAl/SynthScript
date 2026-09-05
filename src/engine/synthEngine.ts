import { midiToFrequency } from './notes'
import type { Preset, VoiceKind } from './presets'
import { loadBank, nearestNote, getLoopPoints, type SampleBankName } from './samples'

interface Voice {
  kind: VoiceKind
  sources: AudioScheduledSourceNode[]
  gain: GainNode
  filter: BiquadFilterNode
  preset: Preset
}

export class SynthEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private voices = new Map<number, Voice>()
  private preset: Preset
  private masterGainValue: number = 0.8
  private sampleBanks = new Map<SampleBankName, Promise<Map<number, AudioBuffer>>>()
  private loadedBanks = new Map<SampleBankName, Map<number, AudioBuffer>>()

  constructor(preset: Preset) {
    this.preset = preset
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.masterGainValue

      const comp = this.ctx.createDynamicsCompressor()
      comp.threshold.value = -18
      comp.knee.value = 10
      comp.ratio.value = 6
      comp.attack.value = 0.002
      comp.release.value = 0.12

      this.master.connect(comp)
      comp.connect(this.ctx.destination)
    }
    return this.ctx
  }

  async preloadSamples(): Promise<void> {
    const ctx = this.ensureContext()
    const banks: SampleBankName[] = ['piano', 'harpsichord', 'organ']
    await Promise.all(
      banks.map(async (name) => {
        if (this.sampleBanks.has(name)) return
        const promise = loadBank(ctx, name)
        this.sampleBanks.set(name, promise)
        const map = await promise
        this.loadedBanks.set(name, map)
      }),
    )
  }

  isSamplesReady(): boolean {
    return (
      this.loadedBanks.has('piano') &&
      this.loadedBanks.has('harpsichord') &&
      this.loadedBanks.has('organ')
    )
  }

  injectSampleBank(
    name: SampleBankName,
    map: Map<number, AudioBuffer>,
  ): void {
    this.loadedBanks.set(name, map)
    this.sampleBanks.set(name, Promise.resolve(map))
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
  }

  setPreset(preset: Preset): void {
    this.preset = preset
  }

  setMasterGain(v: number): void {
    this.masterGainValue = v
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02)
    }
  }

  noteOn(noteNumber: number, velocity: number = 1): void {
    const ctx = this.ensureContext()
    this.startVoice(noteNumber, velocity, this.preset, ctx.currentTime)
  }

  // Render a voice with an explicit preset starting at an absolute context time.
  // Used by the loop scheduler so recorded layers keep the voice they were
  // captured with regardless of the currently selected preset.
  noteOnAt(noteNumber: number, velocity: number, preset: Preset, at: number): void {
    this.ensureContext()
    this.startVoice(noteNumber, velocity, preset, at)
  }

  private startVoice(noteNumber: number, velocity: number, p: Preset, at: number): void {
    const ctx = this.ensureContext()

    const env = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    filter.type = p.filterType
    filter.frequency.value = p.filterFreq
    filter.Q.value = p.filterQ

    const now = at
    const peak = p.gain * Math.max(0.05, Math.min(1, velocity))
    env.gain.setValueAtTime(0.0001, now)
    env.gain.exponentialRampToValueAtTime(
      Math.max(peak, 0.0001),
      now + Math.max(p.attack, 0.001),
    )
    env.gain.exponentialRampToValueAtTime(
      Math.max(peak * p.sustain, 0.0001),
      now + Math.max(p.attack, 0.001) + Math.max(p.decay, 0.001),
    )

    env.connect(filter)
    filter.connect(this.master!)

    const kind = p.voiceKind ?? 'osc'
    const sources: AudioScheduledSourceNode[] = []

    if (kind === 'sample') {
      const bankName = p.sampleBank
      if (!bankName) return
      const bank = this.loadedBanks.get(bankName)
      if (!bank) return
      const hit = nearestNote(bank, noteNumber)
      if (!hit) return

      const src = ctx.createBufferSource()
      src.buffer = hit.buffer
      src.playbackRate.value = hit.playbackRate
      const loop = getLoopPoints(bankName, hit.midi)
      if (loop.loopStart !== undefined && loop.loopEnd !== undefined) {
        src.loop = true
        src.loopStart = loop.loopStart
        src.loopEnd = Math.min(loop.loopEnd, hit.buffer.duration - 0.01)
      }
      src.connect(env)
      src.start(now + 0.005)
      sources.push(src)
    } else {
      const freq = midiToFrequency(noteNumber)
      const oscCount = p.detune > 0 ? 2 : 1
      for (let i = 0; i < oscCount; i++) {
        const osc = ctx.createOscillator()
        osc.type = p.wave
        osc.frequency.value = freq
        if (i === 1) osc.detune.value = p.detune
        osc.connect(env)
        osc.start(now)
        sources.push(osc)
      }
    }

    this.voices.set(noteNumber, { kind, sources, gain: env, filter, preset: p })
  }

  noteOff(noteNumber: number): void {
    this.releaseVoice(noteNumber, this.ctx ? this.ctx.currentTime : 0)
  }

  // Release a loop voice at an absolute context time so the release envelope
  // lands on the loop grid instead of whenever the release arrives.
  noteOffAt(noteNumber: number, at: number): void {
    this.releaseVoice(noteNumber, at)
  }

  private releaseVoice(noteNumber: number, at: number): void {
    const voice = this.voices.get(noteNumber)
    if (!voice || !this.ctx) return
    const now = at
    const p = voice.preset

    voice.gain.gain.cancelScheduledValues(now)
    voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, 0.0001), now)
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(p.release, 0.005))

    for (const src of voice.sources) {
      src.stop(now + Math.max(p.release, 0.005) + 0.05)
    }

    const cleanup = () => {
      try { voice.gain.disconnect() } catch {}
      try { voice.filter.disconnect() } catch {}
    }

    if (voice.kind === 'osc') {
      voice.sources.forEach((src) => {
        src.onended = cleanup
      })
    } else {
      setTimeout(cleanup, (Math.max(p.release, 0.005) + 0.06) * 1000)
    }

    this.voices.delete(noteNumber)
  }

  allNotesOff(): void {
    for (const note of [...this.voices.keys()]) {
      this.noteOff(note)
    }
  }

  getCurrentTime(): number {
    return this.ensureContext().currentTime
  }

  // Schedule a short metronome click at an absolute context time. Accents are
  // slightly louder and higher pitched so the downbeat of each bar stands out.
  click(at: number, accent: boolean = false): void {
    const ctx = this.ensureContext()
    const master = this.master
    if (!master) return

    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.value = accent ? 1760 : 1175

    const env = ctx.createGain()
    const peak = accent ? 0.18 : 0.1
    env.gain.setValueAtTime(peak, at)
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.04)

    osc.connect(env)
    env.connect(master)
    osc.start(at)
    osc.stop(at + 0.05)
  }
}