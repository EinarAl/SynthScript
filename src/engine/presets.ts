export interface Preset {
  id: string
  name: string
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
}

export const presets: Preset[] = [
  {
    id: 'clean',
    name: 'Clean',
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
    id: 'synth',
    name: 'Synth',
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
    id: 'harpsichord',
    name: 'Harpsichord',
    wave: 'square',
    attack: 0.002,
    decay: 0.6,
    sustain: 0.8,
    release: 0.15,
    filterType: 'highpass',
    filterFreq: 300,
    filterQ: 0.5,
    detune: 0,
    gain: 0.28,
  },
  {
    id: 'dusk',
    name: 'Dusk',
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
  if (typeof p.id !== 'string') return null
  if (typeof p.name !== 'string') return null
  if (!waveValues.includes(p.wave as OscillatorType)) return null
  if (!filterValues.includes(p.filterType as BiquadFilterType)) return null
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  for (const f of ['attack', 'decay', 'sustain', 'release', 'filterFreq', 'filterQ', 'detune', 'gain'] as const) {
    if (!num(p[f])) return null
  }
  return p as unknown as Preset
}

export function serializePreset(preset: Preset): string {
  return JSON.stringify(preset)
}