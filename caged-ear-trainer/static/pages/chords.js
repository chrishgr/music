/* Chords: every chord type with movable grips on the guitar, or with piano voicings in piano mode.
   Clicking a chord diagram chooses the grip, and the neck, the piano and every Play button then use exactly
   that grip. In piano mode the diagrams are voicing buttons instead (root position, the inversions and two
   hands): the chosen voicing sets the piano, the text and the Play buttons, and the neck below shows the
   chord on the guitar without following the piano. */
const CH = { sel: null, playing: null };   // sel: index of the chosen grip. playing: the grip or voicing sounding during "Play every .."
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
// Where the text above talks about guitar grips, the piano gets its own
const PIANO_CHORD_NOTES = {
  aug: 'Two major thirds on top of each other: root, 3 and ♯5. The thirds split the octave in three equal parts, so every inversion has the same shape on the keys, four semitones and four more.',
  dim7: 'A diminished triad with a diminished seventh, nine semitones above the root: four notes three semitones apart. Every inversion has the same shape on the keys and is also the dim7 chord of its lowest note.',
  add9: 'A major triad with the ninth added, the same note as the second. Unlike sus2 it keeps the third, so it stays major but sounds more open. In close position the ninth sits next to the root (C D E G); played an octave higher on top (C E G D) it is the same chord with a wider sound.'
};
// The chord tone at the bottom of an inversion, in words
const BOTTOM_WORD = { '1': 'root', '2': 'second', b3: 'third', '3': 'third', '4': 'fourth', b5: 'fifth', '5': 'fifth', '#5': 'fifth', bb7: 'seventh', b7: 'seventh', '7': 'seventh' };
const ORDINAL = ['', '1st', '2nd', '3rd'];
const chordGrips = () => chordShapes(rootPc(), state.chord);
function gripIndex(vs) {
  if (CH.sel !== null && vs[CH.sel]) return CH.sel;
  const i = vs.findIndex(v => v.letter === state.chordShape);
  return i >= 0 ? i : 0;
}
// Piano voicings of the chord. The chosen one is kept by name, so 1st inversion stays chosen when the chord changes.
const chordVoicings = () => pianoVoicings(rootPc(), chordById(state.chord).iv);
function voicingIndex(vs) {
  const i = vs.findIndex(v => v.id === state.pianoVoicing);
  return i >= 0 ? i : 0;
}
const chosenVoicing = () => { const vs = chordVoicings(); return vs[voicingIndex(vs)]; };
function chordTitle(root, id) {
  const c = chordById(id), rn = noteName(root);
  return id === 'maj' ? `${rn} major` : id === 'min' ? `${rn} minor` : `${rn}${c.sym}, ${c.name.toLowerCase()}`;
}
// The Play buttons: the chosen grip on the guitar, or the chosen voicing on the piano
function playChord(broken = false) {
  stopAll();
  if (pianoMode()) { const v = chosenVoicing(); if (broken) playPianoBroken(v.notes); else playPiano(v.notes); return; }
  const vs = chordGrips(), g = vs[gripIndex(vs)];
  if (broken) arpeggio(g); else strum(g);
}
function playAllGrips() {
  stopAll();
  const vs = pianoMode() ? chordVoicings() : chordGrips(), step = pianoMode() ? 1.6 : 1.5;
  vs.forEach((v, i) => {
    later(i * step, () => { CH.playing = i; renderChords(); });
    if (pianoMode()) playPiano(v.notes, { at: i * step }); else strum(v, i * step);
  });
  later(vs.length * step, () => { CH.playing = null; renderChords(); });
}

function renderChords() {
  const c = chordById(state.chord), tones = tonesOf(state.root, c.iv), piano = pianoMode();
  const chip = id => `<button data-v="${id}" aria-pressed="${id === state.chord}" title="${chordById(id).name}">${chordSymbol(state.root, id)}</button>`;
  $('chTypes3').innerHTML = TRIAD_TYPES.map(chip).join('');
  $('chTypes4').innerHTML = SEVENTH_TYPES.map(chip).join('');
  $('chAll').checked = !!state.chordAll;
  $('chTitle').textContent = chordTitle(state.root, c.id);
  $('chFormula').innerHTML = `<span><b>Degrees</b>${c.iv.map(ivFmt).join(' ')}</span><span><b>Intervals</b>${c.iv.map(intervalName).join(' ')}</span><span><b>Notes</b>${tones.map(t => t.name).join(' ')}</span>`;
  $('chStrum').textContent = piano ? 'Play' : 'Strum';
  $('chWalk').textContent = piano ? 'Play every voicing' : 'Play every grip';
  const roles = new Set(tones.map(t => t.role));
  $('chLegend').innerHTML = legendHtml(['root', 'third', 'fifth', 'seventh', 'other'].filter(k => roles.has(k)));

  // The neck: the chosen grip. In piano mode it stays the guitar version of the chord and does not follow the piano.
  const gs = chordGrips(), gsel = gripIndex(gs), g = gs[!piano && CH.playing !== null ? CH.playing : gsel];
  const strong = new Set(positionKeys(g));
  const faint = state.chordAll ? neckDots(tones, { keep: (st, f) => !strong.has(noteKey(st, f)), cls: t => t.role + ' faint' }) : [];
  renderNeck($('chNeck'), {
    bands: [{ lo: g.lo, hi: g.hi, label: `${g.letter} shape`, cls: !piano && CH.playing !== null ? 'active' : '' }],
    dots: [...faint, ...positionDots(g, tones)], mutes: mutedStrings(g)
  });
  const fits = scalesContaining(c.iv);
  const scaleLinks = fits.length ? `Scales with every note of this chord: ${fits.map(s => `<a class="more" href="#/scales" data-scale="${s.id}">${noteName(state.root)} ${s.name.toLowerCase()}</a>`).join(', ')}.` : '';

  if (piano) {
    const vs = chordVoicings(), sel = voicingIndex(vs), v = vs[CH.playing !== null ? CH.playing : sel];
    const oneHand = octaveRange(vs.filter(x => !x.left.length).flatMap(x => x.notes));   // the same keys for every one-hand voicing
    $('chBoxes').classList.add('pianos');
    $('chBoxes').innerHTML = vs.map((x, i) => voicingButton(x, tones, {
      i, title: x.name, pressed: i === sel, playing: i === CH.playing, range: x.left.length ? undefined : oneHand,
      sub: (x.left.length ? [x.left, x.right] : [x.notes]).map(ms => ms.map(m => pitchName(m, tones)).join(' ')).join(' | ')
    })).join('');
    renderKeys($('chKeys'), { byMidi: pianoMarks(v.notes, tones), byPc: state.chordAll ? new Map(tones.map(t => [t.pc, { ...t, cls: t.role + ' faint' }])) : null });
    const named = ms => ms.map(m => `${pitchName(m, tones)} (${intervalName(tones.find(x => x.pc === m % 12).iv)})`).join(' · ');
    $('chVoicing').innerHTML = v.left.length
      ? `<b>Left hand:</b> ${named(v.left)} &nbsp; <b>Right hand, low to high:</b> ${named(v.right)}`
      : `<b>This voicing, low to high:</b> ${named(v.notes)}`;
    const inv = c.iv.filter(iv => iv !== '9').slice(1);
    const steps = inv.map((iv, k) => `${k ? 'once more gives' : 'gives'} the ${ORDINAL[k + 1]} inversion, with the ${BOTTOM_WORD[iv]} at the bottom`);
    const hint = `${PIANO_CHORD_NOTES[c.id] || CHORD_NOTES[c.id]} Root position has the root at the bottom. Moving the lowest note up an octave ${steps.join('; ')}. ` +
      'The notes stay the same, so it is still the same chord; only their order changes. Each voicing here is in close position, with every note within an octave, placed as near middle C as it goes. ' +
      'Pianists choose the inversion nearest the chord before, so the hand hardly moves; Progressions does this for you. With two hands, the left hand plays the root in octaves and the right hand the chord.';
    $('chHint').innerHTML = esc(hint) + (scaleLinks ? `<br>${scaleLinks}` : '');
    return;
  }

  $('chBoxes').classList.remove('pianos');
  $('chBoxes').innerHTML = gs.map((x, i) => chordBoxButton(x, tones, {
    i, title: `${x.letter} shape`, sub: fretRange(x), pressed: i === gsel, playing: i === CH.playing
  })).join('');
  renderKeys($('chKeys'), { byMidi: midiMarks(g, tones) });
  // The grip as notes, low string first
  const notes = positionDots(g, tones);
  $('chVoicing').innerHTML = `<b>This grip, low to high:</b> ${notes.map(d => `${d.item.name} (${intervalName(d.item.iv)})`).join(' · ')}` +
    (g.frets.includes(-1) ? ' &nbsp; × in the diagram marks a string you do not play.' : '');
  const used = new Set(notes.map(d => d.item.iv));
  const missing = c.iv.filter(iv => !used.has(iv));
  let hint = CHORD_NOTES[c.id] + ' ';
  if (missing.length) hint += `This grip leaves out the ${missing.map(intervalName).join(' and ')}, which is common in seventh-chord grips: the root, the third and the seventh are what make the chord. `;
  hint += `Each grip is a movable shape named after the open chord it comes from, so the ${g.letter} shape has its root where the open ${g.letter} chord has it.`;
  let links = '';
  if (CAGED_QUALITIES.includes(c.id)) links += `<a class="more" href="#/caged/explore" data-caged="${g.letter}">See all five CAGED shapes for ${chordSymbol(state.root, c.id)} and how they join up</a>`;
  if (scaleLinks) links += `${links ? '<br>' : ''}${scaleLinks}`;
  $('chHint').innerHTML = esc(hint) + (links ? `<br>${links}` : '');
}

PAGES.chords = {
  title: 'Chords',
  init() {
    const pickType = (b) => { state.chord = b.dataset.v; CH.sel = null; save(); renderChords(); playChord(); };
    onButton($('chTypes3'), pickType);
    onButton($('chTypes4'), pickType);
    $('chAll').addEventListener('change', e => { state.chordAll = e.target.checked; save(); renderChords(); });
    // A chord diagram chooses the grip, a voicing button the voicing
    onButton($('chBoxes'), b => {
      const i = +b.dataset.i;
      if (pianoMode()) state.pianoVoicing = chordVoicings()[i].id;
      else { CH.sel = i; state.chordShape = chordGrips()[i].letter; }
      save(); stopAll(); renderChords(); playChord();
    });
    $('chStrum').addEventListener('click', () => playChord());
    $('chArp').addEventListener('click', () => playChord(true));
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
  onRoot() { CH.sel = null; return () => playChord(); },
  keys(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const d = e.key === 'ArrowLeft' ? -1 : 1;
    if (pianoMode()) {
      const vs = chordVoicings();
      state.pianoVoicing = vs[(voicingIndex(vs) + d + vs.length) % vs.length].id;
    } else {
      const vs = chordGrips(), i = (gripIndex(vs) + d + vs.length) % vs.length;
      CH.sel = i; state.chordShape = vs[i].letter;
    }
    save(); stopAll(); renderChords(); playChord();
  }
};
