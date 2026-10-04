/* Scales: a scale on the neck and the piano, one position at a time if wanted, and the chords built from it.
   In piano mode the scale is written out on a grand staff with its fingering for both hands, and Play runs it up,
   down or both, over one or two octaves, with the right, the left or both hands. The neck areas are not used then. */
const SC = { chord: null, playing: null };   // chord: index of the chord from the scale that is shown. playing: the area Play is using
const SCALE_SPAN = 4;                          // a position covers five frets, the first one and four more
const STEP_NAMES = { 1: 'H', 2: 'W', 3: 'W+H' };
const scaleNow = () => SCALES.find(s => s.id === state.scale) || SCALES[0];
const scaleArea = () => pianoMode() || state.scalePos === 'all' ? null : { lo: +state.scalePos, hi: Math.min(FRETS, +state.scalePos + SCALE_SPAN) };
// The root spelled as the scale's key is written: C♯ minor rather than D♭ minor, D♭ major rather than C♯ major
const scaleRoot = () => scaleRootName(rootPc(), scaleNow().iv);
// Piano mode: one hand's notes low to high with their fingering, and in the order Play takes them
const handRun = hand => pianoScaleRun(scaleRoot(), scaleNow().iv, { hand, octaves: state.scaleOct });
function inOrder(run) {
  const down = [...run].reverse();
  return state.scaleDir === 'up' ? run : state.scaleDir === 'down' ? down : run.concat(down.slice(1));
}
const scaleParts = () => ({ right: inOrder(handRun('right')), left: inOrder(handRun('left')) });
const playingHands = () => state.scaleHand === 'both' ? ['right', 'left'] : [state.scaleHand];
// The key signature in words: the major and minor key that use it
const SIG_KEYS = { '-7': 'C♭ major and A♭ minor', '-6': 'G♭ major and E♭ minor', '-5': 'D♭ major and B♭ minor', '-4': 'A♭ major and F minor',
  '-3': 'E♭ major and C minor', '-2': 'B♭ major and G minor', '-1': 'F major and D minor', 0: 'C major and A minor', 1: 'G major and E minor',
  2: 'D major and B minor', 3: 'A major and F♯ minor', 4: 'E major and C♯ minor', 5: 'B major and G♯ minor', 6: 'F♯ major and D♯ minor', 7: 'C♯ major and A♯ minor' };
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
const keyChords = () => diatonicChords(scaleRoot(), state.scale, state.scaleKind === 'sevenths');

function playScale() {
  stopAll();
  if (pianoMode()) {
    const parts = scaleParts(), n = parts.right.length, step = 0.3;
    SC.playing = { piano: true }; renderScales();
    playingHands().forEach(h => playPiano(parts[h].map(x => x.m), { broken: true, step }));
    // the note that sounds lights up in the notation too
    for (let i = 0; i < n; i++) later(i * step, () => $$('#scStaff .st-n').forEach(g => g.classList.toggle('now', +g.dataset.i === i)));
    later(n * step + 0.3, () => { SC.playing = null; renderScales(); });
    return;
  }
  const area = scaleArea() || defaultArea(), run = scaleRun(area);
  const seq = run.concat(run.slice(0, -1).reverse()), step = 0.26;
  SC.playing = area; renderScales();
  seq.forEach((n, i) => play(n.m, i * step, state.inst, noteKey(n.st, n.f)));
  later(seq.length * step + 0.3, () => { SC.playing = null; renderScales(); });
}
// A chord from the scale, close together from the third octave: all at once, then note by note.
// In piano mode: its root position voicing near middle C, with the piano sound.
const keyChordVoicing = c => pianoVoicings(parseNote(c.root).pc, c.chord.iv)[0].notes;
function playKeyChord(c) {
  stopAll();
  if (pianoMode()) { const ms = keyChordVoicing(c); playPiano(ms); playPiano(ms, { at: 1.1, broken: true }); return; }
  const base = 48 + parseNote(c.root).pc, ms = c.chord.iv.map(iv => base + IV[iv][0]);
  ms.forEach((m, i) => play(m, i * 0.03));
  ms.forEach((m, i) => play(m, 1.1 + i * 0.28));
}

function renderScales() {
  const sc = scaleNow(), root = scaleRoot(), tones = tonesOf(root, sc.iv), area = scaleArea();
  const chords = keyChords();
  if (SC.chord !== null && !chords[SC.chord]) SC.chord = null;
  const ch = SC.chord !== null ? chords[SC.chord] : null;
  $('scaleSel').value = sc.id;
  $('scalePos').value = String(state.scalePos);
  $('scTitle').textContent = `${noteName(root)} ${sc.name.toLowerCase()}`;
  // the root buttons name each key as this scale is written in it
  $$('#page-scales [data-roots] button').forEach(b => { b.textContent = noteName(scaleRootName(parseNote(b.dataset.v).pc, sc.iv)); });
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
  // Piano mode: the notes Play uses, with their fingers, or the chord from the scale, marked strongly; the same
  // notes in other octaves faint. The scale is also written out, with the fingering for both hands.
  if (pianoMode()) renderPianoScale(sc, root, tones, ch, keys);
  else renderKeys($('scKeys'), { byPc: keys });
  setPressed($('scOct'), state.scaleOct);
  const bands = [];
  if (area) bands.push({ lo: area.lo, hi: area.hi, label: area.lo === 0 ? 'Open position' : `Frets ${area.lo}–${area.hi}` });
  if (SC.playing && SC.playing.piano) { /* the piano plays, the neck only shows the scale */ }
  else if (SC.playing && (!area || SC.playing.lo !== area.lo)) bands.push({ lo: SC.playing.lo, hi: SC.playing.hi, label: 'Playing', cls: 'active' });
  else if (SC.playing) bands[0].cls = 'active';
  renderNeck($('scNeck'), { bands, dots });
  const roles = new Set((ch ? tonesOf(ch.root, ch.chord.iv) : tones).map(t => t.role));
  $('scLegend').innerHTML = legendHtml(['root', 'third', 'fifth', 'seventh', 'other'].filter(k => roles.has(k)));

  $('scHint').textContent = ch && pianoMode()
    ? `The marked keys are ${chordSymbol(ch.root, ch.chord.id)}, the ${ch.roman} chord, in root position near middle C. Faint dots are the notes of the scale. Click the chord again to go back to the scale.`
    : ch
    ? `Coloured dots are ${chordSymbol(ch.root, ch.chord.id)}, the ${ch.roman} chord, labelled from its own root. Rings are the other notes of the scale. Click the chord again to go back to the scale.`
    : pianoMode()
      ? `Play runs the scale ${{ updown: 'up and back down', up: 'up', down: 'down' }[state.scaleDir]} over ${state.scaleOct === 2 ? 'two octaves' : 'one octave'} with ${{ right: 'the right hand', left: 'the left hand', both: 'both hands' }[state.scaleHand]}. ` +
        (state.scaleFingers ? (state.scaleHand === 'both' ? 'With both hands the keys show the notes, and the fingering is in the notation: the right hand above, the left below. ' : 'The numbers on the keys are the fingers. ') : '') +
        'Faint dots are the same notes in other octaves.'
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

// Piano mode: the keyboard, with the hands that play and their fingers, and the scale written on a grand staff
function renderPianoScale(sc, root, tones, ch, keys) {
  const parts = scaleParts(), hands = playingHands(), up = handRun('right').length;
  const faint = new Map([...keys].map(([pc, t]) => [pc, { ...t, cls: (t.cls || t.role) + ' faint' }]));
  let strong;
  if (ch) strong = pianoMarks(keyChordVoicing(ch), tonesOf(ch.root, ch.chord.iv));
  else {
    strong = new Map();
    const label = state.scaleFingers && hands.length === 1;
    hands.forEach(h => (h === 'right' ? handRun('right') : handRun('left')).forEach(x => {
      const t = tones.find(y => y.pc === x.m % 12);
      strong.set(x.m, label ? { ...t, label: String(x.finger) } : t);
    }));
  }
  renderKeys($('scKeys'), { byMidi: strong, byPc: faint, octaves: 5 });
  const sig = keySignature(root, sc.id);
  const bars = parts.right.map((x, i) => state.scaleDir === 'updown' && i >= up ? 1 : 0);
  $('scStaff').innerHTML = scaleStaffSvg(parts, { sig, bars, fingers: state.scaleFingers, hands }).svg;
  const n = sig ? sig.letters.length : 0, kind = sig && sig.acc > 0 ? 'sharp' : 'flat';
  $('scStaffInfo').textContent = (sig
    ? `Key signature: ${n ? `${n} ${kind}${n > 1 ? 's' : ''}` : 'no sharps or flats'}, as in ${SIG_KEYS[sig.acc * n]}.` +
      (KEY_OF_SCALE[sc.id] ? ` The scale is written in ${noteName(root)} ${KEY_OF_SCALE[sc.id]}, so its notes outside that key get an accidental.` : '')
    : 'No key signature: this key would need double sharps or flats, so each note that needs one has its own accidental.') +
    ' Right hand in the treble clef, left hand in the bass clef.' + (state.scaleFingers ? ' The numbers are fingers: 1 is the thumb, 5 the little finger.' : '');
  setPressed($('scDir'), state.scaleDir);
  setPressed($('scHand'), state.scaleHand);
  $('scFingers').checked = !!state.scaleFingers;
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
    onButton($('scOct'), b => { state.scaleOct = +b.dataset.v; save(); stopAll(); renderScales(); });
    onButton($('scDir'), b => { state.scaleDir = b.dataset.v; save(); stopAll(); renderScales(); });
    onButton($('scHand'), b => { state.scaleHand = b.dataset.v; save(); stopAll(); renderScales(); });
    $('scFingers').addEventListener('change', e => { state.scaleFingers = e.target.checked; save(); renderScales(); });
    // a note in the notation plays that note
    $('scStaff').addEventListener('click', e => { const g = e.target.closest('.st-n'); if (g) { stopAll(); playPiano([+g.dataset.m]); } });
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
    if (!pianoMode() && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); stepArea(e.key === 'ArrowLeft' ? -1 : 1); }
  }
};
