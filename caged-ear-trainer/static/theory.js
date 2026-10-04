/* CAGED Ear Trainer: music theory, sound synthesis and pitch detection.
   Pure functions with no page or Web Audio code, so verify_notes.mjs can test exactly this file in Node. */

/* ================= THEORY ================= */
const TUNING = [40, 45, 50, 55, 59, 64];          // E A D G B e as MIDI numbers, low to high
const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];
const FRETS = 15;
const LETTERS = 'CDEFGAB';
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
// interval -> [semitones, scale degree]
const IV = {
  '1': [0, 1], 'b2': [1, 2], '2': [2, 2], 'b3': [3, 3], '3': [4, 3], '4': [5, 4], '#4': [6, 4],
  'b5': [6, 5], '5': [7, 5], '#5': [8, 5], 'b6': [8, 6], '6': [9, 6], 'bb7': [9, 7], 'b7': [10, 7], '7': [11, 7], '8': [12, 8]
};
const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const SCALES = [
  { id: 'major', name: 'Major', iv: ['1', '2', '3', '4', '5', '6', '7'] },
  { id: 'minor', name: 'Natural minor', iv: ['1', '2', 'b3', '4', '5', 'b6', 'b7'] },
  { id: 'majpenta', name: 'Major pentatonic', iv: ['1', '2', '3', '5', '6'] },
  { id: 'minpenta', name: 'Minor pentatonic', iv: ['1', 'b3', '4', '5', 'b7'] },
  { id: 'blues', name: 'Blues scale', iv: ['1', 'b3', '4', 'b5', '5', 'b7'] },
  { id: 'dorian', name: 'Dorian', iv: ['1', '2', 'b3', '4', '5', '6', 'b7'] },
  { id: 'mixolydian', name: 'Mixolydian', iv: ['1', '2', '3', '4', '5', '6', 'b7'] },
  { id: 'lydian', name: 'Lydian', iv: ['1', '2', '3', '#4', '5', '6', '7'] },
  { id: 'phrygian', name: 'Phrygian', iv: ['1', 'b2', 'b3', '4', '5', 'b6', 'b7'] },
  { id: 'harmminor', name: 'Harmonic minor', iv: ['1', '2', 'b3', '4', '5', 'b6', '7'] }
];
const CHORDS = [
  { id: 'maj', sym: '', name: 'Major', iv: ['1', '3', '5'] },
  { id: 'min', sym: 'm', name: 'Minor', iv: ['1', 'b3', '5'] },
  { id: 'dim', sym: 'dim', name: 'Diminished', iv: ['1', 'b3', 'b5'] },
  { id: 'aug', sym: 'aug', name: 'Augmented', iv: ['1', '3', '#5'] },
  { id: 'sus2', sym: 'sus2', name: 'Sus2', iv: ['1', '2', '5'] },
  { id: 'sus4', sym: 'sus4', name: 'Sus4', iv: ['1', '4', '5'] },
  { id: '7', sym: '7', name: 'Dominant seventh', iv: ['1', '3', '5', 'b7'] },
  { id: 'maj7', sym: 'maj7', name: 'Major seventh', iv: ['1', '3', '5', '7'] },
  { id: 'm7', sym: 'm7', name: 'Minor seventh', iv: ['1', 'b3', '5', 'b7'] },
  { id: 'm7b5', sym: 'm7♭5', name: 'Half-diminished', iv: ['1', 'b3', 'b5', 'b7'] },
  { id: 'dim7', sym: 'dim7', name: 'Diminished seventh', iv: ['1', 'b3', 'b5', 'bb7'] },
  { id: 'mmaj7', sym: 'm(maj7)', name: 'Minor-major seventh', iv: ['1', 'b3', '5', '7'] },
  { id: 'maj7s5', sym: 'maj7♯5', name: 'Augmented major seventh', iv: ['1', '3', '#5', '7'] }
];
const chordById = id => CHORDS.find(c => c.id === id) || CHORDS[0];

/* --- Movable chord shapes and the CAGED system ---
   Each shape is a grip written as tab, low E string first, x = muted. The letter names the open chord
   the grip comes from, and the root of the grip is that letter (an "E shape" has E as its root where it
   is written). Moving the whole grip up n frets, with a barre or a capo in place of the nut, gives the
   chord n semitones higher, so every shape can be played in all twelve keys.
   The CAGED system uses the five open chords C, A, G, E and D of one chord quality. For minor that is
   Cm, Am, Gm, Em and Dm: the major shapes with every third lowered one fret. Where the third is an open
   string and cannot be lowered, the string is muted (C shape) or plays the fifth instead (G shape).
   The seventh-chord shapes are the open C7, A7, G7, E7, D7, the m7 and the maj7 chords: one root of the
   triad shape is replaced by the seventh, which lies a whole step (b7) or a half step (7) below it.
   A few shapes are written at fret 11 to 13, because the grip needs a fret below the nut in open position. */
const SHAPE_ROOT_PC = { C: 0, A: 9, G: 7, E: 4, D: 2 };
const SHAPE_ORDER = ['C', 'A', 'G', 'E', 'D'];
const SHAPES = {
  maj:    { C: 'x 3 2 0 1 0', A: 'x 0 2 2 2 0', G: '3 2 0 0 0 3', E: '0 2 2 1 0 0', D: 'x x 0 2 3 2' },
  min:    { C: 'x 3 1 0 1 x', A: 'x 0 2 2 1 0', G: '3 1 0 0 3 3', E: '0 2 2 0 0 0', D: 'x x 0 2 3 1' },
  '7':    { C: 'x 3 2 3 1 0', A: 'x 0 2 0 2 0', G: '3 2 0 0 0 1', E: '0 2 0 1 0 0', D: 'x x 0 2 1 2' },
  m7:     { C: 'x 3 1 3 1 x', A: 'x 0 2 0 1 0', G: '3 1 0 0 3 1', E: '0 2 0 0 0 0', D: 'x x 0 2 1 1' },
  maj7:   { C: 'x 3 2 0 0 0', A: 'x 0 2 1 2 0', G: '3 2 0 0 0 2', E: '0 2 1 1 0 0', D: 'x x 0 2 2 2' },
  sus2:   { C: 'x 3 0 0 1 3', A: 'x 0 2 2 0 0', G: '3 0 0 0 3 3', E: '0 2 4 4 0 0', D: 'x x 0 2 3 0' },
  sus4:   { C: 'x 3 3 0 1 1', A: 'x 0 2 2 3 0', G: '3 3 0 0 1 3', E: '0 2 2 2 0 0', D: 'x x 0 2 3 3' },
  dim:    { A: 'x 0 1 2 1 x', E: '0 1 2 0 x x', D: 'x x 0 1 3 1' },
  aug:    { C: 'x 3 2 1 1 0', A: 'x 0 3 2 2 1', E: '0 3 2 1 1 0', D: 'x x 0 3 3 2' },
  m7b5:   { A: 'x 0 1 0 1 x', E: '12 x 12 12 11 x', D: 'x x 0 1 1 1' },
  dim7:   { A: 'x 12 13 11 13 x', E: '12 x 11 12 11 12', D: 'x x 0 1 0 1' },
  mmaj7:  { A: 'x 0 2 1 1 0', E: '0 2 1 0 0 0', D: 'x x 0 2 2 1' },
  maj7s5: { A: 'x 0 3 1 2 x', E: '0 x 1 1 1 x', D: 'x x 0 3 2 2' }
};
// Chord qualities with all five CAGED shapes, as offered on the CAGED page
const CAGED_QUALITIES = ['maj', 'min', '7', 'm7', 'maj7'];
// The scale usually played over each CAGED quality (chord-scale theory: Ionian on major and maj7,
// Aeolian on minor, Mixolydian on dominant seventh, Dorian on minor seventh)
const CAGED_SCALE = { maj: 'major', min: 'minor', '7': 'mixolydian', m7: 'dorian', maj7: 'major' };

// 'x 3 2 0 1 0' -> [null, 3, 2, 0, 1, 0]
const parseGrip = g => g.trim().split(/\s+/).map(x => x === 'x' ? null : +x);
const gripOf = (q, letter) => SHAPES[q] && SHAPES[q][letter] ? parseGrip(SHAPES[q][letter]) : null;
const shapeLetters = q => SHAPE_ORDER.filter(l => gripOf(q, l));

// Every place on the neck (frets 0 to maxFret) where a shape gives the chord with the root rootPc.
// Positions use -1 for a muted string, like every other position in the app.
function shapeInstances(rootPc, q, letter, maxFret = FRETS) {
  const ref = gripOf(q, letter);
  if (!ref) return [];
  const shift = ((rootPc - SHAPE_ROOT_PC[letter]) % 12 + 12) % 12, out = [];
  for (const base of [shift - 24, shift - 12, shift, shift + 12]) {
    const played = ref.filter(x => x !== null).map(x => x + base);
    const lo = Math.min(...played), hi = Math.max(...played);
    if (lo < 0 || hi > maxFret) continue;
    out.push({ letter, q, base, strings: [0, 1, 2, 3, 4, 5], frets: ref.map(x => x === null ? -1 : x + base), lo, hi });
  }
  return out;
}
// All shapes of a chord on the neck, lowest position first
function chordShapes(rootPc, q, maxFret = FRETS) {
  return shapeLetters(q).flatMap(l => shapeInstances(rootPc, q, l, maxFret))
    .sort((a, b) => a.lo - b.lo || a.hi - b.hi);
}
// MIDI numbers of a position, low string first, muted strings left out
const positionMidis = p => p.frets.map((f, k) => f < 0 ? null : TUNING[p.strings[k]] + f).filter(m => m !== null);
// Scales that contain every note of a chord with the same root
function scalesContaining(chordIvs) {
  const need = chordIvs.map(iv => IV[iv][0] % 12);
  return SCALES.filter(s => { const have = new Set(s.iv.map(iv => IV[iv][0])); return need.every(x => have.has(x)); });
}

// Open chords for the triad view (fret per string, low E first, -1 = muted).
// A capo raises every note, so the shape keeps its fingering while the sounding chord moves up.
const OPEN_CHORDS = [
  { id: 'C', root: 'C', q: 'maj', f: [-1, 3, 2, 0, 1, 0] },
  { id: 'A', root: 'A', q: 'maj', f: [-1, 0, 2, 2, 2, 0] },
  { id: 'G', root: 'G', q: 'maj', f: [3, 2, 0, 0, 0, 3] },
  { id: 'E', root: 'E', q: 'maj', f: [0, 2, 2, 1, 0, 0] },
  { id: 'D', root: 'D', q: 'maj', f: [-1, -1, 0, 2, 3, 2] },
  { id: 'Am', root: 'A', q: 'min', f: [-1, 0, 2, 2, 1, 0] },
  { id: 'Em', root: 'E', q: 'min', f: [0, 2, 2, 0, 0, 0] },
  { id: 'Dm', root: 'D', q: 'min', f: [-1, -1, 0, 2, 3, 1] }
];
const TRIAD_IVS = { maj: ['1', '3', '5'], min: ['1', 'b3', '5'] };
// Minor keys are usually written with sharps (C#m, F#m, G#m), major keys with flats (Db, Eb, Ab)
const MINOR_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const INVERSION_OF = { '1': 0, '3': 1, 'b3': 1, '5': 2 };   // the bass note decides the inversion

// Root of the chord that actually sounds when an open shape is played with a capo
function capoChord(chord, capo) {
  const pc = (parseNote(chord.root).pc + capo) % 12;
  return (chord.q === 'min' ? MINOR_ROOTS : ROOTS)[pc];
}

// Every close-voiced triad on three adjacent strings (lowString, +1, +2) between the capo and maxFret.
// Close voicing means the three different chord tones, ascending, within one octave,
// and playable within maxSpan frets. The capo works as a new nut, so nothing below it is used.
function triadVoicings(rootPc, quality, lowString, capo = 0, maxFret = 15, maxSpan = 4) {
  const byPc = new Map(TRIAD_IVS[quality].map(iv => [(rootPc + IV[iv][0]) % 12, iv]));
  const strings = [lowString, lowString + 1, lowString + 2];
  const out = [];
  for (let a = capo; a <= maxFret; a++) for (let b = capo; b <= maxFret; b++) for (let c = capo; c <= maxFret; c++) {
    const frets = [a, b, c];
    const lo = Math.min(a, b, c), hi = Math.max(a, b, c);
    if (hi - lo > maxSpan) continue;
    const midis = strings.map((st, i) => TUNING[st] + frets[i]);
    const ivs = midis.map(m => byPc.get(m % 12));
    if (ivs.some(iv => !iv) || new Set(ivs).size !== 3) continue;
    if (!(midis[0] < midis[1] && midis[1] < midis[2]) || midis[2] - midis[0] >= 12) continue;
    out.push({ strings, frets, ivs, inversion: INVERSION_OF[ivs[0]], lo, hi });
  }
  return out.sort((p, q) => p.lo - q.lo || p.hi - q.hi);
}

// Interval names with quality, as in standard theory texts:
// P = perfect, M = major, m = minor, A = augmented, d = diminished.
// Unisons, fourths, fifths and octaves are perfect; seconds, thirds, sixths and sevenths are major or minor.
// The quality is the distance in semitones from the major-scale interval with the same number.
const PERFECT_DEGREES = [1, 4, 5, 8];
const MAJOR_SCALE_SEMIS = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 8: 12 };
function intervalName(iv) {
  const [semi, deg] = IV[iv];
  const off = semi - MAJOR_SCALE_SEMIS[deg];
  if (deg === 1 && off === 0) return 'R';
  let q;
  if (PERFECT_DEGREES.includes(deg)) q = off === 0 ? 'P' : off > 0 ? 'A'.repeat(off) : 'd'.repeat(-off);
  else q = off === 0 ? 'M' : off === -1 ? 'm' : off < -1 ? 'd'.repeat(-off - 1) : 'A'.repeat(off);
  return q + deg;
}

// Note names. 'intl' writes B natural as B. 'no' (German and Nordic) writes B natural as H and B flat as B.
const naming = { system: 'intl' };
function parseNote(n) {
  const L = LETTERS.indexOf(n[0]);
  let acc = 0;
  for (const c of n.slice(1)) acc += c === '#' ? 1 : -1;
  return { L, acc, pc: ((NATURAL[L] + acc) % 12 + 12) % 12 };
}
function fmt(letter, acc) {
  let base = letter, a = acc;
  if (naming.system === 'no' && letter === 'B') {
    if (acc < 0) { base = 'B'; a = acc + 1; } else base = 'H';
  }
  return base + (a > 0 ? '♯'.repeat(a) : '♭'.repeat(-a));
}
function noteName(n) { const p = parseNote(n); return fmt(LETTERS[p.L], p.acc); }
// Spell an interval from the root with the correct letter (A + b3 = C, not B#).
// spellRaw gives plain text that parseNote reads back ('F#', 'Bb'); spell gives the name to show.
function spellRaw(root, iv) {
  const r = parseNote(root);
  const [semi, deg] = IV[iv];
  const L = (r.L + deg - 1) % 7;
  const pc = (r.pc + semi) % 12;
  let d = ((pc - NATURAL[L]) % 12 + 12) % 12;
  if (d > 6) d -= 12;
  return LETTERS[L] + (d > 0 ? '#'.repeat(d) : 'b'.repeat(-d));
}
const spell = (root, iv) => noteName(spellRaw(root, iv));
const ivFmt = iv => iv.replace(/b/g, '♭').replace(/#/g, '♯');
function role(iv) {
  if (iv === '1' || iv === '8') return 'root';
  if (iv === 'b3' || iv === '3') return 'third';
  if (iv === '5' || iv === 'b5' || iv === '#5') return 'fifth';
  if (iv === 'b7' || iv === '7' || iv === 'bb7') return 'seventh';
  return 'other';
}
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const chordSymbol = (root, id) => noteName(root) + chordById(id).sym;
// The notes of a chord or scale with their role, so they can be drawn and labelled
const tonesOf = (root, ivs) => ivs.map(iv => ({ iv, pc: (parseNote(root).pc + IV[iv][0]) % 12, role: role(iv), name: spell(root, iv) }));

/* --- Chords built from a scale (diatonic harmony) ---
   Stacking every other note of a seven-note scale gives a triad on each degree, and one more third
   gives a seventh chord. Roman numerals follow the scale: upper case for a major third, lower case for
   a minor third, ° diminished, + augmented, ø half-diminished. In C major that is
   I ii iii IV V vi vii°, and with sevenths Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7. */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const ROMAN_SUFFIX = { maj: '', min: '', dim: '°', aug: '+', '7': '7', maj7: 'maj7', m7: '7', m7b5: 'ø7', dim7: '°7', mmaj7: '(maj7)', maj7s5: '+maj7' };
function diatonicChords(root, scaleId, sevenths = false) {
  const sc = SCALES.find(s => s.id === scaleId);
  if (!sc || sc.iv.length !== 7) return [];
  const names = sc.iv.map(iv => spellRaw(root, iv));
  const pcs = names.map(n => parseNote(n).pc);
  return names.map((name, i) => {
    const idx = (sevenths ? [0, 2, 4, 6] : [0, 2, 4]).map(k => (i + k) % 7);
    const semis = idx.map(j => (pcs[j] - pcs[i] + 12) % 12);
    const chord = CHORDS.find(c => c.iv.length === semis.length && c.iv.every((iv, k) => IV[iv][0] === semis[k]));
    const numeral = semis[1] === 3 ? ROMAN[i].toLowerCase() : ROMAN[i];
    return { degree: i + 1, root: name, notes: idx.map(j => names[j]), chord, roman: numeral + (chord ? ROMAN_SUFFIX[chord.id] : '?') };
  });
}

/* --- Chord progressions ---
   Each chord is written as [Roman numeral, interval of its root above the key note, chord type, bars].
   The numerals follow the key: in a minor key VII and VI are the chords on the seventh and sixth notes of
   the natural minor scale (G and F in A minor), and V is the major V that the harmonic minor scale gives.
   In a major key a chord from outside the key is marked with its accidental (♭VII). */
const PROGRESSIONS = [
  { id: 'pop', name: 'I–V–vi–IV', nick: 'The pop progression', mode: 'major',
    chords: [['I', '1', 'maj'], ['V', '5', 'maj'], ['vi', '6', 'min'], ['IV', '4', 'maj']],
    about: 'Probably the most used progression in pop today. Heard in "Let It Be" (The Beatles), "With or Without You" (U2) and "Someone Like You" (Adele).' },
  { id: 'fifties', name: 'I–vi–IV–V', nick: 'The 50s progression', mode: 'major',
    chords: [['I', '1', 'maj'], ['vi', '6', 'min'], ['IV', '4', 'maj'], ['V', '5', 'maj']],
    about: 'The doo-wop progression behind countless love songs of the 1950s.' },
  { id: 'sadpop', name: 'vi–IV–I–V', nick: 'Pop, starting on the minor chord', mode: 'major',
    chords: [['vi', '6', 'min'], ['IV', '4', 'maj'], ['I', '1', 'maj'], ['V', '5', 'maj']],
    about: 'The same four chords as I–V–vi–IV, but starting on vi, which makes it sound more wistful.' },
  { id: 'three', name: 'I–IV–V–I', nick: 'The three-chord trick', mode: 'major',
    chords: [['I', '1', 'maj'], ['IV', '4', 'maj'], ['V', '5', 'maj'], ['I', '1', 'maj']],
    about: 'The three major chords of a major key. The backbone of rock, country and folk.' },
  { id: 'canon', name: 'I–V–vi–iii–IV–I–IV–V', nick: 'Pachelbel’s Canon', mode: 'major',
    chords: [['I', '1', 'maj'], ['V', '5', 'maj'], ['vi', '6', 'min'], ['iii', '3', 'min'], ['IV', '4', 'maj'], ['I', '1', 'maj'], ['IV', '4', 'maj'], ['V', '5', 'maj']],
    about: 'The bass line of Pachelbel’s Canon in D steps down, and many pop songs borrow it.' },
  { id: 'turnaround', name: 'I–vi–ii–V', nick: 'The turnaround', mode: 'major',
    chords: [['I', '1', 'maj'], ['vi', '6', 'min'], ['ii', '2', 'min'], ['V', '5', 'maj']],
    about: 'Each chord moves down a fifth to the next, leading back to I. Common in jazz standards and old pop.' },
  { id: 'twofive', name: 'ii7–V7–Imaj7', nick: 'The ii–V–I', mode: 'major',
    chords: [['ii7', '2', 'm7'], ['V7', '5', '7'], ['Imaj7', '1', 'maj7', 2]],
    about: 'The most important progression in jazz. In C major it is Dm7, G7 and Cmaj7.' },
  { id: 'blues', name: '12-bar blues', nick: 'Blues with dominant sevenths', mode: 'major',
    chords: [['I7', '1', '7', 4], ['IV7', '4', '7', 2], ['I7', '1', '7', 2], ['V7', '5', '7'], ['IV7', '4', '7'], ['I7', '1', '7'], ['V7', '5', '7']],
    about: 'Four bars of I, two of IV, two of I, then V, IV, I and V to turn around. All three chords are dominant sevenths.' },
  { id: 'rock', name: 'I–♭VII–IV–I', nick: 'Rock with a borrowed ♭VII', mode: 'major',
    chords: [['I', '1', 'maj'], ['♭VII', 'b7', 'maj'], ['IV', '4', 'maj'], ['I', '1', 'maj']],
    about: 'The ♭VII chord is borrowed from the Mixolydian mode and gives a classic rock sound.' },
  { id: 'andalusian', name: 'i–VII–VI–V', nick: 'The Andalusian cadence', mode: 'minor',
    chords: [['i', '1', 'min'], ['VII', 'b7', 'maj'], ['VI', 'b6', 'maj'], ['V', '5', 'maj']],
    about: 'Steps down from the minor chord to a major V, as in flamenco. In A minor: Am, G, F, E.' },
  { id: 'minorpop', name: 'i–VI–III–VII', nick: 'Minor pop', mode: 'minor',
    chords: [['i', '1', 'min'], ['VI', 'b6', 'maj'], ['III', 'b3', 'maj'], ['VII', 'b7', 'maj']],
    about: 'The chords of the natural minor scale. In A minor: Am, F, C, G, the same chords as vi–IV–I–V in C major.' },
  { id: 'minorcadence', name: 'i–iv–V–i', nick: 'Minor cadence', mode: 'minor',
    chords: [['i', '1', 'min'], ['iv', '4', 'min'], ['V', '5', 'maj'], ['i', '1', 'min']],
    about: 'The basic minor-key progression. The V chord is major, with the raised seventh of harmonic minor, so it pulls home to i.' }
];
// The name of a key: major keys with flats (Db, Eb, Ab, Bb), minor keys with sharps (C#m, F#m, G#m)
const keyName = (pc, mode) => (mode === 'minor' ? MINOR_ROOTS : ROOTS)[((pc % 12) + 12) % 12];
// A grip near the nut with open strings, the kind found in chord books as an open chord
const isOpenGrip = p => p.base === 0 && p.lo <= 3;
function openGrip(rootPc, q) { return chordShapes(rootPc, q).find(isOpenGrip) || null; }
// The chords of a progression in a key. With a capo the shapes are those of the key `capo` semitones lower:
// with capo 2, A major is played with the shapes of G major.
function progressionChords(prog, keyPc, capo = 0) {
  const key = keyName(keyPc, prog.mode), shapeKey = keyName(keyPc - capo, prog.mode);
  let bar = 0;
  return prog.chords.map(([roman, iv, q, bars = 1]) => {
    const root = spellRaw(key, iv), shapeRoot = spellRaw(shapeKey, iv);
    const c = { roman, iv, q, bars, bar, root, shapeRoot, symbol: chordSymbol(root, q), shapeSymbol: chordSymbol(shapeRoot, q) };
    bar += bars;
    return c;
  });
}
const progressionBars = prog => prog.chords.reduce((n, c) => n + (c[3] || 1), 0);
// Capo positions (up to maxCapo) where every chord of the progression has an open grip
function capoSuggestions(prog, keyPc, maxCapo = 9) {
  const out = [];
  for (let capo = 0; capo <= maxCapo; capo++) {
    const chords = progressionChords(prog, keyPc, capo);
    if (chords.every(c => openGrip(parseNote(c.shapeRoot).pc, c.q))) out.push({ capo, shapeKey: keyName(keyPc - capo, prog.mode) });
  }
  return out;
}

/* ================= RHYTHM (metronome, pure functions) ================= */
// The clicks inside one beat, as fractions of the beat: 'accent' (beat 1), 'beat' or 'sub' (a subdivision).
// subdiv is the number of notes per beat, or a list with one number per beat.
// only: click only on these beats (1-based), offbeat: click only halfway between the beats, silent: no click.
function beatClicks({ subdiv = 1, accent = true, only = null, offbeat = false, silent = false } = {}, beat) {
  if (silent) return [];
  if (offbeat) return [{ at: 0.5, kind: 'beat' }];
  const n = Array.isArray(subdiv) ? subdiv[beat] || 1 : subdiv, out = [];
  if (!only || only.includes(beat + 1)) out.push({ at: 0, kind: accent && beat === 0 ? 'accent' : 'beat' });
  for (let k = 1; k < n; k++) out.push({ at: k / n, kind: 'sub' });
  return out;
}
// Speed trainer: start at `start` BPM and go up `step` BPM every `every` bars until `target`
const trainerBpm = (start, step, every, target, bar) =>
  step > 0 && target > start ? Math.min(target, start + step * Math.floor(bar / Math.max(1, every))) : start;
// Gap click: `on` bars with the click, then `off` bars without it, over and over
const isSilentBar = (on, off, bar) => off > 0 && bar % (on + off) >= on;
// Subdivision ladder: 1, 2, 3 and 4 notes per click, `each` bars of each, then from the start again
const LADDER = [1, 2, 3, 4];
const ladderStep = (each, bar) => LADDER[Math.floor(bar / Math.max(1, each)) % LADDER.length];
// Tap tempo: the tempo from the times of the last taps in seconds, or null with fewer than two taps
function tapTempo(times) {
  if (times.length < 2) return null;
  return Math.round(60 * (times.length - 1) / (times[times.length - 1] - times[0]));
}
// Spider exercise: fingers 1-2-3-4 on one fret each from `fret`, low E string to high e and back down
function spiderNotes(fret) {
  const up = [], down = [];
  for (let st = 0; st < 6; st++) for (let k = 0; k < 4; k++) up.push({ st, f: fret + k, finger: k + 1 });
  for (let st = 5; st >= 0; st--) for (let k = 3; k >= 0; k--) down.push({ st, f: fret + k, finger: k + 1 });
  return up.concat(down);
}

/* ================= SYNTHESIS (pure functions, no Web Audio, so they can be tested) ================= */
// Karplus-Strong plucked string: a short noise burst circulates in a delay line and is low-pass filtered on every pass.
// In this implementation each output sample is the average of the samples N and N-1 steps back,
// so the loop period is N - 0.5 samples. N must be an integer, so the remaining fraction of a sample
// is corrected with a playback rate. Without that correction high notes come out audibly flat.
function synthPluck(f, sr, seconds = 2.6) {
  const N = Math.max(3, Math.round(sr / f + 0.5));
  const period = N - 0.5;
  const rate = f / (sr / period);
  const ring = new Float32Array(N);
  for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
  for (let i = 1; i < N; i++) ring[i] = 0.5 * (ring[i] + ring[i - 1]);   // softer attack
  const decay = Math.pow(0.5, 1 / ((sr / period) * 0.9));              // similar sustain in every register
  const len = Math.floor(sr * seconds), d = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const j = i % N, k = (j + 1) % N;
    d[i] = ring[j];
    ring[j] = decay * 0.5 * (ring[j] + ring[k]);
  }
  const fade = Math.floor(sr * 0.15);
  for (let i = 0; i < fade; i++) d[len - 1 - i] *= i / fade;
  return { samples: d, rate };
}
// Simple additive piano-like tone: partials that die away faster the higher they are,
// with a touch of string inharmonicity so it sounds less like an organ.
function synthPiano(f, sr, seconds = 3) {
  const len = Math.floor(sr * seconds), d = new Float32Array(len);
  const brightness = Math.sqrt(f / 261.6);
  for (let h = 1; h <= 6; h++) {
    const fh = f * h * Math.sqrt(1 + 0.0001 * (h * h - 1));          // fundamental stays exactly at f
    if (fh > sr / 2.2) break;
    const k = Math.exp(-(1.1 + 0.8 * h) * brightness / sr);
    const w = 2 * Math.PI * fh / sr;
    let env = 0.32 / Math.pow(h, 1.4);
    for (let i = 0; i < len; i++) { d[i] += env * Math.sin(w * i); env *= k; }
  }
  const atk = Math.floor(sr * 0.004);
  for (let i = 0; i < atk; i++) d[i] *= i / atk;
  const fade = Math.floor(sr * 0.2);
  for (let i = 0; i < fade; i++) d[len - 1 - i] *= i / fade;
  return { samples: d, rate: 1 };
}

// Metronome click: a short sine burst that dies away within a few hundredths of a second
function synthClick(f, sr, seconds = 0.05) {
  const len = Math.floor(sr * seconds), d = new Float32Array(len), atk = Math.max(1, Math.floor(sr * 0.001));
  for (let i = 0; i < len; i++) d[i] = 0.8 * Math.sin(2 * Math.PI * f * i / sr) * Math.exp(-i / sr * 110) * Math.min(1, i / atk);
  return { samples: d, rate: 1 };
}

/* ================= PITCH DETECTION (pure functions, used by the tuner) ================= */
// YIN pitch detector (de Cheveigné and Kawahara, 2002).
// 1. Difference function: how much the signal differs from itself shifted by tau samples.
// 2. Cumulative mean normalisation, so the curve starts at 1 and true periods dip towards 0.
// 3. Take the first dip below the threshold (the first one avoids octave errors), then the bottom of that dip.
// 4. Parabolic interpolation gives a period between whole samples, which matters for accuracy in cents.
// Returns { freq, clarity } or null when no periodic signal is found.
function detectPitch(x, sr, minF = 60, maxF = 1100, threshold = 0.15) {
  const tauMin = Math.max(2, Math.floor(sr / maxF));
  const tauMax = Math.min(Math.ceil(sr / minF), Math.floor(x.length / 2) - 2);
  const W = x.length - tauMax - 1;
  const d = new Float32Array(tauMax + 2);
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    let sum = 0;
    for (let i = 0; i < W; i++) { const v = x[i] - x[i + tau]; sum += v * v; }
    d[tau] = sum;
  }
  const c = new Float32Array(tauMax + 2);
  c[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax + 1; tau++) { running += d[tau]; c[tau] = running > 0 ? d[tau] * tau / running : 1; }
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (c[t] < threshold) { while (t + 1 <= tauMax && c[t + 1] < c[t]) t++; tau = t; break; }
  }
  if (tau < 0) {                       // no dip below the threshold: accept the deepest one if it is clear enough
    let best = tauMin;
    for (let t = tauMin; t <= tauMax; t++) if (c[t] < c[best]) best = t;
    if (c[best] > 0.35) return null;
    tau = best;
  }
  // interpolate on the raw difference function, which is closer to a parabola than the normalised one
  const a = d[tau - 1], b = d[tau], e = d[tau + 1], den = a - 2 * b + e;
  const shift = den !== 0 ? Math.max(-1, Math.min(1, 0.5 * (a - e) / den)) : 0;
  return { freq: sr / (tau + shift), clarity: 1 - c[tau] };
}
// Samples analysed per reading. 8192 is about 170 ms, which holds more than a dozen periods of the low E string.
const PITCH_WINDOW = 8192;
function signalLevel(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / x.length); }
const freqToMidi = f => 69 + 12 * Math.log2(f / 440);
// Distance from a target note in cents. With anyOctave, singing the note an octave higher or lower counts as a hit.
function foldCents(midi, target, anyOctave) {
  let d = midi - target;
  if (anyOctave) d -= 12 * Math.round(d / 12);
  return d * 100;
}
const median = arr => { const a = [...arr].sort((p, q) => p - q); return a[Math.floor(a.length / 2)]; };
