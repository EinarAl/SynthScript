// QWERTY -> semitone offset mapping, the classic "computer keyboard as piano" layout.
// Each entry maps a physical key (lowercase) to a semitone offset from C of the
// window's base octave. White keys use the home row; black keys the row above.

const KEY_OFFSETS: Record<string, number> = {
  a: 0,   // C
  w: 1,   // C#
  s: 2,   // D
  e: 3,   // D#
  d: 4,   // E
  f: 5,   // F
  t: 6,   // F#
  g: 7,   // G
  y: 8,   // G#
  h: 9,   // A
  u: 10,  // A#
  j: 11,  // B
  k: 12,  // C (next octave)
  o: 13,  // C#
  l: 14,  // D
  p: 15,  // D#
  ';': 16,// E
  "'": 17,// F
}

const KEY_LABELS: Record<string, string> = {
  a: 'A', w: 'W', s: 'S', e: 'E', d: 'D', f: 'F', t: 'T', g: 'G', y: 'Y',
  h: 'H', u: 'U', j: 'J', k: 'K', o: 'O', l: 'L', p: 'P', ';': ';', "'": "'",
}

export interface KeyMapping {
  key: string
  offset: number
  label: string
}

export function getKeyMapping(): KeyMapping[] {
  return Object.keys(KEY_OFFSETS).map((key) => ({
    key,
    offset: KEY_OFFSETS[key],
    label: KEY_LABELS[key] ?? key.toUpperCase(),
  }))
}

// A single octave window is 12 semitones. Our layout spans a bit over an
// octave and a half (offsets 0..17), so the "middle C" base is chosen so the
// layout is centered. Given a base MIDI note (a C), return the MIDI note for
// a pressed QWERTY key, or null if unmapped.
export function keyToMidi(baseC: number, key: string): number | null {
  const normalized = key.toLowerCase()
  if (normalized === "'") {
    if (key === "'") { /* fallthrough */ } else { return null }
  }
  const offset = KEY_OFFSETS[normalized]
  if (offset === undefined) return null
  return baseC + offset
}

export function midiToKey(baseC: number, midi: number): string | null {
  const offset = midi - baseC
  for (const [key, off] of Object.entries(KEY_OFFSETS)) {
    if (off === offset) return key
  }
  return null
}