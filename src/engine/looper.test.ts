import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Looper } from './looper'
import { SynthEngine } from './synthEngine'
import { getPreset } from './presets'

interface CtxStub {
  currentTime: number
  state: string
  createdOscs: { type: string; frequency: { value: number }; connect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; onended: (() => void) | null }[]
  createdSources: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; loop: boolean; loopStart: number; loopEnd: number; buffer: unknown; playbackRate: { value: number }; connect: ReturnType<typeof vi.fn>; onended: (() => void) | null }>
}

interface TimerQueue {
  callbacks: Array<() => void>
  active: boolean
  register(fn: () => void, _ms: number): { clear(): void }
  runAll(): void
}

function makeHarness(presetId = 'clean'): { engine: SynthEngine; ctx: CtxStub; queue: TimerQueue } {
  const oscs: CtxStub['createdOscs'] = []
  const sources: CtxStub['createdSources'] = []
  const queue: TimerQueue = {
    callbacks: [],
    active: true,
    register(fn: () => void, _ms: number) {
      queue.callbacks.push(fn)
      return { clear: () => { queue.callbacks = [] } }
    },
    runAll() {
      for (const cb of [...queue.callbacks]) cb()
    },
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
    disconnect: vi.fn(),
  }) as unknown as GainNode

  const makeFilter = () => ({
    type: 'lowpass',
    frequency: { value: 0 },
    Q: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }) as unknown as BiquadFilterNode

  const makeOsc = () => {
    const osc = {
      type: 'square',
      frequency: { value: 0 },
      detune: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    }
    oscs.push(osc)
    return osc
  }

  const makeSource = () => {
    const src = {
      buffer: null,
      playbackRate: { value: 1 },
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    }
    sources.push(src)
    return src
  }

  const ctx: CtxStub & {
    sampleRate: number
    destination: { connect: ReturnType<typeof vi.fn> }
    createOscillator: ReturnType<typeof vi.fn>
    createGain: ReturnType<typeof vi.fn>
    createBiquadFilter: ReturnType<typeof vi.fn>
    createBufferSource: ReturnType<typeof vi.fn>
    createBuffer: (channels: number, length: number) => { getChannelData: () => Float32Array }
    createDynamicsCompressor: ReturnType<typeof vi.fn>
  } = {
    currentTime: 0,
    state: 'running',
    sampleRate: 44100,
    destination: { connect: vi.fn() },
    createdOscs: oscs,
    createdSources: sources,
    createGain: vi.fn(makeGain),
    createBiquadFilter: vi.fn(makeFilter),
    createOscillator: vi.fn(makeOsc as unknown as () => OscillatorNode),
    createBufferSource: vi.fn(makeSource as unknown as () => AudioBufferSourceNode),
    createBuffer: vi.fn((_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) })),
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

  return { engine: new SynthEngine(getPreset(presetId)), ctx, queue }
}

beforeEach(() => {
  ;(globalThis as Record<string, unknown>).AudioContext = undefined
})

describe('Looper recording', () => {
  it('captures live notes only, anchored to the count-in grid', () => {
    const h = makeHarness()
    const lo = new Looper({ engine: h.engine, setInterval: (fn, ms) => h.queue.register(fn, ms) })

    h.ctx.currentTime = 0
    lo.startRecording(120, 1, 0) // 60/120 * 4 = 2s per bar; count-in => gridStart = 2
    // note captured before grid (during count-in) is ignored
    lo.capture(true, 60, 1, getPreset('clean'))
    h.ctx.currentTime = 2.1
    lo.capture(true, 60, 1, getPreset('clean'))
    h.ctx.currentTime = 2.5
    lo.capture(false, 60, 1, getPreset('clean'))

    expect(h.ctx.createdOscs).toHaveLength(0) // live notes are not engine-visible here

    // advance to the end of the 1-bar window and finalize
    h.ctx.currentTime = 4.01
    h.queue.runAll()

    expect(lo.getLayerCount()).toBe(1)
    expect(lo.isRecording()).toBe(false)
  })

  it('records the preset each note was played with', () => {
    const h = makeHarness()
    const lo = new Looper({ engine: h.engine, setInterval: (fn, ms) => h.queue.register(fn, ms) })

    h.ctx.currentTime = 0
    lo.startRecording(120, 1, 0)
    h.ctx.currentTime = 2.1
    lo.capture(true, 60, 1, getPreset('clean'))
    h.ctx.currentTime = 3.1
    lo.capture(true, 64, 1, getPreset('synth'))
    h.ctx.currentTime = 4.01
    h.queue.runAll()

    const events = (lo as unknown as { layers: Array<{ events: Array<{ note: number; preset: { id: string } }> }> }).layers[0].events
    expect(events).toHaveLength(2)
    expect(events.find((e) => e.note === 60)?.preset.id).toBe('clean')
    expect(events.find((e) => e.note === 64)?.preset.id).toBe('synth')
  })

  it('does not record while a previous loop is playing (no echo)', () => {
    const h = makeHarness()
    const lo = new Looper({ engine: h.engine, setInterval: (fn, ms) => h.queue.register(fn, ms) })

    // first recording
    h.ctx.currentTime = 0
    lo.startRecording(120, 1, 0)
    h.ctx.currentTime = 2.1
    lo.capture(true, 60, 1, getPreset('clean'))
    h.ctx.currentTime = 2.5
    lo.capture(false, 60, 1, getPreset('clean'))
    h.ctx.currentTime = 4.01
    h.queue.runAll()

    // second recording: loop is playing and schedules events, but recording
    // buffer only sees what's captured via capture() (live notes only)
    h.ctx.currentTime = 8.0
    lo.startRecording(120, 1, 8.0)
    // the running layer plays its note again (scheduled, not captured)
    h.ctx.currentTime = 8.1
    h.queue.runAll()
    h.ctx.currentTime = 10.0
    lo.capture(true, 62, 1, getPreset('harpsichord'))
    h.ctx.currentTime = 10.2
    lo.capture(false, 62, 1, getPreset('harpsichord'))
    h.ctx.currentTime = 12.01
    h.queue.runAll()

    expect(lo.getLayerCount()).toBe(2)
    const secondLayer = (lo as unknown as { layers: Array<{ events: Array<Record<string, unknown>> }> }).layers[1]
    // second layer holds only the live note, not echoes of layer 1
    expect(secondLayer.events).toHaveLength(2)
    expect(secondLayer.events.every((e) => e.note === 62)).toBe(true)
  })

  it('schedules loop voices at offset 128 and off events at the right times', () => {
    const h = makeHarness()
    const lo = new Looper({ engine: h.engine, setInterval: (fn, ms) => h.queue.register(fn, ms) })

    h.ctx.currentTime = 0
    lo.startRecording(120, 1, 0)
    h.ctx.currentTime = 2.1
    lo.capture(true, 60, 1, getPreset('clean'))
    h.ctx.currentTime = 2.5
    lo.capture(false, 60, 1, getPreset('clean'))
    h.ctx.currentTime = 4.01
    h.queue.runAll()

    // loop now scheduled; first cycle starts at the next aligned boundary
    h.ctx.currentTime = 10.0
    h.queue.runAll()

    // deterministically check the scheduled start time: gridStart=2, duration=2,
    // cycleStart aligned up from 4 to the next bar boundary = 4 (already on a bar)
    const starts = h.ctx.createdOscs.map((o) => (o.start as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(starts).toContain(4.1) // note at cycleStart + (2.1-2)=0.1 -> 4.1
    const stops = h.ctx.createdOscs.map((o) => (o.stop as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(stops).toContain(4.85) // release at 4.5 + clean release 0.3 + 0.05
  })
})