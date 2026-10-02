// Verifies the music theory, the chord shapes and the synthesized pitches used by the app.
// Run with:  node verify_notes.mjs
//
// The script loads static/theory.js, the same file the page loads, so it tests exactly
// the code the page runs. The expected answers below are written out by hand from
// standard references, not computed by the code under test.

import { readFileSync } from 'node:fs';

// Fixed random seed, so every run uses the same noise and the results are reproducible
let seed = 12345;
Math.random = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

const source = readFileSync(new URL('./static/theory.js', import.meta.url), 'utf8');
const T = new Function(`
  ${source}
  return { TUNING, IV, ROOTS, SCALES, CHORDS, parseNote, spell, spellRaw, mtof, synthPluck, synthPiano,
           detectPitch, freqToMidi, foldCents, PITCH_WINDOW, intervalName, OPEN_CHORDS, TRIAD_IVS,
           capoChord, triadVoicings, naming, SHAPES, SHAPE_ORDER, CAGED_QUALITIES, CAGED_SCALE, gripOf,
           shapeInstances, chordShapes, positionMidis, scalesContaining, diatonicChords, MINOR_ROOTS };
`)();

let passed = 0, failed = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++; else { failed++; console.log(`FAIL  ${label}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`); }
}
const plain = s => s.replace(/♯/g, '#').replace(/♭/g, 'b');
const spellAll = (root, ivs) => ivs.map(iv => plain(T.spell(root, iv)));
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// 1. Frequencies: A4 = 440 Hz and equal temperament, checked against a standard tuning chart
console.log('1. Frequencies');
const freqs = { 69: 440.00, 60: 261.63, 40: 82.41, 45: 110.00, 50: 146.83, 55: 196.00, 59: 246.94, 64: 329.63, 81: 880.00 };
for (const [m, hz] of Object.entries(freqs)) check(`MIDI ${m}`, +T.mtof(+m).toFixed(2), hz);

// 2. Standard tuning and fretboard positions, as any guitar chart shows them
console.log('2. Fretboard');
check('open strings', T.TUNING.map(m => NAMES[m % 12]), ['E', 'A', 'D', 'G', 'B', 'E']);
const fretFacts = [[1, 3, 'C'], [5, 5, 'A'], [3, 2, 'A'], [0, 12, 'E'], [4, 1, 'C'], [2, 7, 'A'], [0, 5, 'A'], [4, 4, 'D#']];
for (const [s, f, n] of fretFacts) check(`string ${s} fret ${f}`, NAMES[(T.TUNING[s] + f) % 12], n);
// The B string is tuned a major third above G, all the others a fourth apart
check('string gaps in semitones', T.TUNING.slice(1).map((m, i) => m - T.TUNING[i]), [5, 5, 5, 4, 5]);

// 3. Known scales and chords, spelled with correct letters
console.log('3. Spelling of known scales and chords');
const known = [
  ['C', 'major', ['C', 'D', 'E', 'F', 'G', 'A', 'B']],
  ['Eb', 'major', ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D']],
  ['F#', 'major', ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']],
  ['A', 'minor', ['A', 'B', 'C', 'D', 'E', 'F', 'G']],
  ['A', 'minpenta', ['A', 'C', 'D', 'E', 'G']],
  ['E', 'blues', ['E', 'G', 'A', 'Bb', 'B', 'D']],
  ['D', 'dorian', ['D', 'E', 'F', 'G', 'A', 'B', 'C']],
  ['G', 'mixolydian', ['G', 'A', 'B', 'C', 'D', 'E', 'F']],
  ['F', 'lydian', ['F', 'G', 'A', 'B', 'C', 'D', 'E']],
  ['E', 'phrygian', ['E', 'F', 'G', 'A', 'B', 'C', 'D']],
  ['A', 'harmminor', ['A', 'B', 'C', 'D', 'E', 'F', 'G#']]
];
for (const [root, id, exp] of known) check(`${root} ${id}`, spellAll(root, T.SCALES.find(s => s.id === id).iv), exp);
const chords = [
  ['A', 'maj', ['A', 'C#', 'E']], ['C', 'min', ['C', 'Eb', 'G']], ['B', 'dim', ['B', 'D', 'F']],
  ['C', 'aug', ['C', 'E', 'G#']], ['G', '7', ['G', 'B', 'D', 'F']], ['Db', 'maj7', ['Db', 'F', 'Ab', 'C']],
  ['F#', 'm7b5', ['F#', 'A', 'C', 'E']], ['B', 'dim7', ['B', 'D', 'F', 'Ab']], ['D', 'sus4', ['D', 'G', 'A']],
  ['A', 'mmaj7', ['A', 'C', 'E', 'G#']], ['C', 'maj7s5', ['C', 'E', 'G#', 'B']]
];
for (const [root, id, exp] of chords) check(`${root}${id}`, spellAll(root, T.CHORDS.find(c => c.id === id).iv), exp);

// 4. Exhaustive consistency: every spelled note has the right pitch, and 7-note scales use each letter once
console.log('4. All roots x all scales and chords');
const pcOf = name => T.parseNote(name).pc;
for (const root of T.ROOTS) {
  for (const set of [...T.SCALES, ...T.CHORDS]) {
    const names = spellAll(root, set.iv);
    const pcs = names.map(pcOf);
    const expected = set.iv.map(iv => (pcOf(root) + T.IV[iv][0]) % 12);
    check(`${root} ${set.id} pitch classes`, pcs, expected);
    if (set.iv.length === 7) check(`${root} ${set.id} uses all seven letters once`, new Set(names.map(n => n[0])).size, 7);
  }
}

// 5. Norwegian note names: B means B flat and H means B natural
console.log('5. Norwegian H/B naming');
T.naming.system = 'no';
check('F major in Norwegian', spellAll('F', T.SCALES[0].iv), ['F', 'G', 'A', 'B', 'C', 'D', 'E']);
check('G major in Norwegian', spellAll('G', T.SCALES[0].iv), ['G', 'A', 'H', 'C', 'D', 'E', 'F#']);
check('Eb minor in Norwegian', spellAll('Eb', T.SCALES[1].iv), ['Eb', 'F', 'Gb', 'Ab', 'B', 'Cb', 'Db']);
T.naming.system = 'intl';

// 6. CAGED shapes: in every key, each major shape contains only notes of the major triad, and all three of them
console.log('6. Major CAGED shapes in all 12 keys');
check('the open major shapes are C A G E D', T.SHAPE_ORDER.map(l => T.SHAPES.maj[l]),
  ['x 3 2 0 1 0', 'x 0 2 2 2 0', '3 2 0 0 0 3', '0 2 2 1 0 0', 'x x 0 2 3 2']);
for (const root of T.ROOTS) {
  const rp = pcOf(root), triad = new Set([rp, (rp + 4) % 12, (rp + 7) % 12]);
  for (const letter of T.SHAPE_ORDER) {
    const shapes = T.shapeInstances(rp, 'maj', letter);
    check(`${root} ${letter}-shape fits on the neck at least once`, shapes.length >= 1, true);
    for (const sh of shapes) {
      const pcs = T.positionMidis(sh).map(m => m % 12);
      check(`${root} ${letter}-shape only triad tones`, pcs.every(pc => triad.has(pc)), true);
      check(`${root} ${letter}-shape has root, third and fifth`, new Set(pcs).size, 3);
      // the lowest sounding note of each shape is the root (true for all five classic shapes)
      check(`${root} ${letter}-shape bass note is the root`, Math.min(...T.positionMidis(sh)) % 12, rp);
    }
  }
}

// 7. Measured pitch of the actual audio. Renders each sound and estimates its frequency
//    by autocorrelation, then reports the error in cents (100 cents = one semitone).
//    Most listeners notice errors from roughly 5 to 10 cents; the limit here is 3.
console.log('7. Measured pitch of the synthesized sound');
function measure(samples, sr) {
  const start = Math.floor(sr * 0.15), n = Math.floor(sr * 0.25);
  const x = samples.subarray(start, start + n + 2000);
  const corr = lag => { let s = 0; for (let i = 0; i < n; i++) s += x[i] * x[i + lag]; return s; };
  const minLag = Math.floor(sr / 1200), maxLag = Math.ceil(sr / 60);
  const c = []; for (let l = minLag - 1; l <= maxLag + 1; l++) c[l] = corr(l);   // real values at the edges, no artificial zeros
  // take the first lag that comes within 90 % of the strongest peak, which avoids octave errors
  let best = minLag; for (let l = minLag; l <= maxLag; l++) if (c[l] > c[best]) best = l;
  for (let l = minLag; l <= maxLag; l++) if (c[l] > c[l - 1] && c[l] >= c[l + 1] && c[l] > 0.9 * c[best]) { best = l; break; }
  const a = c[best - 1], b = c[best], d = c[best + 1];
  const lag = best + 0.5 * (a - d) / (a - 2 * b + d);   // parabolic interpolation between samples
  return sr / lag;
}
const cents = (f, ref) => 1200 * Math.log2(f / ref);
let worst = 0;
for (const sr of [44100, 48000]) {
  for (const inst of ['guitar', 'piano']) {
    for (let m = 40; m <= 79; m++) {
      const target = T.mtof(m);
      const r = inst === 'guitar' ? T.synthPluck(target, sr) : T.synthPiano(target, sr);
      const heard = measure(r.samples, sr) * r.rate;        // playbackRate scales the pitch
      const err = cents(heard, target);
      worst = Math.max(worst, Math.abs(err));
      if (Math.abs(err) > 3) { failed++; console.log(`FAIL  ${inst} MIDI ${m} at ${sr} Hz is off by ${err.toFixed(1)} cents`); } else passed++;
    }
  }
}
console.log(`   largest pitch error over E2 to G5: ${worst.toFixed(2)} cents`);

// 8. The tuner's pitch detector. It gets one microphone-sized window (PITCH_WINDOW samples, as in the page)
//    of a sine, the guitar sound and the piano sound, clean and with background noise added,
//    and must name the right note and land within 5 cents. With noise the tuner takes the median
//    of five frames, and the test does the same.
console.log('8. Pitch detection used by the tuner');
const WINDOW = T.PITCH_WINDOW;   // same window size as the page uses
function addNoise(x, ratio) {
  let p = 0; for (const v of x) p += v * v;
  const amp = Math.sqrt(p / x.length) * ratio * Math.sqrt(3);   // uniform noise with rms = ratio * signal rms
  return x.map(v => v + (Math.random() * 2 - 1) * amp);
}
let worstDetect = 0;
for (const sr of [44100, 48000]) {
  for (let m = 40; m <= 79; m++) {
    const f = T.mtof(m), start = Math.floor(sr * 0.2);
    const sine = new Float32Array(WINDOW).map((_, i) => 0.3 * Math.sin(2 * Math.PI * f * (start + i) / sr));
    const pluck = T.synthPluck(f, sr, 0.5), piano = T.synthPiano(f, sr, 0.5);
    const cases = [
      ['sine', sine, 1],
      ['guitar', pluck.samples.slice(start, start + WINDOW), pluck.rate],
      ['piano', piano.samples.slice(start, start + WINDOW), 1]
    ];
    for (const [name, x, rate] of cases) {
      for (const label of ['clean', 'noisy']) {
        // clean: one window. noisy: five windows with fresh noise and the median, exactly as the tuner smooths
        const frames = label === 'clean' ? [T.detectPitch(x, sr)] : [0, 1, 2, 3, 4].map(() => T.detectPitch(addNoise(x, 0.1), sr));
        const freqs = frames.filter(Boolean).map(q => q.freq).sort((a, b) => a - b);
        const p = freqs.length >= (label === 'clean' ? 1 : 3) ? { freq: freqs[Math.floor(freqs.length / 2)] } : null;
        const heard = p ? p.freq * rate : NaN;
        const err = p ? cents(heard, f) : Infinity;
        const note = p ? Math.round(T.freqToMidi(heard)) : null;
        if (note === m && Math.abs(err) <= 5) { passed++; worstDetect = Math.max(worstDetect, Math.abs(err)); }
        else { failed++; console.log(`FAIL  detect ${name} ${label} MIDI ${m} at ${sr} Hz: got ${p ? heard.toFixed(2) + ' Hz (' + err.toFixed(1) + ' cents)' : 'nothing'}`); }
      }
    }
  }
}
console.log(`   largest detection error: ${worstDetect.toFixed(2)} cents`);
// pure noise must not be reported as a note
let falseNotes = 0;
for (let k = 0; k < 30; k++) if (T.detectPitch(new Float32Array(WINDOW).map(() => Math.random() * 2 - 1), 48000)) falseNotes++;
check('white noise gives no pitch (30 windows)', falseNotes, 0);

// 9. Octave folding in "Hit the note": singing the target an octave off counts when "Accept any octave" is on
console.log('9. Octave folding for the hit exercise');
check('A2 vs A3, any octave', T.foldCents(45, 57, true), 0);
check('A2 vs A3, same octave only', T.foldCents(45, 57, false), -1200);
check('20 cents sharp, two octaves up', Math.round(T.foldCents(81.2, 57, true)), 20);
check('a semitone flat stays a semitone flat', Math.round(T.foldCents(56, 57, true)), -100);

// 10. Interval names. Expected values from the semitone table in Open Music Theory, "Intervals"
//     (https://viva.pressbooks.pub/openmusictheory/chapter/intervals/): unisons, fourths, fifths and
//     octaves are perfect; augmented is a half step larger than perfect or major, diminished a half step
//     smaller than perfect or minor.
console.log('10. Interval names (R, m3, M3, P5 ...)');
const NAMED = { '1': 'R', 'b2': 'm2', '2': 'M2', 'b3': 'm3', '3': 'M3', '4': 'P4', '#4': 'A4', 'b5': 'd5', '5': 'P5',
  '#5': 'A5', 'b6': 'm6', '6': 'M6', 'bb7': 'd7', 'b7': 'm7', '7': 'M7', '8': 'P8' };
const SEMIS = { R: 0, m2: 1, M2: 2, m3: 3, M3: 4, P4: 5, A4: 6, d5: 6, P5: 7, A5: 8, m6: 8, M6: 9, d7: 9, m7: 10, M7: 11, P8: 12 };
for (const [iv, name] of Object.entries(NAMED)) {
  check(`interval ${iv} is called ${name}`, T.intervalName(iv), name);
  check(`${name} is ${SEMIS[name]} semitones`, T.IV[iv][0], SEMIS[name]);
}

// 11. Chord and scale construction, in semitones above the root and as whole/half steps.
//     Chord formulas as in Open Music Theory, "Triads" and "Seventh chords"; scale step patterns
//     (W = whole step, H = half step) as in any standard theory text.
console.log('11. Chord formulas and scale step patterns');
const CHORD_SEMIS = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7],
  '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9],
  mmaj7: [0, 3, 7, 11], maj7s5: [0, 4, 8, 11] };
for (const c of T.CHORDS) check(`chord ${c.id} formula`, c.iv.map(iv => T.IV[iv][0]), CHORD_SEMIS[c.id]);
const STEPS = { major: 'WWHWWWH', minor: 'WHWWHWW', dorian: 'WHWWWHW', phrygian: 'HWWWHWW', lydian: 'WWWHWWH',
  mixolydian: 'WWHWWHW', harmminor: 'WHWWH3H' };
for (const sc of T.SCALES) {
  if (!STEPS[sc.id]) continue;
  const semis = sc.iv.map(iv => T.IV[iv][0]).concat(12);
  const pattern = semis.slice(1).map((x, i) => ({ 1: 'H', 2: 'W', 3: '3' })[x - semis[i]]).join('');
  check(`scale ${sc.id} steps`, pattern, STEPS[sc.id]);
}
check('minor pentatonic', T.SCALES.find(x => x.id === 'minpenta').iv.map(iv => T.IV[iv][0]), [0, 3, 5, 7, 10]);
check('major pentatonic', T.SCALES.find(x => x.id === 'majpenta').iv.map(iv => T.IV[iv][0]), [0, 2, 4, 7, 9]);
check('blues scale', T.SCALES.find(x => x.id === 'blues').iv.map(iv => T.IV[iv][0]), [0, 3, 5, 6, 7, 10]);

// 12. Triads with capo. Inversion is decided by the bass note only: root = root position,
//     third = first inversion, fifth = second inversion (Open Music Theory, "Inversion").
//     A capo raises every string by one semitone per fret.
console.log('12. Triads and capo');
check('G shape, capo 2 sounds A', T.capoChord(T.OPEN_CHORDS.find(c => c.id === 'G'), 2), 'A');
check('D shape, capo 7 sounds A', T.capoChord(T.OPEN_CHORDS.find(c => c.id === 'D'), 7), 'A');
check('Em shape, capo 3 sounds G minor', T.capoChord(T.OPEN_CHORDS.find(c => c.id === 'Em'), 3), 'G');
check('C shape, capo 5 sounds F', T.capoChord(T.OPEN_CHORDS.find(c => c.id === 'C'), 5), 'F');
check('E shape, capo 4 sounds Ab', T.capoChord(T.OPEN_CHORDS.find(c => c.id === 'E'), 4), 'Ab');
const has = (list, frets, inv) => list.some(v => JSON.stringify(v.frets) === JSON.stringify(frets) && v.inversion === inv);
const cOnTop = T.triadVoicings(0, 'maj', 3, 0);                 // C major on G B e
check('C on G B e, root position 5-5-3', has(cOnTop, [5, 5, 3], 0), true);
check('C on G B e, 1st inversion 9-8-8', has(cOnTop, [9, 8, 8], 1), true);
check('C on G B e, 2nd inversion 0-1-0', has(cOnTop, [0, 1, 0], 2), true);
check('C on G B e, 2nd inversion 12-13-12', has(cOnTop, [12, 13, 12], 2), true);
check('A on D G B, root position 7-6-5', has(T.triadVoicings(9, 'maj', 2, 0), [7, 6, 5], 0), true);
check('Am on G B e, root position 2-1-0', has(T.triadVoicings(9, 'min', 3, 0), [2, 1, 0], 0), true);
check('G with capo 2 is not allowed below the capo', T.triadVoicings(9, 'maj', 3, 2).every(v => v.lo >= 2), true);
for (const ch of T.OPEN_CHORDS) {
  for (let capo = 0; capo <= 12; capo++) {
    const rp = (T.parseNote(ch.root).pc + capo) % 12;
    const triad = T.TRIAD_IVS[ch.q].map(iv => (rp + T.IV[iv][0]) % 12);
    // the open shape with a capo must contain exactly the triad, with the root as the lowest note
    const notes = ch.f.map((f, st) => f < 0 ? null : T.TUNING[st] + f + capo).filter(x => x !== null);
    check(`${ch.id} capo ${capo}: shape is the triad`, [...new Set(notes.map(m => m % 12))].sort((a, b) => a - b), [...triad].sort((a, b) => a - b));
    check(`${ch.id} capo ${capo}: root in bass`, Math.min(...notes) % 12, rp);
    for (let low = 0; low <= 3; low++) {
      const vs = T.triadVoicings(rp, ch.q, low, capo);
      const ok = vs.every(v => {
        const m = v.strings.map((st, i) => T.TUNING[st] + v.frets[i]);
        const pcs = m.map(x => x % 12);
        const bass = { 0: triad[0], 1: triad[1], 2: triad[2] }[v.inversion];
        return v.lo >= capo && v.hi <= 15 && v.hi - v.lo <= 4 && m[0] < m[1] && m[1] < m[2] && m[2] - m[0] < 12 &&
          new Set(pcs).size === 3 && pcs.every(pc => triad.includes(pc)) && pcs[0] === bass;
      });
      check(`${ch.id} capo ${capo} strings ${low}-${low + 2}: every voicing is a correct close triad`, ok, true);
      // completeness: compare with all voicings on an imagined 27-fret neck, keeping those that fit between capo and fret 15
      const full = T.triadVoicings(rp, ch.q, low, 0, 27);
      check(`${ch.id} capo ${capo} strings ${low}-${low + 2}: a long neck has all three inversions`, new Set(full.map(v => v.inversion)).size, 3);
      const expected = full.filter(v => v.lo >= capo && v.hi <= 15).map(v => v.frets.join('-')).sort();
      check(`${ch.id} capo ${capo} strings ${low}-${low + 2}: finds exactly the voicings that fit`, vs.map(v => v.frets.join('-')).sort(), expected);
    }
  }
}

// 13. Movable shapes for every chord type in every key. A grip may leave out the perfect fifth of a
//     four-note chord (common in seventh-chord grips), but nothing else, and the root is always the lowest note.
console.log('13. Movable chord shapes for all chord types and keys');
for (const c of T.CHORDS) {
  const letters = T.SHAPE_ORDER.filter(l => T.gripOf(c.id, l));
  check(`${c.id} has at least three shapes`, letters.length >= 3, true);
  for (const root of T.ROOTS) {
    const rp = pcOf(root), need = c.iv.map(iv => (rp + T.IV[iv][0]) % 12), fifth = (rp + 7) % 12;
    const shapes = T.chordShapes(rp, c.id);
    check(`${root}${c.id}: every shape letter appears`, [...new Set(shapes.map(s => s.letter))].sort(), [...letters].sort());
    for (const sh of shapes) {
      const ms = T.positionMidis(sh), pcs = ms.map(m => m % 12);
      const missing = need.filter(pc => !pcs.includes(pc));
      const ok = pcs.every(pc => need.includes(pc)) && Math.min(...ms) % 12 === rp && sh.lo >= 0 && sh.hi <= 15 &&
        sh.hi - sh.lo <= 4 && (missing.length === 0 || (c.iv.length === 4 && missing.length === 1 && missing[0] === fifth && c.iv.includes('5')));
      check(`${root}${c.id} ${sh.letter} shape at ${sh.lo}: chord tones, root in bass, span at most 4`, ok, true);
    }
  }
}

// 14. Known grips, written out from standard chord charts (fret per string, low E first, -1 = muted)
console.log('14. Known grips');
const grip = (root, q, letter) => { const s = T.chordShapes(pcOf(root), q).find(x => x.letter === letter); return s && s.frets; };
const KNOWN = [
  ['A', 'maj', 'E', [5, 7, 7, 6, 5, 5]],     // A barre chord
  ['B', 'min', 'A', [-1, 2, 4, 4, 3, 2]],    // Bm barre chord
  ['F#', 'm7', 'E', [2, 4, 2, 2, 2, 2]],     // F#m7 barre chord
  ['D', 'min', 'C', [-1, 5, 3, 2, 3, -1]],   // Dm from the C shape
  ['A', '7', 'G', [5, 4, 2, 2, 2, 3]],       // A7 from the G shape
  ['C', '7', 'A', [-1, 3, 5, 3, 5, 3]],      // C7 barre chord
  ['G', 'maj7', 'E', [3, 5, 4, 4, 3, 3]],    // Gmaj7 barre chord
  ['E', 'm7', 'D', [-1, -1, 2, 4, 3, 3]],    // Em7 from the D shape
  ['C', 'm7b5', 'A', [-1, 3, 4, 3, 4, -1]],  // Cm7b5
  ['G', 'dim7', 'E', [3, -1, 2, 3, 2, 3]],   // Gdim7
  ['C', 'maj', 'C', [-1, 3, 2, 0, 1, 0]],    // open C
  ['E', 'min', 'E', [0, 2, 2, 0, 0, 0]],     // open Em
  ['G', '7', 'G', [3, 2, 0, 0, 0, 1]],       // open G7
  ['D', 'm7', 'D', [-1, -1, 0, 2, 1, 1]]     // open Dm7
];
for (const [root, q, letter, frets] of KNOWN) check(`${root}${q} ${letter} shape`, grip(root, q, letter), frets);

// 15. The CAGED order: going up the neck the five shapes always come as a rotation of C A G E D,
//     for major, minor and the seventh chords alike
console.log('15. CAGED order up the neck');
const ROT = 'CAGEDCAGED';
for (const q of T.CAGED_QUALITIES) for (const root of T.ROOTS) {
  const shapes = T.chordShapes(pcOf(root), q);
  const order = shapes.filter((s, i) => shapes.findIndex(x => x.letter === s.letter) === i).map(s => s.letter).join('');
  check(`${root} ${q}: ${order} is a rotation of CAGED`, order.length === 5 && ROT.includes(order), true);
}

// 16. How the minor and seventh shapes come from the major shapes (the hints on the CAGED page say this):
//     minor lowers the third one fret or drops it; 7 and maj7 turn one root (or in the C shape the fifth)
//     into the seventh; m7 does the same to the minor shape. No other string changes.
console.log('16. Minor and seventh shapes compared with major');
const ivAt = (rootPc, st, f) => { const d = (T.TUNING[st] + f - rootPc + 120) % 12; return { 0: 'R', 3: 'b3', 4: '3', 7: '5', 10: 'b7', 11: '7' }[d]; };
const RULES = {
  min: { from: 'maj', was: ['3'], now: ['b3', '5', null] },
  '7': { from: 'maj', was: ['R', '5'], now: ['b7'] },
  maj7: { from: 'maj', was: ['R'], now: ['7'] },
  m7: { from: 'min', was: ['R', '5'], now: ['b7'] }
};
for (const [q, rule] of Object.entries(RULES)) for (const letter of T.SHAPE_ORDER) {
  const a = T.gripOf(rule.from, letter), b = T.gripOf(q, letter), rp = { C: 0, A: 9, G: 7, E: 4, D: 2 }[letter];
  const changes = a.map((f, st) => f === b[st] ? null : { was: f === null ? null : ivAt(rp, st, f), now: b[st] === null ? null : ivAt(rp, st, b[st]) }).filter(Boolean);
  check(`${q} ${letter} shape changes at least one string`, changes.length >= 1, true);
  check(`${q} ${letter} shape only changes ${rule.was.join('/')} into ${rule.now.map(x => x || 'muted').join('/')}`,
    changes.every(c => rule.was.includes(c.was) && rule.now.includes(c.now)), true);
}
// In the seventh shapes exactly one note becomes the seventh, so the outline of the shape stays
for (const q of ['7', 'maj7', 'm7']) for (const letter of T.SHAPE_ORDER) {
  const rp = { C: 0, A: 9, G: 7, E: 4, D: 2 }[letter], g = T.gripOf(q, letter);
  check(`${q} ${letter} shape has exactly one seventh`, g.filter((f, st) => f !== null && ['b7', '7'].includes(ivAt(rp, st, f))).length, 1);
}

// 17. Chords built from a scale. Expected values from the diatonic triad and seventh-chord tables in
//     standard theory texts (major: I ii iii IV V vi vii°, Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7;
//     harmonic minor: i(maj7) iiø7 III+maj7 iv7 V7 VImaj7 vii°7)
console.log('17. Diatonic chords');
const dia = (root, sc, sev) => T.diatonicChords(root, sc, sev).map(d => d.roman + ' ' + d.root + d.chord.id);
check('C major triads', dia('C', 'major', false), ['I Cmaj', 'ii Dmin', 'iii Emin', 'IV Fmaj', 'V Gmaj', 'vi Amin', 'vii° Bdim']);
check('C major sevenths', dia('C', 'major', true), ['Imaj7 Cmaj7', 'ii7 Dm7', 'iii7 Em7', 'IVmaj7 Fmaj7', 'V7 G7', 'vi7 Am7', 'viiø7 Bm7b5']);
check('A natural minor triads', dia('A', 'minor', false), ['i Amin', 'ii° Bdim', 'III Cmaj', 'iv Dmin', 'v Emin', 'VI Fmaj', 'VII Gmaj']);
check('A harmonic minor sevenths', dia('A', 'harmminor', true), ['i(maj7) Ammaj7', 'iiø7 Bm7b5', 'III+maj7 Cmaj7s5', 'iv7 Dm7', 'V7 E7', 'VImaj7 Fmaj7', 'vii°7 G#dim7']);
check('D dorian triads', dia('D', 'dorian', false), ['i Dmin', 'ii Emin', 'III Fmaj', 'IV Gmaj', 'v Amin', 'vi° Bdim', 'VII Cmaj']);
check('G mixolydian sevenths', dia('G', 'mixolydian', true), ['I7 G7', 'ii7 Am7', 'iiiø7 Bm7b5', 'IVmaj7 Cmaj7', 'v7 Dm7', 'vi7 Em7', 'VIImaj7 Fmaj7']);
check('Eb major sevenths are spelled with flats', dia('Eb', 'major', true).map(x => x.split(' ')[1]), ['Ebmaj7', 'Fm7', 'Gm7', 'Abmaj7', 'Bb7', 'Cm7', 'Dm7b5']);
check('pentatonic has no stacked-third chords', T.diatonicChords('A', 'minpenta').length, 0);
// Every chord of every seven-note scale in every key is a known chord, and its notes as spelled from the
// scale are the same as the chord spelled from its own root
for (const sc of T.SCALES.filter(s => s.iv.length === 7)) for (const root of T.ROOTS) for (const sev of [false, true]) {
  for (const d of T.diatonicChords(root, sc.id, sev)) {
    check(`${root} ${sc.id} degree ${d.degree}${sev ? ' seventh' : ''} is a known chord`, !!d.chord, true);
    if (d.chord) check(`${root} ${sc.id} degree ${d.degree}${sev ? ' seventh' : ''} spelling`, d.notes, d.chord.iv.map(iv => T.spellRaw(d.root, iv)));
  }
}

// 18. Scales that fit a chord, and the usual scale for each CAGED chord (chord-scale theory:
//     Ionian on major and maj7, Aeolian on minor, Mixolydian on 7, Dorian on m7)
console.log('18. Scales that fit a chord');
const fitIds = id => T.scalesContaining(T.CHORDS.find(c => c.id === id).iv).map(s => s.id);
check('scales for maj7', fitIds('maj7'), ['major', 'lydian']);
check('scales for 7', fitIds('7'), ['mixolydian']);
check('scales for m7', fitIds('m7'), ['minor', 'minpenta', 'blues', 'dorian', 'phrygian']);
check('scales for m7b5 (only the blues scale has the b5 and the b7)', fitIds('m7b5'), ['blues']);
for (const q of T.CAGED_QUALITIES) check(`usual scale for ${q} contains the chord`, fitIds(q).includes(T.CAGED_SCALE[q]), true);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
