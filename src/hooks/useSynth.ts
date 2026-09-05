import { useEffect, useRef, useState, useCallback } from 'react'
import { SynthEngine } from '../engine/synthEngine'
import { getPreset, type Preset } from '../engine/presets'
import { keyToMidi } from '../engine/keymap'

export function useSynth() {
  const engineRef = useRef<SynthEngine | null>(null)
  if (engineRef.current === null) {
    engineRef.current = new SynthEngine(getPreset('clean'))
  }
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set())
  const [preset, setPresetState] = useState<Preset>(getPreset('clean'))
  const [samplesLoading, setSamplesLoading] = useState(true)
  const activeRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    let cancelled = false
    engineRef.current?.preloadSamples().then(() => {
      if (!cancelled) setSamplesLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const noteOn = useCallback((note: number, velocity?: number) => {
    engineRef.current?.resume()
    engineRef.current?.noteOn(note, velocity)
    const next = new Set(activeRef.current)
    next.add(note)
    activeRef.current = next
    setActiveNotes(next)
  }, [])

  const noteOff = useCallback((note: number) => {
    engineRef.current?.noteOff(note)
    const next = new Set(activeRef.current)
    next.delete(note)
    activeRef.current = next
    setActiveNotes(next)
  }, [])

  const setPreset = useCallback((p: Preset) => {
    engineRef.current?.setPreset(p)
    setPresetState(p)
  }, [])

  const setMasterGain = useCallback((v: number) => {
    engineRef.current?.setMasterGain(v)
  }, [])

  const allNotesOff = useCallback(() => {
    engineRef.current?.allNotesOff()
    const next = new Set<number>()
    activeRef.current = next
    setActiveNotes(next)
  }, [])

  return { activeNotes, noteOn, noteOff, allNotesOff, preset, setPreset, setMasterGain, presets: [getPreset('clean'), getPreset('piano'), getPreset('synth'), getPreset('harpsichord'), getPreset('organ'), getPreset('dusk')], samplesLoading }
}

export function useKeyboardInput(opts: {
  baseC: number
  onNoteOn: (n: number) => void
  onNoteOff: (n: number) => void
}) {
  const { baseC, onNoteOn, onNoteOff } = opts
  const baseCRef = useRef(baseC)
  baseCRef.current = baseC
  const onNoteOnRef = useRef(onNoteOn)
  onNoteOnRef.current = onNoteOn
  const onNoteOffRef = useRef(onNoteOff)
  onNoteOffRef.current = onNoteOff

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return
      const midi = keyToMidi(baseCRef.current, e.key)
      if (midi !== null) onNoteOnRef.current(midi)
    }
    const up = (e: KeyboardEvent) => {
      const midi = keyToMidi(baseCRef.current, e.key)
      if (midi !== null) onNoteOffRef.current(midi)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  return null
}