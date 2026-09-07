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
  countingIn: boolean
  countInBeats: number | null
}

const LOOKAHEAD_SECONDS = 0.25
const TICK_MS = 25
const LOOP_OFFSET = 128 // voice-key separation only; audible pitch stays unchanged
const BEATS_PER_BAR = 4
const COUNTIN_BEATS = 3 // warning clicks heard before recording begins

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
  private countInStart = 0
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
    return { layers: 0, recording: false, recordingBar: null, countingIn: false, countInBeats: null }
  }

  isRecording(): boolean {
    return this.recording
  }

  onStateChanged(fn: (state: LoopStateChanged) => void): () => void {
    this.listeners.add(fn)
    fn(this.snapshot())
    return () => this.listeners.delete(fn)
  }

  // Begin capturing after a 3-beat count-in. The recording window is anchored
  // to the first bar boundary at least COUNTIN_BEATS after now, so layers start
  // on a downbeat and every layer shares the same absolute bar grid. Returns
  // the grid start and the count-in start so the caller can drive the
  // metronome clicks into alignment.
  startRecording(bpm: number, barCount: number, now: number): { gridStart: number; countInStart: number } {
    this.cancelRecording()
    this.stopped = false
    this.secondsPerBar = (60 / bpm) * BEATS_PER_BAR
    this.recordingBarTotal = Math.max(1, barCount)
    this.recordingBarElapsed = 0
    this.buffer = []
    this.activeRecordingNotes.clear()

    const beat = 60 / bpm
    this.gridStart = this.alignUp(now + COUNTIN_BEATS * beat, this.secondsPerBar)
    this.countInStart = this.gridStart - COUNTIN_BEATS * beat
    if (this.countInStart < now) {
      // Bar boundary landed inside the lead-up; push to the next one so the
      // full count-in is still audible.
      this.gridStart += this.secondsPerBar
      this.countInStart = this.gridStart - COUNTIN_BEATS * beat
    }
    this.recordingStopTime = this.gridStart + this.secondsPerBar * this.recordingBarTotal
    this.recording = true

    this.timer = this.setIntervalFn(() => this.tick(), TICK_MS)
    this.emit()
    return { gridStart: this.gridStart, countInStart: this.countInStart }
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
    this.emit()
  }

  private snapshot(): LoopStateChanged {
    const now = this.engine.getCurrentTime()
    const inCountIn = this.recording && now < this.gridStart
    const beat = this.secondsPerBar / BEATS_PER_BAR
    return {
      layers: this.layers.length,
      recording: this.recording,
      recordingBar: this.recording && !inCountIn
        ? Math.min(this.recordingBarElapsed + 1, this.recordingBarTotal)
        : null,
      countingIn: inCountIn,
      countInBeats: inCountIn ? Math.max(1, Math.ceil((this.gridStart - now) / beat) - 1) : null,
    }
  }

  private emit(): void {
    const state = this.snapshot()
    this.listeners.forEach((fn) => fn(state))
  }

  private finalizeRecording(): void {
    const duration = this.secondsPerBar * this.recordingBarTotal
    const id = this.nextLayerId++

    // Bring the take's note events into the cycle window, walking them in time
    // order. Any note still held when the window closed gets a release clamped
    // to the end of the cycle: a sustained chord loops as a sustained chord
    // instead of stacking an unreleased drone on every pass.
    const sorted = [...this.buffer].sort((a, b) => a.time - b.time)
    const events: LoopEvent[] = []
    const held = new Set<number>()

    for (const e of sorted) {
      if (e.time >= duration) {
        // Releases past the window boundary are handled by the held-note sweep
        // below so the loop never drops a note-off and rings forever.
        continue
      }
      if (e.on) {
        held.add(e.note)
      } else {
        held.delete(e.note)
      }
      events.push(e)
    }
    for (const note of held) {
      const last = [...events].reverse().find((e) => e.note === note)
      events.push({
        on: false,
        note,
        velocity: last?.velocity ?? 1,
        preset: last?.preset ?? this.layers[0]?.events[0]?.preset ?? sorted[0]?.preset,
        time: duration,
      })
    }
    events.sort((a, b) => a.time - b.time)

    const layer: LoopLayer = { id, events, duration, barCount: this.recordingBarTotal }
    this.layers.push(layer)
    this.layerGridStart.set(id, this.gridStart)
    // The first playback cycle starts where the recording ended, so the loop
    // picks up seamlessly the moment the take completes.
    this.layerCursor.set(id, this.gridStart + duration)

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
      let cursor = this.layerCursor.get(layer.id)
      if (gridStart === undefined || cursor === undefined) continue

      // A long stall (tab throttling) left the cursor far behind: snap it to the
      // next upcoming cycle start on this layer's own grid instead of firing a
      // wall of stale notes. A cursor only a few ms in the past (25ms tick
      // granularity) is fine: it fires now and WebAudio clamps the times, so the
      // loop resumes on its original grid.
      if (cursor < now - LOOKAHEAD_SECONDS) {
        cursor = gridStart + Math.max(0, Math.ceil((now - gridStart) / layer.duration)) * layer.duration
      }

      // Schedule every cycle whose start lands inside the lookahead window. The
      // cursor always advances, so playback stays live even when the recording
      // window ends a few ms after the scheduler's tick.
      while (cursor < now + LOOKAHEAD_SECONDS) {
        for (const e of layer.events) {
          const at = cursor + e.time
          if (e.on) {
            this.engine.noteOnAt(e.note + LOOP_OFFSET, e.velocity, e.preset, at)
          } else {
            this.engine.noteOffAt(e.note + LOOP_OFFSET, at)
          }
        }
        cursor += layer.duration
      }
      this.layerCursor.set(layer.id, cursor)
    }
  }
}