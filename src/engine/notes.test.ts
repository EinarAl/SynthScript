import { describe, it, expect } from 'vitest'
import { midiToFrequency, frequencyToMidi, midiToNote, noteToLabel, isBlackKey } from './notes'

describe('midiToFrequency', () => {
  it('maps A4 (69) to 440', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 6)
  })

  it('maps one octave up to double frequency', () => {
    expect(midiToFrequency(81)).toBeCloseTo(880, 6)
  })

  it('is lower for lower notes', () => {
    expect(midiToFrequency(60)).toBeLessThan(midiToFrequency(69))
  })
})

describe('frequencyToMidi', () => {
  it('inverts midiToFrequency', () => {
    expect(frequencyToMidi(440)).toBeCloseTo(69, 6)
  })
})

describe('midiToNote / noteToLabel', () => {
  it('names middle C as C4', () => {
    expect(midiToNote(60)).toEqual({ name: 'C', octave: 4, midi: 60 })
    expect(noteToLabel(60)).toBe('C4')
  })

  it('names C# correctly', () => {
    expect(midiToNote(61).name).toBe('C#')
  })
})

describe('isBlackKey', () => {
  it('identifies black keys by pitch class', () => {
    expect(isBlackKey(61)).toBe(true) // C#
    expect(isBlackKey(60)).toBe(false) // C
    expect(isBlackKey(62)).toBe(false) // D
    expect(isBlackKey(63)).toBe(true) // D#
    expect(isBlackKey(64)).toBe(false) // E
    expect(isBlackKey(66)).toBe(true) // F#
    expect(isBlackKey(68)).toBe(true) // G#
    expect(isBlackKey(70)).toBe(true) // A#
  })
})