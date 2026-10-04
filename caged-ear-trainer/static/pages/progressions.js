/* Chord progressions: well-known progressions in any key, a capo helper that shows which shapes to play,
   and Play along, which strums the chords in time with the metronome */
const PG = { sel: 0, now: null };   // sel: the chord shown when nothing plays. now: { chord, bar, beat } while playing
const PG_BEATS = 4, PG_COUNT_IN = 1;
const progNow = () => PROGRESSIONS.find(p => p.id === state.prog) || PROGRESSIONS[0];
const progCapo = () => Math.max(0, Math.min(9, +state.progCapo || 0));
const progChords = () => progressionChords(progNow(), rootPc(), progCapo());
// The grip for a chord: its open shape if it has one, otherwise the lowest movable shape. The capo raises it.
function progGrip(c, capo) {
  const pc = parseNote(c.shapeRoot).pc;
  const shape = openGrip(pc, c.q) || chordShapes(pc, c.q, FRETS - capo)[0] || chordShapes(pc, c.q)[0];
  return { ...shape, frets: shape.frets.map(f => f < 0 ? -1 : f + capo), lo: shape.lo + capo, hi: shape.hi + capo, shape, open: isOpenGrip(shape) };
}
// Notes of a chord, with the names they have in the shape (for the Shape names labels)
const progTones = c => tonesOf(c.root, chordById(c.q).iv).map((t, i) => ({ ...t, shapeName: spell(c.shapeRoot, chordById(c.q).iv[i]) }));
const keyLabel = (pc, mode) => noteName(keyName(pc, mode)) + (mode === 'minor' ? ' minor' : ' major');

function playProgression() {
  stopAll();
  const prog = progNow(), capo = progCapo(), chords = progChords(), grips = chords.map(c => progGrip(c, capo));
  const total = progressionBars(prog), chordAt = chords.flatMap((c, i) => Array(c.bars).fill(i));
  startClock({
    bpm: () => state.progBpm,
    beats: () => PG_BEATS,
    onBeat(info, when) {
      if (info.bar < PG_COUNT_IN) {   // one bar of clicks first, so you can come in on the first chord
        clickAt(info.beat === 0 ? 'accent' : 'beat', when);
        atTime(when, () => { PG.now = { count: info.beat + 1 }; renderProgressions(); });
        return;
      }
      const b = info.bar - PG_COUNT_IN;
      if (!state.progLoop && b >= total) { stopClock(); atTime(when, stopAll); return; }
      const bar = b % total, ci = chordAt[bar], g = grips[ci];
      if (state.progClick) clickAt(info.beat === 0 ? 'accent' : 'beat', when, state.clickVol * 0.7);
      if (state.progStrum === 'bar') { if (info.beat === 0) strumAt(g, when, state.inst, { gap: 0.03 }); }
      else {
        strumAt(g, when, state.inst, { gap: 0.014, vol: info.beat === 0 ? 0.9 : 0.65 });
        if (state.progStrum === 'eighths') strumAt(g, when + info.len / 2, state.inst, { gap: 0.012, up: true, vol: 0.45 });
      }
      atTime(when, () => { PG.now = { chord: ci, bar, beat: info.beat }; renderProgressions(); });
    }
  });
}
function selectChord(i, sound = true) {
  const chords = progChords();
  PG.sel = (i + chords.length) % chords.length;
  stopAll(); renderProgressions();
  if (sound) strum(progGrip(chords[PG.sel], progCapo()));
}

function renderProgressions() {
  const prog = progNow(), capo = progCapo(), chords = progChords(), pc = rootPc();
  if (PG.sel >= chords.length) PG.sel = 0;
  const playing = PG.now && PG.now.chord !== undefined;
  const shownIdx = playing ? PG.now.chord : PG.sel, c = chords[shownIdx], grip = progGrip(c, capo), tones = progTones(c);

  $('pgList').innerHTML = PROGRESSIONS.map(p => `<button data-v="${p.id}" aria-pressed="${p.id === prog.id}" title="${esc(p.nick)}">${p.name}</button>`).join('');
  $('pgKey').innerHTML = Array.from({ length: 12 }, (_, k) =>
    `<button data-v="${k}" aria-pressed="${k === pc}">${noteName(keyName(k, prog.mode))}${prog.mode === 'minor' ? 'm' : ''}</button>`).join('');
  $('pgCapo').value = String(capo);
  $('pgBpm').value = state.progBpm;
  $('pgBpmVal').innerHTML = `<b>${state.progBpm}</b> BPM`;
  setPressed($('pgStrum'), state.progStrum);
  $('pgClick').checked = !!state.progClick;
  $('pgLoop').checked = !!state.progLoop;
  $('pgPlay').textContent = PG.now ? 'Restart' : 'Play along';

  $('pgTitle').textContent = `${prog.nick} in ${keyLabel(pc, prog.mode)}`;
  $('pgInfo').innerHTML = `<span><b>Numerals</b>${prog.chords.map(x => x[0]).join(' ')}</span><span><b>Chords</b>${chords.map(x => x.symbol).join(' ')}</span>` +
    (capo ? `<span><b>Shapes with capo ${capo}</b>${chords.map(x => x.shapeSymbol).join(' ')}</span>` : '');

  // One cell per bar; a chord that lasts several bars shows its name in the first and a dash after
  let cells = '';
  chords.forEach((x, i) => {
    for (let b = 0; b < x.bars; b++) {
      const bar = x.bar + b, now = playing && PG.now.bar === bar;
      cells += `<button data-c="${i}" class="${b ? 'cont' : ''}${now ? ' now' : ''}" aria-pressed="${!playing && i === PG.sel}">` +
        `<b>${b ? '–' : x.symbol}</b><small>${bar + 1}: ${x.roman}${capo && !b ? ' · ' + x.shapeSymbol : ''}</small></button>`;
    }
  });
  $('pgBars').innerHTML = cells;
  const next = chords[(shownIdx + 1) % chords.length];
  $('pgPhase').textContent = PG.now && PG.now.count ? `Count-in: ${PG.now.count}`
    : playing ? `Bar ${PG.now.bar + 1} of ${progressionBars(prog)}, beat ${PG.now.beat + 1}: ${c.symbol}${capo ? ` (play ${c.shapeSymbol})` : ''}. Next: ${next.symbol}`
    : 'Click a bar or a chord diagram to hear that chord. Play along starts with one bar of clicks.';

  // Capo helper
  const sugg = capoSuggestions(prog, pc);
  const barre = chords.filter(x => !progGrip(x, capo).open).map(x => x.shapeSymbol);
  $('pgCapoHelp').innerHTML = `<b>Capo.</b> ` + (sugg.length
    ? `Every chord is an open chord with ${sugg.map(s => `<button class="linkbtn" data-capo="${s.capo}">${s.capo ? `capo ${s.capo}` : 'no capo'} (${noteName(s.shapeKey)}${prog.mode === 'minor' ? 'm' : ''} shapes)</button>`).join(', ')}.`
    : 'No capo position makes every chord an open chord in this key, so some barre chords are needed.') +
    (barre.length ? ` Right now ${[...new Set(barre)].join(', ')} ${barre.length > 1 ? 'are' : 'is'} played as barre chord${barre.length > 1 ? 's' : ''}.` : '');

  // Chord diagrams, as you see them with the capo as the nut
  const uniq = chords.filter((x, i) => chords.findIndex(y => y.shapeSymbol === x.shapeSymbol) === i);
  $('pgBoxes').innerHTML = uniq.map(x => {
    const g = progGrip(x, capo), i = chords.indexOf(x);
    return chordBoxButton(g.shape, progTones(x).map(t => ({ ...t, name: t.shapeName })), {
      i, title: x.shapeSymbol, sub: (capo ? `sounds ${x.symbol}` : x.roman) + (g.open ? '' : ', barre'),
      pressed: chords[shownIdx].shapeSymbol === x.shapeSymbol, playing: playing && chords[shownIdx].shapeSymbol === x.shapeSymbol
    });
  }).join('');

  renderNeck($('pgNeck'), { capo, dots: positionDots(grip, tones), mutes: mutedStrings(grip),
    bands: [{ lo: grip.lo, hi: grip.hi, label: capo ? `${c.shapeSymbol} shape` : c.symbol, cls: playing ? 'active' : '' }] });
  renderKeys($('pgPiano'), { byMidi: midiMarks(grip, tones) });
  const roles = new Set(tones.map(t => t.role));
  $('pgLegend').innerHTML = legendHtml(['root', 'third', 'fifth', 'seventh'].filter(k => roles.has(k)));
  $('pgHint').textContent = prog.about + (capo ? ' With the capo, the neck shows where the notes are and the labels give the sounding notes. Choose Shape names to see the names from the shapes you finger.' : '');
}

PAGES.progressions = {
  title: 'Progressions',
  init() {
    $('pgCapo').innerHTML = Array.from({ length: 10 }, (_, i) => `<option value="${i}">${i === 0 ? 'None' : 'Fret ' + i}</option>`).join('');
    onButton($('pgList'), b => { state.prog = b.dataset.v; PG.sel = 0; save(); stopAll(); renderProgressions(); });
    onButton($('pgKey'), b => { state.root = ROOTS[+b.dataset.v]; save(); selectChord(PG.sel); });
    $('pgCapo').addEventListener('change', e => { state.progCapo = +e.target.value; save(); selectChord(PG.sel); });
    $('pgCapoHelp').addEventListener('click', e => {
      const b = e.target.closest('[data-capo]'); if (!b) return;
      state.progCapo = +b.dataset.capo; save(); selectChord(PG.sel);
    });
    const setTempo = v => { state.progBpm = Math.max(40, Math.min(200, Math.round(v))); save(); $('pgBpm').value = state.progBpm; $('pgBpmVal').innerHTML = `<b>${state.progBpm}</b> BPM`; };
    $('pgBpm').addEventListener('input', e => setTempo(+e.target.value));
    $$('[data-pgbpm]').forEach(b => b.addEventListener('click', () => setTempo(state.progBpm + +b.dataset.pgbpm)));
    onButton($('pgStrum'), b => { state.progStrum = b.dataset.v; save(); renderProgressions(); });
    $('pgClick').addEventListener('change', e => { state.progClick = e.target.checked; save(); });
    $('pgLoop').addEventListener('change', e => { state.progLoop = e.target.checked; save(); });
    $('pgPlay').addEventListener('click', playProgression);
    onButton($('pgBars'), b => selectChord(+b.dataset.c));
    onButton($('pgBoxes'), b => selectChord(+b.dataset.i));
    STOP_HOOKS.push(() => { if (PG.now) { PG.now = null; if (current && current.page === 'progressions') renderProgressions(); } });
  },
  render: renderProgressions,
  keys(e, sub, buttonFocused) {
    if (e.key === ' ' && !buttonFocused) { e.preventDefault(); if (PG.now) stopAll(); else playProgression(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); selectChord(PG.sel + (e.key === 'ArrowLeft' ? -1 : 1)); }
  }
};
