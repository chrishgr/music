/* CAGED Ear Trainer: code shared by all pages.
   Storage, sound (with the notes lighting up as they sound), drawing of the neck, the piano and chord
   diagrams, the page router and the practice drills. Each page lives in static/pages/. */

const $ = id => document.getElementById(id);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ================= STORAGE (this browser only) ================= */
const STORE = 'caged-ear-v2';   // the same key as before the pages were split, so settings and ear statistics carry over
function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
const saved = load();
const DEFAULTS = {
  page: 'home', sub: {},
  root: 'A', labels: 'name', inst: 'guitar', notation: 'intl',
  scale: 'minpenta', scalePos: 'all', scaleKind: 'triads',
  chord: 'maj', chordShape: 'E', chordAll: true,
  cagedQ: 'maj', shape: 'all', cagedScale: '', cagedCompare: true,
  cpType: 'play', cpQ: ['maj', 'min', '7'], cpShapes: [...SHAPE_ORDER],
  triShape: 'G', capo: 0, triSet: '3', triPos: 0, triAuto: true, pType: 'play', pRandCapo: true,
  bpm: 80, beats: 4, subdiv: 1, accent: true, clickVol: 0.8, drill: 'ladder', drillSet: {}, omcLog: {},
  prog: 'pop', progCapo: 0, progBpm: 90, progStrum: 'beats', progClick: true, progLoop: true, progGenre: 'classic', progStart: 0
};
const state = {};
for (const k of Object.keys(DEFAULTS)) state[k] = saved[k] !== undefined ? saved[k] : DEFAULTS[k];
// Values from older versions or a damaged store fall back to the defaults
if (!ROOTS.includes(state.root)) state.root = DEFAULTS.root;
if (!CHORDS.some(c => c.id === state.chord)) state.chord = DEFAULTS.chord;
if (!CAGED_QUALITIES.includes(state.cagedQ)) state.cagedQ = DEFAULTS.cagedQ;
if (!SCALES.some(s => s.id === state.scale)) state.scale = DEFAULTS.scale;
if (state.shape !== 'all' && !SHAPE_ORDER.includes(state.shape)) state.shape = 'all';
if (saved.showScale && saved.cagedScale === undefined) state.cagedScale = 'major';
if (!Array.isArray(state.cpQ) || !state.cpQ.length) state.cpQ = [...DEFAULTS.cpQ];
if (!Array.isArray(state.cpShapes) || !state.cpShapes.length) state.cpShapes = [...DEFAULTS.cpShapes];
for (const k of ['sub', 'drillSet', 'omcLog']) if (typeof state[k] !== 'object' || !state[k] || Array.isArray(state[k])) state[k] = {};
naming.system = state.notation;

// Pages with their own saved data (ear statistics, tuner settings) register a function here
const SAVERS = {};
function save() {
  try {
    const out = {};
    for (const k of Object.keys(DEFAULTS)) out[k] = state[k];
    for (const [k, fn] of Object.entries(SAVERS)) out[k] = fn();
    localStorage.setItem(STORE, JSON.stringify(out));
  } catch (e) { /* storage is optional */ }
}

/* ================= AUDIO ================= */
const audio = { ctx: null, master: null, cache: new Map(), live: [], timers: [] };
function ctx() {
  if (!audio.ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    audio.ctx = new C();
    const comp = audio.ctx.createDynamicsCompressor();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.55;
    audio.master.connect(comp); comp.connect(audio.ctx.destination);
  }
  if (audio.ctx.state === 'suspended') audio.ctx.resume();
  return audio.ctx;
}
function buffer(m, inst) {
  const key = inst + m;
  if (!audio.cache.has(key)) {
    const c = ctx();
    const r = inst === 'piano' ? synthPiano(mtof(m), c.sampleRate) : synthPluck(mtof(m), c.sampleRate);
    const buf = c.createBuffer(1, r.samples.length, c.sampleRate);
    buf.getChannelData(0).set(r.samples);
    audio.cache.set(key, { buf, rate: r.rate });
  }
  return audio.cache.get(key);
}
// Run fn at the audio-clock time `when` (when that sound starts). stopAll() cancels it.
function atTime(when, fn) {
  const t = setTimeout(() => { audio.timers = audio.timers.filter(x => x !== t); fn(); }, Math.max(0, (when - ctx().currentTime) * 1000));
  audio.timers.push(t);
}
// Run fn when a note scheduled `sec` seconds from now starts to sound
const later = (sec, fn) => atTime(ctx().currentTime + 0.03 + sec, fn);
function startBuffer(b, when, gain) {
  const c = ctx(), src = c.createBufferSource(), g = c.createGain();
  src.buffer = b.buf;
  src.playbackRate.value = b.rate;   // fine-tunes the pluck to the exact target pitch
  g.gain.value = gain;
  src.connect(g); g.connect(audio.master);
  src.start(Math.max(when, c.currentTime));
  audio.live.push(src);
  src.onended = () => { audio.live = audio.live.filter(s => s !== src); };
}
// Play MIDI note m at the audio-clock time `when`. `where` decides what lights up on the neck when it sounds:
// 'string:fret' for one place, '*' for every place the note can be played, null for the piano only.
function playAt(m, when, inst = state.inst, where = null, vol = 1) {
  startBuffer(buffer(m, inst), when, (inst === 'guitar' ? 0.55 : 1) * vol);
  atTime(when, () => flash(m, where));
}
// Play MIDI note m `at` seconds from now
function play(m, at = 0, inst = state.inst, where = null, vol = 1) { playAt(m, ctx().currentTime + 0.03 + at, inst, where, vol); }
// Metronome click. An accent on beat 1 is higher than the other beats, and subdivisions are softer.
const CLICKS = { accent: [1650, 1], beat: [1100, 0.75], sub: [820, 0.38] };
function clickAt(kind, when, vol = state.clickVol) {
  const key = 'click' + kind;
  if (!audio.cache.has(key)) {
    const c = ctx(), r = synthClick(CLICKS[kind][0], c.sampleRate), buf = c.createBuffer(1, r.samples.length, c.sampleRate);
    buf.getChannelData(0).set(r.samples);
    audio.cache.set(key, { buf, rate: 1 });
  }
  startBuffer(audio.cache.get(key), when, CLICKS[kind][1] * vol);
}
// Pages that show what is playing (a lit band, a highlighted diagram) reset it here when the sound stops
const STOP_HOOKS = [];
function stopAll() {
  stopClock();
  audio.live.forEach(s => { try { s.stop(); } catch (e) { /* already stopped */ } });
  audio.live = [];
  audio.timers.forEach(clearTimeout);
  audio.timers = [];
  STOP_HOOKS.forEach(fn => fn());
}
const noteKey = (st, f) => st + ':' + f;
// Strum a position from the lowest string up (or the highest, for an up-strum), every note lighting up where it is played
function strumAt(p, when, inst = state.inst, { gap = 0.045, up = false, vol = 1 } = {}) {
  const notes = p.frets.map((f, k) => f < 0 ? null : { m: TUNING[p.strings[k]] + f, where: noteKey(p.strings[k], f) }).filter(Boolean);
  (up ? notes.reverse() : notes).forEach((n, i) => playAt(n.m, when + i * gap, inst, n.where, vol));
}
function strum(p, at = 0, inst = state.inst, gap = 0.045) {
  p.frets.forEach((f, k) => { if (f >= 0) play(TUNING[p.strings[k]] + f, at + k * gap, inst, noteKey(p.strings[k], f)); });
}
// One note at a time from the lowest string, then all together
function arpeggio(p, at = 0, inst = state.inst, step = 0.3) {
  const notes = p.frets.map((f, k) => f < 0 ? null : { m: TUNING[p.strings[k]] + f, where: noteKey(p.strings[k], f) }).filter(Boolean);
  notes.forEach((n, i) => play(n.m, at + i * step, inst, n.where));
  strum(p, at + notes.length * step + 0.25, inst);
}

/* ================= CLOCK (the metronome and anything played in time) =================
   Look-ahead scheduling: a timer wakes up every 25 ms and puts every beat that starts within the next
   0.12 s on the audio clock, which keeps exact time even when the page is busy drawing.
   cfg = { bpm(bar), beats(), onBeat({ bar, beat, beats, bpm, len }, when) }. bpm and beats are read
   again on every beat, so tempo changes and the speed trainer take effect right away. */
const CLOCK = { running: false, timer: null, next: 0, bar: 0, beat: 0 };
function startClock(cfg) {
  stopClock();
  const c = ctx();
  Object.assign(CLOCK, { running: true, next: c.currentTime + 0.12, bar: 0, beat: 0 });
  const tick = () => {
    while (CLOCK.running && CLOCK.next < c.currentTime + 0.12) {
      const beats = cfg.beats();
      if (CLOCK.beat >= beats) { CLOCK.beat = 0; CLOCK.bar++; }
      const bpm = cfg.bpm(CLOCK.bar), len = 60 / bpm;
      cfg.onBeat({ bar: CLOCK.bar, beat: CLOCK.beat, beats, bpm, len }, CLOCK.next);
      CLOCK.next += len;
      CLOCK.beat++;   // wraps to the next bar on the next beat, which also handles fewer beats per bar
    }
  };
  CLOCK.timer = setInterval(tick, 25);
  tick();
}
function stopClock() { clearInterval(CLOCK.timer); CLOCK.timer = null; CLOCK.running = false; }
// Clicks for one beat, from beatClicks() in theory.js
function clickBeat(plan, info, when) {
  beatClicks(plan, info.beat).forEach(k => clickAt(k.kind, when + k.at * info.len));
}

/* ================= NOTES THAT FOLLOW THE SOUND ================= */
const SVGNS = 'http://www.w3.org/2000/svg';
const currentPageEl = () => current ? $('page-' + current.page) : null;
function placesOf(m, capo = 0) {
  const out = [];
  for (let st = 0; st < 6; st++) { const f = m - TUNING[st]; if (f >= capo && f <= FRETS) out.push([st, f]); }
  return out;
}
function flash(m, where) {
  const page = currentPageEl();
  if (!page) return;
  $$(`svg.keys [data-m="${m}"]`, page).forEach(k => { k.classList.add('lit'); setTimeout(() => k.classList.remove('lit'), 420); });
  if (!where) return;
  $$('svg.neck', page).forEach(svg => {
    const layer = svg.querySelector('.flash-layer');
    if (!layer) return;
    const spots = where === '*' ? placesOf(m, +svg.dataset.capo || 0) : [where.split(':').map(Number)];
    spots.forEach(([st, f]) => {
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('class', 'flash'); c.setAttribute('cx', cx(f)); c.setAttribute('cy', sy(st)); c.setAttribute('r', 14);
      layer.appendChild(c);
      setTimeout(() => c.remove(), 750);
    });
  });
}

/* ================= DRAWING: NECK ================= */
const X0 = 46, SCALE_LEN = 1060, TOP = 36, GAP = 28;
const fx = f => X0 + SCALE_LEN * (1 - Math.pow(2, -f / 12));        // real fret spacing (12th fret at half the scale length)
const cx = f => f === 0 ? X0 - 19 : (fx(f - 1) + fx(f)) / 2;
const sy = s => TOP + 14 + (5 - s) * GAP;                              // high e string on top
const BOARD_H = GAP * 6;
const MARKS = [3, 5, 7, 9, 12, 15];
const stringName = st => st === 4 && naming.system === 'no' ? 'H' : STRING_NAMES[st];
const rootPc = () => parseNote(state.root).pc;

// The text inside a dot follows the Labels choice: note name, degree (1 b3 5), interval (R m3 P5) or shape name
function labelOf(item) {
  if (item.label) return item.label;   // a fixed label, such as a finger number
  const mode = state.labels === 'shape' && !item.shapeName ? 'name' : state.labels;
  return mode === 'interval' ? ivFmt(item.iv) : mode === 'quality' ? intervalName(item.iv) : mode === 'shape' ? item.shapeName : item.name;
}
function dotSvg(x, y, item, cls, r) {
  if (!item) return `<g class="dot ${cls}"><circle cx="${x}" cy="${y}" r="${r}"/></g>`;
  const label = labelOf(item);
  const fs = r < 10 ? 8 : (label.length > 2 ? 8.5 : 10.5);
  return `<g class="dot ${cls}"><circle cx="${x}" cy="${y}" r="${r}"/><text x="${x}" y="${y + 0.5}" font-size="${fs}">${label}</text></g>`;
}
const bandX = (lo, hi) => [lo === 0 ? X0 - 36 : fx(lo - 1) + 1, hi === 0 ? X0 - 2 : fx(hi) - 1];

// Every place on the neck whose note is one of the tones. `cls` and `keep` can style or filter each place.
function neckDots(tones, { capo = 0, cls = t => t.role, keep = () => true, r = 11 } = {}) {
  const byPc = new Map(tones.map(t => [t.pc, t])), out = [];
  for (let st = 0; st < 6; st++) for (let f = capo; f <= FRETS; f++) {
    const t = byPc.get((TUNING[st] + f) % 12);
    if (t && keep(st, f, t)) out.push({ st, f, item: t, cls: cls(t, st, f), r });
  }
  return out;
}
// Dots for one position (a grip or a triad), coloured by what each note is in the chord
function positionDots(p, tones, cls = '') {
  return p.frets.map((f, k) => {
    if (f < 0) return null;
    const st = p.strings[k], t = tones.find(x => x.pc === (TUNING[st] + f) % 12);
    return { st, f, item: t, cls: (t ? t.role : 'other') + cls };
  }).filter(Boolean);
}
const positionKeys = p => p.frets.map((f, k) => f < 0 ? null : noteKey(p.strings[k], f)).filter(Boolean);
// Muted strings are marked at the nut (or the capo). A shape moved up the neck has no nut to mark them at,
// so there the chord diagram shows them instead.
const mutedStrings = p => p.strings.length === 6 && !(p.base > 0) ? p.frets.map((f, st) => f < 0 ? st : null).filter(x => x !== null) : [];

// model: { capo, bands: [{lo, hi, label, cls}], dots: [{st, f, item, cls, r}], mutes: [string] }
function renderNeck(svg, m = {}) {
  const capo = m.capo || 0, W = fx(FRETS) + 14, mid = TOP + BOARD_H / 2;
  let s = `<rect class="b-wood" x="${X0}" y="${TOP}" width="${fx(FRETS) - X0}" height="${BOARD_H}" rx="2"/>`;
  (m.bands || []).forEach(b => {
    const [x1, x2] = bandX(Math.max(b.lo, capo), Math.max(b.hi, capo));
    const active = (b.cls || '').includes('active');
    s += `<rect class="band ${b.cls || ''}" x="${x1}" y="${TOP - 4}" width="${x2 - x1}" height="${BOARD_H + 8}" rx="4"/>`;
    if (b.label) s += `<text class="band-lbl${active ? ' active' : ''}" x="${(x1 + x2) / 2}" y="${TOP - 12}">${b.label}</text>`;
  });
  for (const f of MARKS) {
    if (f === 12) s += `<circle class="b-inlay" cx="${cx(f)}" cy="${TOP + GAP * 1.5}" r="5"/><circle class="b-inlay" cx="${cx(f)}" cy="${TOP + GAP * 4.5}" r="5"/>`;
    else s += `<circle class="b-inlay" cx="${cx(f)}" cy="${mid}" r="5"/>`;
  }
  s += `<rect class="b-nut" x="${X0 - 3}" y="${TOP}" width="6" height="${BOARD_H}"/>`;
  for (let f = 1; f <= FRETS; f++) s += `<line class="b-fret" x1="${fx(f)}" y1="${TOP}" x2="${fx(f)}" y2="${TOP + BOARD_H}"/>`;
  for (let st = 0; st < 6; st++) {
    s += `<line class="b-string" x1="${X0 - 40}" y1="${sy(st)}" x2="${fx(FRETS)}" y2="${sy(st)}" stroke-width="${2.7 - st * 0.33}"/>`;
    s += `<text class="b-sname" x="10" y="${sy(st)}">${stringName(st)}</text>`;
  }
  for (let f = 1; f <= FRETS; f++) s += `<text class="b-num${MARKS.includes(f) ? ' mark' : ''}" x="${cx(f)}" y="${TOP + BOARD_H + 18}">${f}</text>`;
  // capo: frets behind it are shaded and cannot be played
  if (capo > 0) {
    s += `<rect class="capo-shade" x="${X0 - 40}" y="${TOP - 2}" width="${fx(capo - 1) - (X0 - 40)}" height="${BOARD_H + 4}"/>`;
    s += `<rect class="capo" x="${fx(capo) - 10}" y="${TOP - 7}" width="7" height="${BOARD_H + 14}" rx="3"/>`;
  }
  (m.mutes || []).forEach(st => { s += `<text class="b-mute" x="${capo ? cx(capo) : X0 - 19}" y="${sy(st)}">×</text>`; });
  // clickable cells, one per string and fret
  for (let st = 0; st < 6; st++) for (let f = capo; f <= FRETS; f++) {
    const x1 = f === 0 ? X0 - 38 : fx(f - 1), x2 = f === 0 ? X0 - 3 : fx(f);
    s += `<rect class="cell" data-m="${TUNING[st] + f}" data-k="${noteKey(st, f)}" x="${x1}" y="${sy(st) - GAP / 2}" width="${x2 - x1}" height="${GAP}"><title>${stringName(st)} string, ${f === 0 ? 'open' : 'fret ' + f}</title></rect>`;
  }
  (m.dots || []).forEach(d => { s += dotSvg(cx(d.f), sy(d.st), d.item, d.cls, d.r || 11); });
  s += '<g class="flash-layer"></g>';
  svg.setAttribute('viewBox', `0 0 ${Math.ceil(W)} ${TOP + BOARD_H + 28}`);
  svg.dataset.capo = capo;
  svg.innerHTML = s;
}

/* ================= DRAWING: PIANO ================= */
// Four octaves, C2 to B5, which covers every note of a guitar with 15 frets (E2 to G5)
const KEY_LO = 36, KEY_OCTAVES = 4;
// marks: byMidi marks exact notes (a grip as it sounds), byPc marks a pitch class in every octave (a scale)
function renderKeys(svg, { byPc = null, byMidi = null } = {}) {
  const W = 24, H = 104, BW = 15, BH = 64;
  const whites = [0, 2, 4, 5, 7, 9, 11], blacks = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };
  const mark = m => byMidi ? byMidi.get(m) : byPc ? byPc.get(m % 12) : null;
  let w = '', b = '';
  for (let o = 0; o < KEY_OCTAVES; o++) {
    whites.forEach((pc, i) => {
      const x = (o * 7 + i) * W + 1, m = KEY_LO + o * 12 + pc;
      w += `<rect class="k-white" data-m="${m}" x="${x}" y="1" width="${W}" height="${H}" rx="3"><title>${noteName(ROOTS[pc])}${Math.floor(m / 12) - 1}</title></rect>`;
      if (pc === 0) w += `<text class="k-oct" x="${x + W / 2}" y="${H - 30}">C${2 + o}</text>`;
      const t = mark(m);
      if (t) w += dotSvg(x + W / 2, H - 13, t, t.cls || t.role, 9);
    });
    for (const [pc, wi] of Object.entries(blacks)) {
      const x = (o * 7 + wi + 1) * W + 1 - BW / 2, m = KEY_LO + o * 12 + +pc;
      b += `<rect class="k-black" data-m="${m}" x="${x}" y="1" width="${BW}" height="${BH}" rx="2"><title>${noteName(ROOTS[pc])}${Math.floor(m / 12) - 1}</title></rect>`;
      const t = mark(m);
      if (t) b += dotSvg(x + BW / 2, BH - 11, t, t.cls || t.role, 7);
    }
  }
  svg.setAttribute('viewBox', `0 0 ${7 * KEY_OCTAVES * W + 2} ${H + 2}`);
  svg.innerHTML = w + b;
}
// The exact notes of a position, for renderKeys
function midiMarks(p, tones) {
  const out = new Map();
  p.frets.forEach((f, k) => {
    if (f < 0) return;
    const m = TUNING[p.strings[k]] + f, t = tones.find(x => x.pc === m % 12);
    if (t) out.set(m, t);
  });
  return out;
}

/* ================= DRAWING: CHORD DIAGRAMS ================= */
// A chord box as in chord books: strings from low E (left) to high e (right), frets from the nut down.
// When the grip sits higher than fret 5, the number of its first fret is written on the left.
// anchors: notes ('string:fret') that stay in place across a progression, drawn with a dashed ring
function chordBoxSvg(p, tones, anchors = new Set()) {
  const SW = 16, FH = 20, LEFT = 18, TOPY = 24;
  const played = p.frets.filter(f => f >= 0), hi = Math.max(...played);
  const fretted = played.filter(f => f > 0);
  const start = played.includes(0) || hi <= 5 ? 1 : Math.min(...fretted);
  const rows = Math.max(5, hi - start + 1);
  const w = LEFT + 5 * SW + 10, h = TOPY + rows * FH + 6;
  let s = '';
  for (let r = 0; r <= rows; r++) s += `<line class="cb-line" x1="${LEFT}" x2="${LEFT + 5 * SW}" y1="${TOPY + r * FH}" y2="${TOPY + r * FH}"/>`;
  for (let k = 0; k < 6; k++) s += `<line class="cb-line" x1="${LEFT + k * SW}" x2="${LEFT + k * SW}" y1="${TOPY}" y2="${TOPY + rows * FH}"/>`;
  if (start === 1) s += `<line class="cb-nut" x1="${LEFT - 1}" x2="${LEFT + 5 * SW + 1}" y1="${TOPY}" y2="${TOPY}"/>`;
  else s += `<text class="cb-fr" x="1" y="${TOPY + FH / 2}">${start}</text>`;
  p.frets.forEach((f, k) => {
    const st = p.strings[k], x = LEFT + st * SW;
    if (f < 0) { s += `<text class="cb-mark" x="${x}" y="${TOPY - 11}">×</text>`; return; }
    const t = tones.find(x => x.pc === (TUNING[st] + f) % 12);
    if (f === 0) s += `<circle class="cb-open ${t ? t.role : ''}" cx="${x}" cy="${TOPY - 11}" r="4.5"/>`;
    else s += dotSvg(x, TOPY + (f - start + 0.5) * FH, t, (t ? t.role : 'other') + (anchors.has(noteKey(st, f)) ? ' anchor' : ''), 7.5);
  });
  return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true">${s}</svg>`;
}
function chordBoxButton(p, tones, { i, title, sub, pressed = false, playing = false, anchors }) {
  return `<button class="box${playing ? ' playing' : ''}" data-i="${i}" aria-pressed="${pressed}">${chordBoxSvg(p, tones, anchors)}<b>${title}</b><small>${sub}</small></button>`;
}
const fretRange = p => p.lo === p.hi ? `fret ${p.lo}` : `frets ${p.lo}–${p.hi}`;

/* ================= SHARED CONTROLS ================= */
const LEGEND_TXT = { root: 'Root', third: 'Third', fifth: 'Fifth', seventh: 'Seventh', other: 'Other notes', ghost: 'Note in the major shape', anchor: 'Anchor finger, stays put' };
function legendHtml(keys) {
  return keys.map(k => `<span><i class="sw ${k}"></i>${LEGEND_TXT[k]}</span>`).join('');
}
function setPressed(el, v) { $$('button', el).forEach(b => b.setAttribute('aria-pressed', b.dataset.v === String(v))); }
function onButton(el, fn) {
  el.addEventListener('click', e => { const b = e.target.closest('button'); if (b && el.contains(b)) fn(b, e); });
}
function renderRootPickers() {
  $$('[data-roots]').forEach(el => {
    el.innerHTML = ROOTS.map(r => `<button data-v="${r}" aria-pressed="${r === state.root}">${noteName(r)}</button>`).join('');
  });
}
const LABEL_OPTS = [['name', 'Note names'], ['interval', 'Degrees'], ['quality', 'Intervals'], ['shape', 'Shape names']];
function renderLabelPickers() {
  $$('[data-labels]').forEach(el => {
    const withShape = el.dataset.labels === 'shape';
    const v = state.labels === 'shape' && !withShape ? 'name' : state.labels;
    el.innerHTML = LABEL_OPTS.filter(([k]) => k !== 'shape' || withShape)
      .map(([k, t]) => `<button data-v="${k}" aria-pressed="${k === v}">${t}</button>`).join('');
  });
}

/* ================= PAGES AND ROUTER =================
   Every page has its own address: #/scales, #/chords, #/caged/practice ... so the back button,
   bookmarks and links between pages work. A page registers itself in PAGES with
   { title, subs, init(), render(sub), leave(), keys(e, sub), onNeck(key, midi) }. */
const PAGES = {};
const OLD_HASHES = { fretboard: 'caged', fb: 'caged' };
let current = null;
function parseHash() {
  // Without an address (a plain bookmark of the app), open the page that was used last
  if (!location.hash.replace('#', '')) return { page: state.page, sub: '' };
  const [page = '', sub = ''] = location.hash.replace(/^#\/?/, '').split('/');
  return { page: OLD_HASHES[page] || page || 'home', sub };
}
function go(page, sub) { location.hash = '#/' + (page === 'home' ? '' : page + (sub ? '/' + sub : '')); }
function route() {
  let { page, sub } = parseHash();
  if (!PAGES[page]) page = 'home';
  const P = PAGES[page];
  if (P.subs) {
    if (!P.subs.includes(sub)) sub = P.subs.includes(state.sub[page]) ? state.sub[page] : P.subs[0];
    state.sub[page] = sub;
  } else sub = '';
  const changedPage = !current || current.page !== page;
  if (current && (changedPage || current.sub !== sub)) {
    stopAll();
    const old = PAGES[current.page];
    if (old.leave) old.leave(current.sub, changedPage);
  }
  current = { page, sub };
  state.page = page;
  save();
  for (const id of Object.keys(PAGES)) $('page-' + id).hidden = id !== page;
  $$('#nav a').forEach(a => { if (a.dataset.page === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const el = $('page-' + page);
  $$('.subtabs a', el).forEach(a => { if (a.dataset.sub === sub) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  $$('.sub', el).forEach(s => { s.hidden = s.dataset.sub !== sub; });
  const canonical = '#/' + (page === 'home' ? '' : page + (P.subs ? '/' + sub : ''));
  if (location.hash !== canonical) history.replaceState(null, '', canonical);
  document.title = (page === 'home' ? '' : P.title + ' · ') + 'CAGED Ear Trainer';
  if (changedPage) window.scrollTo(0, 0);
  rerender();
}
function rerender() {
  if (!current) return;
  renderRootPickers();
  renderLabelPickers();
  PAGES[current.page].render(current.sub);
}

/* ================= PRACTICE DRILLS =================
   Shared by the triad and CAGED practice. A task is either
   - "play": the page names a chord and a shape, the user clicks its notes on the neck and checks, or
   - "name": the neck shows a grip and the user picks its name from four answers.
   cfg = { prefix, exercises: { play, name }, make(), playPos(p), bandLabel(p), render() } */
function makeDrill(cfg) {
  const D = { task: null, taps: new Set(), checked: false, choice: null, ok: false, shownOnly: false, right: 0, total: 0 };
  const id = s => $(cfg.prefix + s);
  D.clear = () => { D.task = null; D.taps = new Set(); D.checked = false; D.choice = null; };
  D.next = () => { stopAll(); D.task = cfg.make(); D.taps = new Set(); D.checked = false; D.choice = null; cfg.render(); };
  D.revealed = () => !!D.task && (D.checked || (D.task.kind === 'name' && D.choice !== null));
  // After checking, show the accepted answer closest to what was clicked
  D.shown = () => {
    const t = D.task;
    if (!t || t.kind !== 'play' || !D.taps.size) return t && t.target;
    return t.accepted.reduce((best, a) => {
      const hit = positionKeys(a).filter(k => D.taps.has(k)).length;
      return hit > best.hit ? { a, hit } : best;
    }, { a: t.target, hit: -1 }).a;
  };
  D.tap = key => {
    if (!D.task || D.task.kind !== 'play' || D.checked) return;
    if (D.taps.has(key)) D.taps.delete(key); else D.taps.add(key);
    cfg.render();
  };
  D.check = showOnly => {
    const t = D.task;
    if (!t || t.kind !== 'play' || D.checked) return;
    D.checked = true;
    D.ok = !showOnly && t.accepted.some(a => { const ks = positionKeys(a); return ks.length === D.taps.size && ks.every(k => D.taps.has(k)); });
    D.shownOnly = showOnly;
    D.total++; if (D.ok) D.right++;
    logAttempt(cfg.exercises.play, t.item, showOnly ? 'Showed the answer' : D.ok ? 'Correct grip' : 'Wrong grip', D.ok);
    cfg.render();
    stopAll(); cfg.playPos(D.shown());
  };
  D.answer = i => {
    const t = D.task;
    if (!t || t.kind !== 'name' || D.choice !== null || !t.options.list[i]) return;
    D.choice = i;
    D.ok = t.options.list[i] === t.options.correct;
    D.total++; if (D.ok) D.right++;
    logAttempt(cfg.exercises.name, t.item, t.options.list[i], D.ok);
    cfg.render();
    stopAll(); cfg.playPos(t.target);
  };
  D.hear = () => { if (!D.task) return; stopAll(); cfg.playPos(D.task.kind === 'play' ? D.shown() : D.task.target); };
  // What the neck shows for the current task
  D.neck = capo => {
    const t = D.task;
    if (!t) return { capo, dots: [] };
    const rev = D.revealed(), shown = D.shown(), dots = [];
    const toneAt = (st, f) => t.tones.find(x => x.pc === (TUNING[st] + f) % 12);
    if (t.kind === 'name') {
      positionKeys(t.target).forEach(k => {
        const [st, f] = k.split(':').map(Number), tone = toneAt(st, f);
        dots.push(rev ? { st, f, item: tone, cls: tone.role } : { st, f, cls: 'mystery' });
      });
    } else {
      const target = new Set(positionKeys(shown));
      if (rev) dots.push(...positionDots(shown, t.tones));
      D.taps.forEach(k => {
        const [st, f] = k.split(':').map(Number);
        if (!rev) dots.push({ st, f, cls: 'tap', r: 10 });
        else if (!target.has(k)) dots.push({ st, f, cls: 'miss', r: 10 });
      });
    }
    const mutes = t.kind === 'name' || rev ? mutedStrings(t.kind === 'name' ? t.target : shown) : [];
    return { capo: t.capo, dots, mutes, bands: rev ? [{ lo: shown.lo, hi: shown.hi, label: cfg.bandLabel(shown) }] : [] };
  };
  D.keys = (e, buttonFocused) => {
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); D.next(); return true; }
    if (!D.task) return false;
    if (e.key === 'Enter' && D.task.kind === 'play' && !buttonFocused) { e.preventDefault(); D.check(false); return true; }
    if (D.task.kind === 'name' && /^[1-4]$/.test(e.key)) { e.preventDefault(); D.answer(+e.key - 1); return true; }
    return false;
  };
  D.renderStage = (idlePrompt) => {
    const t = D.task, play = !t || t.kind === 'play', rev = D.revealed();
    const pct = D.total ? ` (${Math.round(100 * D.right / D.total)}%)` : '';
    id('Score').innerHTML = `Correct <b>${D.right}</b> of <b>${D.total}</b>${pct}`;
    id('Prompt').textContent = t ? t.prompt : idlePrompt;
    let fb = '';
    if (t && rev) {
      if (t.kind === 'name') fb = `<span class="verdict ${D.ok ? 'good' : 'bad'}">${D.ok ? 'Correct' : 'It was ' + t.options.correct}</span><span class="sub">${t.detail}</span>`;
      else if (D.shownOnly) fb = `<span class="verdict">The answer is shown on the fretboard</span><span class="sub">${t.detail}</span>`;
      else fb = `<span class="verdict ${D.ok ? 'good' : 'bad'}">${D.ok ? 'Correct' : 'Not quite. Dashed rings are notes that do not belong.'}</span><span class="sub">${t.detail}${t.acceptNote && t.accepted.length > 1 ? ' ' + t.acceptNote : ''}</span>`;
    }
    id('Feedback').innerHTML = fb;
    id('Answers').innerHTML = t && t.kind === 'name' ? t.options.list.map((o, i) => {
      let cls = '';
      if (D.choice !== null) { if (o === t.options.correct) cls = 'correct'; else if (i === D.choice) cls = 'wrong'; }
      return `<button class="${cls}" data-o="${i}"><span>${o}</span><small>${i + 1}</small></button>`;
    }).join('') : '';
    ['Check', 'Clear', 'Show'].forEach(k => { id(k).hidden = !play; });
    id('Check').disabled = !t || D.checked || D.taps.size === 0;
    id('Show').disabled = !t || D.checked;
    id('Clear').disabled = !t || D.checked || D.taps.size === 0;
    id('Hear').disabled = !t || (play && !D.checked);
    id('Keys').innerHTML = play
      ? '<kbd>N</kbd> new task &nbsp; <kbd>Enter</kbd> check &nbsp; Click a marked spot again to remove it.'
      : '<kbd>N</kbd> new task &nbsp; <kbd>1</kbd> to <kbd>4</kbd> answer';
  };
  D.bind = () => {
    id('New').addEventListener('click', D.next);
    id('Check').addEventListener('click', () => D.check(false));
    id('Show').addEventListener('click', () => D.check(true));
    id('Clear').addEventListener('click', () => { D.taps.clear(); cfg.render(); });
    id('Hear').addEventListener('click', D.hear);
    onButton(id('Answers'), b => D.answer(+b.dataset.o));
  };
  return D;
}
// Four different answers, the right one first in the pool, shuffled
function fourOptions(correct, pool) {
  const opts = [correct];
  for (const o of pool) if (o && !opts.includes(o) && opts.length < 4) opts.push(o);
  return { list: shuffle(opts), correct };
}
// The practice box is the same on every page that has one, so it is written here once
$$('[data-drill]').forEach(el => {
  const p = el.dataset.drill;
  el.innerHTML = `
    <div class="stage-head"><p class="prompt" id="${p}Prompt"></p><p class="score" id="${p}Score"></p></div>
    <div class="feedback" aria-live="polite" id="${p}Feedback"></div>
    <div class="answers" id="${p}Answers"></div>
    <div class="presets">
      <button class="primary" id="${p}New">New task</button>
      <button class="ghost" id="${p}Check">Check</button>
      <button class="ghost" id="${p}Show">Show answer</button>
      <button class="ghost" id="${p}Clear">Clear marks</button>
      <button class="ghost" id="${p}Hear">Hear it</button>
    </div>
    <p class="kbd" id="${p}Keys"></p>`;
});
