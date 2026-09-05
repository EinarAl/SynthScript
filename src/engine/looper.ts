import type { SynthEngine } from './synthEngine'
import type { Preset } from './presets'

interface TimerHandle {
  clear(): void
}

interface LooperDeps {
  engine: SynthEngine
  setInterval?: (fn: () => void, ms: number) => TimerHandle
}

export interface LoopEvent {
  on: boolean
  note: number
  velocity: number
  preset: Preset
  time: number // seconds, relative to this layer's gridStart
}

export interface LoopLayer {
  id: number
  events: LoopEvent[]
  duration: number // seconds, one full cycle
  barCount: number
}

export interface LoopStateChanged {
  layers: number
  recording: boolean
  recordingBar: number | null
}

const LOOKAHEAD_SECONDS = 0.25
const TICK_MS = 25
const LOOP_OFFSET = 128 // keeps loop voices out of the live-voice range
const BEATS_PER_BAR = 4
const COUNTING_BARS = 1

// Captures live keyboard input into discrete note events and replays them on a
// shared bar-aligned grid. Live input is the only thing recorded: already
// playing loops are never fed back in, so layered takes stay clean instead of
// echoing themselves. Every layer keeps the preset each note was played with.
export class Looper {
  private engine: SynthEngine
  private setIntervalFn: (fn: () => void, ms: number) => TimerHandle
  private timer: TimerHandle | null = null
  private layers: LoopLayer[] = []
  private layerGridStart = new Map<number, number>() // layer.id -> absolute bar-anchored start
  private layerCursor = new Map<number, number>() // layer.id -> next cycle start (absolute)
  private nextLayerId = 1
  private secondsPerBar = 0
  private recording = false
  private recordingBarTotal = 0
  private recordingBarElapsed = 0
  private gridStart = 0
  private recordingStopTime = 0
  private buffer: LoopEvent[] = []
  private activeRecordingNotes = new Set<number>()
  private listeners = new Set<(state: LoopStateChanged) => void>()
  private stopped = false

  constructor(deps: LooperDeps) {
    this.engine = deps.engine
    this.setIntervalFn = deps.setInterval ?? ((fn, ms) => {
      const id = window.setInterval(fn, ms)
      return { clear: () => window.clearInterval(id) }
    })
  }

  getLayerCount(): number {
    return this.layers.length
  }

  initialState(): LoopStateChanged {
    return { layers: 0, recording: false, recordingBar: null }
  }

  isRecording(): boolean {
    return this.recording
  }

  onStateChanged(fn: (state: LoopStateChanged) => void): () => void {
    this.listeners.add(fn)
    fn(this.snapshot())
    return () => this.listeners.delete(fn)
  }

  startRecording(bpm: number, barCount: number, now: number): void {
    this.cancelRecording()
    this.stopped = false
    this.secondsPerBar = (60 / bpm) * BEATS_PER_BAR
    this.recordingBarTotal = Math.max(1, barCount)
    this.recordingBarElapsed = 0
    this.buffer = []
    this.activeRecordingNotes.clear()

    // Anchor the grid one count-in bar after the current position so the
    // recording starts on a fresh downbeat.
    this.gridStart = now + this.secondsPerBar * COUNTING_BARS
    this.recordingStopTime = this.gridStart + this.secondsPerBar * this.recordingBarTotal
    this.recording = true

    this.timer = this.setIntervalFn(() => this.tick(), TICK_MS)
    this.emit()
  }

  capture(on: boolean, note: number, velocity = 1, preset: Preset): void {
    if (!this.recording) return
    const now = this.engine.getCurrentTime()
    if (now < this.gridStart) return
    const time = now - this.gridStart
    this.buffer.push({ on, note, velocity, preset, time })
    if (on) {
      this.activeRecordingNotes.add(note)
    } else {
      this.activeRecordingNotes.delete(note)
    }
  }

  stop(): void {
    this.cancelRecording()
    this.stopped = true
    this.engine.allNotesOff()
    this.layers = []
    this.layerGridStart.clear()
    this.layerCursor.clear()
    this.emit()
  }

  cancelRecording(): void {
    this.recording = false
    this.buffer = []
    this.activeRecordingNotes.clear()
    if (this.timer) {
      this.timer.clear()
      this.timer = null
    }
  }

  private snapshot(): LoopStateChanged {
    return {
      layers: this.layers.length,
      recording: this.recording,
      recordingBar: this.recording
        ? Math.min(this.recordingBarElapsed + 1, this.recordingBarTotal)
        : null,
    }
  }

  private emit(): void {
    const state = this.snapshot()
    this.listeners.forEach((fn) => fn(state))
  }

  private finalizeRecording(): void {
    const duration = this.secondsPerBar * this.recordingBarTotal
    const id = this.nextLayerId++
    const events = this.buffer
      // Delay release events that leak past the end of the recorded window so a
      // held note doesn't ring into the following, unrelated cycle.
      .filter((e) => e.time < duration)
      .sort((a, b) => a.time - b.time)

    const layer: LoopLayer = { id, events, duration, barCount: this.recordingBarTotal }
    this.layers.push(layer)
    this.layerGridStart.set(id, this.gridStart)
    // Start the first playback cycle on the next bar boundary so the layer
    // enters in sync with whatever is already looping.
    const cycleStart = this.alignUp(this.gridStart + duration, this.secondsPerBar)
    this.layerCursor.set(id, cycleStart)

    this.recording = false
    this.buffer = []
    this.activeRecordingNotes.clear()
    this.emit()
  }

  // Round an absolute time up to the nearest whole-bar boundary.
  private alignUp(t: number, secondsPerBar: number): number {
    const bar = Math.ceil(t / secondsPerBar)
    return bar * secondsPerBar
  }

  private tick(): void {
    if (this.stopped) return
    const now = this.engine.getCurrentTime()

    if (this.recording) {
      this.recordingBarElapsed = Math.floor((now - this.gridStart) / this.secondsPerBar)
      if (now >= this.recordingStopTime) {
        this.finalizeRecording()
      } else {
        this.emit()
      }
    }

    for (const layer of this.layers) {
      const gridStart = this.layerGridStart.get(layer.id)
      const cursor = this.layerCursor.get(layer.id)
      if (gridStart === undefined || cursor === undefined) continue

      // Schedule every cycle whose start still fits inside the lookahead window.
      let next = cursor
      while (next < now + LOOKAHEAD_SECONDS && next >= now - 0.02) {
        for (const e of layer.events) {
          const at = next + e.time
          if (e.on) {
            this.engine.noteOnAt(e.note + LOOP_OFFSET, e.velocity, e.preset, at)
          } else {
            this.engine.noteOffAt(e.note + LOOP_OFFSET, at)
          }
        }
        next += layer.duration
      }
      this.layerCursor.set(layer.id, next)

      // If the cursor fell behind (long stall), snap back to the current bar.
      if (next < now - LOOKAHEAD_SECONDS) {
        this.layerCursor.set(layer.id, this.alignUp(now, this.secondsPerBar))
      }
    }
  }
}