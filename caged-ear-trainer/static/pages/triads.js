/* Triads: three-note chords on three neighbouring strings, from an open chord with or without a capo */
const INV_SHORT = ['Root', '1st inv.', '2nd inv.'];
const INV_FULL = ['Root position', '1st inversion', '2nd inversion'];
const BASS_ROLE = ['the root', 'the third', 'the fifth'];
const setName = low => [low, low + 1, low + 2].map(stringName).join(' ');
const chordLabel = (rootName, q) => `${noteName(rootName)} ${q === 'min' ? 'minor' : 'major'}`;
// Triad notes, with the names they have in the shape without a capo (shapeName) for the Shape names labels
const triadTones = (root, q, shapeRoot) => TRIAD_IVS[q].map(iv => ({
  iv, pc: (parseNote(root).pc + IV[iv][0]) % 12, role: role(iv), name: spell(root, iv), shapeName: spell(shapeRoot, iv)
}));
const openShape = (ch, capo) => {
  const frets = ch.f.map(f => f < 0 ? -1 : f + capo), played = frets.filter(f => f >= 0);
  return { open: true, strings: [0, 1, 2, 3, 4, 5], frets, lo: Math.min(...played), hi: Math.max(...played) };
};
// A whole shape is strummed. A triad is strummed and then played note by note.
function playPosition(p, at = 0) {
  strum(p, at);
  if (!p.open) p.frets.forEach((f, k) => play(TUNING[p.strings[k]] + f, at + 0.7 + k * 0.28, state.inst, noteKey(p.strings[k], f)));
}

function triadView() {
  const ch = OPEN_CHORDS.find(c => c.id === state.triShape) || OPEN_CHORDS[2];
  const capo = +state.capo || 0;
  const soundRoot = capoChord(ch, capo), rp = parseNote(soundRoot).pc;
  const tones = triadTones(soundRoot, ch.q, ch.root);
  const sets = state.triSet === 'all' ? [3, 2, 1, 0] : [+state.triSet];
  const positions = [openShape(ch, capo), ...sets.flatMap(low => triadVoicings(rp, ch.q, low, capo))];
  let pos = state.triPos === 'all' ? 'all' : +state.triPos;
  if (pos !== 'all' && !(pos >= 0 && pos < positions.length)) pos = 0;
  const chordName = noteName(soundRoot) + (ch.q === 'min' ? 'm' : '');
  return {
    title: capo ? `${chordName}, ${ch.id} shape with capo on fret ${capo}` : `${chordName}, open ${ch.id} shape`,
    ivs: TRIAD_IVS[ch.q], tones, ch, capo, positions, pos, multiSet: sets.length > 1
  };
}
function stepPosition(delta) {
  const v = triadView(), n = v.positions.length;
  const cur = v.pos === 'all' ? (delta > 0 ? -1 : 0) : v.pos;
  state.triPos = (cur + delta + n) % n;
  save(); stopAll(); renderTriads();
  if (state.triAuto) playPosition(triadView().positions[state.triPos]);
}
function playTriadView() {
  stopAll();
  const v = triadView();
  if (v.pos === 'all') v.positions.forEach((p, i) => playPosition({ ...p, open: true }, i * 1.1));
  else playPosition(v.positions[v.pos]);
}

function renderSetPickers() {
  $$('[data-triset]').forEach(el => {
    el.innerHTML = ['3', '2', '1', '0'].map(k => `<button data-v="${k}" aria-pressed="${state.triSet === k}">${setName(+k)}</button>`).join('') +
      `<button data-v="all" aria-pressed="${state.triSet === 'all'}">All</button>`;
  });
}

function renderTriadExplore() {
  const v = triadView();
  $('triShapeSel').value = v.ch.id;
  $('capoSel').value = String(v.capo);
  $('triAuto').checked = !!state.triAuto;
  $('trTitle').textContent = v.title;
  $('trFormula').innerHTML = `<span><b>Degrees</b>${v.ivs.map(ivFmt).join(' ')}</span><span><b>Intervals</b>${v.ivs.map(intervalName).join(' ')}</span><span><b>Notes</b>${v.tones.map(t => t.name).join(' ')}</span>` +
    (v.capo ? `<span><b>As shape</b>${v.tones.map(t => t.shapeName).join(' ')}</span>` : '');
  $('trPlay').textContent = v.pos === 'all' ? 'Play all positions' : 'Play the position';
  const bassCls = ['root', 'third', 'fifth'];
  $('posChips').innerHTML = v.positions.map((p, i) => {
    const label = p.open ? (v.capo ? 'Shape with capo' : 'Open chord') : `${v.multiSet ? setName(p.strings[0]) + ', ' : ''}${INV_SHORT[p.inversion]} ${p.lo}`;
    const title = p.open ? 'The starting shape' : `${INV_FULL[p.inversion]}, ${setName(p.strings[0])} strings, frets ${p.lo} to ${p.hi}`;
    return `<button data-i="${i}" aria-pressed="${v.pos === i}" title="${title}">${p.open ? '' : `<i class="sw ${bassCls[p.inversion]}"></i>`}${label}</button>`;
  }).join('') + `<button data-i="all" aria-pressed="${v.pos === 'all'}">All</button>`;

  // The chosen position is bright, the others faint
  const strongKeys = new Set(), faintKeys = new Set();
  v.positions.forEach((p, i) => positionKeys(p).forEach(k => (v.pos === 'all' || v.pos === i ? strongKeys : faintKeys).add(k)));
  const dots = [];
  const dotAt = (k, extra) => { const [st, f] = k.split(':').map(Number), t = v.tones.find(x => x.pc === (TUNING[st] + f) % 12); dots.push({ st, f, item: t, cls: t.role + extra }); };
  faintKeys.forEach(k => { if (!strongKeys.has(k)) dotAt(k, ' faint'); });
  strongKeys.forEach(k => dotAt(k, ''));
  const p = v.pos === 'all' ? null : v.positions[v.pos];
  renderNeck($('trNeck'), {
    capo: v.capo, dots,
    bands: p ? [{ lo: p.lo, hi: p.hi, label: p.open ? 'Shape' : INV_SHORT[p.inversion] }] : [],
    mutes: v.pos === 'all' || v.pos === 0 ? mutedStrings(v.positions[0]) : []
  });
  renderKeys($('trKeys'), p ? { byMidi: midiMarks(p, v.tones) } : { byPc: new Map(v.tones.map(t => [t.pc, t])) });
  $('trLegend').innerHTML = legendHtml(['root', 'third', 'fifth']);

  let first = '';
  if (p && p.open) first = `${v.capo ? 'The shape with the capo' : 'The open chord'} is the starting point. `;
  else if (p) first = `${INV_FULL[p.inversion]} on the ${setName(p.strings[0])} strings, frets ${p.lo} to ${p.hi}. The lowest note is ${BASS_ROLE[p.inversion]}, ${v.tones.find(x => x.iv === p.ivs[0]).name}. `;
  $('trHint').textContent = first + 'The order root position, 1st inversion, 2nd inversion repeats up the neck and starts again twelve frets higher. ' +
    (v.capo ? 'The capo acts as a new nut, and Shape names shows the notes as they are called in the shape without a capo.' : 'Choose a capo to move the whole system up. The ← → keys step through the positions.');
}

/* --- Practice --- */
// Four answers: the right one, the same chord in another inversion, the other quality, and another root
function recognizeOptions(rp, q, inv) {
  const label = (r, qq, i) => `${chordLabel((qq === 'min' ? MINOR_ROOTS : ROOTS)[r], qq)}, ${INV_FULL[i].toLowerCase()}`;
  const other = q === 'min' ? 'maj' : 'min';
  return fourOptions(label(rp, q, inv), [
    label(rp, q, pickOne([0, 1, 2].filter(i => i !== inv))),
    label(rp, other, inv),
    label((rp + pickOne([2, 5, 7, 9])) % 12, q, inv),
    label((rp + pickOne([3, 4, 8])) % 12, other, pickOne([0, 1, 2]))
  ]);
}
function makeTriadTask() {
  for (let attempt = 0; attempt < 50; attempt++) {
    const ch = pickOne(OPEN_CHORDS);
    const capo = state.pRandCapo ? Math.floor(Math.random() * 8) : (+state.capo || 0);
    const root = capoChord(ch, capo), rp = parseNote(root).pc;
    const low = state.triSet === 'all' ? Math.floor(Math.random() * 4) : +state.triSet;
    const voicings = triadVoicings(rp, ch.q, low, capo);
    const tones = triadTones(root, ch.q, ch.root);
    const name = chordLabel(root, ch.q), capoTxt = capo ? `Capo on fret ${capo}.` : 'No capo.';
    const detail = (inv) => `The notes are ${tones.map(x => x.name).join(' ')}${capo ? `, called ${tones.map(x => x.shapeName).join(' ')} in the shape` : ''}. ` +
      `The lowest note is ${BASS_ROLE[inv]}, ${tones[inv].name}.`;
    if (state.pType === 'play' && (Math.random() < 0.25 || !voicings.length)) {
      const shape = openShape(ch, capo);
      return { kind: 'play', capo, tones, target: shape, accepted: [shape], prompt: `Play ${name} with the ${ch.id} shape. ${capoTxt}`,
        detail: detail(0), item: `${ch.id} shape with capo` };
    }
    if (!voicings.length) continue;
    const v = pickOne(voicings);
    const item = `${ch.q === 'min' ? 'Minor' : 'Major'}, ${INV_FULL[v.inversion].toLowerCase()}`;
    if (state.pType === 'recognize') {
      return { kind: 'name', capo, tones, target: v, accepted: [v], prompt: `Which triad is this?${capo ? ` Capo on fret ${capo}.` : ''}`,
        options: recognizeOptions(rp, ch.q, v.inversion), detail: detail(v.inversion), item };
    }
    return { kind: 'play', capo, tones, target: v, accepted: voicings.filter(x => x.inversion === v.inversion),
      prompt: `Play ${name} in ${INV_FULL[v.inversion].toLowerCase()} on the ${setName(low)} strings. ${capoTxt}`,
      detail: detail(v.inversion), item, acceptNote: 'The same inversion twelve frets away also counts as correct.' };
  }
  return null;
}
const TPD = makeDrill({
  prefix: 'tp', page: 'triads', exercises: { play: 'triad_play', name: 'triad_recognize' },
  timerKey: () => state.pType === 'play' ? 'triad_play' : 'triad_recognize',
  make: makeTriadTask, playPos: playPosition,
  bandLabel: p => p.open ? 'Shape' : INV_SHORT[p.inversion], render: () => renderTriads('practice')
});

function renderTriadPractice() {
  setPressed($('tpType'), state.pType);
  $('tpRandCapo').checked = !!state.pRandCapo;
  $('tpCapo').value = String(+state.capo || 0);
  $('f-tpcapo').hidden = !!state.pRandCapo;
  TPD.renderStage(state.pType === 'play'
    ? 'Press “New task”. Play it on your guitar, then click the notes on the fretboard and choose Check, or choose Show answer.'
    : 'Press “New task”. The fretboard shows a triad, and you choose which chord and inversion it is.');
  const t = TPD.task;
  renderNeck($('trNeck'), TPD.neck(state.pRandCapo ? 0 : +state.capo || 0));
  renderKeys($('trKeys'), t && TPD.revealed() ? { byMidi: midiMarks(t.kind === 'play' ? TPD.shown() : t.target, t.tones) } : {});
  $('trLegend').innerHTML = legendHtml(['root', 'third', 'fifth']);
  $('trHint').textContent = 'Tasks use the eight open chords, the string set you have chosen and, if selected, a random capo. The label choice applies when the answer is shown.';
}

function renderTriads(sub = current.sub) {
  renderSetPickers();
  if (sub === 'practice') renderTriadPractice(); else renderTriadExplore();
}

PAGES.triads = {
  title: 'Triads',
  subs: ['explore', 'practice'],
  init() {
    $('triShapeSel').innerHTML = OPEN_CHORDS.map(c => `<option value="${c.id}">${c.id}</option>`).join('');
    const capoOpts = Array.from({ length: 13 }, (_, i) => `<option value="${i}">${i === 0 ? 'None' : 'Fret ' + i}</option>`).join('');
    $('capoSel').innerHTML = capoOpts;
    $('tpCapo').innerHTML = capoOpts;
    $('triShapeSel').addEventListener('change', e => { state.triShape = e.target.value; state.triPos = 0; save(); stopAll(); renderTriads(); });
    const setCapo = e => { state.capo = +e.target.value; state.triPos = 0; TPD.clear(); save(); stopAll(); renderTriads(); };
    $('capoSel').addEventListener('change', setCapo);
    $('tpCapo').addEventListener('change', setCapo);
    $('triAuto').addEventListener('change', e => { state.triAuto = e.target.checked; save(); });
    $$('[data-triset]').forEach(el => onButton(el, b => { state.triSet = b.dataset.v; state.triPos = 0; save(); renderTriads(); }));
    onButton($('posChips'), b => {
      state.triPos = b.dataset.i === 'all' ? 'all' : +b.dataset.i; save(); stopAll(); renderTriads();
      if (state.triAuto && state.triPos !== 'all') playPosition(triadView().positions[state.triPos]);
    });
    $('posPrev').addEventListener('click', () => stepPosition(-1));
    $('posNext').addEventListener('click', () => stepPosition(1));
    $('trPlay').addEventListener('click', playTriadView);
    onButton($('tpType'), b => { state.pType = b.dataset.v; TPD.clear(); save(); stopAll(); renderTriads(); });
    $('tpRandCapo').addEventListener('change', e => { state.pRandCapo = e.target.checked; save(); renderTriads(); });
    TPD.bind();
  },
  render: renderTriads,
  onNeck(key, m, sub) { if (sub === 'practice') TPD.tap(key); },
  keys(e, sub, buttonFocused) {
    if (sub === 'practice') return TPD.keys(e, buttonFocused);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); stepPosition(e.key === 'ArrowLeft' ? -1 : 1); }
  }
};
