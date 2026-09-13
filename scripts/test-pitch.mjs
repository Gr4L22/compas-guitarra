import assert from 'node:assert/strict';
import { detectPitch, midiHz, centsFrom, judgeNote } from '../src/pitch.js';
// Fundamentals, guitar-like harmonics, different devices and detuning.
for (const rate of [44100, 48000, 96000]) {
  for (const midi of [40, 45, 48, 50, 52, 55, 59, 60, 62, 64, 65, 67]) {
    for (const cents of [-35, 0, 35]) {
      const hz = midiHz(midi) * 2 ** (cents / 1200);
      const samples = Float32Array.from({ length: 4096 }, (_, i) => .12 * Math.sin(2 * Math.PI * hz * i / rate) + .08 * Math.sin(4 * Math.PI * hz * i / rate) + .03 * Math.sin(6 * Math.PI * hz * i / rate));
      const pitch = detectPitch(samples, rate);
      assert.ok(pitch, 'Expected pitch: ' + midi + ' at ' + rate);
      assert.ok(Math.abs(centsFrom(pitch.hz, midi) - cents) < 7, 'Pitch accuracy: ' + midi + ' at ' + rate);
    }
  }
}
assert.equal(detectPitch(new Float32Array(4096), 48000), null);
const target = { time: 2, midi: 64 }, settings = { window: .16, cents: 30 };
assert.equal(judgeNote(target, 2.03, midiHz(64), settings).kind, 'perfect');
assert.equal(judgeNote(target, 2.13, midiHz(64), settings).kind, 'good');
assert.equal(judgeNote(target, 2.3, midiHz(64), settings).kind, 'outside');
assert.equal(judgeNote(target, 2, midiHz(65), settings).kind, 'wrong');
assert.equal(judgeNote(target, 2, midiHz(64) * 2 ** (40 / 1200), settings).kind, 'wrong');
console.log('Pitch and timing checks passed.');
