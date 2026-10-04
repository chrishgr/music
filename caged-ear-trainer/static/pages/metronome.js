/* Metronome: a plain metronome, and well-known exercises that set up the metronome for you.
   The exercises only guide: they run the click and show what to play, they do not measure you. */
const MX = { running: false, start: 0, taps: [], plan: null, omc: { phase: 'idle', t0: 0, timer: null } };
const BEAT_CHOICES = [2, 3, 4, 5, 6, 7];
const SUBDIV_NAMES = { 1: 'One note per click', 2: 'Eighth notes, two per click', 3: 'Triplets, three per click', 4: 'Sixteenth notes, four per click' };
// Open chords for One minute changes, as name: [root, chord type]
const OMC_CHORDS = { A: ['A', 'maj'], Am: ['A', 'min'], A7: ['A', '7'], C: ['C', 'maj'], C7: ['C', '7'], D: ['D', 'maj'], Dm: ['D', 'min'], D7: ['D', '7'],
  E: ['E', 'maj'], Em: ['E', 'min'], E7: ['E', '7'], G: ['G', 'maj'], G7: ['G', '7'] };

/* Each exercise: what it trains, how to do it, where it comes from, its settings (first option is the default)
   and plan(settings, bar) with the clicks for that bar (see beatClicks in theory.js) and the text to show. */
const DRILLS = [
  { id: 'ladder', name: 'Subdivision ladder', bpm: 60,
    trains: 'Even rhythm: dividing the beat in different ways while the tempo stays the same.',
    steps: ['Mute the strings with your fretting hand (or hold one note) and pick along with every click, soft ones too.',
      'Every few bars the clicks change from 1 per beat to 2 (eighths), 3 (triplets) and 4 (sixteenths), then start over. Keep going without stopping.',
      'Down-strokes land on the beat. With two per beat the up-stroke lands exactly halfway.',
      'When all four feel even, raise the tempo by 5 BPM.'],
    source: ['ArtistWorks: Mastering Time, the best metronome exercises for guitarists', 'https://blog.artistworks.com/mastering-time-the-best-metronome-exercises-for-guitarists-to-build-speed-and-accuracy/'],
    settings: { each: ['Bars of each', ['4', '2', '8']] },
    plan(s, bar) {
      const n = ladderStep(+s.each, bar), left = +s.each - bar % +s.each;
      return { clicks: { subdiv: n }, phase: `${SUBDIV_NAMES[n]}. ${left === 1 ? 'Changes after this bar.' : `Changes in ${left} bars.`}` };
    } },
  { id: 'gap', name: 'Gap click', bpm: 80,
    trains: 'Your inner pulse: keeping the tempo when the click goes quiet.',
    steps: ['Play or strum steadily while the click sounds.',
      'In the silent bars keep playing and count in your head as if the click were still there.',
      'When the click comes back, listen: were you still with it? Do not jump to catch up.',
      'Start with 3 bars on and 1 off, then work towards 1 on and 3 off.'],
    source: ['Soundbrenner: 5 metronome exercises to build your internal clock', 'https://www.soundbrenner.com/blogs/articles/5-metronome-exercises-build-internal-clock'],
    settings: { pattern: ['Bars on + bars off', ['3+1', '2+2', '1+1', '1+3', '4+4', '2+6']], show: ['Show the beat in silent bars', ['No', 'Yes']] },
    plan(s, bar) {
      const [on, off] = s.pattern.split('+').map(Number), silent = isSilentBar(on, off, bar), k = bar % (on + off);
      return { clicks: { silent }, silent, hideLights: silent && s.show === 'No',
        phase: silent ? `Silent bar ${k - on + 1} of ${off}: keep the beat going` : `Click bar ${k + 1} of ${on}` };
    } },
  { id: 'backbeat', name: 'Click on 2 and 4', bpm: 70,
    trains: 'Groove: hearing the click as the snare drum on 2 and 4, so you have to feel 1 and 3 yourself.',
    steps: ['Count “1, 2, 3, 4” out loud or in your head. The click is only on 2 and 4.',
      'Strum or play a simple riff and lock in with the click like you would with a drummer.',
      'Harder: let the click sound on one beat only, for example only on 1, or only on 3.'],
    source: ['Soundbrenner: 5 metronome exercises to build your internal clock', 'https://www.soundbrenner.com/blogs/articles/5-metronome-exercises-build-internal-clock'],
    settings: { on: ['Click on', ['2 and 4', 'Only 1', 'Only 2', 'Only 3', 'Only 4']] },
    plan(s) {
      const only = s.on === '2 and 4' ? [2, 4] : [+s.on.slice(-1)];
      return { clicks: { only, accent: false }, only, phase: `The click is on ${only.join(' and ')}. Count the other beats yourself.` };
    } },
  { id: 'offbeat', name: 'Click on the offbeat', bpm: 70,
    trains: 'Subdivision: the click marks the “and” between the beats, so you have to place the beat yourself.',
    steps: ['The first bar clicks on the beats so you hear where they are.',
      'Then the click moves to the “and”: 1 and 2 and 3 and 4 and.',
      'Play on the beats, in the gaps between the clicks. If the click starts to sound like the beat, stop and start again.'],
    source: ['Guitarwiz: How to practise guitar on the offbeat with a metronome', 'https://guitarwiz.app/articles/guitar-metronome-offbeat-practice/'],
    settings: { countIn: ['Count-in', ['1 bar', 'None']] },
    plan(s, bar) {
      if (s.countIn === '1 bar' && bar === 0) return { clicks: {}, phase: 'Count-in: these clicks are the beats' };
      return { clicks: { offbeat: true }, offbeat: true, phase: 'Clicks are on the “and”. Play on the beats, between the clicks.' };
    } },
  { id: 'speed', name: 'Speed trainer', bpm: 80,
    trains: 'Speed with control: the tempo goes up so slowly that your technique keeps up.',
    steps: ['Choose something you can already play cleanly, for example a scale, a riff or the spider exercise.',
      'Set the tempo above to where it is easy, then press Start.',
      'The tempo goes up by the step every few bars until it reaches the target, and stays there.',
      'If it falls apart, stop, go back to the last clean tempo and use a smaller step.'],
    source: ['Musokit: Speed trainer, a metronome that ramps up', 'https://musokit.com/speed-trainer'],
    settings: { step: ['Raise by (BPM)', ['5', '2', '3', '10']], every: ['Every (bars)', ['4', '2', '8']], range: ['Up to', ['+40', '+20', '+60']], subdiv: ['Notes per click', ['2', '1', '4']] },
    bpmAt: (s, bar, start) => trainerBpm(start, +s.step, +s.every, start + +s.range, bar),
    plan(s, bar) {
      const bpm = this.bpmAt(s, bar, MX.start), target = MX.start + +s.range, left = +s.every - bar % +s.every;
      return { clicks: { subdiv: +s.subdiv }, phase: bpm >= target ? `Target ${target} BPM reached. Stay here until it feels easy.` : `${bpm} BPM, up ${s.step} in ${left} bar${left > 1 ? 's' : ''}. Target ${target}.` };
    } },
  { id: 'spider', name: 'Spider (1-2-3-4)', bpm: 60,
    trains: 'Finger independence and picking: one finger per fret on every string.',
    steps: ['Put finger 1 at the fret shown, and fingers 2, 3 and 4 on the next frets.',
      'Play 1-2-3-4 on the low E string, then the same on each string up to high e, then come back down with 4-3-2-1.',
      'Alternate down and up strokes. Keep each finger close to the string when it lifts.',
      'Start at 60 BPM with two notes per click. When it is clean three times in a row, go up 5 BPM.'],
    source: ['Guitar World: the spider exercise', 'https://www.guitarworld.com/lessons/spider-exercise'],
    settings: { fret: ['First fret', ['1', '3', '5', '7', '9']], subdiv: ['Notes per click', ['2', '1', '4']], notes: ['Sound', ['Click only', 'Click and notes']] },
    plan(s) { return { clicks: { subdiv: +s.subdiv }, phase: `Frets ${s.fret}–${+s.fret + 3}, ${s.subdiv} note${s.subdiv === '1' ? '' : 's'} per click. Follow the lit note.` }; },
    // Light up (and maybe play) each note of the pattern on its subdivision
    onBeat(s, info, when) {
      const notes = spiderNotes(+s.fret), n = +s.subdiv;
      for (let k = 0; k < n; k++) {
        const nt = notes[((info.bar * info.beats + info.beat) * n + k) % notes.length], t = when + k * info.len / n, m = TUNING[nt.st] + nt.f;
        if (s.notes === 'Click and notes') playAt(m, t, 'guitar', noteKey(nt.st, nt.f), 0.8);
        else atTime(t, () => flash(m, noteKey(nt.st, nt.f)));
      }
    } },
  { id: 'burst', name: 'Burst (jog and sprint)', bpm: 60,
    trains: 'Speed bursts: short fast runs between relaxed ones, so the hands learn fast motion without tiring.',
    steps: ['On beats 1, 2 and 3 play triplets, three notes per click: the jog.',
      'On beat 4 play six notes, twice as fast: the sprint. Then jog again.',
      'Use one string or a short scale fragment. Keep the sprint relaxed.'],
    source: ['ArtistWorks: Mastering Time, the best metronome exercises for guitarists', 'https://blog.artistworks.com/mastering-time-the-best-metronome-exercises-for-guitarists-to-build-speed-and-accuracy/'],
    settings: {},
    plan() { return { clicks: { subdiv: [3, 3, 3, 6] }, phase: 'Jog: three notes per click on 1, 2 and 3. Sprint: six on beat 4.' }; } },
  { id: 'changes', name: 'One minute changes', bpm: 60,
    trains: 'Fast chord changes: how many times you can change between two chords in one minute.',
    steps: ['Choose two chords. Press Start and change between them as many times as you can for one minute.',
      'Strum once on each chord, so you know it sounds clean. Count each change: A to D to A is two changes.',
      'Write down the number when the minute is up and try to beat it next time. A few minutes a day is plenty.',
      'With Click along on, change on the click instead: a slow, steady version of the same exercise.'],
    source: ['JustinGuitar: One Minute Changes', 'https://www.justinguitar.com/guitar-lessons/one-minute-changes-f1-im-112'],
    settings: {} }
];
const drillNow = () => DRILLS.find(d => d.id === state.drill) || DRILLS[0];
function drillSettings(d) {
  const mine = state.drillSet[d.id] || {}, out = {};
  for (const [k, [, opts]] of Object.entries(d.settings || {})) out[k] = opts.includes(mine[k]) ? mine[k] : opts[0];
  return out;
}
const drillMode = () => current && current.page === 'metronome' && current.sub === 'exercises' ? drillNow() : null;
const metroBeats = d => d ? 4 : state.beats;
const clampBpm = v => Math.max(30, Math.min(260, Math.round(v)));

function setBpm(v) {
  state.bpm = clampBpm(v); save();
  $('bpmVal').textContent = state.bpm; $('bpmRange').value = state.bpm;
}
// The plan for a bar: from the exercise, or from the plain metronome settings
function barPlan(d, bar) {
  return d ? d.plan(drillSettings(d), bar) : { clicks: { subdiv: state.subdiv, accent: state.accent }, phase: '' };
}

function startMetro() {
  const d = drillMode();
  if (d && d.id === 'changes') return;
  stopAll();
  MX.running = true; MX.start = state.bpm;
  startClock({
    bpm: bar => d && d.bpmAt ? d.bpmAt(drillSettings(d), bar, MX.start) : state.bpm,
    beats: () => metroBeats(d),
    onBeat(info, when) {
      const plan = barPlan(d, info.bar);
      clickBeat(plan.clicks, info, when);
      if (d && d.onBeat) d.onBeat(drillSettings(d), info, when);
      atTime(when, () => showBeat(info, plan));
    }
  });
  renderMetroControls();
}
function stopMetro() { stopAll(); }
function toggleMetro() { if (MX.running || MX.omc.phase !== 'idle') stopMetro(); else if (drillMode() && drillNow().id === 'changes') startChanges(); else startMetro(); }

// Beat lights: dashed for beats without a click, the current beat filled
function renderLights(beats, plan = null, on = -1) {
  const el = $('beatLights');
  if (plan && plan.hideLights) { el.innerHTML = ''; return; }
  el.innerHTML = Array.from({ length: beats }, (_, i) => {
    const mute = plan && (plan.silent || plan.offbeat || (plan.only && !plan.only.includes(i + 1)));
    const accent = !plan || (plan.clicks.accent !== false && i === 0);
    return `<i class="${accent ? 'accent' : ''}${mute ? ' mute' : ''}${i === on ? ' on' + (mute ? ' soft' : '') : ''}">${i + 1}</i>`;
  }).join('');
}
function showBeat(info, plan) {
  renderLights(info.beats, plan, info.beat);
  $('metroPhase').textContent = plan.phase;
  if (info.bpm !== state.bpm) $('bpmVal').textContent = info.bpm;
}

/* --- One minute changes --- */
const omcPair = () => { const s = state.drillSet.changes || {}; return [s.a || 'A', s.b || 'D']; };
const omcKey = () => [...omcPair()].sort().join('–');
function startChanges() {
  stopAll();
  const o = MX.omc, c = ctx(), t0 = c.currentTime + 3.1;
  o.phase = 'count'; o.t0 = t0;
  [3, 2, 1].forEach((n, i) => clickAt('beat', t0 - n));
  clickAt('accent', t0);
  atTime(t0, () => {
    o.phase = 'run';
    if ((state.drillSet.changes || {}).click) startClock({ bpm: () => state.bpm, beats: () => 4, onBeat: (info, when) => { clickBeat({}, info, when); atTime(when, () => renderLights(4, { clicks: {} }, info.beat)); } });
  });
  atTime(t0 + 60, () => {
    stopClock();
    [0, 0.25, 0.5].forEach(t => clickAt('accent', ctx().currentTime + 0.03 + t));
    clearInterval(o.timer); o.phase = 'done';
    renderChanges();
    $('omcCount').focus();
  });
  clearInterval(o.timer);
  o.timer = setInterval(renderChangesClock, 100);
  renderChanges();
}
function renderChangesClock() {
  const o = MX.omc, now = audio.ctx ? audio.ctx.currentTime : 0;
  if (o.phase === 'count') { $('omcTime').textContent = Math.max(1, Math.ceil(o.t0 - now)); $('omcState').textContent = 'get ready'; }
  else if (o.phase === 'run') { $('omcTime').textContent = Math.max(0, Math.ceil(o.t0 + 60 - now)); $('omcState').textContent = 'seconds left: change, change, change'; }
  else { $('omcTime').textContent = o.phase === 'done' ? '0' : '60'; $('omcState').textContent = o.phase === 'done' ? 'time is up' : 'seconds'; }
}
function renderChanges() {
  const set = state.drillSet.changes || {}, [a, b] = omcPair();
  $('omcA').value = a; $('omcB').value = b;
  $('omcClick').checked = !!set.click;
  $('omcBoxes').innerHTML = [a, b].map((name, i) => {
    const [root, q] = OMC_CHORDS[name], p = openGrip(parseNote(root).pc, q);
    return chordBoxButton(p, tonesOf(root, chordById(q).iv), { i, title: noteName(root) + chordById(q).sym, sub: i ? 'second chord' : 'first chord' });
  }).join('');
  const o = MX.omc;
  $('omcStart').textContent = o.phase === 'idle' || o.phase === 'done' ? 'Start one minute' : 'Stop';
  $('omcForm').hidden = o.phase !== 'done';
  const log = state.omcLog[omcKey()] || [];
  const best = log.length ? Math.max(...log.map(x => x.n)) : null;
  $('omcLog').innerHTML = log.length
    ? `<p class="hint"><b>${esc(omcKey())}</b>: best ${best} changes. Last ${Math.min(5, log.length)}: ${log.slice(-5).map(x => `${x.n} (${x.d})`).join(', ')}.</p>`
    : '<p class="hint">Your results for this pair of chords are kept in this browser.</p>';
  renderChangesClock();
}

/* --- Spider neck --- */
function renderSpider() {
  const s = drillSettings(drillNow()), seen = new Set(), dots = [];
  spiderNotes(+s.fret).forEach(n => {
    const k = noteKey(n.st, n.f);
    if (!seen.has(k)) { seen.add(k); dots.push({ st: n.st, f: n.f, item: { label: String(n.finger) }, cls: 'other' }); }
  });
  renderNeck($('mxNeck'), { dots, bands: [{ lo: +s.fret, hi: +s.fret + 3, label: `Frets ${s.fret}–${+s.fret + 3}` }] });
}

function renderMetroControls() {
  const d = drillMode(), changes = d && d.id === 'changes';
  $('bpmVal').textContent = state.bpm; $('bpmRange').value = state.bpm;
  $('clickVol').value = state.clickVol;
  $('metroStart').textContent = MX.running ? 'Stop' : 'Start';
  $('metroStart').hidden = !!changes;
  if (!MX.running) {
    renderLights(metroBeats(d), changes ? null : barPlan(d, 0));
    $('metroPhase').textContent = changes ? 'Set the tempo here if you want to click along.' : d ? 'Press Start, or the space bar.' : '';
  }
}

function renderMetronome(sub = current.sub) {
  $('mBeats').innerHTML = BEAT_CHOICES.map(n => `<button data-v="${n}" aria-pressed="${state.beats === n}">${n}</button>`).join('');
  setPressed($('mSubdiv'), state.subdiv);
  $('mAccent').checked = !!state.accent;
  const d = sub === 'exercises' ? drillNow() : null;
  $('drills').innerHTML = DRILLS.map(x => `<button data-v="${x.id}" aria-pressed="${x.id === state.drill}">${x.name}</button>`).join('');
  if (d) {
    $('drillInfo').innerHTML = `<p><b>Trains:</b> ${esc(d.trains)}</p><ol>${d.steps.map(t => `<li>${esc(t)}</li>`).join('')}</ol>` +
      `<p class="src">Source: <a class="more" href="${d.source[1]}" target="_blank" rel="noopener">${esc(d.source[0])}</a></p>`;
    const s = drillSettings(d);
    $('drillSet').innerHTML = Object.entries(d.settings).map(([k, [label, opts]]) =>
      `<div class="field"><span class="lbl">${label}</span><div class="seg" data-set="${k}" role="group" aria-label="${label}">${opts.map(o =>
        `<button data-v="${o}" aria-pressed="${s[k] === o}">${o}</button>`).join('')}</div></div>`).join('');
  }
  $('omcBox').hidden = !d || d.id !== 'changes';
  $('spiderBox').hidden = !d || d.id !== 'spider';
  if (d && d.id === 'changes') renderChanges();
  if (d && d.id === 'spider') renderSpider();
  renderMetroControls();
}

PAGES.metronome = {
  title: 'Metronome',
  subs: ['click', 'exercises'],
  init() {
    const keepRunning = () => { if (MX.running) startMetro(); };
    onButton($('mBeats'), b => { state.beats = +b.dataset.v; save(); renderMetronome(); });
    onButton($('mSubdiv'), b => { state.subdiv = +b.dataset.v; save(); renderMetronome(); });
    $('mAccent').addEventListener('change', e => { state.accent = e.target.checked; save(); renderMetronome(); });
    onButton($('drills'), b => {
      stopAll();
      state.drill = b.dataset.v;
      setBpm(drillNow().bpm);   // each exercise starts at the tempo its source suggests
      renderMetronome();
    });
    onButton($('drillSet'), (b) => {
      const k = b.closest('[data-set]').dataset.set, d = drillNow();
      state.drillSet[d.id] = { ...(state.drillSet[d.id] || {}), [k]: b.dataset.v };
      save(); renderMetronome(); keepRunning();
    });
    $$('[data-bpm]').forEach(b => b.addEventListener('click', () => setBpm(state.bpm + +b.dataset.bpm)));
    $('bpmRange').addEventListener('input', e => setBpm(+e.target.value));
    $('clickVol').addEventListener('input', e => { state.clickVol = +e.target.value; save(); });
    $('metroStart').addEventListener('click', toggleMetro);
    $('tapBtn').addEventListener('click', tap);
    // One minute changes
    const setPair = (k, v) => { state.drillSet.changes = { ...(state.drillSet.changes || {}), [k]: v }; save(); renderChanges(); };
    $('omcA').innerHTML = $('omcB').innerHTML = Object.keys(OMC_CHORDS).map(n => `<option value="${n}">${n}</option>`).join('');
    $('omcA').addEventListener('change', e => setPair('a', e.target.value));
    $('omcB').addEventListener('change', e => setPair('b', e.target.value));
    $('omcClick').addEventListener('change', e => setPair('click', e.target.checked));
    $('omcStart').addEventListener('click', () => { if (MX.omc.phase === 'count' || MX.omc.phase === 'run') stopAll(); else startChanges(); });
    onButton($('omcBoxes'), b => { const [root, q] = OMC_CHORDS[omcPair()[+b.dataset.i]]; stopAll(); strum(openGrip(parseNote(root).pc, q)); });
    $('omcForm').addEventListener('submit', e => {
      e.preventDefault();
      const n = Math.round(+$('omcCount').value);
      if (!(n >= 0)) return;
      const key = omcKey();
      state.omcLog[key] = [...(state.omcLog[key] || []), { n, d: new Date().toISOString().slice(0, 10) }].slice(-30);
      $('omcCount').value = ''; MX.omc.phase = 'idle'; save(); renderChanges();
    });
    STOP_HOOKS.push(() => {
      MX.running = false;
      if (MX.omc.phase === 'count' || MX.omc.phase === 'run') { MX.omc.phase = 'idle'; clearInterval(MX.omc.timer); }
      if (current && current.page === 'metronome') { renderMetroControls(); if (drillMode() && drillNow().id === 'changes') renderChanges(); }
    });
  },
  render: renderMetronome,
  keys(e, sub, buttonFocused) {
    if (e.key === ' ' && !buttonFocused) { e.preventDefault(); toggleMetro(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); setBpm(state.bpm + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 5 : 1)); }
    else if (e.key === 't' || e.key === 'T') { e.preventDefault(); tap(); }
  }
};
// Tap tempo: taps more than two seconds apart start a new count
function tap() {
  const now = performance.now() / 1000;
  if (MX.taps.length && now - MX.taps[MX.taps.length - 1] > 2) MX.taps = [];
  MX.taps = [...MX.taps, now].slice(-6);
  const bpm = tapTempo(MX.taps);
  if (bpm) setBpm(bpm);
  $('metroPhase').textContent = bpm ? `Tapped ${clampBpm(bpm)} BPM` : 'Tap again…';
}
