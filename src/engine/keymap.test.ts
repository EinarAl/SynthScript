import { describe, it, expect } from 'vitest'
import { keyToMidi, midiToKey, getKeyMapping } from './keymap'

describe('keyToMidi', () => {
  const base = 48 // C3

  it('maps A to base C', () => {
    expect(keyToMidi(base, 'a')).toBe(48)
  })

  it('maps W to C#', () => {
    expect(keyToMidi(base, 'w')).toBe(49)
  })

  it('maps S to D', () => {
    expect(keyToMidi(base, 's')).toBe(50)
  })

  it('is case-insensitive except apostrophe handling', () => {
    expect(keyToMidi(base, 'A')).toBe(48)
  })

  it('returns null for unmapped keys', () => {
    expect(keyToMidi(base, 'z')).toBeNull()
    expect(keyToMidi(base, '1')).toBeNull()
  })

  it('maps k to next octave C', () => {
    expect(keyToMidi(base, 'k') === base + 12).toBe(true)
  })
})

describe('midiToKey', () => {
  const base = 48

  it('round-trips', () => {
    const key = keyToMidi(base, 'e')
    expect(midiToKey(base, key!)).toBe('e')
  })

  it('returns null when no key maps to the offset', () => {
    expect(midiToKey(base, base + 100)).toBeNull()
  })
})

describe('getKeyMapping', () => {
  it('returns entries with offsets sorted', () => {
    const m = getKeyMapping()
    expect(m.length).toBeGreaterThan(0)
    const offsets = m.map((x) => x.offset)
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets)
  })
})