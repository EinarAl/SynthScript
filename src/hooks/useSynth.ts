import { useEffect, useRef, useState, useCallback } from 'react'
import { SynthEngine } from '../engine/synthEngine'
import { getPreset, type Preset } from '../engine/presets'
import { keyToMidi } from '../engine/keymap'
import { Metronome } from '../engine/metronome'
import { Looper, type LoopStateChanged } from '../engine/looper'

export function useSynth() {
  const engineRef = useRef<SynthEngine | null>(null)
  if (engineRef.current === null) {
    engineRef.current = new SynthEngine(getPreset('clean'))
  }
  const looperRef = useRef<Looper | null>(null)
  if (looperRef.current === null) {
    looperRef.current = new Looper({ engine: engineRef.current })
  }
  const metronomeRef = useRef<Metronome | null>(null)
  if (metronomeRef.current === null) {
    metronomeRef.current = new Metronome({ engine: engineRef.current })
  }
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set())
  const [preset, setPresetState] = useState<Preset>(getPreset('clean'))
  const [samplesLoading, setSamplesLoading] = useState(true)
  const activeRef = useRef<Set<number>>(new Set())
  const [loopState, setLoopState] = useState<LoopStateChanged>(() => looperRef.current!.initialState())
  const [metronomeOn, setMetronomeOn] = useState(false)
  const [bpm, setBpm] = useState(120)
  const bpmRef = useRef(bpm)
  bpmRef.current = bpm
  const presetRef = useRef(preset)
  presetRef.current = preset

  useEffect(() => {
    let cancelled = false
    engineRef.current?.preloadSamples().then(() => {
      if (!cancelled) setSamplesLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    return looperRef.current!.onStateChanged((state) => {
      setLoopState(state)
      // When a recording finishes into a layer, drop the count-in metronome.
      if (!state.recording && state.layers > 0 && metronomeOn) {
        metronomeRef.current?.stop()
        setMetronomeOn(false)
      }
    })
  }, [metronomeOn])

  const noteOn = useCallback((note: number, velocity?: number) => {
    engineRef.current?.resume()
    engineRef.current?.noteOn(note, velocity)
    looperRef.current?.capture(true, note, velocity ?? 1, presetRef.current)
    const next = new Set(activeRef.current)
    next.add(note)
    activeRef.current = next
    setActiveNotes(next)
  }, [])

  const noteOff = useCallback((note: number) => {
    engineRef.current?.noteOff(note)
    looperRef.current?.capture(false, note, 1, presetRef.current)
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

  const toggleMetronome = useCallback(() => {
    setMetronomeOn((on) => {
      if (on) {
        metronomeRef.current?.stop()
        return false
      }
      engineRef.current?.resume()
      metronomeRef.current?.start(bpmRef.current)
      return true
    })
  }, [])

  const setTempo = useCallback((v: number) => {
    setBpm(v)
    if (metronomeRef.current && metronomeOn) {
      metronomeRef.current.stop()
      metronomeRef.current.start(v)
    }
  }, [metronomeOn])

  const startLoopRecording = useCallback((barCount: number) => {
    engineRef.current?.resume()
    const at = engineRef.current!.getCurrentTime()
    const { countInStart } = looperRef.current?.startRecording(bpmRef.current, barCount, at) ?? { countInStart: 0 }
    // Kick the click track into alignment so the count-in beats land exactly
    // before the recording window, regardless of the metronome's prior phase.
    metronomeRef.current?.stop()
    metronomeRef.current?.startAt(bpmRef.current, countInStart)
    setMetronomeOn(true)
  }, [])

  const stopLoop = useCallback(() => {
    looperRef.current?.stop()
    metronomeRef.current?.stop()
    setMetronomeOn(false)
  }, [])

  const cancelRecording = useCallback(() => {
    looperRef.current?.cancelRecording()
    metronomeRef.current?.stop()
    setMetronomeOn(false)
  }, [])

  return {
    activeNotes,
    noteOn,
    noteOff,
    allNotesOff,
    preset,
    setPreset,
    setMasterGain,
    presets: [getPreset('clean'), getPreset('piano'), getPreset('synth'), getPreset('harpsichord'), getPreset('organ'), getPreset('dusk')],
    samplesLoading,
    loopState,
    metronomeOn,
    bpm,
    toggleMetronome,
    setTempo,
    startLoopRecording,
    stopLoop,
    cancelRecording,
  }
}

export function useKeyboardInput(opts: {
  baseC: number
  onNoteOn: (n: number) => void
  onNoteOff: (n: number) => void
  onOctaveShift?: (dir: 1 | -1) => void
}) {
  const { baseC, onNoteOn, onNoteOff, onOctaveShift } = opts
  const baseCRef = useRef(baseC)
  baseCRef.current = baseC
  const onNoteOnRef = useRef(onNoteOn)
  onNoteOnRef.current = onNoteOn
  const onNoteOffRef = useRef(onNoteOff)
  onNoteOffRef.current = onNoteOff
  const onOctaveShiftRef = useRef(onOctaveShift)
  onOctaveShiftRef.current = onOctaveShift

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (e.repeat) return
        if (onOctaveShiftRef.current) {
          e.preventDefault()
          onOctaveShiftRef.current(e.key === 'ArrowUp' ? 1 : -1)
        }
        return
      }
      if (e.repeat) return
      const midi = keyToMidi(baseCRef.current, e.key)
      if (midi !== null) onNoteOnRef.current(midi)
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') return
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
}