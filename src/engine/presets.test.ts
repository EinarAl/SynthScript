import { describe, it, expect } from 'vitest'
import { getPreset, validatePreset, serializePreset } from './presets'

describe('getPreset', () => {
  it('returns a preset by id', () => {
    expect(getPreset('piano').id).toBe('piano')
  })

  it('falls back to first preset for unknown id', () => {
    expect(getPreset('does-not-exist').id).toBe('piano')
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

  it('rejects missing numeric fields', () => {
    const p = { ...getPreset('piano') }
    delete (p as Record<string, unknown>).attack
    expect(validatePreset(p)).toBeNull()
  })
})

describe('serializePreset', () => {
  it('round-trips through JSON', () => {
    const p = getPreset('harpsichord')
    const json = serializePreset(p)
    const parsed = JSON.parse(json)
    expect(validatePreset(parsed)).toEqual(p)
  })
})