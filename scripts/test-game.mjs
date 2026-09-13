import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { detectPitch, midiHz, centsFrom, judgeNote } from '../src/pitch.js';

// Run the actual game state and microphone pipeline with a deterministic clock
// and synthesized input, without requesting access to a physical microphone.
const elements = new Map();
const defaults = { song: 'open', speed: '1', difficulty: 'easy', mode: 'mic', latency: '60' };
const noop = () => {};
const drawing = new Proxy({}, { get: () => noop, set: () => true });
function element(id = '') {
  if (!elements.has(id)) elements.set(id, {
    value: defaults[id] || '', textContent: '', hidden: false, disabled: false,
    checked: false, append: noop, replaceChildren: noop,
    getContext: () => drawing, getBoundingClientRect: () => ({ width: 900, height: 400 })
  });
  return elements.get(id);
}
let now = 0, inputHz = null, amplitude = .12, trackedStops = 0;
const sandbox = vm.createContext({
  detectPitch, midiHz, centsFrom, judgeNote, console,
  performance: { now: () => now },
  document: { getElementById: element, createElement: () => element(Math.random()), addEventListener: noop },
  window: { devicePixelRatio: 1, addEventListener: noop },
  navigator: {}, ResizeObserver: class { observe() {} },
  requestAnimationFrame: () => 1, cancelAnimationFrame: noop,
  fakeAnalyser: { getFloatTimeDomainData(data) {
    for (let i = 0; i < data.length; i++) {
      const t = now / 1000 - (data.length - i) / 48000;
      data[i] = inputHz ? amplitude * Math.sin(2 * Math.PI * inputHz * t) + amplitude * .4 * Math.sin(4 * Math.PI * inputHz * t) : 0;
    }
  }},
  fakeStream: { getTracks: () => [{ stop: () => trackedStops++ }] }
});
const code = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8').replace(/^import[^\n]+\n/, '');
vm.runInContext(code, sandbox);
const run = code => vm.runInContext(code, sandbox);
function prepare(times = [0, .8], midi = 64) {
  now = 0; inputHz = null;
  run("reset(); ac = { sampleRate: 48000, state: 'suspended' }; analyser = fakeAnalyser; origin = 0; running = true; active = true; lastPitchCheck = -100; lastAttack = -Infinity; previousRms = 0; armed = true;");
  sandbox.testEvents = times.map((time, id) => ({ time, id, midi, lane: 5, fret: 0, state: 'pending' }));
  run('events = testEvents;');
}
function captureFor(start, end, hz) {
  inputHz = hz;
  for (now = start; now <= end; now += 16) run('capture()');
}
prepare();
captureFor(60, 300, midiHz(64));
assert.equal(run('hitCount'), 1, 'Correct note at the compensated attack time scores once');
captureFor(316, 1100, midiHz(64));
assert.equal(run('hitCount'), 1, 'Sustaining a note does not score a second note');
run('advance(1.5)');
assert.equal(run('missedCount'), 1, 'An unplayed repeated note is missed');
prepare();
captureFor(60, 300, midiHz(65));
assert.equal(run('wrongCount'), 1, 'Wrong pitch at the right time fails');
assert.equal(run('hitCount'), 0);
prepare([1]);
captureFor(60, 300, midiHz(64));
assert.equal(run('hitCount'), 0, 'Correct pitch outside the timing window fails');
prepare([0]);
captureFor(0, 800, null); run('advance(.9)');
assert.equal(run('missedCount'), 1, 'Silence cannot earn points');
prepare([0, .8]);
captureFor(60, 300, midiHz(64));
captureFor(316, 800, null);
captureFor(860, 1100, midiHz(64));
assert.equal(run('hitCount'), 2, 'Separate attacks can score repeated notes');
prepare();
run('pause()');
assert.equal(run('running'), false);
assert.equal(run('attack'), null);
run('stream = fakeStream; stopMic()');
assert.equal(trackedStops, 1, 'Stopping microphone releases its track');
run("$('mode').value = 'demo'; reset(); running = true; advance(0);");
assert.equal(run('hitCount'), 0, 'Demo never scores');
assert.equal(run("events[0].state"), 'demo');
run('advance(duration)');
assert.equal(element('summary').hidden, false);
assert.equal(run('running'), false);
run('reset()');
assert.equal(run('hitCount'), 0);
assert.equal(element('summary').hidden, true);
console.log('Microphone attack, scoring, silence, repeat, pause, cleanup and demo checks passed.');
