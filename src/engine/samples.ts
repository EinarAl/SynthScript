export type SampleBankName = 'piano' | 'harpsichord' | 'organ'

interface SampleNote {
  midi: number
  file: string
  loopStart?: number
  loopEnd?: number
}

const BANKS: Record<SampleBankName, SampleNote[]> = {
  piano: [
    { midi: 21, file: 'A0.mp3' },
    { midi: 33, file: 'A1.mp3' },
    { midi: 45, file: 'A2.mp3' },
    { midi: 57, file: 'A3.mp3' },
    { midi: 69, file: 'A4.mp3' },
    { midi: 81, file: 'A5.mp3' },
    { midi: 93, file: 'A6.mp3' },
    { midi: 105, file: 'A7.mp3' },
    { midi: 24, file: 'C1.mp3' },
    { midi: 36, file: 'C2.mp3' },
    { midi: 48, file: 'C3.mp3' },
    { midi: 60, file: 'C4.mp3' },
    { midi: 72, file: 'C5.mp3' },
    { midi: 84, file: 'C6.mp3' },
    { midi: 96, file: 'C7.mp3' },
    { midi: 108, file: 'C8.mp3' },
    { midi: 27, file: 'Ds1.mp3' },
    { midi: 39, file: 'Ds2.mp3' },
    { midi: 51, file: 'Ds3.mp3' },
    { midi: 63, file: 'Ds4.mp3' },
    { midi: 75, file: 'Ds5.mp3' },
    { midi: 87, file: 'Ds6.mp3' },
    { midi: 99, file: 'Ds7.mp3' },
    { midi: 30, file: 'Fs1.mp3' },
    { midi: 42, file: 'Fs2.mp3' },
    { midi: 54, file: 'Fs3.mp3' },
    { midi: 66, file: 'Fs4.mp3' },
    { midi: 78, file: 'Fs5.mp3' },
    { midi: 90, file: 'Fs6.mp3' },
    { midi: 102, file: 'Fs7.mp3' },
  ],
  harpsichord: [
    { midi: 30, file: 'Fs0.ogg' },
    { midi: 32, file: 'Gs0.ogg' },
    { midi: 34, file: 'As0.ogg' },
    { midi: 36, file: 'C1.ogg' },
    { midi: 38, file: 'D1.ogg' },
    { midi: 40, file: 'E1.ogg' },
    { midi: 42, file: 'Fs1.ogg' },
    { midi: 44, file: 'Gs1.ogg' },
    { midi: 46, file: 'As1.ogg' },
    { midi: 48, file: 'C2.ogg' },
    { midi: 50, file: 'D2.ogg' },
    { midi: 52, file: 'E2.ogg' },
    { midi: 54, file: 'Fs2.ogg' },
    { midi: 56, file: 'Gs2.ogg' },
    { midi: 58, file: 'As2.ogg' },
    { midi: 60, file: 'C3.ogg' },
    { midi: 62, file: 'D3.ogg' },
    { midi: 64, file: 'E3.ogg' },
    { midi: 66, file: 'Fs3.ogg' },
    { midi: 68, file: 'Gs3.ogg' },
    { midi: 70, file: 'As3.ogg' },
    { midi: 72, file: 'C4.ogg' },
    { midi: 74, file: 'D4.ogg' },
    { midi: 76, file: 'E4.ogg' },
    { midi: 78, file: 'Fs4.ogg' },
    { midi: 80, file: 'Gs4.ogg' },
    { midi: 82, file: 'As4.ogg' },
    { midi: 84, file: 'C5.ogg' },
  ],
  organ: [
    { midi: 36, file: 'C2.ogg', loopStart: 2.23, loopEnd: 9.02 },
    { midi: 42, file: 'Fs2.ogg', loopStart: 1.03, loopEnd: 8.03 },
    { midi: 48, file: 'C3.ogg', loopStart: 1.16, loopEnd: 7.78 },
    { midi: 54, file: 'Fs3.ogg', loopStart: 1.03, loopEnd: 8.02 },
    { midi: 60, file: 'C4.ogg', loopStart: 1.34, loopEnd: 6.93 },
    { midi: 66, file: 'Fs4.ogg', loopStart: 0.9, loopEnd: 6.61 },
    { midi: 72, file: 'C5.ogg', loopStart: 0.81, loopEnd: 7.59 },
    { midi: 78, file: 'Fs5.ogg', loopStart: 1.03, loopEnd: 7.04 },
    { midi: 84, file: 'C6.ogg', loopStart: 1.03, loopEnd: 7.53 },
    { midi: 90, file: 'Fs6.ogg', loopStart: 1.04, loopEnd: 7.26 },
    { midi: 96, file: 'C7.ogg', loopStart: 0.82, loopEnd: 6.11 },
  ],
}

export function getBankNotes(bankName: SampleBankName): SampleNote[] {
  return BANKS[bankName]
}

export interface NearestResult {
  midi: number
  buffer: AudioBuffer
  playbackRate: number
}

export function getLoopPoints(
  bankName: SampleBankName,
  midi: number,
): { loopStart?: number; loopEnd?: number } {
  const note = BANKS[bankName].find((n) => n.midi === midi)
  return note ? { loopStart: note.loopStart, loopEnd: note.loopEnd } : {}
}

export function nearestNote(
  map: Map<number, AudioBuffer>,
  midi: number,
): NearestResult | null {
  let bestMidi = -1
  let bestDelta = Infinity
  for (const m of map.keys()) {
    const d = Math.abs(m - midi)
    if (d < bestDelta) {
      bestDelta = d
      bestMidi = m
    }
  }
  if (bestMidi < 0) return null
  const buffer = map.get(bestMidi)!
  const playbackRate = Math.pow(2, (midi - bestMidi) / 12)
  return { midi: bestMidi, buffer, playbackRate }
}

const bankCache = new Map<string, Promise<Map<number, AudioBuffer>>>()

export function loadBank(
  ctx: AudioContext,
  bankName: SampleBankName,
): Promise<Map<number, AudioBuffer>> {
  const cached = bankCache.get(bankName)
  if (cached) return cached

  const notes = BANKS[bankName]

  const promise = (async () => {
    const map = new Map<number, AudioBuffer>()
    await Promise.all(
      notes.map(async (n) => {
        const url = `/samples/${bankName}/${n.file}`
        try {
          const res = await fetch(url)
          if (!res.ok) return
          const ab = await res.arrayBuffer()
          const buf = await ctx.decodeAudioData(ab)
          map.set(n.midi, buf)
        } catch {}
      }),
    )
    return map
  })()

  bankCache.set(bankName, promise)
  return promise
}
