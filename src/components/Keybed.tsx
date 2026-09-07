import { useRef } from 'react'
import { getKeyMapping } from '../engine/keymap'
import { isBlackKey, noteToLabel } from '../engine/notes'

interface KeybedProps {
  baseC: number
  activeNotes: Set<number>
  onNoteOn: (n: number) => void
  onNoteOff: (n: number) => void
}

export default function Keybed({ baseC, activeNotes, onNoteOn, onNoteOff }: KeybedProps) {
  const mapping = getKeyMapping()

  const keys = mapping
    .map((m) => {
      const midi = baseC + m.offset
      return { ...m, midi, black: isBlackKey(midi) }
    })
    .sort((a, b) => a.offset - b.offset)

  const whiteKeys = keys.filter((k) => !k.black)
  const blackKeys = keys.filter((k) => k.black)

  // Buttons are keyed by offset (stable across an octave shift) so a held
  // pointer is not remounted mid-hold. The midi each pointer pressed is stored
  // here, so releasing after shifting octaves still stops the original note.
  const pointers = useRef(new Map<number, number>())

  const down = (k: { midi: number }) => (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, k.midi)
    onNoteOn(k.midi)
  }
  const up = (e: React.PointerEvent) => {
    const midi = pointers.current.get(e.pointerId)
    if (midi === undefined) return
    pointers.current.delete(e.pointerId)
    onNoteOff(midi)
  }

  return (
    <div className="keybed">
      <div className="keybed-whites">
        {whiteKeys.map((k) => (
          <button
            key={k.offset}
            className={`key white ${activeNotes.has(k.midi) ? 'active' : ''}`}
            onPointerDown={down(k)}
            onPointerUp={up}
            onPointerLeave={up}
            onPointerCancel={up}
          >
            <span className="key-label">{k.label}</span>
            <span className="key-note">{noteToLabel(k.midi)}</span>
          </button>
        ))}
      </div>
      <div className="keybed-blacks">
        {blackKeys.map((k) => {
          const wi = whiteKeys.findIndex((w) => w.offset === k.offset)
          const leftPct = ((wi + 1) / whiteKeys.length) * 100
          return (
            <button
              key={k.offset}
              className={`key black ${activeNotes.has(k.midi) ? 'active' : ''}`}
              style={{ left: `calc(${leftPct}% - var(--black-offset))` }}
              onPointerDown={down(k)}
              onPointerUp={up}
              onPointerLeave={up}
              onPointerCancel={up}
            >
              <span className="key-label">{k.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}