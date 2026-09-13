import { detectPitch, midiHz, centsFrom, judgeNote } from './pitch.js';

const $ = id => document.getElementById(id);
const names = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
const tuning = [40, 45, 50, 55, 59, 64];
const colors = ['#c9f779', '#79dba2', '#7de2df', '#86b9ff', '#b79bfc', '#f39ecd'];
const noteName = midi => names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
const exercises = {
  open: { title: 'Cuerdas al aire', bpm: 60, notes: [0, 1, 2, 3, 4, 5, 5, 4, 3, 2, 1, 0].map(lane => [lane, 0, 2]) },
  ode: { title: 'Oda a la alegría', bpm: 76, notes: [
    [0,1],[0,1],[1,1],[3,1],[3,1],[1,1],[0,1],[-2,1],[-4,1],[-4,1],[-2,1],[0,1],[0,1.5],[-2,.5],[-2,2],
    [0,1],[0,1],[1,1],[3,1],[3,1],[1,1],[0,1],[-2,1],[-4,1],[-4,1],[-2,1],[0,1],[-2,1.5],[-4,.5],[-4,2]
  ].map(([offset, beats]) => offset >= 0 ? [5, offset, beats] : offset === -2 ? [4, 3, beats] : [4, 1, beats]) },
  scale: { title: 'Escala de Do', bpm: 64, notes: [
    [1,3],[2,0],[2,2],[2,3],[3,0],[3,2],[4,0],[4,1],[4,0],[3,2],[3,0],[2,3],[2,2],[2,0],[1,3]
  ].map(([lane, fret]) => [lane, fret, 1.5]) }
};
const levels = { easy: { window: .25, cents: 50 }, normal: { window: .16, cents: 30 }, hard: { window: .1, cents: 18 } };
let events = [], duration = 0, beatSeconds = 1, running = false, active = false, elapsed = -3, origin = 0;
let ac, stream, source, analyser, captureId, loadingMic = false, micGeneration = 0;
let attack = null, lastAttack = -Infinity, previousRms = 0, floor = .003, armed = true, lastPitchCheck = 0, lastBeat = -1;
let hitCount = 0, wrongCount = 0, missedCount = 0, combo = 0, bestCombo = 0, timingErrors = [], flash = null;
const voices = new Set();
const canvas = $('highway'), ctx = canvas.getContext('2d');
let width = 0, height = 0;
const isDemo = () => $('mode').value === 'demo';
const songTime = () => running ? (performance.now() - origin) / 1000 : elapsed;
const settings = () => levels[$('difficulty').value];
const latency = () => Number($('latency').value) / 1000;

function loadExercise() {
  const exercise = exercises[$('song').value];
  beatSeconds = 60 / (exercise.bpm * Number($('speed').value));
  let time = 0;
  events = exercise.notes.map(([lane, fret, beats], id) => {
    const event = { id, lane, fret, midi: tuning[lane] + fret, time, state: 'pending' };
    time += beats * beatSeconds;
    return event;
  });
  duration = time + 1;
  $('trackTitle').textContent = exercise.title;
  $('tempo').textContent = Math.round(60 / beatSeconds) + ' BPM · 4/4';
  $('modeBadge').textContent = isDemo() ? 'DEMO · SIN PUNTOS' : 'MICRÓFONO';
  $('mic').hidden = isDemo();
  updateStats();
  updateNext();
}
function updateNext() {
  const next = events.find(event => event.state === 'pending');
  $('nextNote').textContent = next ? noteName(next.midi) + ' · ' + (6 - next.lane) + 'ª cuerda · ' + (next.fret ? 'Traste ' + next.fret : 'Al aire') : 'Recorrido completo';
}
function updateStats() {
  $('hits').textContent = isDemo() ? '—' : hitCount + ' / ' + events.length;
  $('combo').textContent = isDemo() ? '—' : combo;
  $('timing').textContent = timingErrors.length ? Math.round(timingErrors.reduce((a, b) => a + b, 0) / timingErrors.length * 1000) + ' ms' : '—';
  $('progress').textContent = Math.round(events.filter(e => e.state !== 'pending').length / Math.max(1, events.length) * 100) + '%';
}
function overlay(title, text) {
  $('overlay').replaceChildren();
  const strong = document.createElement('strong'), span = document.createElement('span');
  strong.textContent = title; span.textContent = text;
  $('overlay').append(strong, span); $('overlay').hidden = false;
}
function lockControls(locked) {
  for (const id of ['song', 'speed', 'difficulty', 'mode', 'latency']) $(id).disabled = locked;
}
async function ensureAudio() {
  ac ??= new AudioContext();
  if (ac.state !== 'running') await ac.resume();
}
function tone(hz, length = .2, volume = .07) {
  if (!ac || ac.state !== 'running') return;
  const oscillator = ac.createOscillator(), gain = ac.createGain();
  oscillator.type = 'triangle'; oscillator.frequency.value = hz;
  gain.gain.setValueAtTime(0, ac.currentTime);
  gain.gain.linearRampToValueAtTime(volume, ac.currentTime + .008);
  gain.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + length);
  oscillator.connect(gain).connect(ac.destination);
  voices.add(oscillator);
  oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
  oscillator.start(); oscillator.stop(ac.currentTime + length);
}
function silenceVoices() {
  for (const voice of voices) { try { voice.stop(); } catch {} }
  voices.clear();
}
function pause() {
  if (!running) return;
  elapsed = songTime(); running = false; attack = null; silenceVoices();
  $('start').textContent = '▶ Continuar';
  overlay('En pausa', 'El recorrido espera por vos.');
}
function reset() {
  running = false; active = false; elapsed = -3; attack = null; lastBeat = -1; flash = null;
  hitCount = wrongCount = missedCount = combo = bestCombo = 0; timingErrors = [];
  silenceVoices(); lockControls(false);
  $('summary').hidden = true; $('start').textContent = '▶ Empezar';
  $('feedback').textContent = 'Las marcas llegan a la línea de abajo. Tocá una sola cuerda.';
  $('heard').textContent = 'Todavía no escuchamos una nota.';
  overlay(isDemo() ? 'Mirá, escuchá, preparate.' : 'Una nota a la vez.', isDemo() ? 'La demostración muestra y reproduce el recorrido. No evalúa tu guitarra.' : 'Empezá para activar el micrófono y tocar.');
  loadExercise();
}
async function start() {
  if (running) { pause(); return; }
  $('start').disabled = true;
  try {
    if (!isDemo() && !stream && !(await openMic())) return;
    await ensureAudio();
    if (!active) { reset(); active = true; }
    // A short lead-in on resume lets the player find the next note again.
    if (elapsed > -3) elapsed -= 2;
    origin = performance.now() - elapsed * 1000;
    running = true; attack = null; lastAttack = -Infinity; previousRms = 0; armed = true;
    lockControls(true); lastBeat = Math.floor(elapsed / beatSeconds) - 1;
    $('start').textContent = 'Ⅱ Pausar';
    $('feedback').textContent = isDemo() ? 'Demostración: escuchá y mirá la cuerda y el traste.' : 'Tocá cuando el centro de la marca cruce la línea.';
  } catch (error) {
    $('feedback').textContent = 'No se pudo iniciar el audio. Volvé a intentar desde este navegador.';
  } finally { $('start').disabled = false; }
}
function stopMic() {
  micGeneration++; cancelAnimationFrame(captureId); attack = null;
  stream?.getTracks().forEach(track => track.stop());
  source?.disconnect(); source = analyser = stream = null;
  $('mic').textContent = 'Activar micrófono';
  $('micStatus').textContent = 'Micrófono apagado';
  if (!isDemo()) pause();
}
async function openMic() {
  if (stream) return true;
  if (loadingMic) return false;
  if (!navigator.mediaDevices?.getUserMedia) {
    $('micStatus').textContent = 'El micrófono requiere HTTPS o localhost. Podés usar la demo.';
    return false;
  }
  const generation = ++micGeneration;
  loadingMic = true; $('mic').disabled = true;
  $('micStatus').textContent = 'Esperando permiso del micrófono…';
  try {
    await ensureAudio();
    const acquired = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    if (generation !== micGeneration) { acquired.getTracks().forEach(t => t.stop()); return false; }
    stream = acquired;
    source = ac.createMediaStreamSource(stream);
    analyser = ac.createAnalyser(); analyser.fftSize = 4096;
    source.connect(analyser);
    for (const track of stream.getTracks()) track.onended = () => { stopMic(); $('micStatus').textContent = 'Se desconectó el micrófono.'; };
    previousRms = 0; floor = .003; armed = true; lastAttack = -Infinity;
    $('mic').textContent = 'Apagar micrófono'; $('micStatus').textContent = 'Escuchando · Una cuerda por vez';
    capture();
    return true;
  } catch (error) {
    stopMic();
    $('micStatus').textContent = error.name === 'NotAllowedError' ? 'Permiso denegado. Habilitá el micrófono o elegí la demo.' : 'No se pudo abrir el micrófono. Revisá el dispositivo.';
    return false;
  } finally { loadingMic = false; $('mic').disabled = false; }
}
const signal = new Float32Array(4096);
function capture() {
  if (!analyser) return;
  analyser.getFloatTimeDomainData(signal);
  const now = performance.now();
  let energy = 0;
  for (let i = signal.length - 512; i < signal.length; i++) energy += signal[i] ** 2;
  const rms = Math.sqrt(energy / 512);
  if (rms < Math.max(.008, floor * 1.6)) armed = true;
  const rising = rms > Math.max(.014, floor * 3) && (armed || rms > previousRms * 1.65);
  if (running && !isDemo() && rising && now - lastAttack > 180) {
    attack = { time: songTime() - latency(), observedAt: now, candidate: null, stable: 0 };
    lastAttack = now; armed = false;
  }
  if (rms < .012) floor = floor * .97 + rms * .03;
  previousRms = rms;
  if (now - lastPitchCheck >= 35) {
    lastPitchCheck = now;
    const pitch = rms > .008 ? detectPitch(signal, ac.sampleRate) : null;
    if (pitch) {
      const midi = Math.round(69 + 12 * Math.log2(pitch.hz / 440));
      $('heard').textContent = 'Escucho ' + noteName(midi) + ' · ' + pitch.hz.toFixed(1) + ' Hz · ' + Math.round(centsFrom(pitch.hz, midi)) + ' cents';
    } else $('heard').textContent = rms < .008 ? 'Silencio · Esperando tu ataque.' : 'Sin nota clara · Tocá una sola cuerda.';
    if (attack && running && !isDemo() && now - attack.observedAt >= 55 && pitch) {
      const nearest = Math.round(69 + 12 * Math.log2(pitch.hz / 440));
      attack.stable = attack.candidate === nearest ? attack.stable + 1 : 1;
      attack.candidate = nearest;
      if (attack.stable >= 2) { evaluateAttack(attack.time, pitch.hz); attack = null; }
    }
  }
  if (attack && now - attack.observedAt > 240) {
    $('feedback').textContent = 'Escuché un ataque, pero no una nota clara. Probá una sola cuerda.';
    attack = null;
  }
  captureId = requestAnimationFrame(capture);
}
function evaluateAttack(time, hz) {
  const pending = events.filter(e => e.state === 'pending');
  const target = pending.reduce((best, e) => !best || Math.abs(e.time - time) < Math.abs(best.time - time) ? e : best, null);
  if (!target) return;
  const result = judgeNote(target, time, hz, settings());
  if (result.kind === 'outside') {
    $('feedback').textContent = 'Ataque fuera de tiempo. Esperá a que la marca llegue a la línea.';
    combo = 0; updateStats(); return;
  }
  target.state = result.kind;
  if (result.kind === 'wrong') {
    wrongCount++; combo = 0;
    const heard = Math.round(69 + 12 * Math.log2(hz / 440));
    $('feedback').textContent = heard === target.midi ? 'Nota fuera de afinación: ' + Math.round(result.cents) + ' cents. Revisá afinación y presión.' : 'Escuché ' + noteName(heard) + '; tocaba ' + noteName(target.midi) + ' en la ' + (6 - target.lane) + 'ª cuerda.';
  } else {
    hitCount++; combo++; bestCombo = Math.max(bestCombo, combo); timingErrors.push(Math.abs(result.delta));
    const ms = Math.round(result.delta * 1000);
    $('feedback').textContent = (result.kind === 'perfect' ? '¡Justo a tiempo!' : '¡Bien, nota correcta!') + ' ' + Math.abs(ms) + ' ms ' + (ms < 0 ? 'antes' : 'después') + ' del pulso.';
  }
  flash = { lane: target.lane, kind: result.kind, until: performance.now() + 500 };
  updateStats(); updateNext();
}
function finish() {
  running = false; active = false; elapsed = duration; attack = null; silenceVoices();
  stopMic(); lockControls(false); $('start').textContent = '▶ Otra vez';
  $('overlay').hidden = true; $('summary').hidden = false;
  $('result').textContent = isDemo() ? 'Demostración terminada. Elegí “Tocar con micrófono” para probarlo con tu guitarra.' : hitCount + ' de ' + events.length + ' notas acertadas. ' + wrongCount + ' con otra nota o fuera de afinación; ' + missedCount + ' sin acierto dentro del tiempo. Mejor racha: ' + bestCombo + '.';
  $('feedback').textContent = isDemo() ? 'Ahora conocés el recorrido. Probalo a tu velocidad.' : 'Podés bajar la velocidad y repetir para mejorar tus cambios.';
}
function advance(time) {
  const beat = Math.floor(time / beatSeconds);
  if (beat !== lastBeat) {
    lastBeat = beat;
    if ($('metronome').checked) tone(beat % 4 === 0 ? 1100 : 800, .05, .045);
  }
  for (const event of events) {
    if (event.state !== 'pending') continue;
    if (isDemo() && time >= event.time) {
      event.state = 'demo'; tone(midiHz(event.midi), Math.min(.7, beatSeconds * .8), .12);
      flash = { lane: event.lane, kind: 'demo', until: performance.now() + 300 };
      updateStats(); updateNext();
    } else if (!isDemo() && time > event.time + settings().window + .3 + latency()) {
      event.state = 'missed'; missedCount++; combo = 0;
      $('feedback').textContent = 'Pasó ' + noteName(event.midi) + ' · ' + (6 - event.lane) + 'ª cuerda. Prepará la siguiente.';
      flash = { lane: event.lane, kind: 'wrong', until: performance.now() + 300 };
      updateStats(); updateNext();
    }
  }
  if (time >= duration) finish();
}
function resize() {
  const rect = canvas.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2);
  width = rect.width; height = rect.height;
  canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
function draw(time) {
  ctx.clearRect(0, 0, width, height);
  const left = width * .06, laneWidth = width * .88 / 6, targetY = height - 57, travel = 3.5, speed = (targetY - 18) / travel;
  for (let lane = 0; lane < 6; lane++) {
    const x = left + laneWidth * (lane + .5);
    ctx.strokeStyle = colors[lane] + '35'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    if (flash && flash.lane === lane && flash.until > performance.now()) {
      ctx.fillStyle = flash.kind === 'wrong' ? '#ff7b7b40' : colors[lane] + '40';
      ctx.fillRect(x - laneWidth * .4, targetY - 25, laneWidth * .8, 50);
    }
    ctx.strokeStyle = colors[lane] + 'aa'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, targetY, Math.min(22, laneWidth * .31), 0, Math.PI * 2); ctx.stroke();
  }
  const startBeat = Math.max(0, Math.floor(time / beatSeconds));
  for (let beat = startBeat; beat < startBeat + Math.ceil(travel / beatSeconds) + 2; beat++) {
    const y = targetY - (beat * beatSeconds - time) * speed;
    if (y < 0 || y > height) continue;
    ctx.strokeStyle = beat % 4 === 0 ? '#ffffff22' : '#ffffff0b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width - left, y); ctx.stroke();
  }
  ctx.strokeStyle = '#d4efa3'; ctx.lineWidth = 2; ctx.shadowColor = '#c9f779'; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.moveTo(left - 8, targetY); ctx.lineTo(width - left + 8, targetY); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.fillStyle = '#adbf98'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('TOCÁ ACÁ', width / 2, height - 15);
  for (const event of events) {
    if (event.state !== 'pending') continue;
    const y = targetY - (event.time - time) * speed;
    if (y < -26 || y > height + 25) continue;
    const x = left + laneWidth * (event.lane + .5), radius = Math.min(21, laneWidth * .3);
    ctx.fillStyle = colors[event.lane]; ctx.shadowColor = colors[event.lane]; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#172323'; ctx.font = 'bold ' + Math.round(radius * .85) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(event.fret, x, y);
    if (laneWidth > 65) { ctx.fillStyle = '#bac6da'; ctx.font = '10px sans-serif'; ctx.fillText(noteName(event.midi), x, y - radius - 10); }
  }
  ctx.textBaseline = 'alphabetic';
}
function frame() {
  const time = songTime();
  if (running) {
    if (time < 0) overlay(String(Math.ceil(-time)), isDemo() ? 'Escuchá la demostración' : 'Prepará la primera nota');
    else $('overlay').hidden = true;
    advance(time);
  }
  draw(time);
  requestAnimationFrame(frame);
}
$('start').onclick = start;
$('reset').onclick = () => { stopMic(); reset(); };
$('mic').onclick = () => stream ? stopMic() : openMic();
for (const id of ['song', 'speed', 'difficulty', 'mode']) $(id).onchange = () => { stopMic(); reset(); };
$('latency').oninput = () => { $('latencyValue').textContent = $('latency').value + ' ms'; };
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); stopMic(); } });
window.addEventListener('pagehide', () => { pause(); stopMic(); silenceVoices(); });
new ResizeObserver(resize).observe(canvas);
reset(); resize(); frame();
