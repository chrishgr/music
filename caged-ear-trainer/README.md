# Fretboard & Keys

A practice tool for guitar and piano, with a small Python backend for profiles and scores.

The app has one page per task, each with its own address, so the back button and bookmarks work
(`#/scales`, `#/caged/practice` and so on). Whatever you play lights up where it sounds: Play buttons
light up each note on the neck and the piano in time with the sound, a click on the neck shows the
note on the piano, and a click on a piano key shows every place on the neck with that pitch.

| Page | What it does |
| --- | --- |
| **Home** | The choice of main instrument (guitar or piano), one card per page, and how the pages fit together |
| **Scales** | Ten scales and modes on the whole neck or one five-fret position at a time. Play runs root to root through the position. *Chords in this scale* builds the triads or seventh chords on each degree, with Roman numerals; click one to hear it and see it inside the scale. In piano mode the scale is written out on a grand staff, right hand in the treble clef and left hand in the bass clef, with its key signature, accidentals and the fingering for both hands; Play runs it up, down or up and back down, over one or two octaves, with the right, the left or both hands, and the note that sounds lights up on the keys and in the notation. The neck areas are hidden then. Minor-type scales are spelled as their minor key (C♯ minor, not D♭ minor) |
| **Chords** | Fourteen chord types with movable grips shown as chord diagrams. The chosen grip is what the neck, the piano and the Play buttons use. Links to the CAGED shapes and to the scales that contain the chord. In piano mode the diagrams are piano voicings instead: root position, every inversion in close position near middle C, and two hands with the root in octaves in the left hand. The chosen voicing is what the piano, the text and the Play buttons use |
| **CAGED** | The five CAGED shapes for **major, minor, 7, m7 and maj7**, in neck order. *Compare with the major shape* marks which notes moved and lists the changes. A scale can be shown around the shape. *Play all five up the neck* lights each shape as it sounds. *Practice*: play a named shape on the neck, or name a shape that is shown |
| **Triads** | Triads from any open chord with a capo (0 to 12) on any string set, in root position and both inversions. *Practice*: play a named triad or recognise one |
| **Progressions** | Twelve well-known chord progressions (I–V–vi–IV, the 50s progression, ii–V–I, 12-bar blues, the Andalusian cadence and more) in any major or minor key. Choose a capo and the page shows the shapes to play; it also lists the capo positions where every chord is an open chord. *Play along* counts in one bar and strums the chords in time (once per bar, every beat, down and up, or the folk strum D DU UDU), with the current bar, grip and notes lit up. Loops can start on any of their chords. The **Acoustic Indie Folk-Pop** style (in the style of Vance Joy, Jonah Kagen, Sons of the East, Hollow Coves, Matthew Mole, Ocie Elliott, The Lumineers, Buffalo Traffic Jam, Henry and the Waiter, Jack and the Waiterman and Just Pete) has seven progressions with written-out voicings that show its spices: sus hammer-ons and pull-offs, anchor fingers on fret 3 of the B and e strings (G 320033, Cadd9 x32033, Em7 022033, Dsus4 xx0233), the borrowed iv, maj7 colours, falling bass lines with slash chords, the same loop started on vi or I, and G or C shapes with a capo. Its shapes stay fixed and the capo sets the key. In piano mode every chord gets a piano voicing with voice leading, the bass in the left hand and the inversion nearest the chord before in the right, and Play along plays those in the same rhythms; the capo is left out |
| **Metronome** | A plain metronome (30–260 BPM, 2 to 7 beats per bar, up to four notes per click, accent, tap tempo, click volume) and eight guided exercises that set it up for you: subdivision ladder, gap click, click on 2 and 4, click on the offbeat, speed trainer, spider (the neck shows the note to play in time), burst, and one minute changes with your results kept in the browser |
| **Ear training** | Intervals, or chord qualities, weighted towards the items you miss most |
| **Tuner** | Tune the guitar, hit a target note with your voice or instrument, or guess a note by ear |
| **Profile** | Only with the backend running. *Overview*: points and accuracy week by week, accuracy per exercise with its trend, and suggestions for what to practise next. *Summaries*: any day, week or month compared with the one before. *Goals*: daily, weekly and monthly goals that repeat, and long-term goals with a date. *Leaderboard*: profiles ranked by points this week, this month or overall, also per exercise |

The **main instrument**, chosen on the Home page, is drawn large at the top of the Scales, Chords and
Progressions pages (and CAGED and Triads on the guitar), and the other one smaller further down.

With the piano as main instrument (**piano mode**) the pages play the piano the way a pianist does, instead
of turning guitar grips into keys:

- Chords offers piano voicings: root position, each inversion in close position (every note within an octave)
  in the octave nearest middle C, and two hands with the root in octaves in the left hand.
- Progressions voices each chord with the bass in the left hand and, in the right hand, the inversion nearest
  the chord before, so the notes two chords share stay where they are and the others move a step or two.
- Scales writes the scale out on a grand staff with the key signature and the fingering for both hands, shows
  the fingers on the keys, and plays it up, down or both ways, over one or two octaves, with either or both hands.
- The guitar neck further down still shows the guitar version, but it does not decide what the piano plays.
- CAGED and Triads are about the guitar, so they are hidden: they leave the menu and the Home page, links to
  them disappear, and their addresses lead to Home.

The Play buttons sound like a **piano by default**, on both instruments. The choice at the top of the page
switches them to the guitar sound.

Every exercise (Play and Name the shape on the CAGED page, Play it and Recognise on the Triads page,
both Ear training exercises, Hit the note and Guess the note) has a **Timer** box. When it is ticked, a
field for the seconds per task appears (30 by default, 3 to 600) with a countdown. When the time runs out,
a task that has not been answered counts as a wrong answer and is saved as one. Marks already placed on the
neck are checked as they are. The answer is shown and heard, and after a few seconds the next task comes by
itself. An answer given in time also moves on by itself, so a timed round runs until the box is unticked.
Each exercise keeps its own setting, and leaving the page stops the time. Hit the note only counts down
while the microphone is on, since it cannot be answered without it.

Labels on the neck can show note names, scale degrees (1 b3 5), intervals (R m3 M3 P5) or, on the Triads
page with a capo, the note names of the shape as if there were no capo. Note names can be English (B) or
German and Nordic (H for B natural, B for B flat). The root you choose is shared by Scales, Chords and CAGED.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The markup of every page |
| `static/style.css` | All styles, light and dark |
| `static/theory.js` | Music theory, chord shapes, piano voicings and scales, sound synthesis and pitch detection. Pure functions, tested by `verify_notes.mjs` |
| `static/ui.js` | Shared code: storage, sound with the notes lighting up, drawing of the neck, piano and chord diagrams, the page router and the practice drills |
| `static/pages/*.js` | One file per page |
| `static/main.js` | Start-up, and the controls every page shares |
| `app.py` | FastAPI backend that stores profiles, answers, practice time and goals in SQLite and serves the front end |
| `stats.py` | Points, summaries, goal progress and suggestions. Pure functions with no database, tested by `test_stats.py` |
| `requirements.txt` | Python packages for the backend and its tests |
| `test_api.py` | Tests for the API (pytest) |
| `test_stats.py` | Tests for `stats.py` with worked-out expected values (pytest) |
| `verify_notes.mjs` | Tests for the theory, the chord shapes, the synthesized sound and the pitch detector (Node.js) |
| `gehor.db` | The SQLite database. Created automatically the first time the backend starts |

## Run it

```bash
cd path/to/this/folder
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --reload
```

Open <http://localhost:8000>. The Profile page appears when the page finds the backend.
The API documentation is at <http://localhost:8000/docs>.

The microphone (tuner) only works on a secure origin, and `localhost` counts as one.
Without the backend, `python -m http.server 8000` also works, and so does opening `index.html` directly,
but then nothing is saved to profiles, and from a file the browser may refuse the microphone.

The backend tells the browser to check for a newer version on every load, so after `git pull` a normal
reload shows the new version. Without the backend, the browser may show the old version from its cache
for a while: reload with Ctrl+Shift+R (Cmd+Shift+R on a Mac).

To use another database file, set `GEHOR_DB=/path/to/file.db` before starting.

## Data model

```sql
profiles (id, name UNIQUE, created_at)
attempts (id, profile_id → profiles.id ON DELETE CASCADE,
          exercise, item, answer, correct 0/1, cents, created_at)
sessions (id, profile_id → profiles.id ON DELETE CASCADE,
          activity, detail, seconds, bpm, value, created_at)
goals    (id, profile_id → profiles.id ON DELETE CASCADE,
          metric, scope, target, period, due, note, created_at)
```

Every answer is stored as one attempt. `exercise` is one of `interval`, `chord`, `triad_play`,
`triad_recognize`, `caged_play`, `caged_recognize`, `tuner_hit`, `tuner_guess`.

A session is practice without answers: the metronome (`metronome`), one of its exercises (`drill`, with
the exercise in `detail`), play-along on the Progressions page (`progressions`) and one minute changes
(`changes`, with the chord pair in `detail` and the number of changes in `value`). The metronome and
play-along save a session when they stop, if they ran for at least 15 seconds, with the last tempo in
`bpm`. Each saved one minute changes result is one minute of practice.

Points, summaries, goal progress and suggestions are computed from these rows when they are asked for,
so the rules can change without changing stored data. Times are stored in UTC, and the page sends its
time zone (`tz`, minutes east of UTC) so that days start at local midnight. Weeks start on Monday.

## Points, summaries and goals

Points (in `stats.py`, and explained on the Leaderboard page):

- A right answer gives 1 point, or 2 for *Play the triad*, *Play the CAGED shape* and *Hit the note*,
  because playing takes more than choosing. Wrong answers give nothing, so guessing does not pay.
- Every 10th right answer in a row gives 5 extra points.
- Practice without answers gives 1 point a minute, at most 30 a day.
- Every day with any practice gives 5 points, so practising often pays more than practising long.
- On the same points, the higher share of right answers ranks first.

Practice time from answers counts the gaps between answers up to 2 minutes; the first answer after a
longer pause counts 10 seconds.

A summary covers a day, a week or a month, compared with the one before. While a week or month is still
going on, it is compared with as many days of the one before as have passed, so a half-done week is not
measured against a whole one.

A goal has a metric (points, answers, right answers, share right, minutes, days with practice, tempo or
one minute changes), an optional exercise or chord pair, a target and a period. `day`, `week` and
`month` goals repeat, and the page shows whether the last six were reached. `until` goals are long-term
and run from the day they were set to their date. A share-right goal counts only after 10 answers in the
period. A goal is *behind* when it has less than 80 % of what an even pace would have reached by now.

Suggestions come from the same numbers: goals that are behind, items with less than 70 % right in the
last 60 days, exercises that dropped or improved by 15 or 10 percentage points between the last two
fortnights, exercises not practised for a week, few practice days, exercises never tried, and no goals.

## API

| Method and path | What it does |
| --- | --- |
| `GET /api/health` | `{"ok": true}`, used by the page to detect the backend |
| `GET /api/scoring` | The numbers of the points system |
| `GET /api/profiles` | All profiles with attempts, correct answers, accuracy and points |
| `POST /api/profiles` | Create a profile, body `{"name": "..."}` (1 to 40 characters, unique ignoring case) |
| `DELETE /api/profiles/{id}` | Delete a profile and everything saved for it |
| `POST /api/attempts` | Save one answer |
| `POST /api/sessions` | Save practice without answers, body `{"profile_id", "activity", "detail", "seconds", "bpm", "value"}` |
| `GET /api/profiles/{id}/overview` | Totals, points, streaks, this day, week and month, 12 weeks of progress, accuracy per exercise with its trend, suggestions and the place on the leaderboard |
| `GET /api/profiles/{id}/summary?period=day\|week\|month&day=YYYY-MM-DD` | The period that contains `day`, compared with the one before, with the goals reached in it |
| `GET /api/profiles/{id}/goals` | Goals with their progress and history |
| `POST /api/profiles/{id}/goals` | Add a goal, body `{"metric", "scope", "target", "period", "due", "note"}` |
| `DELETE /api/goals/{id}` | Remove a goal |
| `GET /api/profiles/{id}/stats` | Totals, streaks, per exercise, weakest items, per day |
| `GET /api/leaderboard?period=all\|week\|month&exercise=...` | Profiles ranked by points, optionally for one exercise |

Every `GET` takes `tz`, the browser's offset from UTC in minutes.

Profiles have no passwords. This is meant for one computer or a home network, not the open internet.

## Tests

```bash
pytest -q                 # backend and statistics: 50 tests
node verify_notes.mjs     # theory, shapes, piano voicings, progressions, rhythm, sound and pitch detection: 9343 checks, about 20 seconds
```

`verify_notes.mjs` loads `static/theory.js`, the same file the page uses, and checks it against
hand-written expected answers:

1. Frequencies (A4 = 440 Hz, equal temperament)
2. Standard tuning and fretboard positions
3. Spelling of known scales and chords (for example F# major with E#, B dim7 with Ab)
4. Every root with every scale and chord: correct pitch classes, seven letters in seven-note scales
5. German and Nordic note names (B = B flat, H = B natural)
6. All five CAGED shapes in all twelve keys contain only the triad, with the root in the bass
7. The synthesized guitar and piano sounds are measured and must be within 3 cents of the target
8. The tuner's YIN pitch detector must name the right note within 5 cents, with and without noise
9. Octave folding used by the "Hit the note" exercise
10. Interval names (R, m2 ... P8) and their sizes in semitones
11. Chord formulas and the whole/half-step patterns of the scales and modes
12. Triads with capo: known voicings, every generated voicing is a correct close triad with the right
    bass note for its inversion, and exactly the voicings that fit between the capo and fret 15 are found
13. Every movable shape of every chord type in all twelve keys: only chord tones, the root as the lowest
    note, at most a four-fret span, and nothing left out except possibly the fifth of a seventh chord
14. Known grips from chord charts, for example the A barre chord 5 7 7 6 5 5 and Dm from the C shape x 5 3 2 3 x
15. For major, minor, 7, m7 and maj7 in every key, the shapes come up the neck as a rotation of C A G E D
16. How the minor and seventh shapes come from the major ones: minor only lowers or drops the third,
    7 and maj7 turn one root (or in the C shape the fifth) into the seventh, m7 does the same to minor
17. Chords built from scales, with Roman numerals, for example Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7 in major
18. Which scales contain a chord, and the usual scale for each CAGED chord
19. Chord progressions in known keys (I–V–vi–IV in G is G D Em C; the Andalusian cadence in E minor is
    Em D C B), shapes with a capo, the capo positions that give only open chords, and that the Roman
    numerals agree with the chords of the key in every key and with every capo
20. Metronome patterns: clicks and subdivisions in a beat, 2 and 4, offbeat, gap click, speed trainer,
    subdivision ladder, tap tempo, the spider pattern and the click sound
21. Acoustic Indie Folk-Pop: every written-out grip is exactly its chord with the right bass note, the
    anchor grips are G 320033, Dsus4 xx0233, Em7 022033 and Cadd9 x32033 with fret 3 on B and e in all
    of them, the falling bass lines (C B A G F E D, G F# E C), the borrowed Cm in G, the sus decorations
    move one finger at a time, and the capo for each key with G and C shapes
22. Piano: C major is C4 E4 G4, E4 G4 C5 and G3 C4 E4 in root position and its inversions, with C2 C3
    under C4 E4 G4 for two hands; G7 has F3 G3 B3 D4 as 3rd inversion; every chord type in every key is in
    close position with the right notes and the named bass, on the keyboard near middle C; notes are named
    from the chord (C#4 in A7, B#3 in G#aug); every scale rises root to root over one or two octaves;
    I–IV–V–I in C leads to C E G, C F A, B D G and back with C F G C in the bass, and the falling bass line
    walks C B A G F E D; in every progression and key the notes two chords share stay in place and no voice
    moves more than a major third
23. Piano scales: the fingering of all twelve major and harmonic minor scales for both hands is the one in the
    scale books (C major 1231234 5 and 5432132 1, B♭ major 2123123 4 and 3214321 3, F♯ major 2341231 2 and
    4321321 4 ...), two octaves repeat the pattern, C major pentatonic is 123123 and 321321 and the C blues
    scale 1234123; in every scale, key, hand and octave count the thumb stays on white keys where the keys allow,
    each change is the next finger or a thumb crossing, and 5 only ends a hand; every scale in every key has a
    key signature of at most seven sharps or flats, and the accidentals are those a copyist would write (G♯ in
    A harmonic minor in both bars, G♭ then G♮ in the C blues scale, F𝄪 in G♯ harmonic minor)

Random noise uses a fixed seed, so every run gives the same result.

## How the code fits together

The scripts are plain scripts (no build step and no modules), loaded in order by `index.html`, so the
app also runs when `index.html` is opened directly from disk.

- `theory.js` knows nothing about the page. Chord shapes are written as tab (`'x 3 2 0 1 0'`) in the
  `SHAPES` table, one row per chord type and one grip per CAGED letter. `chordShapes(root, type)` moves
  them to every place they fit on the neck.
- Each page in `static/pages/` registers itself in `PAGES` with `render(sub)` and, when it needs them,
  `init()`, `keys()`, `onRoot()` (when the shared root changes) and `onNeck()` (a click on the neck).
  The router in `ui.js` reads the address, shows that page and calls `render`.
- `play(note, at, sound, where)` schedules a note and lights it up when it sounds: `where` is one string
  and fret, `'*'` for every place with that pitch, or nothing for the piano only. `stopAll()` stops the
  sound and the lights together.
- `makeDrill()` is the practice engine shared by the Triads and CAGED pages: new task, marks on the neck,
  check, show answer, multiple choice and scoring.
- `profile.js` sends every answer (`logAttempt`) and every finished practice session (`logSession`, through
  `startSession` and `endSession` in `ui.js`) to the backend. Its charts are small SVGs drawn at the width of
  their slot, with a tooltip on hover and keyboard focus and a table view of the same numbers.
- Each page with both instruments marks two places, `data-slot="main"` and `data-slot="second"`.
  `placeInstruments()` in `ui.js` moves the neck and the piano (`.inst-block`) into them for the main
  instrument before every redraw, so the code that draws them does not change.
- The scales on the piano come from `pianoScaleRun()` in `theory.js`: each note with its MIDI number, its spelling,
  the line or space it is written on and its finger, from `cyclicFingering()` (the scale-fingering rules: thumb on
  white keys, groups of 1 2 3 and 1 2 3 4, the 4th finger on a black key, the thumb on a white root).
  `keySignature()` and `writtenAccidentals()` decide what is written, and `scaleStaffSvg()` in `ui.js` draws the
  grand staff, with clefs and accidentals drawn as shapes so they look the same in every browser.
- Piano mode (`pianoMode()` in `ui.js`) sets the class `piano-mode` on the body; anything marked
  `data-mode="guitar"` or `data-mode="piano"` shows only in that mode. The voicings come from
  `pianoVoicings()`, `pianoScaleRun()` and `voiceLeadProgression()` in `theory.js`, and `playPiano()` plays a list
  of notes together or broken with the piano sound, lighting up only the piano.
- `makeTimer()` is the task timer shared by every exercise. A page tells it which task is waiting for an
  answer, what to do when the time runs out and how to make the next task; the timer counts down, counts
  the task as wrong and moves on. `makeDrill()` sets one up for the CAGED and Triads practice.
- `startClock()` is the metronome clock used by the Metronome and Progressions pages. It looks 0.12 s ahead
  and puts every click and strum on the audio clock (`playAt`, `clickAt`, `strumAt`), so the timing stays
  exact even while the page redraws. The rhythm rules themselves (which clicks sound in a beat, the speed
  trainer, gap bars) are pure functions in `theory.js`.

## Sources for the theory

The expected answers in `verify_notes.mjs` follow these references:

- Intervals, quality and semitone sizes: Open Music Theory, [Intervals](https://viva.pressbooks.pub/openmusictheory/chapter/intervals/)
- Inversion is decided by the bass note only: Open Music Theory, [Inversion](https://viva.pressbooks.pub/openmusictheory/chapter/inversion/)
- MIDI note 69 = A4 = 440 Hz, middle C = 60, and the frequency formula: [MIDI tuning standard](https://en.wikipedia.org/wiki/MIDI_tuning_standard)
- A4 = 440 Hz as standard pitch (ISO 16): [A440 (pitch standard)](https://en.wikipedia.org/wiki/A440_(pitch_standard))
- H for B natural and B for B flat in Germany, Norway and other countries: [B (musical note)](https://en.wikipedia.org/wiki/B_(musical_note))
- The CAGED shapes and their repeating order up the neck: [Applied Guitar Theory, CAGED](https://appliedguitartheory.com/lessons/caged-guitar-theory-system/)
- Minor CAGED shapes are the open Cm, Am, Gm, Em and Dm chords, made by lowering every major third one fret:
  [Applied Guitar Theory, Minor CAGED System](https://appliedguitartheory.com/lessons/minor-caged-system/).
  The G shape minor (3 1 0 0 3 3) is hard to finger higher up and is often played in part:
  [Fretboard Foundation, Practical CAGED grips](https://book.fretboardfoundation.com/caged.html)
- Seventh-chord CAGED shapes from the open C7, A7, G7, E7, D7 (and the m7 and maj7) chords:
  [CAGED seventh chord shapes](https://www.fingerstyleguitar.rocks/movable-chords/caged-seventh/),
  [CAGED minor seventh chord shapes](https://www.fingerstyleguitar.rocks/movable-chords/caged-minor-seventh/),
  [CAGED major seventh chord shapes](https://www.fingerstyleguitar.rocks/movable-chords/caged-major-seventh/)
- The usual scale over each chord (Dorian on m7, Mixolydian on 7, Ionian on maj7): Open Music Theory,
  [Chord-Scale Theory](https://viva.pressbooks.pub/openmusictheorycopy/chapter/chord-scale-theory/)
- Diatonic seventh chords in major and harmonic minor: [Diatonic Seventh Chords](https://pressbooks.pub/harmonyandmusicianshipwithsolfege/chapter/diatonic-seventh-chords/)
- Common chord progressions (I–V–vi–IV, I–vi–IV–V, vi–IV–I–V, ii–V–I, 12-bar blues, Andalusian cadence):
  [Native Instruments, 10 most popular chord progressions](https://blog.native-instruments.com/common-chord-progressions/),
  [LANDR, 7 common chord progressions](https://blog.landr.com/common-chord-progressions/)
- Metronome exercises: subdivision ladder and burst, [ArtistWorks, Mastering Time](https://blog.artistworks.com/mastering-time-the-best-metronome-exercises-for-guitarists-to-build-speed-and-accuracy/);
  gap click and click on 2 and 4, [Soundbrenner, 5 metronome exercises to build your internal clock](https://www.soundbrenner.com/blogs/articles/5-metronome-exercises-build-internal-clock);
  offbeat click, [Guitarwiz, practising on the offbeat](https://guitarwiz.app/articles/guitar-metronome-offbeat-practice/);
  speed trainer, [Musokit, speed trainer](https://musokit.com/speed-trainer);
  spider exercise, [Guitar World, the spider exercise](https://www.guitarworld.com/lessons/spider-exercise);
  one minute changes, [JustinGuitar, One Minute Changes](https://www.justinguitar.com/guitar-lessons/one-minute-changes-f1-im-112)
- Acoustic Indie Folk-Pop spices: sus and add embellishments, [Acoustic Guitar](https://acousticguitar.com/guitar-basics-how-to-use-sus-and-add-embellishments-with-open-chord-shapes/);
  G, Cadd9, Em7, Dsus4 and D/F♯ as the core folk chords, [Guitarwiz, folk chord progressions](https://guitarwiz.app/articles/folk-chord-progressions/);
  the borrowed minor iv, [StudyBass, borrowed chords](https://www.studybass.com/lessons/harmony/borrowed-chords/);
  slash chords and falling bass lines, [Acoustic Guitar, slash chords](https://acousticguitar.com/strengthen-chord-progressions-and-bass-lines-with-slash-chords/);
  the wistful sound of maj7 chords, [Strum Avenue, 7th chords](https://strumavenue.com/guitar-7th-chords/);
  the same four chords rotated for another mood, [Pianote, chord progressions for mood](https://www.pianote.com/blog/chord-progressions-for-mood/);
  the folk strum, [Good Guitarist, strumming patterns](https://goodguitarist.com/common-guitar-strumming-patterns/);
  the capo and open chords, [Guitar World, capo](https://www.guitarworld.com/lessons/how-a-capo-can-make-5-classic-songs-easier-to-play)
- Piano voicings: close position keeps every chord note within an octave, open position spreads them wider,
  [Voicing (music)](https://en.wikipedia.org/wiki/Voicing_(music)) and [Strum and Key, open vs. closed voicings](https://strumandkey.com/theory/open-vs-closed-voicings/);
  root position and the inversions are named by the lowest note, [The Ultimate Piano, chord inversions](https://the-ultimate-piano.com/tutorials/chord-inversions/)
  and [Dummies, chord inversions on the piano](https://www.dummies.com/article/academics-the-arts/music/instruments/piano/how-to-play-chord-inversions-on-the-piano-or-keyboard-153046/);
  a seventh chord with the seventh in the bass is in third inversion, [Hooktheory, inversions of seventh chords](https://book-two.hooktheory.com/section/inversions-of-seventh-chords)
- Voice leading on the piano: the root in the left hand and the nearest inversion in the right,
  [PlayPiano, the nearest chord inversions](https://playpiano.com/piano-chords/play-nearest-chord-inversions-chord-progression) and
  [Hear and Play, voice leading for triads](https://hearandplay.com/main/voice-leading-principles-for-triads-less-hand-movement-more-harmony/);
  keep the common tone and move the other voices by step, [G Major Music Theory, common tone and nearest motion](https://www.gmajormusictheory.org/Fundamentals/Ch15.pdf)
- Scales played up and down over one or two octaves, as in graded piano exams: [ABRSM piano syllabus](https://www.abrsm.org/sites/default/files/2024-06/Piano%202025%20&%202026%20Prac%20syllabus%2020240524_access.pdf)
- Scale fingering rules (thumb only on white keys, the 4th finger on a black key and once an octave, groups of 1 2 3
  and 1 2 3 4 that repeat every octave): [Practising the Piano, the principles of scale fingering](https://practisingthepiano.com/principles-scale-fingerings/),
  [Robert Kelley, scale fingering chart](https://robertkelleyphd.com/home/teaching/keyboard/keyboard-scale-fingering-chart/),
  [Piano Scales, fingerings](https://www.pianoscales.org/fingerings.html)
- Fingerings of the major and harmonic minor scales: [Piano Keyboard Guide, A♭ major](https://www.piano-keyboard-guide.com/a-flat-major-scale.html),
  [B♭ major](https://www.piano-keyboard-guide.com/b-flat-major-scale.html), [E♭ major](https://www.piano-keyboard-guide.com/e-flat-major-scale.html),
  [F♯ major](https://www.piano-keyboard-guide.com/f-sharp-major-scale.html), [B major](https://www.piano-keyboard-guide.com/b-major-scale.html),
  [Piano Scales, major](https://www.pianoscales.org/major.html) and [harmonic minor](https://www.pianoscales.org/minor-harmonic.html),
  [Piano.org, B♭ harmonic minor](https://piano.org/scales/minor/harmonic/b-flat/); F♯ harmonic minor is written
  3 4 1 2 3 1 2 3 here, so every octave is fingered the same; some charts start the single octave with 2 3
- Pentatonic and blues fingering: [Piano.org, C major pentatonic](https://piano.org/scales/pentatonic/major/c/),
  [LadyDpiano, fingering for the blues scale](https://ladydpiano.blogspot.com/2017/06/recommended-fingering-for-blues-scale.html)
- YIN pitch detection: de Cheveigné and Kawahara (2002), [YIN, a fundamental frequency estimator for speech and music](http://audition.ens.fr/adc/pdf/2002_JASA_YIN.pdf)
