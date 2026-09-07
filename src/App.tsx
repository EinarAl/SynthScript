import { useState, useEffect, useCallback } from 'react'
import Keybed from './components/Keybed'
import Controls from './components/Controls'
import PresetPanel from './components/PresetPanel'
import { useSynth, useKeyboardInput } from './hooks/useSynth'
import { validatePreset, type Preset } from './engine/presets'

const DEFAULT_BASE_C = 48 // C3

export default function App() {
  const { activeNotes, noteOn, noteOff, allNotesOff, preset, setPreset, setMasterGain, presets, samplesLoading, loopState, metronomeOn, bpm, toggleMetronome, setTempo, startLoopRecording, stopLoop, pauseLoop, resumeLoop, setLoopLayerMuted, cancelRecording } = useSynth()
  const [baseC, setBaseC] = useState(DEFAULT_BASE_C)
  const [masterGain, setMasterGainLocal] = useState(0.8)
  const [audioBlocked, setAudioBlocked] = useState(false)

  const octave = Math.floor((baseC - 12) / 12)

  const selectPreset = useCallback((p: Preset) => {
    allNotesOff()
    setPreset(p)
  }, [allNotesOff, setPreset])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const p = params.get('p')
    if (p) {
      try {
        const preset = validatePreset(JSON.parse(decodeURIComponent(p)))
        if (preset) selectPreset(preset)
      } catch {}
    }
  }, [selectPreset])

  // Octave shifts do NOT cut held notes: a key pressed in one octave keeps
  // ringing until it is released, even if the range moved beneath it. Only
  // switching voices calls allNotesOff, so a drone doesn't survive a voice swap.
  const onOctaveChange = (o: number) => {
    setBaseC(12 + o * 12)
  }

  const onOctaveShift = (dir: 1 | -1) => {
    const next = Math.max(0, Math.min(6, octave + dir))
    onOctaveChange(next)
  }

  const onMasterGainChange = (v: number) => {
    setMasterGainLocal(v)
    setMasterGain(v)
  }

  useKeyboardInput({ baseC, onNoteOn: noteOn, onNoteOff: noteOff, onOctaveShift })

  const unlock = () => {
    noteOn(baseC);
    window.setTimeout(() => noteOff(baseC), 200)
    setAudioBlocked(false)
  }

  return (
    <div className="app">
      <h1 className="app-title">Keybed</h1>
      {samplesLoading && (
        <div className="samples-loading">Loading samples...</div>
      )}
      {audioBlocked && (
        <div className="audio-overlay" onClick={unlock}>
          <span>Click anywhere to enable audio</span>
        </div>
      )}
      <Keybed baseC={baseC} activeNotes={activeNotes} onNoteOn={noteOn} onNoteOff={noteOff} />
      <Controls
        presets={presets}
        current={preset}
        baseC={baseC}
        octave={octave}
        masterGain={masterGain}
        samplesLoading={samplesLoading}
        onSelectPreset={selectPreset}
        onOctaveChange={onOctaveChange}
        onMasterGainChange={onMasterGainChange}
        loopState={loopState}
        metronomeOn={metronomeOn}
        bpm={bpm}
        onToggleMetronome={toggleMetronome}
        onTempoChange={setTempo}
        onRecord={startLoopRecording}
        onStopLoop={stopLoop}
        onPauseLoop={pauseLoop}
        onResumeLoop={resumeLoop}
        onSetLayerMuted={setLoopLayerMuted}
        onCancelRecording={cancelRecording}
      />
      <PresetPanel current={preset} onImport={selectPreset} />
      <p className="hint">
        Play with your keyboard. A–; are the white keys, W E T Y U O P are the black keys. Up/Down arrows shift octave.
      </p>
    </div>
  )
}