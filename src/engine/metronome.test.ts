import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Metronome } from './metronome'
import { SynthEngine } from './synthEngine'
import { getPreset } from './presets'

interface CtxStub {
  currentTime: number
  state: string
  createdOscs: { type: string; frequency: { value: number }; connect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; onended: (() => void) | null }[]
  resume: ReturnType<typeof vi.fn>
}

interface TimerQueue {
  callbacks: Array<() => void>
  register(fn: () => void, _ms: number): { clear(): void }
  runAll(): void
}

function makeHarness(): { engine: SynthEngine; ctx: CtxStub; queue: TimerQueue } {
  const oscs: CtxStub['createdOscs'] = []
  const queue: TimerQueue = {
    callbacks: [],
    register(fn: () => void, _ms: number) {
      queue.callbacks.push(fn)
      return { clear: () => { /* noop */ } }
    },
    runAll() {
      for (const cb of [...queue.callbacks]) cb()
    },
  }

  const makeOsc = () => {
    const osc = {
      type: 'square',
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    }
    oscs.push(osc)
    return osc
  }

  const makeGain = () => ({
    gain: {
      value: 0.0001,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
      setTargetAtTime: vi.fn(),
    },
    connect: vi.fn(),
  }) as unknown as GainNode

  const makeFilter = () => ({
    type: 'lowpass',
    frequency: { value: 0 },
    Q: { value: 0 },
    connect: vi.fn(),
  }) as unknown as BiquadFilterNode

  const ctx: CtxStub & {
    sampleRate: number
    destination: { connect: ReturnType<typeof vi.fn> }
    createOscillator: ReturnType<typeof vi.fn>
    createGain: ReturnType<typeof vi.fn>
    createBiquadFilter: ReturnType<typeof vi.fn>
    createBufferSource: ReturnType<typeof vi.fn>
    createDynamicsCompressor: ReturnType<typeof vi.fn>
  } = {
    currentTime: 0,
    state: 'running',
    sampleRate: 44100,
    destination: { connect: vi.fn() },
    createdOscs: oscs,
    resume: vi.fn(),
    createGain: vi.fn(makeGain),
    createBiquadFilter: vi.fn(makeFilter),
    createOscillator: vi.fn(makeOsc as unknown as () => OscillatorNode),
    createBufferSource: vi.fn(() => ({
      buffer: null,
      playbackRate: { value: 1, setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
    createDynamicsCompressor: vi.fn(() => ({
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
      connect: vi.fn(),
    })),
  }

  ;(globalThis as Record<string, unknown>).AudioContext = vi.fn(() => ctx)

  return {
    engine: new SynthEngine(getPreset('clean')),
    ctx,
    queue,
  }
}

beforeEach(() => {
  ;(globalThis as Record<string, unknown>).AudioContext = undefined
})

describe('Metronome', () => {
  it('schedules a click on every beat within the lookahead window', () => {
    const h = makeHarness()
    const met = new Metronome({ engine: h.engine, setInterval: (fn, ms) => h.queue.register(fn, ms) })

    h.ctx.currentTime = 0
    met.start(120) // 0.5s per beat, lookahead 0.25s
    h.ctx.currentTime = 0.1
    h.queue.runAll()

    // beats at 0.05, 0.55 beyond lookahead -> only one scheduled
    expect(h.ctx.createdOscs).toHaveLength(1)
    expect(h.ctx.createdOscs[0].start).toHaveBeenCalledWith(0.05)
  })

  it('schedules multiple beats as time advances', () => {
    const h = makeHarness()
    const met = new Metronome({ engine: h.engine, setInterval: (fn, ms) => h.queue.register(fn, ms) })

    h.ctx.currentTime = 0
    met.start(120)
    h.ctx.currentTime = 0.1
    h.queue.runAll()
    h.ctx.currentTime = 0.7
    h.queue.runAll()
    h.ctx.currentTime = 1.3
    h.queue.runAll()

    // beats: 0.05, 0.55, 1.05, 1.55(>1.3+0.25? no: 1.3+0.25=1.55 not <) -> 3 beats
    const times = h.ctx.createdOscs.map((o) => (o.start as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(times).toEqual([0.05, 0.55, 1.05])
  })

  it('accents the downbeat of each bar', () => {
    const h = makeHarness()
    const met = new Metronome({ engine: h.engine, setInterval: (fn, ms) => h.queue.register(fn, ms) })

    h.ctx.currentTime = 0
    met.start(120)
    h.ctx.currentTime = 2.1
    h.queue.runAll()
    h.ctx.currentTime = 4.2
    h.queue.runAll()

    // beats at 0.05(a), 0.55, 1.05, 1.55, 2.05(a), 2.55, 3.05, 3.55, 4.05(a)
    // accent => 1760Hz, else 1175Hz
    const freqs = h.ctx.createdOscs.map((o) => o.frequency.value)
    const isAccent = (t: number) => Math.abs(t - 0.05) < 1e-6 || Math.abs(t - 2.05) < 1e-6 || Math.abs(t - 4.05) < 1e-6
    const times = h.ctx.createdOscs.map((o) => (o.start as ReturnType<typeof vi.fn>).mock.calls[0][0])
    freqs.forEach((f, i) => {
      expect(f).toBe(isAccent(times[i]) ? 1760 : 1175)
    })
  })

  it('notifies beat listeners with downbeat info', () => {
    const h = makeHarness()
    const met = new Metronome({ engine: h.engine, setInterval: (fn, ms) => h.queue.register(fn, ms) })
    const heard: number[] = []
    met.onBeat((b) => heard.push(b.beatInBar))

    h.ctx.currentTime = 0
    met.start(120)
    h.ctx.currentTime = 2.1
    h.queue.runAll()

    expect(heard).toEqual([1, 2, 3, 4, 1])
  })

  it('stop() clears the timer and emits nothing further', () => {
    const h = makeHarness()
    const met = new Metronome({ engine: h.engine, setInterval: (fn, ms) => h.queue.register(fn, ms) })

    h.ctx.currentTime = 0
    met.start(120)
    met.stop()
    h.ctx.currentTime = 0.1
    h.queue.runAll()
    expect(h.ctx.createdOscs).toHaveLength(0)
  })

  it('startAt places the first click at an explicit absolute time', () => {
    const h = makeHarness()
    const met = new Metronome({ engine: h.engine, setInterval: (fn, ms) => h.queue.register(fn, ms) })

    h.ctx.currentTime = 0
    met.startAt(120, 3.0)
    h.ctx.currentTime = 3.1
    h.queue.runAll()

    // beats at 3.0, then 3.5 beyond lookahead -> only the first is scheduled
    const times = h.ctx.createdOscs.map((o) => (o.start as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(times).toEqual([3.0])
  })
})