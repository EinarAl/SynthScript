import { midiToFrequency } from './notes'
import type { Preset, VoiceKind } from './presets'
import { loadBank, nearestNote, getLoopPoints, type SampleBankName } from './samples'

interface Voice {
  kind: VoiceKind
  sources: AudioScheduledSourceNode[]
  gain: GainNode
  filter: BiquadFilterNode
  preset: Preset
  releasing: boolean
  ended: boolean
  lfoGain?: GainNode
  bendGain?: GainNode
}

const LOOP_KEY_BASE = 128 // loop voice keys live at or above this, clear of live notes

export class SynthEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private voices = new Map<number, Voice>()
  private preset: Preset
  private masterGainValue: number = 0.8
  private sampleBanks = new Map<SampleBankName, Promise<Map<number, AudioBuffer>>>()
  private loadedBanks = new Map<SampleBankName, Map<number, AudioBuffer>>()
  private bend = 0
  private mod = 0

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

  // Pitch bend, in cents. Applied live to every ringing osc voice and baked
  // into voices started while the bend is held.
  setPitchBend(cents: number): void {
    this.bend = cents
    const now = this.ctx ? this.ctx.currentTime : 0
    for (const voice of this.voices.values()) {
      if (voice.bendGain) voice.bendGain.gain.setTargetAtTime(cents, now, 0.03)
    }
  }

  // Mod wheel, 0..1. Scales the vibrato depth of ringing voices and of voices
  // started while the wheel sits where it sits.
  setMod(value: number): void {
    this.mod = Math.max(0, Math.min(1, value))
    const now = this.ctx ? this.ctx.currentTime : 0
    for (const voice of this.voices.values()) {
      if (voice.lfoGain) {
        voice.lfoGain.gain.setTargetAtTime((voice.preset.vibratoDepth ?? 0) * this.mod, now, 0.05)
      }
    }
  }

  noteOn(noteNumber: number, velocity: number = 1): void {
    const ctx = this.ensureContext()
    this.startVoice(noteNumber, noteNumber, velocity, this.preset, ctx.currentTime)
  }

  // Render a voice with an explicit preset starting at an absolute context time.
  // Used by the loop scheduler so recorded layers keep the voice they were
  // captured with regardless of the currently selected preset. The audible
  // pitch is the raw `note`; `voiceKey` is the key the voice is tracked under,
  // which lets the looper lay several layers out on distinct keys while they
  // all sound at the recorded pitch.
  noteOnAt(note: number, velocity: number, preset: Preset, at: number, voiceKey?: number): void {
    this.ensureContext()
    this.startVoice(voiceKey ?? note, note, velocity, preset, at)
  }

  private startVoice(key: number, midiNote: number, velocity: number, p: Preset, at: number): void {
    const ctx = this.ensureContext()

    // A re-strike on a key already ringing retriggers the note: release the
    // stale voice first so its buffer/oscillator never leak into the mix.
    const stale = this.voices.get(key)
    if (stale && !stale.releasing && !stale.ended) {
      this.releaseVoice(key, at)
    }

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
    let lfoGain: GainNode | undefined
    let bendGain: GainNode | undefined

    if (kind === 'sample') {
      const bankName = p.sampleBank
      if (!bankName) return
      const bank = this.loadedBanks.get(bankName)
      if (!bank) return
      const hit = nearestNote(bank, midiNote)
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
      const freq = midiToFrequency(midiNote)
      const oscCount = p.detune > 0 || (p.octave ?? 0) !== 0 ? 2 : 1
      for (let i = 0; i < oscCount; i++) {
        const osc = ctx.createOscillator()
        osc.type = p.wave
        osc.frequency.value =
          i === 1 && (p.octave ?? 0) !== 0 ? freq * Math.pow(2, (p.octave ?? 0) / 12) : freq
        if (i === 1 && p.detune > 0) osc.detune.value = p.detune
        osc.connect(env)
        osc.start(now)
        sources.push(osc)
      }

      // Pitch bend: a per-voice gain injected into every note oscillator's
      // detune, holding the current bend position so new voices inherit it and
      // ringing voices are nudged live. Sample presets are left unbent.
      bendGain = ctx.createGain()
      bendGain.gain.setValueAtTime(this.bend, now)
      for (const src of sources) {
        bendGain.connect((src as OscillatorNode).detune)
      }

      // Singing vibrato: a sine LFO modulates every oscillator's detune, ramping
      // in after vibratoDelay so sustained notes warble like arranger-keyboard
      // flute/reed presets instead of staying static.
      if ((p.vibratoDepth ?? 0) > 0) {
        const lfo = ctx.createOscillator()
        lfo.type = 'sine'
        lfo.frequency.value = p.vibratoRate ?? 5.5
        lfoGain = ctx.createGain()
        lfoGain.gain.setValueAtTime(0, now)
        lfoGain.gain.linearRampToValueAtTime(
          (p.vibratoDepth ?? 0) * this.mod,
          now + Math.max(p.vibratoDelay ?? 0.3, 0),
        )
        for (const src of sources) {
          lfoGain.connect((src as OscillatorNode).detune)
        }
        lfo.connect(lfoGain)
        lfo.start(now)
        sources.push(lfo)
      }
    }

    this.voices.set(key, { kind, sources, gain: env, filter, preset: p, releasing: false, ended: false, lfoGain, bendGain })
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
    if (!voice || !this.ctx || voice.releasing || voice.ended) return
    const now = at
    const p = voice.preset

    voice.releasing = true
    voice.gain.gain.cancelScheduledValues(now)
    voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, 0.0001), now)
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(p.release, 0.005))

    for (const src of voice.sources) {
      src.stop(now + Math.max(p.release, 0.005) + 0.05)
    }

    const cleanup = () => {
      // Only claim the map slot if this voice still owns it, so a retrigger
      // that already parked a fresh voice under the same key is not disturbed.
      if (this.voices.get(noteNumber) === voice) this.voices.delete(noteNumber)
      try { voice.gain.disconnect() } catch {}
      try { voice.filter.disconnect() } catch {}
      try { voice.lfoGain?.disconnect() } catch {}
      try { voice.bendGain?.disconnect() } catch {}
    }

    if (voice.kind === 'osc') {
      voice.sources.forEach((src) => {
        src.onended = cleanup
      })
    } else {
      // Sample buffers end on their own too (non-looping strikes), so the
      // natural end frees the voice without waiting for an explicit release.
      voice.sources.forEach((src) => {
        src.onended = () => {
          voice.ended = true
          cleanup()
        }
      })
      setTimeout(() => {
        voice.ended = true
        cleanup()
      }, (Math.max(p.release, 0.005) + 0.06) * 1000)
    }

    this.voices.delete(noteNumber)
  }

  // Ringing = the voice is still producing audio, not mid-release and not
  // already decayed on its own. Used by the looper to decide whether a held
  // note still needs its voice released or its source re-triggered.
  isVoiceRinging(noteNumber: number): boolean {
    const voice = this.voices.get(noteNumber)
    return !!voice && !voice.releasing && !voice.ended
  }

  // Release every loop voice (key at or above LOOP_KEY_BASE) without touching
  // live notes held on the keybed. Used by global pause and by layer mute.
  releaseLoopVoices(): void {
    const now = this.ctx ? this.ctx.currentTime : 0
    for (const key of [...this.voices.keys()]) {
      if (key >= LOOP_KEY_BASE) this.releaseVoice(key, now)
    }
  }

  // Release only the voices parked on keys inside [from, to]. Lets one layer be
  // muted while its neighbours keep ringing.
  releaseNotesInRange(from: number, to: number): void {
    const now = this.ctx ? this.ctx.currentTime : 0
    for (const key of [...this.voices.keys()]) {
      if (key >= from && key <= to) this.releaseVoice(key, now)
    }
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