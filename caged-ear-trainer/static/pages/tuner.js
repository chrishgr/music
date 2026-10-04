/* Tuner: tune the guitar, hit a note with voice or instrument, or guess a note by ear */
// Tuner settings live in their own object; the exercise (tune, hit, guess) is the sub-page
const TU = Object.assign({ range: 'guitar', anyOct: true, playTarget: true, showName: true, ref: true, str: 'auto' }, saved.tuner || {});
SAVERS.tuner = () => TU;
if (!state.sub.tuner && ['hit', 'guess'].includes(TU.mode)) state.sub.tuner = TU.mode;
TU.mode = 'tune';
const RANGES = { guitar: [40, 76], low: [40, 64], high: [48, 72] };
const REF_A = 57;                                   // A3, reference note for "Guess the note"
const GAUGE_CENTER = 270, GAUGE_SCALE = 4.8;        // pixels per cent
const HOLD_SECONDS = 0.7, HIT_TOLERANCE = 20;       // cents
const mic = { stream: null, analyser: null, buf: null, timer: null, hist: [], silent: 0, last: 0, needle: 0 };
const hit = { target: null, hold: 0, solved: false, missed: false, hits: 0, tries: 0 };
const guess = { q: null, answered: false, right: 0, total: 0 };
// Hit the note can only be answered with the microphone on, so its time only runs while it listens
const HIT_TIMER = makeTimer({
  prefix: 'hit', page: 'tuner', subs: ['hit'], key: () => 'tuner_hit',
  waiting: () => !!hit.target && !hit.solved && !hit.missed && !!mic.stream, timeUp: hitTimeUp, next: newHitTarget
});
const GUESS_TIMER = makeTimer({
  prefix: 'guess', page: 'tuner', subs: ['guess'], key: () => 'tuner_guess',
  waiting: () => !!guess.q && !guess.answered, timeUp: guessTimeUp, next: newGuess
});
const pcName = pc => noteName(ROOTS[((pc % 12) + 12) % 12]);
const octaveOf = m => Math.floor(m / 12) - 1;
const midiLabel = m => pcName(m) + octaveOf(m);
const randomIn = ([lo, hi]) => lo + Math.floor(Math.random() * (hi - lo + 1));
const comma = (x, d) => x.toFixed(d).replace('.', ',');

function drawGauge() {
  const X = c => GAUGE_CENTER + c * GAUGE_SCALE;
  let g = `<rect class="g-zone" x="${X(-5)}" y="14" width="${X(5) - X(-5)}" height="50" rx="3"/>`;
  for (let c = -50; c <= 50; c += 5) {
    const major = c % 25 === 0;
    g += `<line class="g-tick" x1="${X(c)}" x2="${X(c)}" y1="${major ? 18 : 30}" y2="${major ? 60 : 48}" stroke-width="${major ? 1.6 : 1}"/>`;
  }
  [-50, -25, 0, 25, 50].forEach(c => { g += `<text class="g-lbl" x="${X(c)}" y="80">${c > 0 ? '+' + c : c}</text>`; });
  g += `<g id="needle" class="idle"><line class="g-needle" x1="${GAUGE_CENTER}" x2="${GAUGE_CENTER}" y1="10" y2="66"/><circle class="g-dot" cx="${GAUGE_CENTER}" cy="10" r="5"/></g>`;
  $('gauge').innerHTML = g;
}
function setNeedle(cents, good) {
  const n = $('needle');
  if (cents === null) { mic.needle *= 0.6; n.setAttribute('class', 'idle'); }
  else { mic.needle += (Math.max(-52, Math.min(52, cents)) - mic.needle) * 0.55; n.setAttribute('class', good ? 'good' : ''); }
  n.setAttribute('transform', `translate(${(mic.needle * GAUGE_SCALE).toFixed(1)} 0)`);
}

async function startMic() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { showMicProblem(); return; }
  try {
    const c = ctx();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }   // raw signal gives the most stable pitch
    });
    const analyser = c.createAnalyser();
    analyser.fftSize = PITCH_WINDOW;
    c.createMediaStreamSource(stream).connect(analyser);
    Object.assign(mic, { stream, analyser, buf: new Float32Array(analyser.fftSize), hist: [], silent: 0, last: performance.now() });
    mic.timer = setInterval(tick, 60);
    $('micNotice').hidden = true;
    HIT_TIMER.start();
  } catch (e) { showMicProblem(); }
  renderTuner();
}
function stopMic() {
  clearInterval(mic.timer);
  HIT_TIMER.cancel();
  if (mic.stream) mic.stream.getTracks().forEach(t => t.stop());
  Object.assign(mic, { stream: null, analyser: null, hist: [] });
  renderReading(null);
  renderTuner();
}
function showMicProblem() {
  const n = $('micNotice');
  n.innerHTML = 'Could not access the microphone. The tuner only works when the page runs locally on your own computer. ' +
    'Open a terminal in the folder with <code>index.html</code>, run <code>uvicorn app:app</code> (or <code>python -m http.server</code>) and go to <code>localhost:8000</code> in your browser. ' +
    'Also check that the browser is allowed to use the microphone. Guess the note works without a microphone.';
  n.hidden = false;
}

function tick() {
  if (!mic.analyser) return;
  const now = performance.now(), dt = Math.min(0.2, (now - mic.last) / 1000);
  mic.last = now;
  mic.analyser.getFloatTimeDomainData(mic.buf);
  let p = signalLevel(mic.buf) > 0.008 ? detectPitch(mic.buf, audio.ctx.sampleRate) : null;
  if (p) { mic.hist.push(p.freq); if (mic.hist.length > 5) mic.hist.shift(); mic.silent = 0; }
  else if (++mic.silent > 6) mic.hist = [];
  const f = mic.hist.length >= 2 ? median(mic.hist) : null;   // median of recent frames removes single wild readings
  if (TU.mode === 'hit') updateHit(f, dt);
  renderReading(f);
}

function renderReading(f) {
  const state_ = $('tState');
  if (!f) {
    $('tNote').textContent = '·';
    $('tMeta').textContent = '';
    state_.className = 't-state';
    state_.textContent = !mic.stream ? '' : hit.solved && TU.mode === 'hit' ? 'Hit!' : 'Play or sing a note.';
    if (hit.solved && TU.mode === 'hit') state_.className = 't-state good';
    setNeedle(null);
    markStrings(null);
    return;
  }
  const midi = freqToMidi(f), nearest = Math.round(midi);
  let cents, msg;
  if (TU.mode === 'tune') {
    const target = TU.str === 'auto' ? nearest : TUNING[+TU.str];
    cents = (midi - target) * 100;
    const semis = Math.round(midi - target);
    if (Math.abs(semis) >= 1) msg = semis < 0 ? `${-semis} semitone${semis < -1 ? 's' : ''} flat, tighten the string` : `${semis} semitone${semis > 1 ? 's' : ''} sharp, loosen the string`;
    else msg = Math.abs(cents) <= 5 ? 'In tune' : cents < 0 ? 'Slightly flat, tighten the string' : 'Slightly sharp, loosen the string';
    if (TU.str === 'auto' && Math.abs(semis) < 1) msg = Math.abs(cents) <= 5 ? 'In tune' : cents < 0 ? 'Slightly flat' : 'Slightly sharp';
    markStrings(Math.abs(cents) <= 5 ? target : null);
  } else {
    if (!hit.target) { cents = (midi - nearest) * 100; msg = 'Press “New note” to get a note to hit.'; }
    else {
      cents = foldCents(midi, hit.target, TU.anyOct);
      const semis = Math.round(cents / 100);
      if (hit.solved) msg = 'Hit!';
      else if (hit.missed) msg = 'Time is up';
      else if (Math.abs(semis) >= 1) msg = `${Math.abs(semis)} semitone${Math.abs(semis) > 1 ? 's' : ''} ${semis < 0 ? 'flat' : 'sharp'}`;
      else msg = Math.abs(cents) <= HIT_TOLERANCE ? 'Hold it there' : cents < 0 ? 'Slightly flat' : 'Slightly sharp';
    }
  }
  const good = TU.mode === 'tune' ? Math.abs(cents) <= 5 : Math.abs(cents) <= HIT_TOLERANCE;
  $('tNote').innerHTML = `${pcName(nearest)}<sub>${octaveOf(nearest)}</sub>`;
  $('tMeta').textContent = `${comma(f, 1)} Hz   ${cents >= 0 ? '+' : ''}${comma(cents, 0)} cent`;
  state_.textContent = msg;
  state_.className = 't-state ' + (good || hit.solved && TU.mode === 'hit' ? 'good' : 'off');
  setNeedle(cents, good);
}

function markStrings(okMidi) {
  document.querySelectorAll('#strings button[data-s]').forEach(b => {
    const s = b.dataset.s;
    b.classList.toggle('ok', s !== 'auto' && okMidi !== null && TUNING[+s] === okMidi);
  });
}

/* --- Hit the note --- */
function newHitTarget() {
  if (hit.target && !hit.solved && !hit.missed) logAttempt('tuner_hit', pcName(hit.target), null, false, hit.lastCents);   // skipped = missed
  hit.target = randomIn(RANGES[TU.range]);
  hit.lastCents = null;
  hit.hold = 0; hit.solved = false; hit.missed = false; hit.tries++;
  HIT_TIMER.start();
  playHitTarget();
  renderTuner();
}
// No hit in time: a miss. The name is shown and the note played, so you know what it was.
function hitTimeUp() {
  if (!hit.target || hit.solved || hit.missed) return;
  hit.missed = true; hit.hold = 0;
  logAttempt('tuner_hit', pcName(hit.target), 'Time ran out', false, hit.lastCents);
  stopAll(); play(hit.target, 0);
  renderTuner();
}
function playHitTarget() {
  if (!hit.target || !TU.playTarget) return;
  stopAll();
  play(hit.target, 0);
}
function updateHit(f, dt) {
  if (!hit.target || hit.solved || hit.missed) return;
  const c = f ? foldCents(freqToMidi(f), hit.target, TU.anyOct) : null;
  if (c !== null) hit.lastCents = Math.round(c * 10) / 10;
  if (c !== null && Math.abs(c) <= HIT_TOLERANCE) hit.hold += dt;
  else hit.hold = Math.max(0, hit.hold - dt);
  if (hit.hold >= HOLD_SECONDS) {
    hit.solved = true; hit.hits++;
    logAttempt('tuner_hit', pcName(hit.target), null, true, hit.lastCents);
    HIT_TIMER.answered(true);
    renderTuner();
  }
  $('holdBar').firstElementChild.style.width = `${Math.min(100, 100 * hit.hold / HOLD_SECONDS)}%`;
}

/* --- Guess the note --- */
function newGuess() {
  guess.q = { m: randomIn(RANGES[TU.range]) };
  guess.answered = false;
  GUESS_TIMER.start();
  playGuess();
  renderTuner();
}
function playGuess() {
  if (!guess.q) return;
  stopAll();
  if (TU.ref) { play(REF_A, 0); play(guess.q.m, 1.1); } else play(guess.q.m, 0);
}
function answerGuess(pc) {
  if (!guess.q) return;
  const m = guess.q.m, same = m - (m % 12) + pc;
  if (guess.answered) { stopAll(); play(same, 0); return; }
  guess.answered = true;
  guess.q.chosen = pc;
  guess.q.ok = pc === m % 12;
  guess.total++; if (guess.q.ok) guess.right++;
  logAttempt('tuner_guess', pcName(m), pcName(pc), guess.q.ok);
  GUESS_TIMER.answered(guess.q.ok);
  renderTuner();
}
// No answer in time: wrong, and the note is played again
function guessTimeUp() {
  if (!guess.q || guess.answered) return;
  guess.answered = true;
  Object.assign(guess.q, { chosen: null, ok: false, late: true });
  guess.total++;
  logAttempt('tuner_guess', pcName(guess.q.m), 'Time ran out', false);
  stopAll(); play(guess.q.m, 0);
  renderTuner();
}

function renderTuner(sub = TU.mode) {
  TU.mode = sub;
  $('rangeSel').value = TU.range;
  $('anyOct').checked = TU.anyOct; $('playTarget').checked = TU.playTarget;
  $('showName').checked = TU.showName; $('refA').checked = TU.ref;
  const m = TU.mode;
  $('f-range').hidden = m === 'tune';
  $('f-anyoct').hidden = $('f-playtarget').hidden = $('f-showname').hidden = m !== 'hit';
  $('f-ref').hidden = m !== 'guess';
  $('micbar').hidden = $('tunerCard').hidden = m === 'guess';
  if (m === 'guess') $('micNotice').hidden = true;
  $('tuneBox').hidden = m !== 'tune';
  $('hitBox').hidden = m !== 'hit';
  $('guessBox').hidden = m !== 'guess';

  $('micBtn').textContent = mic.stream ? 'Stop microphone' : 'Start microphone';
  $('micStatus').textContent = mic.stream ? 'Listening. Keep the phone or computer close to the instrument.' : 'Microphone is off.';

  $('strings').innerHTML = `<button data-s="auto" aria-pressed="${TU.str === 'auto'}">Auto</button>` +
    TUNING.map((midi, s) => `<button data-s="${s}" aria-pressed="${TU.str === String(s)}">${pcName(midi)}<small>${octaveOf(midi)}</small></button>`).join('');

  // target line above the big note
  let tgt = '';
  if (m === 'tune' && TU.str !== 'auto') tgt = `Tuning the ${midiLabel(TUNING[+TU.str])} string`;
  if (m === 'hit' && hit.target) tgt = TU.showName || hit.missed ? `Target ${midiLabel(hit.target)}` : 'Target hidden';
  $('tTarget').textContent = tgt;
  $('holdBar').hidden = m !== 'hit' || !hit.target;
  if (m === 'hit') $('holdBar').firstElementChild.style.width = `${Math.min(100, 100 * hit.hold / HOLD_SECONDS)}%`;

  $('hitReplay').disabled = !hit.target || !TU.playTarget;
  $('hitScore').innerHTML = `Hit <b>${hit.hits}</b> of <b>${hit.tries}</b>`;
  $('hitPrompt').textContent = !mic.stream ? 'Start the microphone, press “New note”, and sing or play the note.'
    : !hit.target ? 'Press “New note”, and sing or play the note until the needle stays in the green zone.'
    : hit.solved ? 'Hit! Press “New note” for the next one.'
    : hit.missed ? `Time is up. The note was ${midiLabel(hit.target)}.`
    : TU.anyOct ? 'Sing or play the note. Any octave counts.' : 'Sing or play the note in the same octave.';

  $('guessReplay').disabled = !guess.q;
  const pct = guess.total ? ` (${Math.round(100 * guess.right / guess.total)}%)` : '';
  $('guessScore').innerHTML = `Correct <b>${guess.right}</b> of <b>${guess.total}</b>${pct}`;
  $('guessPrompt').textContent = !guess.q ? 'Press “New note” and choose the note you heard.'
    : guess.answered ? 'Press “New note” to continue.'
    : TU.ref ? 'First an A as reference, then the note. Which note was it?' : 'Which note did you hear?';
  const q = guess.q;
  if (q && guess.answered) {
    const dist = q.late ? 0 : Math.abs(foldCents(q.chosen, q.m % 12, true) / 100);
    $('guessFeedback').innerHTML = q.ok
      ? `<span class="verdict good">Correct, it was ${midiLabel(q.m)}</span>`
      : q.late ? `<span class="verdict bad">Time is up. It was ${midiLabel(q.m)}</span>`
      : `<span class="verdict bad">It was ${midiLabel(q.m)}</span><span class="sub">You answered ${pcName(q.chosen)}, which is ${dist} semitone${dist > 1 ? 's' : ''} away.</span>`;
  } else $('guessFeedback').innerHTML = '';
  HIT_TIMER.render(); GUESS_TIMER.render();
  $('guessAnswers').innerHTML = ROOTS.map((r, pc) => {
    let cls = '';
    if (q && guess.answered) { if (pc === q.m % 12) cls = 'correct'; else if (pc === q.chosen) cls = 'wrong'; }
    return `<button class="${cls}" data-pc="${pc}">${pcName(pc)}</button>`;
  }).join('');
}

PAGES.tuner = {
  title: 'Tuner',
  subs: ['tune', 'hit', 'guess'],
  init() {
    drawGauge();
    $('rangeSel').addEventListener('change', e => { TU.range = e.target.value; save(); });
    $('anyOct').addEventListener('change', e => { TU.anyOct = e.target.checked; save(); renderTuner(); });
    $('playTarget').addEventListener('change', e => {
      TU.playTarget = e.target.checked;
      if (!TU.playTarget && !TU.showName) TU.showName = true;   // the target has to be heard or seen
      save(); renderTuner();
    });
    $('showName').addEventListener('change', e => {
      TU.showName = e.target.checked;
      if (!TU.showName && !TU.playTarget) TU.playTarget = true;
      save(); renderTuner();
    });
    $('refA').addEventListener('change', e => { TU.ref = e.target.checked; save(); renderTuner(); });
    $('micBtn').addEventListener('click', () => mic.stream ? stopMic() : startMic());
    $('strings').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      TU.str = b.dataset.s; save();
      if (TU.str !== 'auto') { stopAll(); play(TUNING[+TU.str], 0, 'guitar'); }
      renderTuner();
    });
    $('hitNew').addEventListener('click', newHitTarget);
    HIT_TIMER.bind(); GUESS_TIMER.bind();
    $('hitReplay').addEventListener('click', playHitTarget);
    $('guessNew').addEventListener('click', newGuess);
    $('guessReplay').addEventListener('click', playGuess);
    $('guessAnswers').addEventListener('click', e => { const b = e.target.closest('button'); if (b) answerGuess(+b.dataset.pc); });
  },
  render(sub) { renderTuner(sub); renderReading(null); },
  // The microphone stays on while you switch between the tuner exercises, and is turned off when you leave the tuner
  leave(sub, changedPage) { if (changedPage && mic.stream) stopMic(); },
  keys(e, sub) {
    const isN = e.key === 'n' || e.key === 'N', isR = e.key === 'r' || e.key === 'R';
    if (sub === 'hit' && isN) { e.preventDefault(); newHitTarget(); }
    if (sub === 'hit' && isR) { e.preventDefault(); playHitTarget(); }
    if (sub === 'guess' && isN) { e.preventDefault(); newGuess(); }
    if (sub === 'guess' && isR) { e.preventDefault(); playGuess(); }
  }
};
