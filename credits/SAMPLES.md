# Sample library credits

SynthScript ships three open-source sample libraries. Each is a small subset of
the full library, chosen to cover a one-and-a-half octave QWERTY range with
margin for the octave shifter.

## Piano: Salamander Grand Piano V3

- Instrument: Yamaha C5 grand piano
- Author: Alexander Holm (samples/recordings)
- License: CC-BY 3.0 (https://creativecommons.org/licenses/by/3.0/)
- Upstream: https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html
- In this repo: `public/samples/piano/` (30 mp3 files, A0 through C8 at
  velocity-layer 9, single layer)
- Mirror used for retrieval: `@audio-samples/piano-mp3-velocity9` on jsDelivr
  (https://cdn.jsdelivr.net/npm/@audio-samples/piano-mp3-velocity9@1.0.5/)
- License text (CC-BY 3.0) applies; attribution to Alexander Holm required in
  redistributions. See the official license text at the CC-BY 3.0 URL above.

## Harpsichord: Flemish Harpsichord, Versilian Community Sample Library

- Instrument: Flemish harpsichord (far-mic sustain samples, F#0 through C5)
- Author: Versilian Studios (community sample library, VCSL)
- License: public domain (CC0-equivalent per VCSL distribution terms)
- Upstream: https://www.versilianstudios.com/samples
  and the Sonatina Symphonic Orchestra bundle by peastman/sso:
  https://github.com/peastman/sso
- In this repo: `public/samples/harpsichord/` (28 ogg files, transcoded from
  the original FLACs to mono 22.05 kHz OGG, per-note volume trimmed to the
  published SFZ levels)

## Organ: Church Organ Emulation (FreePats)

- Instrument: pipe organ emulation recorded from Aeolus 0.9.0 (debounced
  church organ stops), C2 through C7 with F# intermediates
- Author: Roberto (roberto@zenvoid.org), FreePats project
- License: CC0 1.0 public domain (https://creativecommons.org/publicdomain/zero/1.0/)
- Upstream: https://freepats.zenvoid.org/Organ/pipe-organ.html
- In this repo: `public/samples/organ/` (11 ogg files, transcoded from the
  original WAVs to mono 22.05 kHz OGG; sustain loops taken from the published
  SFZ loop points and applied at runtime)
- The SFZ ships a 2.8 s release tail; this app keeps the note looped at full
  sustain and lets the ADSR release handle the fade instead.

## Notes

- The harpsichord SFZ in SSO also publishes release samples (mixed low, -7 to
  -13 dB); they are intentionally not bundled here.
- The piano library is multi-velocity in its full form; this app currently
  uses a single velocity layer (9), which the engine locks at fixed velocity.