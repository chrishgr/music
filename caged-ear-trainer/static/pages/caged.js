/* CAGED: the five shapes of one chord (major, minor, 7, m7 or maj7), how they join up the neck,
   what changes from the major shapes, and practice. */
const CG = { playing: null };   // { letter, lo } of the shape sounding during "Play all five"
const CAGED_NAME = { maj: 'Major', min: 'Minor', '7': 'Dominant 7', m7: 'Minor 7', maj7: 'Major 7' };
const CAGED_NOTES = {
  maj: 'The five shapes are the open chords C, A, G, E and D moved up the neck with a barre in place of the nut.',
  min: 'Each minor shape is its major shape with every third lowered one fret, which gives the minor third (♭3). Where the third is an open string in the open chord it cannot go lower: the C shape leaves out the high e string, and the G shape plays the fifth on the B string instead.',
  '7': 'A dominant seventh is a major triad plus the minor seventh (♭7), a whole step below the root. In the A, G, E and D shapes one root moves down two frets to become the ♭7. In the C shape the root on the B string cannot go lower, so the fifth on the G string moves up three frets instead.',
  m7: 'A minor seventh is a minor triad plus the minor seventh (♭7). Start from the minor shape: in the A, G, E and D shapes one root moves down two frets to the ♭7, and in the C shape the fifth on the G string moves up three frets.',
  maj7: 'A major seventh is a major triad plus the major seventh (7), a half step below the root. In every shape one root moves down one fret to become the 7.'
};
const cagedTitle = (root, q) => q === 'maj' ? `${noteName(root)} major` : q === 'min' ? `${noteName(root)} minor` : `${chordSymbol(root, q)} (${chordById(q).name.toLowerCase()})`;
// All shapes on the neck, and the first of each letter in the order they come up the neck
function cagedShapesNow() {
  const all = chordShapes(rootPc(), state.cagedQ);
  return { all, five: all.filter((s, i) => all.findIndex(x => x.letter === s.letter) === i) };
}
// What is different from the major shape with the same letter in the same place
function shapeChanges(p, root) {
  const maj = gripOf('maj', p.letter).map(x => x === null ? -1 : x + p.base);
  const majTones = tonesOf(root, CHORDS[0].iv), tones = tonesOf(root, chordById(p.q).iv);
  const at = (list, st, f) => list.find(t => t.pc === (TUNING[st] + f) % 12);
  const out = [];
  for (let st = 0; st < 6; st++) {
    const a = maj[st], b = p.frets[st];
    if (a !== b) out.push({ st, a, b, from: a < 0 ? null : at(majTones, st, a), to: b < 0 ? null : at(tones, st, b) });
  }
  return out;
}
const sameShape = (s, t) => !!t && s.letter === t.letter && s.lo === t.lo;
function walkShapes() {
  stopAll();
  const { five } = cagedShapesNow(), step = 1.6;
  five.forEach((s, i) => { later(i * step, () => { CG.playing = { letter: s.letter, lo: s.lo }; renderCaged(); }); strum(s, i * step); });
  later(five.length * step, () => { CG.playing = null; renderCaged(); });
}
function playChosenShape(how = strum) {
  const { all } = cagedShapesNow(), s = all.find(x => x.letter === state.shape);
  stopAll(); if (s) how(s);
}

function renderCagedExplore() {
  const q = state.cagedQ, c = chordById(q), tones = tonesOf(state.root, c.iv);
  const { all, five } = cagedShapesNow();
  const single = state.shape !== 'all';
  const shown = single ? all.filter(s => s.letter === state.shape) : all;
  const compare = q !== 'maj' && state.cagedCompare;

  $('cgQ').innerHTML = CAGED_QUALITIES.map(k =>
    `<button data-v="${k}" aria-pressed="${k === q}" title="${CAGED_NAME[k]}">${chordSymbol(state.root, k)}</button>`).join('');
  setPressed($('cgShape'), state.shape);
  const fits = scalesContaining(c.iv);
  if (state.cagedScale && !fits.some(s => s.id === state.cagedScale)) state.cagedScale = CAGED_SCALE[q];
  $('cgScale').innerHTML = '<option value="">None</option>' + fits.map(s =>
    `<option value="${s.id}">${noteName(state.root)} ${s.name.toLowerCase()}${s.id === CAGED_SCALE[q] ? ' (the usual choice)' : ''}</option>`).join('');
  $('cgScale').value = state.cagedScale;
  $('f-compare').hidden = q === 'maj';
  $('cgCompare').checked = !!state.cagedCompare;

  $('cgTitle').textContent = single
    ? `${cagedTitle(state.root, q)}, ${state.shape} shape, ${fretRange(shown[0])}`
    : `${cagedTitle(state.root, q)}, all five CAGED shapes`;
  $('cgFormula').innerHTML = `<span><b>Degrees</b>${c.iv.map(ivFmt).join(' ')}</span><span><b>Intervals</b>${c.iv.map(intervalName).join(' ')}</span><span><b>Notes</b>${tones.map(t => t.name).join(' ')}</span>`;
  $('cgPlay').hidden = $('cgArp').hidden = !single;
  $('cgWalk').className = single ? 'ghost' : 'primary';
  $('cgBoxes').innerHTML = five.map((s, i) => chordBoxButton(s, tones, {
    i, title: `${s.letter} shape`, sub: fretRange(s), pressed: state.shape === s.letter, playing: sameShape(s, CG.playing)
  })).join('');

  // Neck: the shapes in bright colours, the rest of the chord faint, the scale as rings, changes from major dashed
  const strong = new Set(shown.flatMap(positionKeys));
  const dots = neckDots(tones, { keep: (st, f) => !strong.has(noteKey(st, f)), cls: t => t.role + ' faint' });
  if (state.cagedScale) {
    const sc = SCALES.find(s => s.id === state.cagedScale), chordPcs = new Set(tones.map(t => t.pc));
    const near = f => !single || shown.some(s => f >= s.lo - 1 && f <= s.hi + 1);
    dots.push(...neckDots(tonesOf(state.root, sc.iv), { keep: (st, f, t) => !chordPcs.has(t.pc) && near(f), cls: () => 'ring', r: 8 }));
  }
  const changed = new Set(), changes = [];
  if (compare) shown.forEach(s => shapeChanges(s, state.root).forEach(ch => {
    changes.push({ s, ...ch });
    if (ch.a >= 0) dots.push({ st: ch.st, f: ch.a, item: ch.from, cls: 'ghost', r: 10 });
    if (ch.b >= 0) changed.add(noteKey(ch.st, ch.b));
  }));
  shown.forEach(s => positionDots(s, tones).forEach(d => dots.push(changed.has(noteKey(d.st, d.f)) ? { ...d, cls: d.cls + ' changed' } : d)));
  const bands = shown.map((s, i) => ({ lo: s.lo, hi: s.hi, label: s.letter, cls: sameShape(s, CG.playing) ? 'active' : i % 2 ? 'alt' : '' }));
  renderNeck($('cgNeck'), { bands, dots, mutes: single ? mutedStrings(shown[0]) : [] });
  const playing = CG.playing && all.find(s => sameShape(s, CG.playing));
  const one = playing || (single ? shown[0] : null);
  renderKeys($('cgKeys'), one ? { byMidi: midiMarks(one, tones) } : { byPc: new Map(tones.map(t => [t.pc, t])) });
  $('cgKeysTitle').textContent = one ? `The ${one.letter} shape on the piano` : 'The same notes on the piano';
  const roles = new Set(tones.map(t => t.role));
  $('cgLegend').innerHTML = legendHtml(['root', 'third', 'fifth', 'seventh'].filter(k => roles.has(k)).concat(state.cagedScale ? ['other'] : [], compare ? ['ghost'] : []));

  const order = five.map(s => s.letter);
  let hint = `<p>${CAGED_NOTES[q]}</p><p>Going up the neck from the lowest position the shapes come in the order ${order.join(', ')}. The order is always a rotation of C A G E D, and neighbouring shapes share notes where they overlap. ${single ? 'Bright dots are the shape, faint dots are the same chord tones elsewhere on the neck.' : 'Click a chord diagram to look at one shape.'}</p>`;
  if (state.cagedScale) hint += `<p>Rings are the other notes of ${noteName(state.root)} ${SCALES.find(s => s.id === state.cagedScale).name.toLowerCase()}${single ? ', within a fret of the shape' : ''}.</p>`;
  if (compare && single) {
    const list = changes.filter(x => x.s === shown[0]).map(x => `${stringName(x.st)} string: ${x.a < 0 ? 'muted' : `fret ${x.a}, ${x.from.name} (${intervalName(x.from.iv)})`} → ${x.b < 0 ? 'muted' : `fret ${x.b}, ${x.to.name} (${intervalName(x.to.iv)})`}`);
    hint += `<p><b>Changes from the major ${state.shape} shape:</b> ${list.length ? list.join('; ') : 'none'}. Dashed rings mark where the major shape has its notes, and outlined dots are the notes that moved.</p>`;
  } else if (compare) hint += '<p>Dashed rings mark the notes of the major shapes that are changed, and outlined dots are the notes that took their place. Choose one shape to get the list of changes.</p>';
  const chordLink = `<a class="more" href="#/chords" data-chord="${single ? state.shape : five[0].letter}">Open ${chordSymbol(state.root, q)} on the Chords page</a>`;
  const scaleLink = state.cagedScale ? ` · <a class="more" href="#/scales" data-scale="${state.cagedScale}">Open the scale on the Scales page</a>` : '';
  $('cgHint').innerHTML = hint + `<p>${chordLink}${scaleLink}</p>`;
}

/* --- Practice --- */
function makeCagedTask() {
  const qs = state.cpQ.filter(q => CAGED_QUALITIES.includes(q)), letters = state.cpShapes.filter(l => SHAPE_ORDER.includes(l));
  const q = pickOne(qs.length ? qs : ['maj']), letter = pickOne(letters.length ? letters : SHAPE_ORDER);
  const names = q === 'min' || q === 'm7' ? MINOR_ROOTS : ROOTS;
  const root = pickOne(names), rp = parseNote(root).pc;
  const tones = tonesOf(root, chordById(q).iv), insts = shapeInstances(rp, q, letter);
  const target = pickOne(insts), sym = chordSymbol(root, q);
  const bass = positionDots(target, tones)[0];
  const others = insts.filter(s => s !== target).map(s => positionDots(s, tones)[0].f);
  const detail = `${sym} is ${tones.map(t => t.name).join(' ')}. The ${letter} shape has its lowest note, the root ${bass.item.name}, on the ${stringName(bass.st)} string at fret ${bass.f}${others.length ? ` (or fret ${others.join(', ')})` : ''}.`;
  const item = `${CAGED_NAME[q]}, ${letter} shape`;
  if (state.cpType === 'play') {
    return { kind: 'play', capo: 0, tones, target: insts[0], accepted: insts, prompt: `Play ${sym} with the ${letter} shape.`, detail, item,
      acceptNote: 'The same shape twelve frets away also counts as correct.' };
  }
  const label = (r, qq, l) => `${l} shape, ${chordSymbol(r, qq)}`;
  const otherQ = CAGED_QUALITIES.filter(x => x !== q), otherL = SHAPE_ORDER.filter(l => l !== letter);
  const pool = shuffle([
    label(root, q, pickOne(otherL)),
    label(root, pickOne(otherQ), letter),
    label(names[(rp + pickOne([2, 5, 7, 10])) % 12], q, letter),
    label(root, pickOne(otherQ), pickOne(otherL))
  ]);
  return { kind: 'name', capo: 0, tones, target, accepted: [target], prompt: 'Which CAGED shape is this, and which chord?',
    options: fourOptions(label(root, q, letter), pool), detail, item };
}
const CPD = makeDrill({
  prefix: 'cp', exercises: { play: 'caged_play', name: 'caged_recognize' },
  make: makeCagedTask, playPos: p => strum(p), bandLabel: p => `${p.letter} shape`, render: () => renderCaged('practice')
});

function renderCagedPractice() {
  setPressed($('cpType'), state.cpType);
  $('cpQ').innerHTML = CAGED_QUALITIES.map(q => `<button data-v="${q}" aria-pressed="${state.cpQ.includes(q)}">${CAGED_NAME[q]}</button>`).join('');
  $('cpShapes').innerHTML = SHAPE_ORDER.map(l => `<button data-v="${l}" aria-pressed="${state.cpShapes.includes(l)}">${l} shape</button>`).join('');
  CPD.renderStage(state.cpType === 'play'
    ? 'Press “New task”. Find the shape on your guitar, click its notes on the neck and choose Check.'
    : 'Press “New task”. The neck shows a grip in grey, and you choose which shape and chord it is.');
  const m = CPD.neck(0), t = CPD.task;
  renderNeck($('cgNeck'), m);
  renderKeys($('cgKeys'), t && CPD.revealed() ? { byMidi: midiMarks(t.kind === 'play' ? CPD.shown() : t.target, t.tones) } : {});
  $('cgKeysTitle').textContent = 'The answer on the piano';
  const roles = new Set(t ? t.tones.map(x => x.role) : ['root', 'third', 'fifth']);
  $('cgLegend').innerHTML = legendHtml(['root', 'third', 'fifth', 'seventh'].filter(k => roles.has(k)));
  $('cgHint').innerHTML = '<p>Tasks use a random root with the chords and shapes you have selected. Every shape has the root as its lowest note, so find the root on the right string first, then build the shape around it. The Explore tab shows every shape with Compare with the major shape.</p>';
}

function renderCaged(sub = current.sub) {
  if (sub === 'practice') renderCagedPractice(); else renderCagedExplore();
}

PAGES.caged = {
  title: 'CAGED',
  subs: ['explore', 'practice'],
  init() {
    onButton($('cgQ'), b => {
      const had = state.cagedScale;
      state.cagedQ = b.dataset.v;
      if (had) state.cagedScale = CAGED_SCALE[state.cagedQ];
      save(); stopAll(); renderCaged();
      if (state.shape !== 'all') playChosenShape();
    });
    onButton($('cgShape'), b => { state.shape = b.dataset.v; save(); stopAll(); renderCaged(); if (state.shape !== 'all') playChosenShape(); });
    $('cgScale').addEventListener('change', e => { state.cagedScale = e.target.value; save(); renderCaged(); });
    $('cgCompare').addEventListener('change', e => { state.cagedCompare = e.target.checked; save(); renderCaged(); });
    onButton($('cgBoxes'), b => {
      const s = cagedShapesNow().five[+b.dataset.i];
      state.shape = s.letter; save(); stopAll(); renderCaged(); strum(s);
    });
    $('cgPlay').addEventListener('click', () => playChosenShape(strum));
    $('cgArp').addEventListener('click', () => playChosenShape(p => arpeggio(p)));
    $('cgWalk').addEventListener('click', walkShapes);
    $('cgHint').addEventListener('click', e => {
      const a = e.target.closest('a'); if (!a) return;
      if (a.dataset.chord) { state.chord = state.cagedQ; state.chordShape = a.dataset.chord; CH.sel = null; }
      if (a.dataset.scale) { state.scale = a.dataset.scale; state.scalePos = 'all'; }
      save();
    });
    onButton($('cpType'), b => { state.cpType = b.dataset.v; CPD.clear(); save(); stopAll(); renderCaged(); });
    const toggle = (key, v) => {
      const list = state[key], i = list.indexOf(v);
      if (i >= 0 && list.length > 1) list.splice(i, 1); else if (i < 0) list.push(v);
      save(); renderCaged();
    };
    onButton($('cpQ'), b => toggle('cpQ', b.dataset.v));
    onButton($('cpShapes'), b => toggle('cpShapes', b.dataset.v));
    CPD.bind();
    STOP_HOOKS.push(() => { if (CG.playing) { CG.playing = null; if (current && current.page === 'caged') renderCaged(); } });
  },
  render: renderCaged,
  onRoot(sub) { return sub === 'explore' && state.shape !== 'all' ? () => playChosenShape() : null; },
  onNeck(key, m, sub) { if (sub === 'practice') CPD.tap(key); },
  keys(e, sub, buttonFocused) {
    if (sub === 'practice') return CPD.keys(e, buttonFocused);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const opts = [...cagedShapesNow().five.map(s => s.letter), 'all'], i = opts.indexOf(state.shape);   // in the order up the neck
      state.shape = opts[(i + (e.key === 'ArrowLeft' ? -1 : 1) + opts.length) % opts.length];
      save(); stopAll(); renderCaged(); if (state.shape !== 'all') playChosenShape();
    }
  }
};
