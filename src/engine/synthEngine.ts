import { midiToFrequency } from './notes'
import type { Preset } from './presets'

interface Voice {
  oscs: OscillatorNode[]
  gain: GainNode
  filter: BiquadFilterNode
}

export class SynthEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private voices = new Map<number, Voice>()
  private preset: Preset
  private masterGainValue: number = 0.8

  constructor(preset: Preset) {
    this.preset = preset
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.masterGainValue
      this.master.connect(this.ctx.destination)
    }
    return this.ctx
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
    const freq = midiToFrequency(noteNumber)
    const p = this.preset

    const gain = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    filter.type = p.filterType
    filter.frequency.value = p.filterFreq
    filter.Q.value = p.filterQ

    const now = ctx.currentTime
    const peak = p.gain * Math.max(0.05, Math.min(1, velocity))
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), now + Math.max(p.attack, 0.001))
    gain.gain.exponentialRampToValueAtTime(Math.max(peak * p.sustain, 0.0001), now + Math.max(p.attack, 0.001) + Math.max(p.decay, 0.001))

    const oscCount = p.detune > 0 ? 2 : 1
    const oscs: OscillatorNode[] = []
    for (let i = 0; i < oscCount; i++) {
      const osc = ctx.createOscillator()
      osc.type = p.wave
      osc.frequency.value = freq
      if (i === 1) osc.detune.value = p.detune
      osc.connect(gain)
      osc.start(now)
      oscs.push(osc)
    }

    gain.connect(filter)
    filter.connect(this.master!)

    this.voices.set(noteNumber, { oscs, gain, filter })
  }

  noteOff(noteNumber: number): void {
    const voice = this.voices.get(noteNumber)
    if (!voice || !this.ctx) return
    const ctx = this.ctx
    const now = ctx.currentTime
    const p = this.preset

    voice.gain.gain.cancelScheduledValues(now)
    voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, 0.0001), now)
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(p.release, 0.005))

    for (const osc of voice.oscs) {
      osc.stop(now + Math.max(p.release, 0.005) + 0.05)
    }

    const voiceRef = voice
    voiceRef.oscs.forEach((osc) => {
      osc.onended = () => {
        try { voiceRef.gain.disconnect() } catch {}
        try { voiceRef.filter.disconnect() } catch {}
      }
    })

    this.voices.delete(noteNumber)
  }

  allNotesOff(): void {
    for (const note of [...this.voices.keys()]) {
      this.noteOff(note)
    }
  }
}