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

    // loop now scheduled; first cycle stacks right where the take ended
    h.ctx.currentTime = 10.0
    h.queue.runAll()

    // deterministically check the scheduled start time: gridStart=2, duration=2,
    // first cycle cursor = gridStart + duration = 4
    const starts = h.ctx.createdOscs.map((o) => (o.start as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(starts).toContain(4.1) // note at cycleStart + (2.1-2)=0.1 -> 4.1
    const stops = h.ctx.createdOscs.map((o) => (o.stop as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(stops).toContain(4.85) // release at 4.5 + clean release 0.3 + 0.05
  })

  it('uses a 3-beat count-in ending on the downbeat', () => {
    const h = makeHarness()
    const lo = new Looper({ engine: h.engine, setInterval: (fn, ms) => h.queue.register(fn, ms) })

    h.ctx.currentTime = 0
    // at 120bpm one beat = 0.5s; 3-beat count-in ends at the bar boundary 2.0
    const { gridStart, countInStart } = lo.startRecording(120, 1, 0)

    expect(gridStart).toBe(2) // 2.0s is a bar boundary (2 = 1 bar * 2s)
    expect(countInStart).toBe(0.5) // clicks at 0.5, 1.0, 1.5 lead into the take

    // state reports counting in before the grid opens
    const states: Array<{ recording: boolean; countingIn: boolean; recordingBar: number | null; countInBeats: number | null }> = []
    lo.onStateChanged((s) => states.push(s))

    h.ctx.currentTime = 0.4
    h.queue.runAll()
    expect(states[0].recording).toBe(true)
    expect(states[0].countingIn).toBe(true)
    expect(states[0].recordingBar).toBeNull()
    // clicks at 0.5, 1.0, 1.5 are still to come
    expect(states[states.length - 1].countInBeats).toBe(3)

    h.ctx.currentTime = 2.1
    h.queue.runAll()
    const active = states[states.length - 1]
    expect(active.countingIn).toBe(false)
    expect(active.recordingBar).toBe(1)
    expect(active.countInBeats).toBeNull()
  })

  it('counts in 3 clicks even when the bar boundary would clip the lead-up', () => {
    const h = makeHarness()
    const lo = new Looper({ engine: h.engine, setInterval: (fn, ms) => h.queue.register(fn, ms) })

    // right on a bar boundary: aligning now+3beats would give gridStart=now,
    // so it rolls over to the next bar and keeps the full 3 clicks audible
    h.ctx.currentTime = 2.0
    const { gridStart, countInStart } = lo.startRecording(120, 1, 2.0)

    expect(gridStart).toBe(4)
    expect(countInStart).toBe(2.5)
  })

  it('loops back immediately after recording ends, even when the finalize tick runs late', () => {
    const h = makeHarness()
    const lo = new Looper({ engine: h.engine, setInterval: (fn, ms) => h.queue.register(fn, ms) })

    h.ctx.currentTime = 0
    lo.startRecording(120, 1, 0)
    h.ctx.currentTime = 2.1
    lo.capture(true, 60, 1, getPreset('clean'))
    h.ctx.currentTime = 2.5
    lo.capture(false, 60, 1, getPreset('clean'))

    // recording window ends at gridStart(2) + 2s = 4.0; the first scheduler
    // tick that notices fires late (past the old 20ms guard)
    h.ctx.currentTime = 4.09
    h.queue.runAll()

    // first playback cycle should still be scheduled right at the tail of the
    // take, not skipped: note on at 4.1, release-start at 4.5
    const starts = h.ctx.createdOscs.map((o) => (o.start as ReturnType<typeof vi.fn>).mock.calls[0][0])
    const stops = h.ctx.createdOscs.map((o) => (o.stop as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(starts).toContain(4.1)
    expect(stops).toContain(4.85)

    // and it keeps cycling on later ticks
    h.ctx.currentTime = 6.1
    h.queue.runAll()
    expect(lo.getLayerCount()).toBe(1)
    expect((lo as unknown as { layerCursor: Map<number, number> }).layerCursor.get(
      (lo as unknown as { layers: Array<{ id: number }> }).layers[0].id,
    )).toBeGreaterThan(6)
  })
})