/* Ear training: intervals and chord qualities, weighted towards the items you miss most */
const EAR_IV = [
  { code: 'b2', semi: 1, name: 'Minor second', song: 'Jaws' },
  { code: '2', semi: 2, name: 'Major second', song: 'Happy Birthday (2nd to 3rd note)' },
  { code: 'b3', semi: 3, name: 'Minor third', song: 'Greensleeves' },
  { code: '3', semi: 4, name: 'Major third', song: 'When the Saints Go Marching In' },
  { code: '4', semi: 5, name: 'Perfect fourth', song: 'Here Comes the Bride' },
  { code: '#4', semi: 6, name: 'Tritone', song: 'The Simpsons' },
  { code: '5', semi: 7, name: 'Perfect fifth', song: 'Star Wars (main theme)' },
  { code: 'b6', semi: 8, name: 'Minor sixth', song: 'The Entertainer' },
  { code: '6', semi: 9, name: 'Major sixth', song: 'My Bonnie' },
  { code: 'b7', semi: 10, name: 'Minor seventh', song: 'Somewhere (West Side Story)' },
  { code: '7', semi: 11, name: 'Major seventh', song: 'Take On Me (chorus)' },
  { code: '8', semi: 12, name: 'Octave', song: 'Somewhere Over the Rainbow' }
];
const EAR_CH = CHORDS.filter(c => ['maj', 'min', 'dim', 'aug', 'sus2', 'sus4', '7', 'maj7', 'm7', 'm7b5', 'dim7'].includes(c.id));
const PRESETS = {
  iv: [['Easy start', ['2', '3', '4', '5', '8']], ['Thirds and sixths', ['b3', '3', 'b6', '6']], ['All', EAR_IV.map(x => x.code)]],
  ch: [['Triads', ['maj', 'min', 'dim', 'aug']], ['Seventh chords', ['7', 'maj7', 'm7', 'm7b5']], ['All', EAR_CH.map(x => x.id)]]
};
const se = saved.ear || {};
const E = {
  mode: 'iv', dir: se.dir || 'up',
  iv: new Set(se.iv || ['2', '3', '4', '5', '8']),
  ch: new Set(se.ch || ['maj', 'min', 'dim', 'aug']),
  stats: se.stats || {}, q: null, answered: false, last: null,
  right: 0, total: 0, streak: 0, confirmReset: false
};
SAVERS.ear = () => ({ mode: E.mode, dir: E.dir, iv: [...E.iv], ch: [...E.ch], stats: E.stats });
// The old single-page version kept the exercise in ear.mode; it now decides which sub-page opens first
if (!state.sub.ear && se.mode === 'ch') state.sub.ear = 'chords';
const EAR_TIMER = makeTimer({
  prefix: 'ear', page: 'ear', key: () => E.mode === 'iv' ? 'interval' : 'chord',
  waiting: () => !!E.q && !E.answered, timeUp: earTimeUp, next: newQuestion
});
const earItems = () => E.mode === 'iv' ? EAR_IV.filter(x => E.iv.has(x.code)) : EAR_CH.filter(x => E.ch.has(x.id));
const keyOf = it => (E.mode === 'iv' ? 'iv:' : 'ch:') + (it.code || it.id);

function pickEar() {
  const list = earItems();
  const pool = list.length > 1 ? list.filter(x => keyOf(x) !== E.last) : list;
  const weights = pool.map(it => {
    const st = E.stats[keyOf(it)];
    const acc = st && st.t ? st.r / st.t : 0.5;
    return 1 + 2.5 * (1 - acc);
  });
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}
function playItem(it, root, dir) {
  stopAll();
  if (E.mode === 'iv') {
    const a = root, b = root + it.semi;
    if (dir === 'up') { play(a, 0); play(b, 0.75); }
    else if (dir === 'down') { play(b, 0); play(a, 0.75); }
    else { play(a, 0); play(b, 0); }
  } else {
    const ms = it.iv.map(iv => root + IV[iv][0]);
    ms.forEach((m, i) => play(m, i * 0.32));
    ms.forEach((m, i) => play(m, ms.length * 0.32 + 0.35 + i * 0.03));
  }
}
function newQuestion() {
  if (earItems().length < 2) return;
  const it = pickEar();
  const dir = E.mode === 'iv' ? (E.dir === 'mixed' ? ['up', 'down', 'harmonic'][Math.floor(Math.random() * 3)] : E.dir) : 'up';
  const root = E.mode === 'iv' ? 48 + Math.floor(Math.random() * 12) : 48 + Math.floor(Math.random() * 10);
  E.q = { it, root, dir }; E.answered = false; E.last = keyOf(it);
  EAR_TIMER.start();
  playItem(it, root, dir);
  renderEar();
}
// Counts an answer: the statistics of the item, the score, the streak and the saved attempt
function scoreEar(ok, answer) {
  const k = keyOf(E.q.it);
  E.answered = true;
  E.stats[k] = E.stats[k] || { r: 0, t: 0 };
  E.stats[k].t++; if (ok) E.stats[k].r++;
  E.total++; if (ok) { E.right++; E.streak++; } else E.streak = 0;
  logAttempt(E.mode === 'iv' ? 'interval' : 'chord', E.q.it.name, answer, ok);
  E.q.ok = ok;
  save();
}
function answerEar(it) {
  if (!E.q) return;
  if (E.answered) { playItem(it, E.q.root, E.q.dir); return; }
  E.q.chosen = it;
  scoreEar(keyOf(it) === keyOf(E.q.it), it.name);
  EAR_TIMER.answered(E.q.ok);
  renderEar();
}
// No answer in time: wrong, and the question is played again so the right answer can be heard
function earTimeUp() {
  if (!E.q || E.answered) return;
  E.q.chosen = null; E.q.late = true;
  scoreEar(false, 'Time ran out');
  playItem(E.q.it, E.q.root, E.q.dir);
  renderEar();
}
function describe(q) {
  const rootName = spell(ROOTS[q.root % 12], '1');
  if (E.mode === 'iv') {
    const top = spell(ROOTS[q.root % 12], q.it.code);
    const dirTxt = { up: 'ascending', down: 'descending', harmonic: 'played together' }[q.dir];
    return `${q.it.name}, ${dirTxt}, from ${rootName} to ${top}. Reference song (ascending) is ${q.it.song}.`;
  }
  const tones = q.it.iv.map(iv => spell(ROOTS[q.root % 12], iv)).join(' ');
  return `${rootName}${q.it.sym}, ${q.it.name.toLowerCase()}, with the notes ${tones}.`;
}

function renderEar(sub = current.sub) {
  const mode = sub === 'chords' ? 'ch' : 'iv';
  if (mode !== E.mode) { E.mode = mode; E.q = null; E.right = E.total = E.streak = 0; }
  setPressed($('dir'), E.dir);
  $('f-dir').hidden = E.mode !== 'iv';
  const all = E.mode === 'iv' ? EAR_IV : EAR_CH, sel = E.mode === 'iv' ? E.iv : E.ch;
  $('pool').innerHTML = all.map(it => {
    const id = it.code || it.id;
    return `<button data-id="${id}" aria-pressed="${sel.has(id)}">${E.mode === 'iv' ? `${it.name} <small>${it.semi}</small>` : it.name}</button>`;
  }).join('');
  $('presets').innerHTML = PRESETS[E.mode].map(([n], i) => `<button class="ghost" data-p="${i}" style="padding:3px 10px;font-size:0.82rem">${n}</button>`).join(' ');

  const list = earItems();
  if (E.q && !list.some(x => keyOf(x) === keyOf(E.q.it))) E.q = null;
  if (!E.q) EAR_TIMER.cancel();
  $('replay').disabled = !E.q;
  $('prompt').textContent = list.length < 2 ? 'Choose at least two options in the selection.'
    : !E.q ? 'Press “New question” to start.'
    : E.answered ? 'Press “New question” to continue.'
    : E.mode === 'iv' ? 'Which interval did you hear?' : 'Which chord quality did you hear?';
  $('feedback').innerHTML = E.q && E.answered
    ? `<span class="verdict ${E.q.ok ? 'good' : 'bad'}">${E.q.ok ? 'Correct' : E.q.late ? 'Time is up. It was ' + E.q.it.name.toLowerCase() : 'Not quite. You answered ' + E.q.chosen.name.toLowerCase()}</span><span class="sub">${describe(E.q)}</span>`
    : '';
  $('answers').innerHTML = list.map(it => {
    let cls = '';
    if (E.q && E.answered) { if (keyOf(it) === keyOf(E.q.it)) cls = 'correct'; else if (E.q.chosen && keyOf(it) === keyOf(E.q.chosen)) cls = 'wrong'; }
    const sub2 = E.mode === 'iv' ? `${it.code === '#4' ? 'A4 / d5' : intervalName(it.code)}, ${it.semi} semitones` : `X${it.sym || ''}`.replace(/^X$/, 'X (major)');
    return `<button class="${cls}" data-a="${it.code || it.id}"><span>${it.name}</span><small>${sub2}</small></button>`;
  }).join('');
  const pct = E.total ? Math.round(100 * E.right / E.total) : 0;
  $('score').innerHTML = `Correct <b>${E.right}</b> of <b>${E.total}</b>${E.total ? ` (${pct}%)` : ''} &nbsp; Streak <b>${E.streak}</b>`;
  $('stats').innerHTML = all.map(it => {
    const st = E.stats[keyOf(it)] || { r: 0, t: 0 }, p = st.t ? st.r / st.t : 0;
    return `<div class="stat-row"><span>${it.name}</span><span class="bar"><i style="width:${(p * 100).toFixed(0)}%"></i></span><span class="n">${st.t ? st.r + '/' + st.t : 'not practised'}</span></div>`;
  }).join('');
  $('resetStats').textContent = E.confirmReset ? 'Click again to delete' : 'Reset statistics';
  EAR_TIMER.render();
}

PAGES.ear = {
  title: 'Ear training',
  subs: ['intervals', 'chords'],
  init() {
    onButton($('dir'), b => { E.dir = b.dataset.v; save(); renderEar(); });
    onButton($('pool'), b => {
      const set = E.mode === 'iv' ? E.iv : E.ch, id = b.dataset.id;
      if (set.has(id)) set.delete(id); else set.add(id);
      save(); renderEar();
    });
    onButton($('presets'), b => {
      const ids = PRESETS[E.mode][+b.dataset.p][1];
      if (E.mode === 'iv') E.iv = new Set(ids); else E.ch = new Set(ids);
      save(); renderEar();
    });
    $('newQ').addEventListener('click', newQuestion);
    EAR_TIMER.bind();
    $('replay').addEventListener('click', () => { if (E.q) playItem(E.q.it, E.q.root, E.q.dir); });
    onButton($('answers'), b => { const it = earItems().find(x => (x.code || x.id) === b.dataset.a); if (it) answerEar(it); });
    $('resetStats').addEventListener('click', () => {
      if (!E.confirmReset) { E.confirmReset = true; renderEar(); setTimeout(() => { E.confirmReset = false; if (current.page === 'ear') renderEar(); }, 4000); return; }
      E.stats = {}; E.confirmReset = false; save(); renderEar();
    });
  },
  render: renderEar,
  keys(e) {
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); newQuestion(); }
    if ((e.key === 'r' || e.key === 'R') && E.q) { e.preventDefault(); playItem(E.q.it, E.q.root, E.q.dir); }
  }
};
