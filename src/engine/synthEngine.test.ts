import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SynthEngine } from './synthEngine'
import { getPreset } from './presets'

interface SourceStub {
  buffer: AudioBuffer | null
  playbackRate: { value: number }
  loop: boolean
  loopStart: number
  loopEnd: number
  connect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  onended: (() => void) | null
}

interface OscStub {
  type: OscillatorType | string
  frequency: { value: number }
  detune: { value: number }
  connect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  onended: (() => void) | null
}

interface CtxStub {
  stopped: number[]
  createdOscs: OscStub[]
  createdSources: SourceStub[]
}

function createEngine(presetId = 'clean'): { engine: SynthEngine; ctx: CtxStub } {
  const stopped: number[] = []
  const createdOscs: OscStub[] = []
  const createdSources: SourceStub[] = []

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

  const makeOsc = (): OscStub => {
    const osc: OscStub = {
      type: 'sine',
      frequency: { value: 440 },
      detune: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn((t: number) => stopped.push(t)),
      onended: null,
    }
    createdOscs.push(osc)
    return osc
  }

  const makeSource = (): SourceStub => {
    const src: SourceStub = {
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
    createdSources.push(src)
    return src
  }

  const audioCtxStub = {
    currentTime: 0,
    state: 'running',
    sampleRate: 44100,
    destination: { connect: vi.fn() },
    createGain: vi.fn(makeGain),
    createBiquadFilter: vi.fn(makeFilter),
    createOscillator: vi.fn(makeOsc as unknown as () => OscillatorNode),
    createBufferSource: vi.fn(makeSource as unknown as () => AudioBufferSourceNode),
    createBuffer: vi.fn((_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    })),
    createDynamicsCompressor: vi.fn(() => ({
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
      connect: vi.fn(),
    })),
    resume: vi.fn(),
  }

  ;(globalThis as Record<string, unknown>).AudioContext = vi.fn(() => audioCtxStub)

  return {
    engine: new SynthEngine(getPreset(presetId)),
    ctx: { stopped, createdOscs, createdSources },
  }
}

function makeBuffer(midi: number): AudioBuffer {
  return { duration: 1, length: 44100, numberOfChannels: 1, sampleRate: 44100, [Symbol.for('midi')]: midi } as unknown as AudioBuffer
}

beforeEach(() => {
  ;(globalThis as Record<string, unknown>).AudioContext = undefined
})

describe('SynthEngine voice lifecycle (osc)', () => {
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

describe('sample voice', () => {
  it('plays the nearest bank sample with a playbackRate stretch', () => {
    const { engine, ctx } = createEngine('piano')
    const bank = new Map<number, AudioBuffer>()
    bank.set(57, makeBuffer(57)) // A3
    bank.set(59, makeBuffer(59)) // B3
    engine.injectSampleBank('piano', bank)

    engine.noteOn(60) // C4, closest to B3 (delta 1)
    expect(ctx.createdSources).toHaveLength(1)
    expect(ctx.createdSources[0].buffer).toBe(bank.get(59))
    // +1 semitone up => 2^(1/12)
    expect(ctx.createdSources[0].playbackRate.value).toBeCloseTo(Math.pow(2, 1 / 12), 6)
  })

  it('uses the exact sample when a note matches a bank note', () => {
    const { engine, ctx } = createEngine('piano')
    const bank = new Map<number, AudioBuffer>()
    bank.set(60, makeBuffer(60))
    engine.injectSampleBank('piano', bank)

    engine.noteOn(60)
    expect(ctx.createdSources).toHaveLength(1)
    expect(ctx.createdSources[0].playbackRate.value).toBeCloseTo(1, 6)
  })

  it('produces no source when the bank is not loaded yet', () => {
    const { engine, ctx } = createEngine('piano')
    engine.noteOn(60)
    expect(ctx.createdSources).toHaveLength(0)
    expect(ctx.createdOscs).toHaveLength(0)
  })
})

describe('harpsichord sample voice', () => {
  it('plays from the harpsichord bank', () => {
    const { engine, ctx } = createEngine('harpsichord')
    const bank = new Map<number, AudioBuffer>()
    bank.set(60, makeBuffer(60))
    engine.injectSampleBank('harpsichord', bank)
    engine.noteOn(60)
    expect(ctx.createdSources).toHaveLength(1)
    expect(ctx.createdSources[0].buffer).toBe(bank.get(60))
  })
})

describe('organ sample voice', () => {
  it('plays from the organ bank with a sustain loop', () => {
    const { engine, ctx } = createEngine('organ')
    const bank = new Map<number, AudioBuffer>()
    const buf = { duration: 7.6, length: 44100, numberOfChannels: 1, sampleRate: 44100 } as unknown as AudioBuffer
    bank.set(60, buf) // C4
    engine.injectSampleBank('organ', bank)
    engine.noteOn(60)
    expect(ctx.createdSources).toHaveLength(1)
    expect(ctx.createdSources[0].buffer).toBe(buf)
    expect(ctx.createdSources[0].loop).toBe(true)
    expect(ctx.createdSources[0].loopStart).toBeGreaterThan(1)
    expect(ctx.createdSources[0].loopEnd).toBeLessThan(buf.duration)
  })

  it('does not loop notes without loop metadata', () => {
    const { engine, ctx } = createEngine('organ')
    const bank = new Map<number, AudioBuffer>()
    bank.set(62, makeBuffer(62)) // D4 has no bank entry so nearestNote... uses D-map semantics only
    engine.injectSampleBank('organ', bank)
    engine.noteOn(60)
    expect(ctx.createdSources).toHaveLength(1)
    expect(ctx.createdSources[0].loop).toBe(false)
  })
})

describe('orphaned-voice safety', () => {
  it('a note whose noteOff is routed to a different MIDI note keeps sounding until allNotesOff', () => {
    const { engine, ctx } = createEngine('clean')
    engine.noteOn(48)
    engine.noteOff(60)
    expect(ctx.stopped).toHaveLength(0)
    engine.allNotesOff()
    expect(ctx.stopped).toHaveLength(1)
  })
})

describe('scheduled voices (noteOnAt / noteOffAt)', () => {
  it('starts a voice at the scheduled absolute time', () => {
    const { engine, ctx } = createEngine('clean')
    engine.noteOnAt(60, 1, getPreset('clean'), 5)
    expect(ctx.createdOscs).toHaveLength(1)
    expect(ctx.createdOscs[0].start).toHaveBeenCalledWith(5)
  })

  it('releases with the scheduled preset at the scheduled time', () => {
    const { engine, ctx } = createEngine('clean')
    engine.noteOnAt(60, 1, getPreset('synth'), 5)
    engine.noteOffAt(60, 6)
    // synth has a 0.4s release; stop fires at release+0.05 after the off time
    expect(ctx.createdOscs[0].stop).toHaveBeenCalledWith(6 + 0.4 + 0.05)
  })

  it('keeps loop voices (voiceKey) distinct from live voices', () => {
    const { engine, ctx } = createEngine('clean')
    engine.noteOn(60)
    engine.noteOnAt(60, 1, getPreset('dusk'), 0, 316)
    // both are separate oscillator starts; live noteOff for 60 must not kill 316
    expect(ctx.createdOscs).toHaveLength(2)
    engine.noteOff(60)
    expect(ctx.createdOscs[0].stop).toHaveBeenCalled()
    expect(ctx.createdOscs[1].stop).not.toHaveBeenCalled()
  })

  it('sounds the raw note pitch regardless of the voice key', () => {
    const { engine, ctx } = createEngine('clean')
    engine.noteOn(60)
    engine.noteOnAt(60, 1, getPreset('clean'), 0, 316)
    expect(ctx.createdOscs).toHaveLength(2)
    // key separation must NOT transpose pitch into the inaudible range; a loop
    // voice sounds like the note that was recorded
    const midi60Hz = ctx.createdOscs[0].frequency.value
    expect(ctx.createdOscs[1].frequency.value).toBe(midi60Hz)
  })

  it('a re-strike on the same voice key force-releases the stale voice', () => {
    const { engine, ctx } = createEngine('clean')
    engine.noteOnAt(60, 1, getPreset('clean'), 4, 316)
    expect(ctx.createdOscs).toHaveLength(1)
    // second strike on the same key before release: stale voice is released
    engine.noteOnAt(60, 1, getPreset('clean'), 8, 316)
    expect(ctx.createdOscs).toHaveLength(2)
    expect(ctx.createdOscs[0].stop).toHaveBeenCalled()
  })

  it('isVoiceRinging reflects a live non-releasing voice', () => {
    const { engine } = createEngine('clean')
    engine.noteOnAt(60, 1, getPreset('clean'), 0, 316)
    expect(engine.isVoiceRinging(316)).toBe(true)
    engine.releaseNotesInRange(300, 330)
    expect(engine.isVoiceRinging(316)).toBe(false)
  })

  it('releaseLoopVoices stops only keys at or above the loop base and never live notes', () => {
    const { engine, ctx } = createEngine('clean')
    engine.noteOn(60) // live
    engine.noteOnAt(60, 1, getPreset('clean'), 0, 316) // loop
    engine.noteOnAt(62, 1, getPreset('clean'), 0, 318) // loop
    engine.releaseLoopVoices()
    // live note untouched
    expect(ctx.createdOscs[0].stop).not.toHaveBeenCalled()
    // both loop voices released
    expect(ctx.createdOscs[1].stop).toHaveBeenCalled()
    expect(ctx.createdOscs[2].stop).toHaveBeenCalled()
  })

  it('releaseNotesInRange releases only keys inside the range', () => {
    const { engine, ctx } = createEngine('clean')
    engine.noteOnAt(60, 1, getPreset('clean'), 0, 256)
    engine.noteOnAt(60, 1, getPreset('clean'), 0, 384)
    engine.releaseNotesInRange(200, 300)
    expect(ctx.createdOscs[0].stop).toHaveBeenCalled() // 256 in range
    expect(ctx.createdOscs[1].stop).not.toHaveBeenCalled() // 384 out of range
  })

  it('click emits an oscillator at the requested time', () => {
    const { engine, ctx } = createEngine('clean')
    engine.click(3, true)
    expect(ctx.createdOscs).toHaveLength(1)
    expect(ctx.createdOscs[0].start).toHaveBeenCalledWith(3)
    expect(ctx.createdOscs[0].stop).toHaveBeenCalled()
  })
})
