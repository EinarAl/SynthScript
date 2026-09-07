import { useState } from 'react'
import type { Preset } from '../engine/presets'

interface LoopState {
  layers: number
  paused: boolean
  recording: boolean
  recordingBar: number | null
  countingIn: boolean
  countInBeats: number | null
  layerStates: Array<{ id: number; muted: boolean }>
}

interface ControlsProps {
  presets: Preset[]
  current: Preset
  baseC: number
  octave: number
  masterGain: number
  samplesLoading: boolean
  loopState: LoopState
  metronomeOn: boolean
  bpm: number
  onSelectPreset: (p: Preset) => void
  onOctaveChange: (o: number) => void
  onMasterGainChange: (v: number) => void
  onToggleMetronome: () => void
  onTempoChange: (v: number) => void
  onRecord: (bars: number) => void
  onStopLoop: () => void
  onPauseLoop: () => void
  onResumeLoop: () => void
  onSetLayerMuted: (id: number, muted: boolean) => void
  onCancelRecording: () => void
}

const LOOP_BARS = [1, 2, 4, 8]

export default function Controls({
  presets,
  current,
  baseC,
  octave,
  masterGain,
  samplesLoading,
  loopState,
  metronomeOn,
  bpm,
  onSelectPreset,
  onOctaveChange,
  onMasterGainChange,
  onToggleMetronome,
  onTempoChange,
  onRecord,
  onStopLoop,
  onPauseLoop,
  onResumeLoop,
  onSetLayerMuted,
  onCancelRecording,
}: ControlsProps) {
  const [selectedBars, setSelectedBars] = useState(4)
  const recording = loopState.recording
  return (
    <div className="controls">
      <div className="control-group">
        <span className="control-label">Voice</span>
        <div className="voice-buttons">
          {presets.map((p) => {
            const disabled = samplesLoading && p.voiceKind === 'sample'
            return (
              <button
                key={p.id}
                className={`voice-btn ${p.id === current.id ? 'active' : ''}`}
                onClick={() => onSelectPreset(p)}
                disabled={disabled}
                style={disabled ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
              >
                {p.name}
              </button>
            )
          })}
        </div>
      </div>

      <div className="control-group">
        <span className="control-label">Octave</span>
        <div className="octave-control">
          <button onClick={() => onOctaveChange(octave - 1)} disabled={baseC - 12 < 24}>−</button>
          <span className="octave-value">{octave}</span>
          <button onClick={() => onOctaveChange(octave + 1)} disabled={baseC + 12 > 84}>+</button>
        </div>
      </div>

      <div className="control-group">
        <span className="control-label">Volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={masterGain}
          onChange={(e) => onMasterGainChange(Number(e.target.value))}
        />
      </div>

      <div className={`control-group transport ${recording ? 'recording' : ''}`}>
        <span className="control-label">Metronome</span>
        <div className="transport-row">
          <button
            className={`transport-btn ${metronomeOn ? 'active' : ''}`}
            onClick={onToggleMetronome}
          >
            {metronomeOn ? 'On' : 'Off'}
          </button>
          <input
            type="range"
            min={40}
            max={240}
            step={1}
            value={bpm}
            aria-label="Tempo"
            onChange={(e) => onTempoChange(Number(e.target.value))}
          />
          <span className="bpm-value">{bpm} BPM</span>
        </div>
        <span className="control-label">Looper</span>
        <div className="transport-row">
          {recording ? (
            <>
              <button className="transport-btn recording" onClick={onCancelRecording}>
                Cancel
              </button>
              <span className="loop-status">
                {loopState.countingIn ? `Get ready... ${loopState.countInBeats ?? 3}` : `Recording bar ${loopState.recordingBar}`}
              </span>
            </>
          ) : (
            <>
              <button
                className={`transport-btn record ${loopState.layers > 0 ? 'active' : ''}`}
                onClick={() => onRecord(selectedBars)}
              >
                {loopState.layers > 0 ? 'Layer' : 'Record'}
              </button>
              <select
                aria-label="Loop length"
                className="loop-length"
                value={selectedBars}
                onChange={(e) => setSelectedBars(Number(e.target.value))}
              >
                {LOOP_BARS.map((bars) => (
                  <option key={bars} value={bars}>{bars} bars</option>
                ))}
              </select>
              {loopState.layers > 0 && (
                <>
                  <button
                    className={`transport-btn ${loopState.paused ? 'paused' : ''}`}
                    onClick={loopState.paused ? onResumeLoop : onPauseLoop}
                  >
                    {loopState.paused ? 'Resume' : 'Pause'}
                  </button>
                  <button className="transport-btn" onClick={onStopLoop}>
                    Stop
                  </button>
                </>
              )}
            </>
          )}
          <span className="loop-status">
            {loopState.layers > 0 ? `${loopState.layers} layer${loopState.layers > 1 ? 's' : ''}` : 'No loop'}
          </span>
        </div>
        {loopState.layerStates.length > 0 && (
          <div className="layer-row">
            {loopState.layerStates.map((layer) => (
              <button
                key={layer.id}
                className={`layer-chip ${layer.muted ? 'muted' : ''}`}
                onClick={() => onSetLayerMuted(layer.id, !layer.muted)}
                title={layer.muted ? 'Unmute this layer' : 'Mute this layer'}
              >
                Layer {layer.id} {layer.muted ? '· Muted' : ''}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}