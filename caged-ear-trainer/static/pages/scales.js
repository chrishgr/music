/* Scales: a scale on the neck and the piano, one position at a time if wanted, and the chords built from it */
const SC = { chord: null, playing: null };   // chord: index of the chord from the scale that is shown. playing: the area Play is using
const SCALE_SPAN = 4;                          // a position covers five frets, the first one and four more
const STEP_NAMES = { 1: 'H', 2: 'W', 3: 'W+H' };
const scaleNow = () => SCALES.find(s => s.id === state.scale) || SCALES[0];
const scaleArea = () => state.scalePos === 'all' ? null : { lo: +state.scalePos, hi: Math.min(FRETS, +state.scalePos + SCALE_SPAN) };
// With the whole neck shown, Play uses the position around the root on the low E string
function defaultArea() {
  const lo = Math.max(0, (rootPc() - TUNING[0] % 12 + 12) % 12 - 1);
  return { lo, hi: lo + SCALE_SPAN };
}
// The notes Play uses: every scale note in the area from the lowest root to the highest, each pitch once
function scaleRun(area) {
  const pcs = new Set(tonesOf(state.root, scaleNow().iv).map(t => t.pc)), notes = [];
  for (let st = 0; st < 6; st++) for (let f = area.lo; f <= area.hi; f++) {
    const m = TUNING[st] + f;
    if (pcs.has(m % 12)) notes.push({ m, st, f });
  }
  notes.sort((a, b) => a.m - b.m || a.st - b.st);
  const run = notes.filter((n, i) => i === 0 || n.m !== notes[i - 1].m);
  const rp = rootPc(), roots = run.map((n, i) => n.m % 12 === rp ? i : -1).filter(i => i >= 0);
  return roots.length > 1 ? run.slice(roots[0], roots[roots.length - 1] + 1) : run;
}
const keyChords = () => diatonicChords(state.root, state.scale, state.scaleKind === 'sevenths');

function playScale() {
  stopAll();
  const area = scaleArea() || defaultArea(), run = scaleRun(area);
  const seq = run.concat(run.slice(0, -1).reverse()), step = 0.26;
  SC.playing = area; renderScales();
  seq.forEach((n, i) => play(n.m, i * step, state.inst, noteKey(n.st, n.f)));
  later(seq.length * step + 0.3, () => { SC.playing = null; renderScales(); });
}
// A chord from the scale, close together from the third octave: all at once, then note by note
function playKeyChord(c) {
  stopAll();
  const base = 48 + parseNote(c.root).pc, ms = c.chord.iv.map(iv => base + IV[iv][0]);
  ms.forEach((m, i) => play(m, i * 0.03));
  ms.forEach((m, i) => play(m, 1.1 + i * 0.28));
}

function renderScales() {
  const sc = scaleNow(), tones = tonesOf(state.root, sc.iv), area = scaleArea();
  const chords = keyChords();
  if (SC.chord !== null && !chords[SC.chord]) SC.chord = null;
  const ch = SC.chord !== null ? chords[SC.chord] : null;
  $('scaleSel').value = sc.id;
  $('scalePos').value = String(state.scalePos);
  $('scTitle').textContent = `${noteName(state.root)} ${sc.name.toLowerCase()}`;
  const semis = sc.iv.map(iv => IV[iv][0]).concat(12);
  $('scFormula').innerHTML = `<span><b>Degrees</b>${sc.iv.map(ivFmt).join(' ')}</span><span><b>Intervals</b>${sc.iv.map(intervalName).join(' ')}</span>` +
    `<span><b>Notes</b>${tones.map(t => t.name).join(' ')}</span><span><b>Steps</b>${semis.slice(1).map((x, i) => STEP_NAMES[x - semis[i]]).join(' ')}</span>`;

  // Neck: the scale, or a chord from it with the other scale notes as rings
  const inArea = f => !area || (f >= area.lo && f <= area.hi);
  let dots, keys;
  if (ch) {
    const ct = tonesOf(ch.root, ch.chord.iv), byPc = new Map(ct.map(t => [t.pc, t]));
    dots = neckDots(tones, {
      keep: (st, f) => inArea(f) || byPc.has((TUNING[st] + f) % 12),
      cls: (t, st, f) => byPc.has(t.pc) ? byPc.get(t.pc).role + (inArea(f) ? '' : ' faint') : 'ring',
      r: 11
    }).map(d => byPc.has(d.item.pc) ? { ...d, item: byPc.get(d.item.pc) } : { ...d, r: 8 });
    keys = new Map(tones.map(t => [t.pc, byPc.get(t.pc) || { ...t, cls: 'other' }]));
  } else {
    dots = neckDots(tones, { cls: (t, st, f) => t.role + (inArea(f) ? '' : ' faint') });
    keys = new Map(tones.map(t => [t.pc, t]));
  }
  const bands = [];
  if (area) bands.push({ lo: area.lo, hi: area.hi, label: area.lo === 0 ? 'Open position' : `Frets ${area.lo}–${area.hi}` });
  if (SC.playing && (!area || SC.playing.lo !== area.lo)) bands.push({ lo: SC.playing.lo, hi: SC.playing.hi, label: 'Playing', cls: 'active' });
  else if (SC.playing) bands[0].cls = 'active';
  renderNeck($('scNeck'), { bands, dots });
  renderKeys($('scKeys'), { byPc: keys });
  const roles = new Set((ch ? tonesOf(ch.root, ch.chord.iv) : tones).map(t => t.role));
  $('scLegend').innerHTML = legendHtml(['root', 'third', 'fifth', 'seventh', 'other'].filter(k => roles.has(k)));

  $('scHint').textContent = ch
    ? `Coloured dots are ${chordSymbol(ch.root, ch.chord.id)}, the ${ch.roman} chord, labelled from its own root. Rings are the other notes of the scale. Click the chord again to go back to the scale.`
    : area
      ? 'Play goes from the lowest root in this area to the highest and back down. Faint dots are the same scale outside the area. Use the arrows or the ← → keys to move along the neck.'
      : 'Play uses the position around the root on the low E string and lights up each note as it sounds. Choose a neck area to see one position at a time.';

  // Chords built from the scale
  setPressed($('scKind'), state.scaleKind);
  const seven = sc.iv.length === 7;
  $('scKind').hidden = !seven;
  $('scChordsHint').textContent = seven
    ? 'Built by stacking every other note of the scale. Upper case is a major chord, lower case minor, ° diminished, + augmented, ø half-diminished. Click a chord to hear it and see it inside the scale.'
    : 'Chords are built by stacking every other note of a seven-note scale, so they are listed for the seven-note scales. Pentatonic and blues scales are usually played over the chords of the major or minor key with the same root.';
  $('scChords').innerHTML = chords.map((c, i) => !c.chord ? '' :
    `<button data-i="${i}" aria-pressed="${SC.chord === i}"><b>${c.roman}</b><span>${chordSymbol(c.root, c.chord.id)}</span><small>${c.notes.map(noteName).join(' ')}</small></button>`).join('');
}

function stepArea(delta) {
  const opts = ['all', ...Array.from({ length: FRETS - SCALE_SPAN + 1 }, (_, i) => String(i))];
  const i = opts.indexOf(String(state.scalePos));
  state.scalePos = opts[(i + delta + opts.length) % opts.length];
  save(); stopAll(); renderScales();
}

PAGES.scales = {
  title: 'Scales',
  init() {
    $('scaleSel').innerHTML = SCALES.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    $('scalePos').innerHTML = '<option value="all">Whole neck</option>' + Array.from({ length: FRETS - SCALE_SPAN + 1 }, (_, lo) =>
      `<option value="${lo}">${lo === 0 ? 'Open position, frets 0–4' : `Frets ${lo}–${lo + SCALE_SPAN}`}</option>`).join('');
    $('scaleSel').addEventListener('change', e => { state.scale = e.target.value; SC.chord = null; save(); stopAll(); renderScales(); });
    $('scalePos').addEventListener('change', e => { state.scalePos = e.target.value; save(); stopAll(); renderScales(); });
    $('scPrev').addEventListener('click', () => stepArea(-1));
    $('scNext').addEventListener('click', () => stepArea(1));
    $('scPlay').addEventListener('click', playScale);
    onButton($('scKind'), b => { state.scaleKind = b.dataset.v; save(); renderScales(); });
    onButton($('scChords'), b => {
      const i = +b.dataset.i, c = keyChords()[i];
      SC.chord = SC.chord === i ? null : i;
      renderScales();
      if (SC.chord !== null) playKeyChord(c); else stopAll();
    });
    STOP_HOOKS.push(() => { if (SC.playing) { SC.playing = null; if (current && current.page === 'scales') renderScales(); } });
  },
  render: renderScales,
  onRoot() { SC.chord = null; },
  keys(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); stepArea(e.key === 'ArrowLeft' ? -1 : 1); }
  }
};
