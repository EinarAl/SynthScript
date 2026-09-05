import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SynthEngine } from './synthEngine'
import { getPreset } from './presets'

interface CtxStub {
  currentTime: number
  state: string
  stopped: number[]
  createdOscs: Array<{ stop: ReturnType<typeof vi.fn>; onended: (() => void) | null }>
  makeGain: () => GainNode
  makeFilter: () => BiquadFilterNode
}

function createEngine(): { engine: SynthEngine; ctx: CtxStub } {
  const stopped: number[] = []
  const createdOscs: CtxStub['createdOscs'] = []

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
      type: 'sine',
      frequency: { value: 440 },
      detune: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn((t: number) => stopped.push(t)),
      onended: null as (() => void) | null,
    }
    createdOscs.push(osc)
    return osc as unknown as OscillatorNode
  }

  const ctx: CtxStub = {
    currentTime: 0,
    state: 'running',
    stopped,
    createdOscs,
    makeGain,
    makeFilter,
  }

  const audioCtxStub = {
    currentTime: 0,
    state: 'running',
    destination: { connect: vi.fn() },
    createGain: vi.fn(makeGain),
    createBiquadFilter: vi.fn(makeFilter),
    createOscillator: vi.fn(makeOsc),
    resume: vi.fn(),
  }

  ;(globalThis as Record<string, unknown>).AudioContext = vi.fn(() => audioCtxStub)

  return { engine: new SynthEngine(getPreset('piano')), ctx }
}

beforeEach(() => {
  ;(globalThis as Record<string, unknown>).AudioContext = undefined
})

describe('SynthEngine voice lifecycle', () => {
  it('noteOff releases the matching voice', () => {
    const { engine, ctx } = createEngine()
    engine.noteOn(60)
    expect(ctx.createdOscs).toHaveLength(1)
    ctx.createdOscs[0].onended?.()
    engine.noteOff(60)
    expect(ctx.stopped).toHaveLength(1)
  })

  it('allNotesOff stops every currently sounding voice', () => {
    const { engine, ctx } = createEngine()
    engine.noteOn(48)
    engine.noteOn(57)
    engine.noteOn(60)
    engine.allNotesOff()
    expect(ctx.stopped).toHaveLength(3)
  })
})

describe('orphaned-voice safety', () => {
  it('a note whose noteOff is routed to a different MIDI note keeps sounding until allNotesOff', () => {
    const { engine, ctx } = createEngine()
    engine.noteOn(48)
    engine.noteOff(60)
    expect(ctx.stopped).toHaveLength(0)
    engine.allNotesOff()
    expect(ctx.stopped).toHaveLength(1)
  })
})