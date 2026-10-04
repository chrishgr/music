/* Chord progressions: well-known progressions in any key, styles such as Acoustic Indie Folk-Pop with their own
   voicings, a capo helper that shows which shapes to play, and Play along, which strums the chords in time */
const PG = { sel: 0, now: null };   // sel: the chord shown when nothing plays. now: { chord, bar, beat } while playing
const PG_BEATS = 4, PG_COUNT_IN = 1;
// Where the folk-pop spices are described, shown in the style card
const FOLK_SOURCES = [
  ['Acoustic Guitar: sus and add embellishments with open chord shapes', 'https://acousticguitar.com/guitar-basics-how-to-use-sus-and-add-embellishments-with-open-chord-shapes/'],
  ['Guitarwiz: folk chord progressions', 'https://guitarwiz.app/articles/folk-chord-progressions/'],
  ['StudyBass: borrowed chords', 'https://www.studybass.com/lessons/harmony/borrowed-chords/'],
  ['Acoustic Guitar: slash chords and bass lines', 'https://acousticguitar.com/strengthen-chord-progressions-and-bass-lines-with-slash-chords/'],
  ['Strum Avenue: what 7th chords do to a song', 'https://strumavenue.com/guitar-7th-chords/'],
  ['Pianote: chord progressions for every mood', 'https://www.pianote.com/blog/chord-progressions-for-mood/'],
  ['Good Guitarist: the most popular strumming patterns', 'https://goodguitarist.com/common-guitar-strumming-patterns/'],
  ['Guitar World: how a capo makes songs easier to play', 'https://www.guitarworld.com/lessons/how-a-capo-can-make-5-classic-songs-easier-to-play']
];
// Strokes in one beat for each strumming style: [part of the beat, up-stroke, volume]
const STRUMS = {
  bar: (beat, starts) => beat === 0 || starts ? [[0, false, 0.9]] : [],
  beats: beat => [[0, false, beat === 0 ? 0.9 : 0.65]],
  eighths: beat => [[0, false, beat === 0 ? 0.9 : 0.65], [0.5, true, 0.45]],
  // D DU UDU: down on 1, down-up on 2, the down on 3 is missed, then up, down-up on 4
  folk: beat => [[[0, false, 0.9]], [[0, false, 0.7], [0.5, true, 0.45]], [[0.5, true, 0.5]], [[0, false, 0.75], [0.5, true, 0.45]]][beat % 4]
};
const baseProg = () => PROGRESSIONS.find(p => p.id === state.prog) || PROGRESSIONS[0];
const progNow = () => rotateProgression(baseProg(), state.progStart);
// A progression with its own family of shapes keeps those shapes, so the capo follows the key. Otherwise the capo is free.
const progCapo = (prog = progNow()) => prog.family ? familyCapo(prog, rootPc()) : Math.max(0, Math.min(9, +state.progCapo || 0));
const progChords = () => progressionChords(progNow(), rootPc(), progCapo());
// The grip for a chord: the voicing written for the style, or its open shape, or the lowest movable shape. The capo raises it.
function progGrip(c, capo) {
  let shape, open;
  if (c.grip) {
    const frets = c.grip.map(x => x === null ? -1 : x), played = frets.filter(f => f >= 0);
    shape = { strings: [0, 1, 2, 3, 4, 5], frets, lo: Math.min(...played), hi: Math.max(...played), base: 0 };
    open = played.includes(0) || shape.hi <= 3;
  } else {
    const pc = parseNote(c.shapeRoot).pc;
    shape = openGrip(pc, c.q) || chordShapes(pc, c.q, FRETS - capo)[0] || chordShapes(pc, c.q)[0];
    open = isOpenGrip(shape);
  }
  return { ...shape, frets: shape.frets.map(f => f < 0 ? -1 : f + capo), lo: shape.lo + capo, hi: shape.hi + capo, shape, open };
}
// Notes of a chord, with the names they have in the shape (for the Shape names labels)
const progTones = c => tonesOf(c.root, chordById(c.q).iv).map((t, i) => ({ ...t, shapeName: spell(c.shapeRoot, chordById(c.q).iv[i]) }));
// The same notes as they are in the shape you finger, for the chord diagrams (which show the capo as the nut)
const shapeTones = c => tonesOf(c.shapeRoot, chordById(c.q).iv);
const keyLabel = (pc, mode) => noteName(keyName(pc, mode)) + (mode === 'minor' ? ' minor' : ' major');
// How a chord marked hammer is reached from the one before: a finger hammers on higher up, or pulls off lower
function hammerKind(chords, i) {
  const a = chords[(i - 1 + chords.length) % chords.length].grip, b = chords[i].grip;
  if (!a || !b) return '';
  const moves = b.map((f, st) => f === a[st] || f === null || a[st] === null ? 0 : Math.sign(f - a[st])).filter(Boolean);
  return moves.every(m => m > 0) ? 'hammer-on' : moves.every(m => m < 0) ? 'pull-off' : 'hammer-on and pull-off';
}

function playProgression() {
  stopAll();
  const prog = progNow(), capo = progCapo(prog), chords = progChords(), grips = chords.map(c => progGrip(c, capo));
  const total = chords.reduce((n, c) => n + c.beats, 0), chordAt = chords.flatMap((c, i) => Array(c.beats).fill(i));
  startClock({
    bpm: () => state.progBpm,
    beats: () => PG_BEATS,
    onBeat(info, when) {
      if (info.bar < PG_COUNT_IN) {   // one bar of clicks first, so you can come in on the first chord
        clickAt(info.beat === 0 ? 'accent' : 'beat', when);
        atTime(when, () => { PG.now = { count: info.beat + 1 }; renderProgressions(); });
        return;
      }
      const b = (info.bar - PG_COUNT_IN) * PG_BEATS + info.beat;
      if (!state.progLoop && b >= total) { stopClock(); atTime(when, stopAll); return; }
      const pos = b % total, ci = chordAt[pos], c = chords[ci], g = grips[ci], starts = c.beat === pos;
      if (state.progClick) clickAt(info.beat === 0 ? 'accent' : 'beat', when, state.clickVol * 0.7);
      let strokes = (STRUMS[state.progStrum] || STRUMS.beats)(info.beat, starts);
      if (c.hammer && starts) {   // only the moving finger sounds, the rest of the chord keeps ringing
        const prev = grips[(ci - 1 + chords.length) % chords.length];
        g.frets.forEach((f, st) => { if (f >= 0 && f !== prev.frets[st]) playAt(TUNING[st] + f, when, state.inst, noteKey(st, f), 0.9); });
        strokes = strokes.filter(([at]) => at > 0);
      }
      strokes.forEach(([at, up, vol]) => strumAt(g, when + at * info.len, state.inst, { gap: state.progStrum === 'bar' ? 0.03 : up ? 0.012 : 0.014, up, vol }));
      atTime(when, () => { PG.now = { chord: ci, bar: Math.floor(pos / PG_BEATS), beat: pos % PG_BEATS }; renderProgressions(); });
    }
  });
}
function selectChord(i, sound = true) {
  const chords = progChords();
  PG.sel = (i + chords.length) % chords.length;
  stopAll(); renderProgressions();
  if (sound) strum(progGrip(chords[PG.sel], progCapo()));
}
// Choosing a progression with its own shapes keeps the key when it needs a capo the style uses (up to fret 5),
// and otherwise moves to the capo the progression suggests
function selectProg(id) {
  state.prog = id; state.progStart = 0; PG.sel = 0;
  const p = baseProg();
  state.progGenre = progGenre(p);
  if (p.family && familyCapo(p, rootPc()) > 5) state.root = ROOTS[(parseNote(p.family).pc + p.capo) % 12];
  save(); stopAll(); renderProgressions();
}
function setCapo(capo) {
  const p = progNow();
  if (p.family) state.root = ROOTS[(parseNote(p.family).pc + capo) % 12]; else state.progCapo = capo;
  save(); selectChord(PG.sel);
}

function renderProgressions() {
  const base = baseProg(), prog = progNow(), genre = progGenre(base), capo = progCapo(prog), chords = progChords(), pc = rootPc();
  if (PG.sel >= chords.length) PG.sel = 0;
  const playing = PG.now && PG.now.chord !== undefined;
  const shownIdx = playing ? PG.now.chord : PG.sel, c = chords[shownIdx], grip = progGrip(c, capo), tones = progTones(c);
  const anchors = new Set(progressionAnchors(prog));
  const onNeck = k => { const [st, f] = k.split(':').map(Number); return noteKey(st, f + capo); };

  // Style, progression and where the loop starts
  $('pgGenre').innerHTML = GENRES.map(g => `<button data-v="${g.id}" aria-pressed="${g.id === genre}">${g.name}</button>`).join('');
  const G = GENRES.find(g => g.id === genre);
  $('pgGenreInfo').hidden = !G.spices;
  if (G.spices) {
    $('pgGenreInfo').innerHTML = `<h3>${G.name}</h3><p class="artists">In the style of ${G.artists.join(', ')}.</p><p>${G.about} Click a spice to hear it.</p>` +
      `<div class="spices">${G.spices.map((s, i) => `<button data-spice="${i}"><b>${s.name}</b><span>${s.text}</span></button>`).join('')}</div>` +
      `<p class="src">Sources: ${FOLK_SOURCES.map(([t, u]) => `<a class="more" href="${u}" target="_blank" rel="noopener">${t}</a>`).join(' · ')}</p>`;
  }
  $('pgList').innerHTML = PROGRESSIONS.filter(p => progGenre(p) === genre).map(p =>
    `<button data-v="${p.id}" aria-pressed="${p.id === base.id}" title="${esc(genre === 'classic' ? p.nick : p.name)}">${genre === 'classic' ? p.name : p.nick}</button>`).join('');
  $('f-pgstart').hidden = !base.loop;
  if (base.loop) $('pgStart').innerHTML = base.chords.map((ch, i) => `<button data-v="${i}" aria-pressed="${i === (state.progStart || 0) % base.chords.length}">${ch[0]}</button>`).join('');

  // Key and capo. With its own shapes, the capo list says which key each fret gives.
  $('pgKey').innerHTML = Array.from({ length: 12 }, (_, k) =>
    `<button data-v="${k}" aria-pressed="${k === pc}">${noteName(keyName(k, prog.mode))}${prog.mode === 'minor' ? 'm' : ''}</button>`).join('');
  const fpc = prog.family ? parseNote(prog.family).pc : 0;
  $('pgCapo').innerHTML = Array.from({ length: prog.family ? 12 : 10 }, (_, i) =>
    `<option value="${i}">${i === 0 ? 'None' : 'Fret ' + i}${prog.family ? ` (${noteName(keyName(fpc + i, prog.mode))})` : ''}</option>`).join('');
  $('pgCapo').value = String(capo);
  $('pgBpm').value = state.progBpm;
  $('pgBpmVal').innerHTML = `<b>${state.progBpm}</b> BPM`;
  setPressed($('pgStrum'), state.progStrum);
  $('pgClick').checked = !!state.progClick;
  $('pgLoop').checked = !!state.progLoop;
  $('pgPlay').textContent = PG.now ? 'Restart' : 'Play along';

  $('pgTitle').textContent = `${prog.nick} in ${keyLabel(pc, prog.mode)}` + (prog.family ? `, ${prog.family} shapes, ${capo ? 'capo ' + capo : 'no capo'}` : '');
  $('pgInfo').innerHTML = `<span><b>Numerals</b>${prog.chords.map(x => x[0]).join(' ')}</span><span><b>Chords</b>${chords.map(x => x.symbol).join(' ')}</span>` +
    (capo ? `<span><b>Shapes with capo ${capo}</b>${chords.map(x => x.shapeSymbol).join(' ')}</span>` : '');

  // One cell per bar with a button for each chord that starts in it; a chord held over from the bar before shows a dash
  const totalBeats = chords.reduce((n, x) => n + x.beats, 0), nBars = Math.ceil(totalBeats / PG_BEATS);
  let cells = '';
  for (let b = 0; b < nBars; b++) {
    const inBar = chords.filter(x => x.beat >= b * PG_BEATS && x.beat < (b + 1) * PG_BEATS);
    const held = !inBar.length || inBar[0].beat > b * PG_BEATS;
    const n = inBar.length + (held ? 1 : 0);
    cells += `<div class="pbar${playing && PG.now.bar === b ? ' playing' : ''}" style="flex: ${n} 1 ${70 + n * 70}px"><span class="barno">${b + 1}</span>${held ? '<span class="cont">–</span>' : ''}` +
      inBar.map(x => {
        const tag = x.borrowed ? 'borrowed' : x.hammer ? hammerKind(chords, x.i) : '';
        return `<button data-c="${x.i}" class="${playing && PG.now.chord === x.i ? 'now' : ''}" aria-pressed="${!playing && x.i === PG.sel}">` +
          `<b>${x.symbol}</b><small>${x.roman}${capo ? ' · ' + x.shapeSymbol : ''}${tag ? ` <span class="tag">${tag}</span>` : ''}</small></button>`;
      }).join('') + '</div>';
  }
  $('pgBars').innerHTML = cells;
  const next = chords[(shownIdx + 1) % chords.length];
  $('pgPhase').textContent = PG.now && PG.now.count ? `Count-in: ${PG.now.count}`
    : playing ? `Bar ${PG.now.bar + 1} of ${nBars}, beat ${PG.now.beat + 1}: ${c.symbol}${capo ? ` (play ${c.shapeSymbol})` : ''}. Next: ${next.symbol}`
    : 'Click a chord or a chord diagram to hear it. Play along starts with one bar of clicks.';

  // Capo helper
  let help;
  if (prog.family) {
    help = `<b>Capo.</b> This progression keeps its ${prog.family}-shape voicings, so the capo sets the key. Usual for the style is capo 2 to 5: ` +
      [2, 3, 4, 5].map(k => `<button class="linkbtn" data-capo="${k}">capo ${k} gives ${noteName(keyName(fpc + k, prog.mode))}</button>`).join(', ') + '.' +
      (capo > 7 ? ` Capo ${capo} is very high on the neck; a key closer to ${noteName(keyName(fpc + prog.capo, prog.mode))} sits better.` : '');
  } else {
    const sugg = capoSuggestions(prog, pc);
    const barre = chords.filter(x => !progGrip(x, capo).open).map(x => x.shapeSymbol);
    help = `<b>Capo.</b> ` + (sugg.length
      ? `Every chord is an open chord with ${sugg.map(s => `<button class="linkbtn" data-capo="${s.capo}">${s.capo ? `capo ${s.capo}` : 'no capo'} (${noteName(s.shapeKey)}${prog.mode === 'minor' ? 'm' : ''} shapes)</button>`).join(', ')}.`
      : 'No capo position makes every chord an open chord in this key, so some barre chords are needed.') +
      (barre.length ? ` Right now ${[...new Set(barre)].join(', ')} ${barre.length > 1 ? 'are' : 'is'} played as barre chord${barre.length > 1 ? 's' : ''}.` : '');
  }
  $('pgCapoHelp').innerHTML = help;

  // Chord diagrams, as you see them with the capo as the nut. Anchor fingers have a dashed ring.
  const uniq = chords.filter((x, i) => chords.findIndex(y => y.shapeSymbol === x.shapeSymbol) === i);
  $('pgBoxes').innerHTML = uniq.map(x => {
    const g = progGrip(x, capo), i = chords.indexOf(x);
    return chordBoxButton(g.shape, shapeTones(x), {
      i, title: x.shapeSymbol, sub: (capo ? `sounds ${x.symbol}` : x.roman) + (g.open ? '' : ', barre'), anchors,
      pressed: chords[shownIdx].shapeSymbol === x.shapeSymbol, playing: playing && chords[shownIdx].shapeSymbol === x.shapeSymbol
    });
  }).join('');

  const anchorsOnNeck = new Set([...anchors].map(onNeck));
  renderNeck($('pgNeck'), {
    capo, mutes: mutedStrings(grip),
    dots: positionDots(grip, tones).map(d => anchorsOnNeck.has(noteKey(d.st, d.f)) ? { ...d, cls: d.cls + ' anchor' } : d),
    bands: [{ lo: grip.lo, hi: grip.hi, label: capo ? `${c.shapeSymbol} shape` : c.symbol, cls: playing ? 'active' : '' }]
  });
  renderKeys($('pgPiano'), { byMidi: midiMarks(grip, tones) });
  const roles = new Set(tones.map(t => t.role));
  $('pgLegend').innerHTML = legendHtml(['root', 'third', 'fifth', 'seventh', 'other'].filter(k => roles.has(k)).concat(anchors.size ? ['anchor'] : []));
  $('pgHint').textContent = prog.about + (capo ? ' With the capo, the labels give the sounding notes. Choose Shape names to see the names from the shapes you finger.' : '');
}

PAGES.progressions = {
  title: 'Progressions',
  init() {
    if (progGenre(baseProg()) !== state.progGenre) state.progGenre = progGenre(baseProg());
    onButton($('pgGenre'), b => { if (b.dataset.v !== state.progGenre) selectProg(PROGRESSIONS.find(p => progGenre(p) === b.dataset.v).id); });
    onButton($('pgList'), b => selectProg(b.dataset.v));
    onButton($('pgStart'), b => { state.progStart = +b.dataset.v; save(); selectChord(0); });
    // A spice opens the progression that shows it, and can set where the loop starts or the strumming
    onButton($('pgGenreInfo'), b => {
      const s = GENRES.find(g => g.id === state.progGenre).spices[+b.dataset.spice];
      selectProg(s.prog);
      if (s.start !== undefined) state.progStart = s.start;
      if (s.strum) state.progStrum = s.strum;
      save();
      if (s.strum) playProgression(); else selectChord(0);
    });
    onButton($('pgKey'), b => { state.root = ROOTS[+b.dataset.v]; save(); selectChord(PG.sel); });
    $('pgCapo').addEventListener('change', e => setCapo(+e.target.value));
    $('pgCapoHelp').addEventListener('click', e => { const b = e.target.closest('[data-capo]'); if (b) setCapo(+b.dataset.capo); });
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
