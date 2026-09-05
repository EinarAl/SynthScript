import { describe, it, expect } from 'vitest'
import { getBankNotes, nearestNote } from './samples'

describe('getBankNotes', () => {
  it('provides a piano bank spanning the full range', () => {
    const notes = getBankNotes('piano')
    expect(notes.length).toBeGreaterThan(20)
    const midis = notes.map((n) => n.midi)
    expect(Math.min(...midis)).toBeLessThanOrEqual(24)
    expect(Math.max(...midis)).toBeGreaterThanOrEqual(96)
  })

  it('provides a harpsichord bank in the low-mid register', () => {
    const notes = getBankNotes('harpsichord')
    expect(notes.length).toBeGreaterThan(15)
    const midis = notes.map((n) => n.midi)
    expect(Math.min(...midis)).toBeLessThanOrEqual(36)
    expect(Math.max(...midis)).toBeGreaterThanOrEqual(72)
  })

  it('piano notes are uniquely keyed by midi', () => {
    const midis = getBankNotes('piano').map((n) => n.midi)
    expect(new Set(midis).size).toBe(midis.length)
  })

  it('harpsichord notes are uniquely keyed by midi', () => {
    const midis = getBankNotes('harpsichord').map((n) => n.midi)
    expect(new Set(midis).size).toBe(midis.length)
  })

  it('provides an organ bank across the keyboard with loop points', () => {
    const notes = getBankNotes('organ')
    expect(notes.length).toBeGreaterThan(9)
    const midis = notes.map((n) => n.midi)
    expect(Math.min(...midis)).toBeLessThanOrEqual(36)
    expect(Math.max(...midis)).toBeGreaterThanOrEqual(84)
    for (const n of notes) {
      expect(n.loopStart).toBeGreaterThan(0)
      expect(n.loopEnd).toBeGreaterThan(n.loopStart ?? 0)
    }
  })

  it('organ notes are uniquely keyed by midi', () => {
    const midis = getBankNotes('organ').map((n) => n.midi)
    expect(new Set(midis).size).toBe(midis.length)
  })
})

describe('nearestNote', () => {
  it('returns the exact note and rate 1 when present', () => {
    const map = new Map<number, AudioBuffer>()
    map.set(60, {} as AudioBuffer)
    const res = nearestNote(map, 60)
    expect(res).not.toBeNull()
    expect(res!.midi).toBe(60)
    expect(res!.playbackRate).toBeCloseTo(1, 6)
  })

  it('stretches to the nearest available note above', () => {
    const map = new Map<number, AudioBuffer>()
    map.set(60, {} as AudioBuffer)
    map.set(72, {} as AudioBuffer)
    // midi 64 is closer to 60 (delta 4) than to 72 (delta 8)
    const res = nearestNote(map, 64)
    expect(res!.midi).toBe(60)
    expect(res!.playbackRate).toBeCloseTo(Math.pow(2, 4 / 12), 6)
  })

  it('picks the closer note across a boundary', () => {
    const map = new Map<number, AudioBuffer>()
    map.set(60, {} as AudioBuffer)
    map.set(72, {} as AudioBuffer)
    // midi 70 is closer to 72 (delta 2) than to 60 (delta 10)
    const res = nearestNote(map, 70)
    expect(res!.midi).toBe(72)
    expect(res!.playbackRate).toBeCloseTo(Math.pow(2, -2 / 12), 6)
  })

  it('returns null for an empty map', () => {
    expect(nearestNote(new Map(), 60)).toBeNull()
  })
})
