# CAGED Ear Trainer

A practice tool for guitar and piano, with a small Python backend for profiles and scores.

- **Fretboard**: scales, chords, the five CAGED shapes and triads from any open chord with a capo (0 to 12)
  on a 15-fret neck, mirrored on a two-octave piano. Labels can show note names, scale degrees (1 b3 5),
  intervals (R m3 M3 P5) or, with a capo, the note names of the shape as if there were no capo.
  The triad view has a practice mode: play a named triad or capo chord, or recognise a triad shown on the neck.
- **Ear trainer**: interval and chord-quality ear training, weighted towards the items you miss most.
- **Tuner**: tune the guitar, hit a target note with your voice or instrument, or guess a note by ear.
- **Profile** (only with the backend running): create profiles, see points, accuracy per exercise,
  your weakest items, the last 14 days and a leaderboard.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole front end: HTML, CSS and JavaScript in one file |
| `app.py` | FastAPI backend that stores profiles and attempts in SQLite and serves `index.html` |
| `requirements.txt` | Python packages for the backend and its tests |
| `test_api.py` | Tests for the backend (pytest) |
| `verify_notes.mjs` | Tests for the music theory, the synthesized sound and the pitch detector (Node.js) |
| `gehor.db` | The SQLite database. Created automatically the first time the backend starts |

## Run it

```bash
cd path/to/this/folder
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --reload
```

Open <http://localhost:8000>. The Profile tab appears when the page finds the backend.
The API documentation is at <http://localhost:8000/docs>.

The microphone (tuner) only works on a secure origin, and `localhost` counts as one.
Without the backend, `python -m http.server 8000` also works, but then nothing is saved to profiles.

To use another database file, set `GEHOR_DB=/path/to/file.db` before starting.

## Data model

```sql
profiles (id, name UNIQUE, created_at)
attempts (id, profile_id → profiles.id ON DELETE CASCADE,
          exercise, item, answer, correct 0/1, cents, created_at)
```

Every answer is stored as one attempt. Points (correct answers), accuracy, streaks and
weakest items are computed from the attempts with SQL, so new statistics can be added later
without changing stored data. `exercise` is one of `interval`, `chord`, `triad_play`,
`triad_recognize`, `tuner_hit`, `tuner_guess`.

## API

| Method and path | What it does |
| --- | --- |
| `GET /api/health` | `{"ok": true}`, used by the page to detect the backend |
| `GET /api/profiles` | All profiles with attempts, correct answers and accuracy |
| `POST /api/profiles` | Create a profile, body `{"name": "..."}` (1 to 40 characters, unique ignoring case) |
| `DELETE /api/profiles/{id}` | Delete a profile and all its attempts |
| `POST /api/attempts` | Save one answer |
| `GET /api/profiles/{id}/stats` | Totals, streaks, per exercise, weakest items, per day |
| `GET /api/leaderboard?exercise=...` | Profiles ranked by points, optionally for one exercise |

Profiles have no passwords. This is meant for one computer or a home network, not the open internet.

## Tests

```bash
pytest -q                 # backend: 14 tests
node verify_notes.mjs     # theory, sound and pitch detection: 2724 checks, about 20 seconds
```

`verify_notes.mjs` extracts the theory, synthesis and pitch-detection code straight from `index.html`
and checks it against hand-written expected answers:

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

Random noise uses a fixed seed, so every run gives the same result.

## Code layout of index.html (inside the `<script>` tag)

| Section | Contents |
| --- | --- |
| THEORY | Notes as MIDI numbers, intervals, scales, chords, CAGED shapes, open chords, triad voicings, note spelling |
| SYNTHESIS | Karplus-Strong plucked string and an additive piano tone, as pure functions |
| PITCH DETECTION | YIN detector, cents and octave folding |
| STORAGE | Settings and ear-training statistics in `localStorage` |
| AUDIO | Web Audio playback of the synthesized buffers |
| FRETBOARD MODEL / DRAWING | What to show, triad practice, and the SVG fretboard and piano |
| EAR TRAINER | Question picking, playback and scoring |
| TUNER | Microphone input, live readout and the three tuner exercises |
| PROFILES | Talks to the backend when it is running, otherwise stays hidden |
| WIRING | Event handlers and start-up |

## Sources for the theory

The expected answers in `verify_notes.mjs` follow these references:

- Intervals, quality and semitone sizes: Open Music Theory, [Intervals](https://viva.pressbooks.pub/openmusictheory/chapter/intervals/)
- Inversion is decided by the bass note only: Open Music Theory, [Inversion](https://viva.pressbooks.pub/openmusictheory/chapter/inversion/)
- MIDI note 69 = A4 = 440 Hz, middle C = 60, and the frequency formula: [MIDI tuning standard](https://en.wikipedia.org/wiki/MIDI_tuning_standard)
- A4 = 440 Hz as standard pitch (ISO 16): [A440 (pitch standard)](https://en.wikipedia.org/wiki/A440_(pitch_standard))
- H for B natural and B for B flat in Germany, Norway and other countries: [B (musical note)](https://en.wikipedia.org/wiki/B_(musical_note))
- The CAGED shapes and their repeating order up the neck: [Applied Guitar Theory, CAGED](https://appliedguitartheory.com/lessons/caged-guitar-theory-system/)
- YIN pitch detection: de Cheveigné and Kawahara (2002), [YIN, a fundamental frequency estimator for speech and music](http://audition.ens.fr/adc/pdf/2002_JASA_YIN.pdf)
