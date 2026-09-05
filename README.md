# SynthScript

A keyboard-playable polyphonic synth that runs in the browser. Your QWERTY
keys are the instrument; every voice is a JSON preset you can copy, import,
and share as a URL.

## Setup

Requires Node 20+ and pnpm.

```bash
pnpm install
pnpm dev     # dev server, http://localhost:5173
pnpm test    # vitest suite
pnpm build   # typecheck + production build
```