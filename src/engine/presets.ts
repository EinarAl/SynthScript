import type { SampleBankName } from './samples'

export type VoiceKind = 'osc' | 'sample'

export interface Preset {
  id: string
  name: string
  voiceKind: VoiceKind
  wave: OscillatorType
  attack: number
  decay: number
  sustain: number
  release: number
  filterType: BiquadFilterType
  filterFreq: number
  filterQ: number
  detune: number
  gain: number
  vibratoRate?: number
  vibratoDepth?: number
  vibratoDelay?: number
  octave?: number
  sampleBank?: SampleBankName
}

export const presets: Preset[] = [
  {
    id: 'clean',
    name: 'Clean',
    voiceKind: 'osc',
    wave: 'triangle',
    attack: 0.005,
    decay: 0.4,
    sustain: 0.3,
    release: 0.3,
    filterType: 'lowpass',
    filterFreq: 1600,
    filterQ: 0.5,
    detune: 0,
    gain: 0.35,
  },
  {
    id: 'piano',
    name: 'Piano',
    voiceKind: 'sample',
    wave: 'triangle',
    attack: 0.005,
    decay: 0.05,
    sustain: 1,
    release: 0.5,
    filterType: 'lowpass',
    filterFreq: 8000,
    filterQ: 0.3,
    detune: 0,
    gain: 0.7,
    sampleBank: 'piano',
  },
  {
    id: 'synth',
    name: 'Synth',
    voiceKind: 'osc',
    wave: 'sawtooth',
    attack: 0.01,
    decay: 0.3,
    sustain: 0.6,
    release: 0.4,
    filterType: 'lowpass',
    filterFreq: 2200,
    filterQ: 2,
    detune: 6,
    gain: 0.25,
  },
  {
    id: 'chorus',
    name: 'Chorus',
    voiceKind: 'osc',
    // Fat, wide square stab: the throwaway chorus voicing from the first cumbia
    // attempt, kept because it is genuinely fun on its own.
    wave: 'square',
    attack: 0.003,
    decay: 0.15,
    sustain: 0.75,
    release: 0.22,
    filterType: 'lowpass',
    filterFreq: 3600,
    filterQ: 1.6,
    detune: 18,
    gain: 0.24,
  },
  {
    id: 'cumbia',
    name: 'Cumbia Lead',
    voiceKind: 'osc',
    // Arranger-keyboard flute/reed lead that anchors cumbia villera riffs
    // (Supermerk2's La Lata punteo, Lescano's Juno-106 melodies): a square
    // doubled an octave up, band-passed for nasal cup-mouth brightness, with
    // the singing LFO vibrato that fades in on sustained notes.
    wave: 'square',
    attack: 0.004,
    decay: 0.2,
    sustain: 0.85,
    release: 0.28,
    filterType: 'bandpass',
    filterFreq: 2400,
    filterQ: 0.9,
    detune: 6,
    vibratoRate: 5.5,
    vibratoDepth: 9,
    vibratoDelay: 0.35,
    octave: 12,
    gain: 0.3,
  },
  {
    id: 'harpsichord',
    name: 'Harpsichord',
    voiceKind: 'sample',
    wave: 'square',
    attack: 0.001,
    decay: 0.03,
    sustain: 1,
    release: 0.15,
    filterType: 'lowpass',
    filterFreq: 8000,
    filterQ: 0.3,
    detune: 0,
    gain: 0.5,
    sampleBank: 'harpsichord',
  },
  {
    id: 'organ',
    name: 'Organ',
    voiceKind: 'sample',
    wave: 'sine',
    attack: 0.01,
    decay: 0.05,
    sustain: 1,
    release: 0.08,
    filterType: 'lowpass',
    filterFreq: 4000,
    filterQ: 0.7,
    detune: 0,
    gain: 0.5,
    sampleBank: 'organ',
  },
  {
    id: 'dusk',
    name: 'Dusk',
    voiceKind: 'osc',
    wave: 'sine',
    attack: 0.01,
    decay: 0.05,
    sustain: 1,
    release: 0.08,
    filterType: 'lowpass',
    filterFreq: 4000,
    filterQ: 0.7,
    detune: 0,
    gain: 0.3,
  },
]

export function getPreset(id: string): Preset {
  return presets.find((p) => p.id === id) ?? presets[0]
}

export function validatePreset(value: unknown): Preset | null {
  if (typeof value !== 'object' || value === null) return null
  const p = value as Record<string, unknown>
  const waveValues: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle']
  const filterValues: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass']
  const voiceKinds: VoiceKind[] = ['osc', 'sample']
  const bankNames: SampleBankName[] = ['piano', 'harpsichord', 'organ']
  if (typeof p.id !== 'string') return null
  if (typeof p.name !== 'string') return null
  if (typeof p.voiceKind !== 'undefined' && !voiceKinds.includes(p.voiceKind as VoiceKind)) return null
  if (typeof p.sampleBank !== 'undefined' && !bankNames.includes(p.sampleBank as SampleBankName)) return null
  if (!waveValues.includes(p.wave as OscillatorType)) return null
  if (!filterValues.includes(p.filterType as BiquadFilterType)) return null
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  for (const f of ['attack', 'decay', 'sustain', 'release', 'filterFreq', 'filterQ', 'detune', 'gain'] as const) {
    if (!num(p[f])) return null
  }
  for (const f of ['vibratoRate', 'vibratoDepth', 'vibratoDelay', 'octave'] as const) {
    if (typeof p[f] !== 'undefined' && !num(p[f])) return null
  }
  return p as unknown as Preset
}

export function serializePreset(preset: Preset): string {
  return JSON.stringify(preset)
}