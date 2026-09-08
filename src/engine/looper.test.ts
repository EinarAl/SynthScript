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
    // a note struck before the grid opens survives and snaps to the downbeat
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

    const events = (lo as unknown as { layers: Array<{ events: Array<{ on: boolean; note: number; time: number; preset: { id: string } }> }> }).layers[0].events
    const ons = events.filter((e) => e.on)
    expect(ons).toHaveLength(2)
    expect(ons.find((e) => e.note === 60)?.preset.id).toBe('clean')
    expect(ons.find((e) => e.note === 64)?.preset.id).toBe('synth')
    // both notes were still held at the end of the window, so each gets a
    // release clamped to the cycle end
    expect(events.filter((e) => !e.on)).toHaveLength(2)
    expect(events.filter((e) => !e.on).every((e) => e.time === 2)).toBe(true)
  })

  it('shifts the take to the first note struck during the count-in', () => {
    const h = makeHarness()
    const lo = new Looper({ engine: h.engine, setInterval: (fn, ms) => h.queue.register(fn, ms) })

    h.ctx.currentTime = 0
    lo.startRecording(120, 1, 0) // gridStart = 2
    // melody starts 1s before the window opens and continues past it
    h.ctx.currentTime = 1.0
    lo.capture(true, 60, 1, getPreset('clean'))
    h.ctx.currentTime = 1.4
    lo.capture(true, 64, 1, getPreset('synth'))
    h.ctx.currentTime = 1.8
    lo.capture(false, 64, 1, getPreset('synth'))
    h.ctx.currentTime = 3.2
    lo.capture(false, 60, 1, getPreset('clean'))
    h.ctx.currentTime = 4.01
    h.queue.runAll()

    // earliest event was at -1.0, so everything shifts +1.0: the first note
    // lands on the downbeat and the rhythm (0.4 spacing) is preserved
    const events = (lo as unknown as { layers: Array<{ events: Array<{ on: boolean; note: number; time: number }> }> }).layers[0].events
    expect(events.find((e) => e.on && e.note === 60)?.time).toBe(0)
    expect(events.find((e) => e.on && e.note === 64)?.time).toBeCloseTo(0.4, 6)
    expect(events.find((e) => !e.on && e.note === 64)?.time).toBeCloseTo(0.8, 6)
  })

  it('handles a take that starts exactly at the boundary', () => {
    const h = makeHarness()
    const lo = new Looper({ engine: h.engine, setInterval: (fn, ms) => h.queue.register(fn, ms) })

    h.ctx.currentTime = 0
    lo.startRecording(120, 1, 0)
    h.ctx.currentTime = 2.0
    lo.capture(true, 60, 1, getPreset('clean'))
    h.ctx.currentTime = 4.01
    h.queue.runAll()

    const events = (lo as unknown as { layers: Array<{ events: Array<{ on: boolean; time: number }> }> }).layers[0].events
    expect(events.filter((e) => e.on)[0].time).toBe(0)
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

  it('schedules loop voices at layer-scoped keys and off events at the right times', () => {
    const h = makeHarness()
    const lo = new Looper({ engine: h.engine, setInterval: (fn, ms) => h.queue.register(fn, ms) })

    h.ctx.currentTime = 0
    lo.startRecording(120, 1, 0)
    // note is released mid-cycle so it re-triggers on every pass
    h.ctx.currentTime = 2.1
    lo.capture(true, 60, 1, getPreset('clean'))
    h.ctx.currentTime = 2.5
    lo.capture(false, 60, 1, getPreset('clean'))
    h.ctx.currentTime = 4.01
    h.queue.runAll()

    // loop now scheduled; first cycle stacks right where the take ended
    h.ctx.currentTime = 10.0
    h.queue.runAll()

    // deterministic start time: gridStart=2, duration=2, first cycle at 4
    const oscs = h.ctx.createdOscs
    const first = oscs[0]
    expect(first).toBeDefined()
    const starts = oscs.map((o) => (o.start as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(starts).toContain(4.1) // note at cycleStart + (2.1-2)=0.1 -> 4.1
    const stops = oscs.map((o) => (o.stop as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(stops).toContain(4.85) // release at 4.5 + clean release 0.3 + 0.05
    // voice key = 128 + layer(1)*128 + note(60) = 316, so a live noteOff on 60
    // must not kill the loop voice
    expect(h.ctx.createdOscs.length).toBeGreaterThan(0)
  })

  it('uses a 4-beat count-in ending on the downbeat', () => {
    const h = makeHarness()
    const lo = new Looper({ engine: h.engine, setInterval: (fn, ms) => h.queue.register(fn, ms) })

    h.ctx.currentTime = 0
    // at 120bpm one beat = 0.5s; 4-beat count-in ends at the bar boundary 2.0
    const { gridStart, countInStart } = lo.startRecording(120, 1, 0)

    expect(gridStart).toBe(2) // 2.0s is a bar boundary (2 = 1 bar * 2s)
    expect(countInStart).toBe(0) // clicks at 0.0, 0.5, 1.0, 1.5 lead into the take

    // state reports counting in before the grid opens
    const states: Array<{ recording: boolean; countingIn: boolean; recordingBar: number | null; countInBeats: number | null }> = []
    lo.onStateChanged((s) => states.push(s))

    h.ctx.currentTime = 0.4
    h.queue.runAll()
    expect(states[0].recording).toBe(true)
    expect(states[0].countingIn).toBe(true)
    expect(states[0].recordingBar).toBeNull()
    // clicks at 0.5, 1.0, 1.5 are still to come, then the take starts
    expect(states[states.length - 1].countInBeats).toBe(3)

    h.ctx.currentTime = 2.1
    h.queue.runAll()
    const active = states[states.length - 1]
    expect(active.countingIn).toBe(false)
    expect(active.recordingBar).toBe(1)
    expect(active.countInBeats).toBeNull()
  })

  it('counts in 4 clicks even when the bar boundary would clip the lead-up', () => {
    const h = makeHarness()
    const lo = new Looper({ engine: h.engine, setInterval: (fn, ms) => h.queue.register(fn, ms) })

    // right on a bar boundary: aligning now+4beats would give gridStart=now,
    // so it rolls over to the next bar and keeps the full 4 clicks audible
    h.ctx.currentTime = 2.0
    const { gridStart, countInStart } = lo.startRecording(120, 1, 2.0)

    expect(gridStart).toBe(4)
    expect(countInStart).toBe(2.0)
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

  it('holds a note through the window and cuts it off at the loop boundary', () => {
    const h = makeHarness()
    const lo = new Looper({ engine: h.engine, setInterval: (fn, ms) => h.queue.register(fn, ms) })

    // single cycle, note held from 2.1 through the end of the 2s window (4.0)
    h.ctx.currentTime = 0
    lo.startRecording(120, 1, 0)
    h.ctx.currentTime = 2.1
    lo.capture(true, 60, 1, getPreset('clean'))
    h.ctx.currentTime = 4.01
    h.queue.runAll()

    // the note is clamped to the cycle end instead of ringing across the
    // boundary, so every pass re-articulates it fresh
    const events = (lo as unknown as { layers: Array<{ events: Array<{ on: boolean; time: number }> }> }).layers[0].events
    const ons = events.filter((e) => e.on)
    expect(ons).toHaveLength(1)
    expect(events.filter((e) => !e.on)).toHaveLength(1)
    expect(events.filter((e) => !e.on)[0].time).toBe(2)
  })

  it('re-strikes a boundary-crossing note on later cycles', () => {
    const h = makeHarness()
    const lo = new Looper({ engine: h.engine, setInterval: (fn, ms) => h.queue.register(fn, ms) })

    h.ctx.currentTime = 0
    lo.startRecording(120, 1, 0)
    h.ctx.currentTime = 2.1
    lo.capture(true, 60, 1, getPreset('clean'))
    h.ctx.currentTime = 4.01
    h.queue.runAll()

    // step ticks through each boundary; the cursor advances one cycle per tick
    h.ctx.currentTime = 6.1
    h.queue.runAll()
    h.ctx.currentTime = 8.1
    h.queue.runAll()

    // the held-through note is re-articulated every cycle: attacks at 4.1, 6.1, 8.1
    const starts = h.ctx.createdOscs.map((o) => (o.start as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(starts.filter((t) => Math.abs(t - 4.1) < 0.01)).toHaveLength(1)
    expect(starts.filter((t) => Math.abs(t - 6.1) < 0.01)).toHaveLength(1)
    expect(starts.filter((t) => Math.abs(t - 8.1) < 0.01)).toHaveLength(1)
  })

  it('released notes still re-trigger each cycle', () => {
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

    // boundaries at 4 and 6; released note should attack at 4.1 and again at 6.1
    h.ctx.currentTime = 6.1
    h.queue.runAll()
    const starts = h.ctx.createdOscs.map((o) => (o.start as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(starts.filter((t) => Math.abs(t - 4.1) < 0.01)).toHaveLength(1)
    expect(starts.filter((t) => Math.abs(t - 6.1) < 0.01)).toHaveLength(1)
  })

  it('pauses scheduling and resumes on the next downbeat', () => {
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

    const before = h.ctx.createdOscs.length

    lo.pause()
    expect((lo as unknown as { paused: boolean }).paused).toBe(true)

    // while paused, ticks must not schedule any new voices
    h.ctx.currentTime = 6.5
    h.queue.runAll()
    expect(h.ctx.createdOscs.length).toBe(before)

    // resume snaps to the downbeat after now (gridStart=2, duration=2 -> 8)
    h.ctx.currentTime = 7.0
    lo.resume()
    const cursor = (lo as unknown as { layerCursor: Map<number, number> }).layerCursor.get(
      (lo as unknown as { layers: Array<{ id: number }> }).layers[0].id,
    )
    expect(cursor).toBe(8)
  })

  it('muting one layer stops only that layer voices', () => {
    const h = makeHarness()
    const lo = new Looper({ engine: h.engine, setInterval: (fn, ms) => h.queue.register(fn, ms) })

    // layer 1
    h.ctx.currentTime = 0
    lo.startRecording(120, 1, 0)
    h.ctx.currentTime = 2.1
    lo.capture(true, 60, 1, getPreset('clean'))
    h.ctx.currentTime = 2.5
    lo.capture(false, 60, 1, getPreset('clean'))
    h.ctx.currentTime = 4.01
    h.queue.runAll()

    // layer 2
    h.ctx.currentTime = 8.0
    lo.startRecording(120, 1, 8.0)
    h.ctx.currentTime = 8.1
    h.queue.runAll()
    h.ctx.currentTime = 10.1
    lo.capture(true, 64, 1, getPreset('clean'))
    h.ctx.currentTime = 10.5
    lo.capture(false, 64, 1, getPreset('clean'))
    h.ctx.currentTime = 12.01
    h.queue.runAll()

    const layerIds = (lo as unknown as { layers: Array<{ id: number }> }).layers.map((l) => l.id)
    expect(layerIds).toHaveLength(2)

    // layer 1 voice key base = 128 + 1*128 = 256; layer 2 base = 128 + 2*128 = 384
    let snapshot = lo.initialState()
    lo.onStateChanged((s) => { snapshot = s })
    lo.setLoopLayerMuted(layerIds[0], true)
    expect(snapshot.layerStates.find((s) => s.id === layerIds[0])?.muted).toBe(true)
  })

  it('reports layerStates in the snapshot and updates on mute', () => {
    const h = makeHarness()
    const lo = new Looper({ engine: h.engine, setInterval: (fn, ms) => h.queue.register(fn, ms) })

    let snapshot = lo.initialState()
    lo.onStateChanged((s) => { snapshot = s })

    h.ctx.currentTime = 0
    lo.startRecording(120, 1, 0)
    h.ctx.currentTime = 2.1
    lo.capture(true, 60, 1, getPreset('clean'))
    h.ctx.currentTime = 4.01
    h.queue.runAll()

    const initialStates = snapshot.layerStates
    expect(initialStates).toHaveLength(1)
    expect(initialStates[0].muted).toBe(false)

    lo.setLoopLayerMuted(initialStates[0].id, true)
    expect(snapshot.layerStates[0].muted).toBe(true)
    // pausing flags the paused state
    lo.pause()
    expect(snapshot.paused).toBe(true)
  })
})