import type { Preset } from '../engine/presets'

interface ControlsProps {
  presets: Preset[]
  current: Preset
  baseC: number
  octave: number
  masterGain: number
  samplesLoading: boolean
  onSelectPreset: (p: Preset) => void
  onOctaveChange: (o: number) => void
  onMasterGainChange: (v: number) => void
}

export default function Controls({
  presets,
  current,
  baseC,
  octave,
  masterGain,
  samplesLoading,
  onSelectPreset,
  onOctaveChange,
  onMasterGainChange,
}: ControlsProps) {
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
    </div>
  )
}