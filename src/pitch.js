// YIN cumulative normalized difference: keep a fixed comparison window at every lag.
export function detectPitch(samples, sampleRate) {
  if (sampleRate > 48000) {
    const factor = Math.ceil(sampleRate / 48000);
    const reduced = new Float32Array(Math.floor(samples.length / factor));
    for (let i = 0; i < reduced.length; i++) {
      for (let j = 0; j < factor; j++) reduced[i] += samples[i * factor + j] / factor;
    }
    return detectPitch(reduced, sampleRate / factor);
  }
  const size = Math.min(2048, samples.length);
  const start = samples.length - size, half = Math.floor(size / 2);
  const maxLag = Math.min(half - 1, Math.ceil(sampleRate / 70));
  const minLag = Math.max(2, Math.floor(sampleRate / 900));
  let energy = 0;
  for (let i = start; i < samples.length; i++) energy += samples[i] ** 2;
  if (Math.sqrt(energy / size) < 0.008) return null;
  const differences = new Float32Array(maxLag + 1);
  let sum = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    let difference = 0;
    for (let i = 0; i < half; i++) difference += (samples[start + i] - samples[start + i + lag]) ** 2;
    sum += difference;
    differences[lag] = sum > 0 ? difference * lag / sum : 1;
  }
  for (let lag = minLag; lag < maxLag - 1; lag++) {
    if (differences[lag] >= 0.12) continue;
    while (lag + 1 < maxLag && differences[lag + 1] < differences[lag]) lag++;
    if (lag >= maxLag) return null;
    const a = differences[lag - 1], b = differences[lag], c = differences[lag + 1];
    const curve = a - 2 * b + c;
    const refined = lag + (curve ? Math.max(-0.5, Math.min(0.5, (a - c) / (2 * curve))) : 0);
    return { hz: sampleRate / refined, confidence: 1 - b };
  }
  return null;
}
export const midiHz = midi => 440 * 2 ** ((midi - 69) / 12);
export const centsFrom = (hz, midi) => 1200 * Math.log2(hz / midiHz(midi));
export function judgeNote(target, attackTime, hz, settings) {
  const delta = attackTime - target.time;
  if (Math.abs(delta) > settings.window) return { kind: 'outside', delta };
  const cents = centsFrom(hz, target.midi);
  if (Math.abs(cents) > settings.cents) return { kind: 'wrong', delta, cents };
  return { kind: Math.abs(delta) <= Math.min(0.075, settings.window / 2) ? 'perfect' : 'good', delta, cents };
}
