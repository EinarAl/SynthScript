import type { SynthEngine } from './synthEngine'

interface TimerHandle {
  clear(): void
}

interface MetronomeDeps {
  engine: SynthEngine
  // Injectable lookahead clock for tests; real browser uses setInterval.
  setInterval?: (fn: () => void, ms: number) => TimerHandle
}

const LOOKAHEAD_SECONDS = 0.25
const TICK_MS = 25
const BEATS_PER_BAR = 4

export interface MetronomeBeat {
  count: number
  beatInBar: number
  accent: boolean
  time: number
}

// A lookahead scheduler that emits a click every beat. Rather than playing a
// click "now", it keeps a cursor ahead of the audio clock and schedules clicks
// slightly in the future, which keeps timing steady even when the main thread
// stalls briefly.
export class Metronome {
  private engine: SynthEngine
  private setIntervalFn: (fn: () => void, ms: number) => TimerHandle
  private timer: TimerHandle | null = null
  private nextBeatTime = 0
  private beatCount = 0
  private bpm = 120
  private listeners = new Set<(beat: MetronomeBeat) => void>()
  private stopped = false

  constructor(deps: MetronomeDeps) {
    this.engine = deps.engine
    this.setIntervalFn = deps.setInterval ?? ((fn, ms) => {
      const id = window.setInterval(fn, ms)
      return { clear: () => window.clearInterval(id) }
    })
  }

  start(bpm: number): void {
    this.stop()
    this.bpm = bpm
    this.beatCount = 0
    // Kick off just after the current time so a start feels immediate.
    this.nextBeatTime = this.engine.getCurrentTime() + 0.05
    this.stopped = false
    this.timer = this.setIntervalFn(() => this.tick(), TICK_MS)
  }

  stop(): void {
    this.stopped = true
    if (this.timer) {
      this.timer.clear()
      this.timer = null
    }
  }

  onBeat(fn: (beat: MetronomeBeat) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private tick(): void {
    if (this.stopped) return
    const now = this.engine.getCurrentTime()
    const secondsPerBeat = 60 / this.bpm

    while (this.nextBeatTime < now + LOOKAHEAD_SECONDS) {
      const accent = this.beatCount % BEATS_PER_BAR === 0
      this.engine.click(this.nextBeatTime, accent)
      const beat: MetronomeBeat = {
        count: this.beatCount,
        beatInBar: (this.beatCount % BEATS_PER_BAR) + 1,
        accent,
        time: this.nextBeatTime,
      }
      this.listeners.forEach((fn) => fn(beat))
      this.beatCount += 1
      this.nextBeatTime += secondsPerBeat
    }
  }
}