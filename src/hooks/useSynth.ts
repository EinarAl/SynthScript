import { useEffect, useRef, useState, useCallback } from 'react'
import { SynthEngine } from '../engine/synthEngine'
import { getPreset, type Preset } from '../engine/presets'
import { keyToMidi } from '../engine/keymap'
import { Metronome } from '../engine/metronome'
import { Looper, type LoopStateChanged } from '../engine/looper'

const PITCH_BEND_CENTS = 200

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

  const setPitchBend = useCallback((cents: number) => {
    engineRef.current?.setPitchBend(cents)
  }, [])

  const setMod = useCallback((value: number) => {
    engineRef.current?.setMod(value)
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

  const pauseLoop = useCallback(() => {
    looperRef.current?.pause()
  }, [])

  const resumeLoop = useCallback(() => {
    looperRef.current?.resume()
  }, [])

  const setLoopLayerMuted = useCallback((id: number, muted: boolean) => {
    looperRef.current?.setLoopLayerMuted(id, muted)
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
    setPitchBend,
    setMod,
    presets: [getPreset('clean'), getPreset('piano'), getPreset('synth'), getPreset('chorus'), getPreset('cumbia'), getPreset('harpsichord'), getPreset('organ'), getPreset('dusk')],
    samplesLoading,
    loopState,
    metronomeOn,
    bpm,
    toggleMetronome,
    setTempo,
    startLoopRecording,
    stopLoop,
    pauseLoop,
    resumeLoop,
    setLoopLayerMuted,
    cancelRecording,
  }
}

export function useKeyboardInput(opts: {
  baseC: number
  onNoteOn: (n: number) => void
  onNoteOff: (n: number) => void
  onPitchBend?: (cents: number) => void
  onMod?: (value: number) => void
}) {
  const { baseC, onNoteOn, onNoteOff, onPitchBend, onMod } = opts
  const baseCRef = useRef(baseC)
  baseCRef.current = baseC
  const onNoteOnRef = useRef(onNoteOn)
  onNoteOnRef.current = onNoteOn
  const onNoteOffRef = useRef(onNoteOff)
  onNoteOffRef.current = onNoteOff
  const onPitchBendRef = useRef(onPitchBend)
  onPitchBendRef.current = onPitchBend
  const onModRef = useRef(onMod)
  onModRef.current = onMod
  // Physical key -> the MIDI note it was pressed at. Releasing must stop the
  // original note, not one re-derived under a different range.
  const heldKeys = useRef(new Map<string, number>())

  useEffect(() => {
    const bendHeld = { left: false, right: false }
    const wheelHeld = { up: false, down: false }
    const wheelValue = { current: 0 }
    let wheelTimer: number | null = null

    const pushMod = () => {
      const dir = wheelHeld.up && !wheelHeld.down ? 1 : wheelHeld.down && !wheelHeld.up ? -1 : 0
      if (dir === 0) return
      wheelValue.current = Math.max(0, Math.min(1, wheelValue.current + dir * 0.05))
      onModRef.current?.(wheelValue.current)
    }
    const syncBend = () => {
      onPitchBendRef.current?.(
        bendHeld.right && !bendHeld.left
          ? PITCH_BEND_CENTS
          : bendHeld.left && !bendHeld.right
            ? -PITCH_BEND_CENTS
            : 0,
      )
    }

    const down = (e: KeyboardEvent) => {
      if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        if (e.repeat) return
        if (e.key === 'ArrowLeft') bendHeld.left = true
        else if (e.key === 'ArrowRight') bendHeld.right = true
        else if (e.key === 'ArrowUp') wheelHeld.up = true
        else if (e.key === 'ArrowDown') wheelHeld.down = true
        syncBend()
        if ((wheelHeld.up || wheelHeld.down) && wheelTimer === null) {
          pushMod()
          wheelTimer = window.setInterval(pushMod, 45)
        }
        return
      }
      if (e.repeat) return
      const midi = keyToMidi(baseCRef.current, e.key)
      if (midi !== null) {
        heldKeys.current.set(e.key, midi)
        onNoteOnRef.current(midi)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        if (e.key === 'ArrowLeft') bendHeld.left = false
        else if (e.key === 'ArrowRight') bendHeld.right = false
        else if (e.key === 'ArrowUp') wheelHeld.up = false
        else if (e.key === 'ArrowDown') wheelHeld.down = false
        syncBend()
        if (!wheelHeld.up && !wheelHeld.down && wheelTimer !== null) {
          window.clearInterval(wheelTimer)
          wheelTimer = null
        }
        return
      }
      const midi = heldKeys.current.get(e.key) ?? keyToMidi(baseCRef.current, e.key)
      heldKeys.current.delete(e.key)
      if (midi !== null) onNoteOffRef.current(midi)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      if (wheelTimer !== null) window.clearInterval(wheelTimer)
    }
  }, [])
}