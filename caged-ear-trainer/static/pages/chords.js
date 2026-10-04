/* Chords: every chord type with movable grips. Clicking a chord diagram chooses the grip,
   and the neck, the piano and every Play button then use exactly that grip. */
const CH = { sel: null, playing: null };   // sel: index of the chosen grip. playing: the grip sounding during "Play every grip"
const TRIAD_TYPES = ['maj', 'min', 'dim', 'aug', 'sus2', 'sus4'];
const SEVENTH_TYPES = ['7', 'maj7', 'm7', 'm7b5', 'dim7', 'mmaj7', 'maj7s5', 'add9'];
const CHORD_NOTES = {
  maj: 'A major triad is the root, the major third (4 semitones up) and the perfect fifth (7 semitones). It is the I, IV and V chord of a major key.',
  min: 'A minor triad is the root, the minor third (3 semitones up) and the perfect fifth. It is the ii, iii and vi chord of a major key.',
  dim: 'Two minor thirds on top of each other: root, ♭3 and ♭5. It sounds tense and wants to move on, often as the vii° chord of a major key.',
  aug: 'Two major thirds on top of each other: root, 3 and ♯5. The thirds split the octave in three equal parts, so the same grip four frets higher has the same notes.',
  sus2: 'The third is replaced by the major second, so the chord is neither major nor minor. The suspended note often moves to the third afterwards.',
  sus4: 'The third is replaced by the perfect fourth, so the chord is neither major nor minor. The fourth usually resolves down to the third.',
  '7': 'A major triad with a minor seventh, a whole step below the root. It is the V7 chord of a major key and pulls strongly towards the I chord.',
  maj7: 'A major triad with a major seventh, a half step below the root. It is the Imaj7 and IVmaj7 chord of a major key.',
  m7: 'A minor triad with a minor seventh. It is the ii7, iii7 and vi7 chord of a major key.',
  m7b5: 'A diminished triad with a minor seventh, also written ø7. It is the viiø7 chord of a major key and the iiø7 chord of a minor key.',
  dim7: 'A diminished triad with a diminished seventh, nine semitones above the root: four notes three semitones apart. Moving a grip three frets gives the same four notes.',
  mmaj7: 'A minor triad with a major seventh. It is the first chord of the harmonic minor scale when you stack sevenths.',
  maj7s5: 'An augmented triad with a major seventh. It is the III+maj7 chord of the harmonic minor scale.',
  add9: 'A major triad with the ninth added on top, the same note as the second but an octave higher. Unlike sus2 it keeps the third, so it stays major but sounds more open. Common in acoustic pop, for example Cadd9.'
};
const chordGrips = () => chordShapes(rootPc(), state.chord);
function gripIndex(vs) {
  if (CH.sel !== null && vs[CH.sel]) return CH.sel;
  const i = vs.findIndex(v => v.letter === state.chordShape);
  return i >= 0 ? i : 0;
}
function chordTitle(root, id) {
  const c = chordById(id), rn = noteName(root);
  return id === 'maj' ? `${rn} major` : id === 'min' ? `${rn} minor` : `${rn}${c.sym}, ${c.name.toLowerCase()}`;
}
function playAllGrips() {
  stopAll();
  const vs = chordGrips(), step = 1.5;
  vs.forEach((v, i) => { later(i * step, () => { CH.playing = i; renderChords(); }); strum(v, i * step); });
  later(vs.length * step, () => { CH.playing = null; renderChords(); });
}

function renderChords() {
  const c = chordById(state.chord), tones = tonesOf(state.root, c.iv), vs = chordGrips();
  const sel = gripIndex(vs), p = vs[CH.playing !== null ? CH.playing : sel];
  const chip = id => `<button data-v="${id}" aria-pressed="${id === state.chord}" title="${chordById(id).name}">${chordSymbol(state.root, id)}</button>`;
  $('chTypes3').innerHTML = TRIAD_TYPES.map(chip).join('');
  $('chTypes4').innerHTML = SEVENTH_TYPES.map(chip).join('');
  $('chAll').checked = !!state.chordAll;
  $('chTitle').textContent = chordTitle(state.root, c.id);
  $('chFormula').innerHTML = `<span><b>Degrees</b>${c.iv.map(ivFmt).join(' ')}</span><span><b>Intervals</b>${c.iv.map(intervalName).join(' ')}</span><span><b>Notes</b>${tones.map(t => t.name).join(' ')}</span>`;
  $('chBoxes').innerHTML = vs.map((v, i) => chordBoxButton(v, tones, {
    i, title: `${v.letter} shape`, sub: fretRange(v), pressed: i === sel, playing: i === CH.playing
  })).join('');

  const strong = new Set(positionKeys(p));
  const faint = state.chordAll ? neckDots(tones, { keep: (st, f) => !strong.has(noteKey(st, f)), cls: t => t.role + ' faint' }) : [];
  renderNeck($('chNeck'), {
    bands: [{ lo: p.lo, hi: p.hi, label: `${p.letter} shape`, cls: CH.playing !== null ? 'active' : '' }],
    dots: [...faint, ...positionDots(p, tones)], mutes: mutedStrings(p)
  });
  renderKeys($('chKeys'), { byMidi: midiMarks(p, tones) });
  const roles = new Set(tones.map(t => t.role));
  $('chLegend').innerHTML = legendHtml(['root', 'third', 'fifth', 'seventh', 'other'].filter(k => roles.has(k)));

  // The grip as notes, low string first
  const notes = positionDots(p, tones);
  $('chVoicing').innerHTML = `<b>This grip, low to high:</b> ${notes.map(d => `${d.item.name} (${intervalName(d.item.iv)})`).join(' · ')}` +
    (p.frets.includes(-1) ? ' &nbsp; × in the diagram marks a string you do not play.' : '');
  const used = new Set(notes.map(d => d.item.iv));
  const missing = c.iv.filter(iv => !used.has(iv));
  let hint = CHORD_NOTES[c.id] + ' ';
  if (missing.length) hint += `This grip leaves out the ${missing.map(intervalName).join(' and ')}, which is common in seventh-chord grips: the root, the third and the seventh are what make the chord. `;
  hint += `Each grip is a movable shape named after the open chord it comes from, so the ${p.letter} shape has its root where the open ${p.letter} chord has it.`;
  const fits = scalesContaining(c.iv);
  let links = '';
  if (CAGED_QUALITIES.includes(c.id)) links += `<a class="more" href="#/caged/explore" data-caged="${p.letter}">See all five CAGED shapes for ${chordSymbol(state.root, c.id)} and how they join up</a>`;
  if (fits.length) links += `${links ? '<br>' : ''}Scales with every note of this chord: ${fits.map(s => `<a class="more" href="#/scales" data-scale="${s.id}">${noteName(state.root)} ${s.name.toLowerCase()}</a>`).join(', ')}.`;
  $('chHint').innerHTML = esc(hint) + (links ? `<br>${links}` : '');
}

PAGES.chords = {
  title: 'Chords',
  init() {
    const pickType = (b) => { state.chord = b.dataset.v; CH.sel = null; save(); stopAll(); renderChords(); const vs = chordGrips(); strum(vs[gripIndex(vs)]); };
    onButton($('chTypes3'), pickType);
    onButton($('chTypes4'), pickType);
    $('chAll').addEventListener('change', e => { state.chordAll = e.target.checked; save(); renderChords(); });
    onButton($('chBoxes'), b => {
      const vs = chordGrips(), i = +b.dataset.i;
      CH.sel = i; state.chordShape = vs[i].letter; save();
      stopAll(); renderChords(); strum(vs[i]);
    });
    $('chStrum').addEventListener('click', () => { const vs = chordGrips(); stopAll(); strum(vs[gripIndex(vs)]); });
    $('chArp').addEventListener('click', () => { const vs = chordGrips(); stopAll(); arpeggio(vs[gripIndex(vs)]); });
    $('chWalk').addEventListener('click', playAllGrips);
    // Links to the CAGED and scale pages take the chord with them
    $('chHint').addEventListener('click', e => {
      const a = e.target.closest('a'); if (!a) return;
      if (a.dataset.caged) { state.cagedQ = state.chord; state.shape = a.dataset.caged; }
      if (a.dataset.scale) { state.scale = a.dataset.scale; state.scalePos = 'all'; }
      save();
    });
    STOP_HOOKS.push(() => { if (CH.playing !== null) { CH.playing = null; if (current && current.page === 'chords') renderChords(); } });
  },
  render: renderChords,
  onRoot() { CH.sel = null; const vs = chordGrips(); return () => strum(vs[gripIndex(vs)]); },
  keys(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const vs = chordGrips(), i = (gripIndex(vs) + (e.key === 'ArrowLeft' ? -1 : 1) + vs.length) % vs.length;
      CH.sel = i; state.chordShape = vs[i].letter; save(); stopAll(); renderChords(); strum(vs[i]);
    }
  }
};
