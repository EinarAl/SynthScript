import { useState } from 'react'
import { serializePreset, validatePreset, type Preset } from '../engine/presets'

interface PresetPanelProps {
  current: Preset
  onImport: (p: Preset) => void
}

export default function PresetPanel({ current, onImport }: PresetPanelProps) {
  const [text, setText] = useState('')
  const [message, setMessage] = useState('')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(serializePreset(current))
      setMessage('Copied to clipboard')
    } catch {
      setMessage('Copy failed')
    }
    setTimeout(() => setMessage(''), 2000)
  }

  const importJson = () => {
    try {
      const parsed = JSON.parse(text)
      const preset = validatePreset(parsed)
      if (preset) {
        onImport(preset)
        setMessage(`Imported "${preset.name}"`)
      } else {
        setMessage('Invalid preset JSON')
      }
    } catch {
      setMessage('Invalid JSON')
    }
    setTimeout(() => setMessage(''), 2000)
  }

  const share = () => {
    const url = new URL(window.location.href)
    url.searchParams.set('p', encodeURIComponent(serializePreset(current)))
    try {
      void navigator.clipboard.writeText(url.toString())
      setMessage('Share link copied')
    } catch {
      setMessage(url.toString())
    }
    setTimeout(() => setMessage(''), 2000)
  }

  return (
    <div className="preset-panel">
      <button onClick={copy}>Copy preset</button>
      <button onClick={share}>Share link</button>
      <div className="preset-import">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste preset JSON here"
          rows={3}
        />
        <button onClick={importJson}>Import</button>
      </div>
      {message && <span className="preset-message">{message}</span>}
    </div>
  )
}