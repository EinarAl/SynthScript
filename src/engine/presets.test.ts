import { describe, it, expect } from 'vitest'
import { getPreset, presets, validatePreset, serializePreset } from './presets'

describe('getPreset', () => {
  it('returns a preset by id', () => {
    expect(getPreset('piano').id).toBe('piano')
  })

  it('falls back to first preset for unknown id', () => {
    expect(getPreset('does-not-exist').id).toBe('clean')
  })
})

describe('built-in presets', () => {
  it('every preset passes validation', () => {
    for (const p of presets) {
      expect(validatePreset(p)).not.toBeNull()
    }
  })

  it('sample presets carry a sampleBank', () => {
    expect(getPreset('piano').sampleBank).toBe('piano')
    expect(getPreset('harpsichord').sampleBank).toBe('harpsichord')
    expect(getPreset('organ').sampleBank).toBe('organ')
  })

  it('osc presets carry no sampleBank', () => {
    expect(getPreset('clean').sampleBank).toBeUndefined()
    expect(getPreset('synth').sampleBank).toBeUndefined()
    expect(getPreset('dusk').sampleBank).toBeUndefined()
  })

  it('saves the original organ voicing under Dusk', () => {
    const dusk = getPreset('dusk')
    expect(dusk.voiceKind).toBe('osc')
    expect(dusk.wave).toBe('sine')
    expect(dusk.sustain).toBe(1)
  })
})

describe('validatePreset', () => {
  it('accepts a valid preset', () => {
    const p = getPreset('synth')
    expect(validatePreset(p)).not.toBeNull()
  })

  it('rejects non-objects', () => {
    expect(validatePreset(42)).toBeNull()
    expect(validatePreset(null)).toBeNull()
  })

  it('rejects invalid wave types', () => {
    const p = { ...getPreset('piano'), wave: 'banana' }
    expect(validatePreset(p)).toBeNull()
  })

  it('rejects invalid voice kinds', () => {
    const p = { ...getPreset('piano'), voiceKind: 'roman' }
    expect(validatePreset(p)).toBeNull()
  })

  it('accepts legacy presets without a voiceKind', () => {
    const p = { ...getPreset('clean') } as Record<string, unknown>
    delete p.voiceKind
    expect(validatePreset(p)).not.toBeNull()
  })

  it('rejects unknown sampleBank values', () => {
    const p = { ...getPreset('piano'), sampleBank: 'banjo' }
    expect(validatePreset(p)).toBeNull()
  })

  it('accepts an organ sampleBank', () => {
    const p = getPreset('organ')
    expect(validatePreset(p)).not.toBeNull()
  })

  it('rejects missing numeric fields', () => {
    const p = { ...getPreset('piano') }
    delete (p as Record<string, unknown>).attack
    expect(validatePreset(p)).toBeNull()
  })
})

describe('serializePreset', () => {
  it('round-trips a sample preset through JSON', () => {
    const p = getPreset('harpsichord')
    const json = serializePreset(p)
    const parsed = JSON.parse(json)
    expect(validatePreset(parsed)).toEqual(p)
  })
})