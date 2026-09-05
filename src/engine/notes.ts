const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export const A4_FREQ = 440
export const A4_MIDI = 69

export function midiToFrequency(noteNumber: number): number {
  return A4_FREQ * Math.pow(2, (noteNumber - A4_MIDI) / 12)
}

export function frequencyToMidi(freq: number): number {
  return A4_MIDI + 12 * Math.log2(freq / A4_FREQ)
}

export interface Note {
  name: string
  octave: number
  midi: number
}

export function midiToNote(noteNumber: number): Note {
  const name = NOTE_NAMES[((noteNumber % 12) + 12) % 12]
  const octave = Math.floor(noteNumber / 12) - 1
  return { name, octave, midi: noteNumber }
}

export function noteToLabel(noteNumber: number): string {
  const { name, octave } = midiToNote(noteNumber)
  return `${name}${octave}`
}

export function isBlackKey(noteNumber: number): boolean {
  const pc = ((noteNumber % 12) + 12) % 12
  return [1, 3, 6, 8, 10].includes(pc)
}