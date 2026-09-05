import { useState, useEffect } from 'react'
import Keybed from './components/Keybed'
import Controls from './components/Controls'
import PresetPanel from './components/PresetPanel'
import { useSynth, useKeyboardInput } from './hooks/useSynth'
import { validatePreset } from './engine/presets'

const DEFAULT_BASE_C = 48 // C3

export default function App() {
  const { activeNotes, noteOn, noteOff, preset, setPreset, setMasterGain, presets } = useSynth()
  const [baseC, setBaseC] = useState(DEFAULT_BASE_C)
  const [masterGain, setMasterGainLocal] = useState(0.8)
  const [audioBlocked, setAudioBlocked] = useState(false)

  const octave = Math.floor((baseC - 12) / 12)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const p = params.get('p')
    if (p) {
      try {
        const preset = validatePreset(JSON.parse(decodeURIComponent(p)))
        if (preset) setPreset(preset)
      } catch {}
    }
  }, [setPreset])

  const onOctaveChange = (o: number) => {
    setBaseC(12 + o * 12)
  }

  const onMasterGainChange = (v: number) => {
    setMasterGainLocal(v)
    setMasterGain(v)
  }

  useKeyboardInput({ baseC, onNoteOn: noteOn, onNoteOff: noteOff })

  const unlock = () => {
    noteOn(baseC);
    window.setTimeout(() => noteOff(baseC), 200)
    setAudioBlocked(false)
  }

  return (
    <div className="app">
      <h1 className="app-title">Keybed</h1>
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
        onSelectPreset={setPreset}
        onOctaveChange={onOctaveChange}
        onMasterGainChange={onMasterGainChange}
      />
      <PresetPanel current={preset} onImport={setPreset} />
      <p className="hint">
        Play with your keyboard. A–; are the white keys, W E T Y U O P are the black keys.
      </p>
    </div>
  )
}