/* Profile: progress, summaries, goals and the points leaderboard. Only when the FastAPI backend is running;
   without it the app works the same, but nothing is saved. The numbers come from stats.py on the server. */
const API = { ok: false, checked: false, profile: null, profiles: [], confirmDelete: false, scoring: null };
const PROFILE_KEY = 'gehor-profile';
const TZ = -new Date().getTimezoneOffset();   // minutes east of UTC, so the server counts days from local midnight
const EXERCISES = {
  interval: 'Intervals', chord: 'Chord qualities', triad_play: 'Play the triad', triad_recognize: 'Recognise the triad',
  caged_play: 'Play the CAGED shape', caged_recognize: 'Name the CAGED shape', tuner_hit: 'Hit the note', tuner_guess: 'Guess the note'
};
const ACTIVITY_NAMES = { metronome: 'Metronome', drill: 'Metronome exercises', progressions: 'Play along', changes: 'One minute changes' };
const PAGE_OF = {
  interval: '#/ear/intervals', chord: '#/ear/chords', triad_play: '#/triads/practice', triad_recognize: '#/triads/practice',
  caged_play: '#/caged/practice', caged_recognize: '#/caged/practice', tuner_hit: '#/tuner/hit', tuner_guess: '#/tuner/guess',
  metronome: '#/metronome/click', drill: '#/metronome/exercises', progressions: '#/progressions', changes: '#/metronome/exercises'
};
const nameOf = k => EXERCISES[k] || ACTIVITY_NAMES[k] || k;
// In piano mode the CAGED and Triads pages are hidden, so their exercises get no link and no suggestions
const guitarOnly = k => pianoMode() && /^#\/(caged|triads)\//.test(PAGE_OF[k] || '');
const pageOf = k => guitarOnly(k) ? '' : PAGE_OF[k] || '';
const PF = { summary: { period: 'week', day: null }, board: 'week', token: 0 };
const pctTxt = a => a === null || a === undefined ? '–' : `${Math.round(a * 100)}%`;
const num = v => v === null || v === undefined ? '–' : new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(v);
const minTxt = m => m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${num(m)} min`;
const plural = (n, word) => `${num(n)} ${word}${n === 1 ? '' : 's'}`;
const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = (s, opts = { day: 'numeric', month: 'long', year: 'numeric' }) => parseDay(s).toLocaleDateString('en-GB', opts);

async function api(path, opts = {}) {
  const r = await fetch('/api' + path + (path.includes('?') ? '&' : '?') + 'tz=' + TZ, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!r.ok) {
    let detail = null;
    try { detail = (await r.json()).detail; } catch (e) { /* not JSON */ }
    if (Array.isArray(detail)) detail = detail.map(d => String(d.msg || '').replace(/^Value error, /, '')).join(' ');
    throw new Error(typeof detail === 'string' && detail ? detail : r.status === 422 ? 'Please check the values.' : `The server answered with error ${r.status}.`);
  }
  return r.status === 204 ? null : r.json();
}

// Fire and forget: practice is never blocked by the network, and without a backend nothing is sent
function logAttempt(exercise, item, answer, correct, cents = null) {
  if (!API.ok || !API.profile) return;
  api('/attempts', { method: 'POST', body: JSON.stringify({ profile_id: API.profile, exercise, item, answer, correct, cents }) })
    .then(refreshProfiles).catch(() => {});
}
// Practice without right or wrong answers: the metronome, its exercises, play-along and One minute changes
function logSession(activity, detail, seconds, bpm = null, value = null) {
  if (!API.ok || !API.profile || !(seconds >= 1)) return;
  api('/sessions', { method: 'POST', body: JSON.stringify({ profile_id: API.profile, activity, detail, seconds: Math.min(14400, Math.round(seconds)), bpm, value }) })
    .then(refreshProfiles).catch(() => {});
}

async function initBackend() {
  try {
    const r = await fetch('/api/health');
    API.ok = r.ok && (await r.json()).ok === true;
  } catch (e) { API.ok = false; }
  API.checked = true;
  if (!API.ok) { if (current && current.page === 'profile') rerender(); return; }
  try { API.profile = +localStorage.getItem(PROFILE_KEY) || null; } catch (e) { API.profile = null; }
  try { API.scoring = await api('/scoring'); } catch (e) { API.scoring = null; }
  $('f-profile').hidden = false;
  $('nav-profile').hidden = false;
  $('boardSel').innerHTML = '<option value="">All exercises</option>' + Object.entries(EXERCISES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  await refreshProfiles();
  if (current) rerender();   // the home page lists the profile page, and the profile page can now load
}

async function refreshProfiles() {
  if (!API.ok) return;
  try { API.profiles = await api('/profiles'); } catch (e) { return; }
  if (API.profile && !API.profiles.some(p => p.id === API.profile)) selectProfile(null);
  $('profileSel').innerHTML = `<option value="">${API.profiles.length ? 'Choose profile' : 'No profiles yet'}</option>` +
    API.profiles.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  $('profileSel').value = API.profile ? String(API.profile) : '';
  const me = API.profiles.find(p => p.id === API.profile);
  $('profileScore').innerHTML = me ? `Points <b>${me.score}</b>, ${pctTxt(me.accuracy)} right` : 'Answers are not saved';
}

function selectProfile(id) {
  API.profile = id; API.confirmDelete = false;
  try { if (id) localStorage.setItem(PROFILE_KEY, String(id)); else localStorage.removeItem(PROFILE_KEY); } catch (e) { /* optional */ }
}

/* ================= CHARTS =================
   Small SVG charts in one hue (the --chart token). Every mark has a hit area larger than itself that shows
   a tooltip on hover and on keyboard focus, and every chart has a table view with the same numbers.
   A chart is drawn at the width of its slot, one SVG unit per pixel, so the text keeps its size on a phone
   and on a wide screen, and it is drawn again when the window changes width. */
const CHARTS = new Map();   // slot id → function(width) that returns the chart
let chartSeq = 0;
function chartSlot(draw) {
  const id = 'chart' + (++chartSeq);
  CHARTS.set(id, draw);
  return `<div class="chart-slot" id="${id}"></div>`;
}
function drawCharts() {
  for (const [id, draw] of CHARTS) {
    const el = document.getElementById(id);
    if (!el) { CHARTS.delete(id); continue; }
    const w = Math.round(el.clientWidth);
    if (!w || +el.dataset.w === w) continue;   // hidden, or already drawn at this width
    el.dataset.w = w;
    el.innerHTML = draw(Math.max(260, w));
  }
}
// Show every n-th x label, counted back from the newest, so labels never collide
function labelStep(rows, room) {
  const widest = Math.max(1, ...rows.map(r => String(r.x).length)) * 7.4 + 14;   // 12px monospace
  return Math.max(1, Math.ceil(rows.length / Math.max(1, Math.floor(room / widest))));
}
const niceMax = v => { const p = Math.pow(10, Math.floor(Math.log10(v))); return [1, 2, 4, 5, 6, 8, 10].map(k => k * p).find(x => x >= v); };
function roundTop(x, y, w, h, r) {
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
// rows: [{ x, v, tip }]; v may be null (no data)
function columnChart(rows, { label, max = null, height = 150, width = 560 }) {
  const W = width, H = height, L = 42, R = 10, T = 18, B = 24;
  const top = max || niceMax(Math.max(1, ...rows.map(r => r.v || 0)));
  const y = v => T + (H - T - B) * (1 - v / top), band = (W - L - R) / rows.length, bw = Math.min(24, band * 0.62);
  let s = [0, top / 2, top].map(t => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="axis end" x="${L - 6}" y="${y(t) + 3}">${num(t)}</text>`).join('');
  const every = labelStep(rows, W - L - R);
  rows.forEach((r, i) => {
    const cx = L + band * (i + 0.5);
    if ((rows.length - 1 - i) % every === 0) s += `<text class="axis mid" x="${cx}" y="${H - 6}">${esc(r.x)}</text>`;
    s += `<rect class="hit" x="${cx - band / 2}" y="${T}" width="${band}" height="${H - T - B}" tabindex="0" data-tip="${esc(r.tip)}" aria-label="${esc(r.tip.replace('|', ', '))}"/>`;
    if (r.v > 0) s += `<path class="mark" d="${roundTop(cx - bw / 2, y(r.v), bw, y(0) - y(r.v), 4)}"/>`;
  });
  const last = rows[rows.length - 1];   // label only the newest column
  if (last && last.v > 0) s += `<text class="label" text-anchor="middle" x="${L + band * (rows.length - 0.5)}" y="${y(last.v) - 5}">${num(last.v)}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">${s}</svg>`;
}
function lineChart(rows, { label, max = 100, unit = '%', height = 150, width = 560 }) {
  const W = width, H = height, L = 46, R = 40, T = 18, B = 24;
  const band = (W - L - R) / rows.length, x = i => L + band * (i + 0.5), y = v => T + (H - T - B) * (1 - v / max);
  let s = [0, max / 2, max].map(t => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="axis end" x="${L - 6}" y="${y(t) + 3}">${num(t)}${unit}</text>`).join('');
  const every = labelStep(rows, W - L - R);
  rows.forEach((r, i) => { if ((rows.length - 1 - i) % every === 0) s += `<text class="axis mid" x="${x(i)}" y="${H - 6}">${esc(r.x)}</text>`; });
  // the line breaks where a week has no answers
  let d = '', pen = false;
  rows.forEach((r, i) => { if (r.v === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i)},${y(r.v)}`; pen = true; });
  s += `<line class="cross" y1="${T}" y2="${H - B}" x1="0" x2="0" visibility="hidden"/><path class="line" d="${d}"/>`;
  rows.forEach((r, i) => { if (r.v !== null) s += `<circle class="dot" cx="${x(i)}" cy="${y(r.v)}" r="4"/>`; });
  const lastI = rows.map(r => r.v !== null).lastIndexOf(true);
  if (lastI >= 0) s += `<text class="label" x="${x(lastI) + 8}" y="${y(rows[lastI].v) + 4}">${num(rows[lastI].v)}${unit}</text>`;
  rows.forEach((r, i) => { s += `<rect class="hit" x="${x(i) - band / 2}" y="${T}" width="${band}" height="${H - T - B}" tabindex="0" data-x="${x(i)}" data-tip="${esc(r.tip)}" aria-label="${esc(r.tip.replace('|', ', '))}"/>`; });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">${s}</svg>`;
}
const tableView = (head, rows) => `<details class="table-view"><summary>Show as a table</summary><div class="scroll"><table class="tbl"><thead><tr>${head.map((h, i) => `<th class="${i ? 'num' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${i ? 'num' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
function showTip(el, px, py) {
  const tip = $('chartTip'), [value, what] = el.dataset.tip.split('|');
  tip.replaceChildren(Object.assign(document.createElement('b'), { textContent: value }), Object.assign(document.createElement('span'), { textContent: what || '' }));
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.min(window.innerWidth - r.width - 8, px + 12) + 'px';
  tip.style.top = Math.max(8, py - r.height - 10) + 'px';
  const cross = el.ownerSVGElement && el.ownerSVGElement.querySelector('.cross');
  if (cross && el.dataset.x) { cross.setAttribute('x1', el.dataset.x); cross.setAttribute('x2', el.dataset.x); cross.setAttribute('visibility', 'visible'); }
}
function hideTip(el) {
  $('chartTip').hidden = true;
  const cross = el && el.ownerSVGElement && el.ownerSVGElement.querySelector('.cross');
  if (cross) cross.setAttribute('visibility', 'hidden');
}

/* ================= TILES ================= */
// A delta: an arrow and the size of the change against an earlier period, green when up and red when down
function delta(now, before, { what, unit = '', points = false } = {}) {
  if (now === null || now === undefined || before === null || before === undefined) return `<span class="delta">${what ? 'nothing ' + what : ''}</span>`;
  const d = points ? Math.round((now - before) * 100) : Math.round((now - before) * 10) / 10;
  const txt = d === 0 ? `= same as ${what || 'before'}` : `${d > 0 ? '▲' : '▼'} ${num(Math.abs(d))}${points ? ' percentage points' : unit}${what ? ' vs. ' + what : ''}`;
  return `<span class="delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${txt}</span>`;
}
const tile = (value, label, extra = '') => `<div class="tile"><b>${value}</b><span>${label}</span>${extra}</div>`;

/* ================= SUGGESTIONS ================= */
const METRICS = {
  points: { name: 'Points', unit: 'points', scopes: 'exercises' },
  answers: { name: 'Answers', unit: 'answers', scopes: 'exercises' },
  correct: { name: 'Correct answers', unit: 'correct answers', scopes: 'exercises' },
  accuracy: { name: 'Accuracy', unit: '%', scopes: 'exercises' },
  minutes: { name: 'Practice time', unit: 'minutes', scopes: 'all' },
  days: { name: 'Practice days', unit: 'days', scopes: 'all' },
  tempo: { name: 'Metronome tempo', unit: 'BPM', scopes: 'tempo' },
  changes: { name: 'One minute changes', unit: 'changes', scopes: 'pairs' }
};
const PERIOD_TXT = { day: 'every day', week: 'every week', month: 'every month' };
// What it takes to reach a goal from here
function paceText(g) {
  const unit = METRICS[g.metric].unit;
  if (g.metric === 'days') {
    const need = g.target - (g.value || 0);
    return need > g.days_left ? `Only ${plural(g.days_left, 'day')} left, so it cannot be reached this time`
      : `Practise on ${num(need)} of the ${plural(g.days_left, 'day')} left to reach it`;
  }
  return g.days_left <= 1 ? `${num(g.per_day)} ${unit} to go today` : `About ${num(g.per_day)} ${unit} a day reaches it`;
}
function goalTitle(g) {
  const t = num(g.target), when = g.period === 'until' ? `by ${fmtDate(g.due)}` : PERIOD_TXT[g.period];
  const inScope = g.scope ? ` in ${nameOf(g.scope)}` : '';
  return {
    points: `${t} points${inScope} ${when}`, answers: `${t} answers${inScope} ${when}`, correct: `${t} correct answers${inScope} ${when}`,
    accuracy: `${t}% right${inScope} ${when}`, minutes: `${t} minutes of practice${inScope} ${when}`,
    days: `Practise on ${t} days ${g.period === 'until' ? when : g.period === 'week' ? 'a week' : 'a month'}${inScope}`,
    tempo: `Reach ${t} BPM in ${g.scope ? nameOf(g.scope) : 'any metronome exercise'} ${when}`,
    changes: `${t} changes in one minute${g.scope ? ' with ' + g.scope : ''} ${when}`
  }[g.metric];
}
function suggestionHtml(s) {
  const pct = v => `${Math.round(v * 100)}%`;
  let text, link = pageOf(s.exercise), go = s.exercise ? `Practise ${nameOf(s.exercise)}` : '', good = false;
  switch (s.kind) {
    case 'goal_behind':
      text = `Your goal “${goalTitle(s)}” is behind: ${num(s.value)} so far. ${paceText(s)}.`;
      link = s.scope && pageOf(s.scope) ? pageOf(s.scope) : '#/profile/goals'; go = s.scope ? `Practise ${nameOf(s.scope)}` : 'See your goals'; break;
    case 'weak_item': text = `${s.item} in ${nameOf(s.exercise)}: ${pct(s.accuracy)} right in the last 60 days (${s.answers} answers).`; break;
    case 'slipping': text = `${nameOf(s.exercise)} has dropped from ${pct(s.before)} to ${pct(s.recent)} right in the last two weeks.`; break;
    case 'improving': text = `${nameOf(s.exercise)} is up from ${pct(s.before)} to ${pct(s.recent)} right in the last two weeks. Well done.`; good = true; go = ''; break;
    case 'stale': text = `You have not practised ${nameOf(s.exercise)} for ${s.days_since} days. A short round keeps it fresh.`; break;
    case 'few_days': text = `You practised on ${plural(s.days, 'day')} of the last seven. A little every day helps more than a lot once a week.`; link = ''; break;
    case 'untried': text = `You have not tried ${nameOf(s.exercise)} yet.`; go = 'Try it'; break;
    case 'no_goals': text = 'Set a goal, for example 50 points a week or 15 minutes a day, and follow it here.'; link = '#/profile/goals'; go = 'Set a goal'; break;
    default: return '';
  }
  return `<li class="${good ? 'good' : ''}"><span>${esc(text)}</span>${link && go ? `<a class="more" href="${link}">${esc(go)}</a>` : ''}</li>`;
}

/* ================= OVERVIEW ================= */
async function renderOverview(token) {
  const box = $('pfOverview');
  if (!API.profile) { box.innerHTML = '<p class="hint">Choose a profile at the top, or create a new one. Your answers and practice time are saved to it from then on.</p>'; return; }
  let o;
  try { o = await api(`/profiles/${API.profile}/overview`); } catch (e) { box.innerHTML = `<p class="form-msg bad">${esc(e.message)}</p>`; return; }
  if (token !== PF.token) return;
  const w = o.progress, now = w[w.length - 1], last = o.same_days_before.week;
  const tips = o.suggestions.filter(t => !guitarOnly(t.exercise));
  const lastName = Math.round((parseDay(last.end) - parseDay(last.start)) / 864e5) < 6 ? 'the same days last week' : 'last week';
  const wk = r => fmtDate(r.start, { day: 'numeric', month: 'short' });
  box.innerHTML = `
    <div class="pf-head"><h2>${esc(o.profile.name)}</h2>
      <button class="ghost danger" id="delProfile">${API.confirmDelete ? 'Click again to delete the profile and everything saved in it' : 'Delete profile'}</button></div>
    <div class="tiles">
      ${tile(num(now.points), 'points this week', delta(now.points, last.points, { what: lastName }))}
      ${tile(num(o.score.total), 'points in total', `<span class="delta">#${o.rank.month.rank} of ${o.rank.month.of} this month</span>`)}
      ${tile(pctTxt(now.accuracy), 'right this week', now.accuracy !== null && last.accuracy !== null ? delta(now.accuracy, last.accuracy, { what: lastName, points: true }) : '')}
      ${tile(minTxt(now.minutes), 'practice this week', delta(now.minutes, last.minutes, { what: lastName, unit: ' min' }))}
      ${tile(plural(o.practice_streak, 'day'), 'practice streak', `<span class="delta">best run of right answers: ${o.streak.best}</span>`)}
    </div>
    <div class="card"><h3>What to practise next</h3>
      ${tips.length ? `<ul class="suggest">${tips.map(suggestionHtml).join('')}</ul>` : '<p class="hint">Do a few tasks on the other pages, and suggestions show up here.</p>'}</div>
    <div class="pf-grid">
      <div class="card"><h3>Points per week</h3><p class="sub-title">The last 12 weeks</p>
        ${chartSlot(width => columnChart(w.map(r => ({ x: wk(r), v: r.points, tip: `${num(r.points)} points|week of ${wk(r)}` })), { label: 'Points per week', width }))}
        ${tableView(['Week of', 'Points', 'Answers', 'Practice'], w.map(r => [wk(r), num(r.points), num(r.answers), minTxt(r.minutes)]))}</div>
      <div class="card"><h3>Right answers per week</h3><p class="sub-title">Share of right answers; weeks without answers are left out</p>
        ${chartSlot(width => lineChart(w.map(r => ({ x: wk(r), v: r.accuracy === null ? null : Math.round(r.accuracy * 100), tip: r.accuracy === null ? 'no answers|week of ' + wk(r) : `${pctTxt(r.accuracy)} right|${r.correct} of ${r.answers}, week of ${wk(r)}` })), { label: 'Share of right answers per week', width }))}
        ${tableView(['Week of', 'Right', 'Answers'], w.map(r => [wk(r), pctTxt(r.accuracy), num(r.answers)]))}</div>
    </div>
    <div class="card"><h3>By exercise</h3>
      <div class="scroll"><table class="tbl"><thead><tr><th>Exercise</th><th class="num">Answers</th><th class="num">Right, all time</th><th class="num">Last 14 days</th><th class="num">The 14 days before</th><th class="num">Last practised</th></tr></thead><tbody>
      ${o.exercises.length ? o.exercises.map(e => {
        const trend = e.recent !== null && e.before !== null ? (e.recent > e.before + 0.05 ? ' ▲' : e.recent < e.before - 0.05 ? ' ▼' : '') : '';
        return `<tr><td>${pageOf(e.exercise) ? `<a class="more" href="${pageOf(e.exercise)}">${nameOf(e.exercise)}</a>` : nameOf(e.exercise)}</td><td class="num">${e.answers}</td><td class="num">${pctTxt(e.accuracy)}</td><td class="num">${pctTxt(e.recent)}${trend}</td><td class="num">${pctTxt(e.before)}</td><td class="num">${e.days_since === 0 ? 'today' : e.days_since === 1 ? 'yesterday' : e.days_since + ' days ago'}</td></tr>`;
      }).join('') : '<tr><td colspan="6">No answers saved yet. Do a few tasks on the other pages.</td></tr>'}
      </tbody></table></div></div>
    <p class="hint">Your ${num(o.score.total)} points: ${num(o.score.answers)} for right answers, ${num(o.score.streaks)} for runs of right answers, ${num(o.score.practice)} for practice time and ${num(o.score.days)} for practice days. <a class="more" href="#/profile/leaderboard">How points work</a></p>`;
}

/* ================= SUMMARIES ================= */
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}
function periodName(kind, start, end) {
  if (kind === 'day') return fmtDate(start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (kind === 'week') return `Week ${isoWeek(parseDay(start))}, ${fmtDate(start, { day: 'numeric', month: 'short' })} to ${fmtDate(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return fmtDate(start, { month: 'long', year: 'numeric' });
}
function shiftSummary(step) {
  const S = PF.summary, d = parseDay(S.day || isoDay(new Date()));
  if (S.period === 'day') d.setDate(d.getDate() + step);
  else if (S.period === 'week') d.setDate(d.getDate() + 7 * step);
  else { d.setDate(1); d.setMonth(d.getMonth() + step); }
  S.day = isoDay(d);
  renderProfileTab();
}
async function renderSummary(token) {
  const box = $('pfSummary'), S = PF.summary;
  setPressed($('sumPeriod'), S.period);
  if (!API.profile) { box.innerHTML = '<p class="hint">Choose a profile at the top to see its summaries.</p>'; return; }
  let s;
  try { s = await api(`/profiles/${API.profile}/summary?period=${S.period}&day=${S.day || isoDay(new Date())}`); } catch (e) { box.innerHTML = `<p class="form-msg bad">${esc(e.message)}</p>`; return; }
  if (token !== PF.token) return;
  const t = s.totals, p = s.previous;
  const prevDays = Math.round((parseDay(p.end) - parseDay(p.start)) / 864e5) + 1;
  const prevName = !p.partial ? { day: 'the day before', week: 'the week before', month: 'the month before' }[S.period]
    : S.period === 'week' ? `the same ${prevDays} days of the week before`
    : `the first ${prevDays === 1 ? 'day' : prevDays + ' days'} of ${fmtDate(p.start, { month: 'long' })}`;
  $('sumNext').disabled = s.period.end >= isoDay(new Date());
  const empty = !t.answers && !t.minutes;
  const dayLabel = d => S.period === 'week' ? fmtDate(d.date, { weekday: 'short' }) : String(parseDay(d.date).getDate());
  box.innerHTML = `
    <h3>${periodName(S.period, s.period.start, s.period.end)}</h3>
    <p class="hint">The arrows compare with ${prevName}${p.partial ? ', since this ' + S.period + ' is not over yet' : ''}.</p>
    <div class="tiles">
      ${tile(num(t.points), 'points', delta(t.points, p.points))}
      ${tile(num(t.answers), 'answers', delta(t.answers, p.answers))}
      ${tile(pctTxt(t.accuracy), 'right', t.accuracy !== null && p.accuracy !== null ? delta(t.accuracy, p.accuracy, { points: true }) : '')}
      ${tile(minTxt(t.minutes), 'practice', delta(t.minutes, p.minutes, { unit: ' min' }))}
      ${S.period !== 'day' ? tile(plural(t.active_days, 'day'), 'with practice', delta(t.active_days, p.active_days)) : ''}
    </div>
    ${empty ? '<p class="hint">Nothing was practised in this period.</p>' : `
    ${s.days.length ? `<div class="card"><h3>Points per day</h3>
      ${chartSlot(width => columnChart(s.days.map(d => ({ x: dayLabel(d), v: d.points, tip: `${num(d.points)} points|${d.answers} answers, ${minTxt(d.minutes)}, ${fmtDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}` })), { label: 'Points per day', width }))}
      ${tableView(['Day', 'Points', 'Answers', 'Right', 'Practice'], s.days.map(d => [fmtDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' }), num(d.points), num(d.answers), pctTxt(d.accuracy), minTxt(d.minutes)]))}</div>` : ''}
    <div class="pf-grid">
      <div class="card"><h3>By exercise</h3>${s.exercises.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>Exercise</th><th class="num">Answers</th><th class="num">Right</th><th class="num">Points</th></tr></thead><tbody>
        ${s.exercises.map(e => `<tr><td>${nameOf(e.exercise)}</td><td class="num">${e.answers}</td><td class="num">${pctTxt(e.accuracy)}</td><td class="num">${e.points}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">No answers in this period.</p>'}</div>
      <div class="card"><h3>Practice without answers</h3>${s.sessions.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>What</th><th class="num">Times</th><th class="num">Time</th><th class="num">Best</th></tr></thead><tbody>
        ${s.sessions.map(g => `<tr><td>${esc(g.detail || nameOf(g.activity))}</td><td class="num">${g.count}</td><td class="num">${minTxt(g.minutes)}</td><td class="num">${g.best_value !== null ? g.best_value + ' changes' : g.best_bpm ? g.best_bpm + ' BPM' : '–'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">No metronome or play-along practice in this period.</p>'}</div>
    </div>
    <div class="pf-grid">
      <div class="card"><h3>Went well</h3>${s.best.length ? `<ul class="suggest">${s.best.map(i => `<li class="good"><span>${esc(i.item)}, ${nameOf(i.exercise)}</span><span>${i.correct} of ${i.answers}</span></li>`).join('')}</ul>` : '<p class="hint">Items with at least three answers and 80 % right show up here.</p>'}</div>
      <div class="card"><h3>To work on</h3>${s.weakest.length ? `<ul class="suggest">${s.weakest.map(i => `<li><span>${esc(i.item)}, ${nameOf(i.exercise)}</span>${pageOf(i.exercise) ? `<a class="more" href="${pageOf(i.exercise)}">${i.correct} of ${i.answers}, practise</a>` : `<span>${i.correct} of ${i.answers}</span>`}</li>`).join('')}</ul>` : '<p class="hint">Nothing below 80 % right. Nice.</p>'}</div>
    </div>`}
    ${s.goals_met.length ? `<div class="card"><h3>Goals reached</h3><ul class="suggest">${s.goals_met.map(g => `<li class="good"><span>${esc(goalTitle(g))}</span><span>✓</span></li>`).join('')}</ul></div>` : ''}`;
}

/* ================= GOALS ================= */
const GOAL_EXAMPLES = [
  { metric: 'points', target: 50, period: 'week' }, { metric: 'minutes', target: 15, period: 'day' },
  { metric: 'days', target: 20, period: 'month' }, { metric: 'accuracy', target: 80, period: 'week', scope: 'interval' },
  { metric: 'tempo', target: 120, period: 'until', scope: 'Speed trainer' }, { metric: 'changes', target: 40, period: 'until', scope: 'A–D' }
];
function scopeOptions(metric) {
  const ex = Object.entries(EXERCISES), acts = Object.entries(ACTIVITY_NAMES);
  if (METRICS[metric].scopes === 'exercises') return [['', 'All exercises'], ...ex];
  if (METRICS[metric].scopes === 'all') return [['', 'Everything'], ...ex, ...acts];
  if (METRICS[metric].scopes === 'tempo') return [['', 'Any metronome exercise'], ['metronome', 'Metronome'], ...DRILLS.filter(d => d.id !== 'changes').map(d => [d.name, d.name])];
  const pairs = new Set(['A–D', 'D–G', 'C–G', 'Em–G', 'Am–C', 'A–E', ...Object.keys(state.omcLog || {})]);
  return [['', 'Any pair of chords'], ...[...pairs].sort().map(p => [p, p])];
}
function fillGoalForm(g) {
  $('gMetric').value = g.metric; updateGoalForm();
  $('gScope').value = g.scope || ''; $('gTarget').value = g.target; $('gPeriod').value = g.period; updateGoalForm(false);
}
function updateGoalForm(resetScope = true) {
  const m = $('gMetric').value, info = METRICS[m];
  if (resetScope) $('gScope').innerHTML = scopeOptions(m).map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
  $('gUnit').textContent = `Target (${info.unit})`;
  $('gTarget').max = m === 'accuracy' ? 100 : 100000;
  $('gPeriod').querySelector('[value="day"]').disabled = m === 'days';
  if (m === 'days' && $('gPeriod').value === 'day') $('gPeriod').value = 'month';
  $('f-gDue').hidden = $('gPeriod').value !== 'until';
  if (!$('gDue').value) { const d = new Date(); d.setDate(d.getDate() + 30); $('gDue').value = isoDay(d); }
  $('gDue').min = isoDay(new Date());
}
function goalCard(g) {
  const unit = METRICS[g.metric].unit, val = g.value === null ? '–' : num(g.value);
  let status, cls = '';
  if (g.met) { status = g.period === 'until' ? 'Reached ✓' : `Done ${g.period === 'day' ? 'today' : 'this ' + g.period} ✓`; cls = 'good'; }
  else if (g.expired) { status = `Ended on ${fmtDate(g.due)} without reaching it`; cls = 'bad'; }
  else if (g.metric === 'accuracy' && g.answers_in_period < (API.scoring ? API.scoring.min_accuracy_answers : 10)) status = `Needs ${(API.scoring ? API.scoring.min_accuracy_answers : 10) - g.answers_in_period} more answers to count`;
  else if (g.behind) { status = `Behind. ${paceText(g)}`; cls = 'bad'; }
  else if (g.per_day) status = `On track. ${paceText(g)}`;
  else status = 'Keep going';
  const left = g.met || g.expired || g.metric === 'days' || g.period === 'day' ? '' : g.days_left <= 1 ? ' · ends today' : ` · ${plural(g.days_left, 'day')} left`;
  const hist = g.history ? `<div class="history" aria-label="Reached in ${g.history.filter(h => h.met).length} of the last ${g.history.length} periods">Last ${g.history.length} ${g.period}s: ${g.history.map(h => `<i class="${h.met ? 'met' : ''}" title="${esc(fmtDate(h.start, { day: 'numeric', month: 'short' }))}: ${num(h.value)}">${h.met ? '✓' : ''}</i>`).join('')}</div>` : '';
  return `<div class="card goal"><div class="goal-top"><h3>${esc(goalTitle(g))}</h3><button class="ghost small-btn" data-del="${g.id}">Remove</button></div>
    ${g.note ? `<p class="note">${esc(g.note)}</p>` : ''}
    <div class="meter ${g.met ? 'done' : ''}" role="meter" aria-valuemin="0" aria-valuemax="${g.target}" aria-valuenow="${g.value || 0}"><i style="width:${Math.round(100 * g.fraction)}%"></i></div>
    <p>${unit === '%' ? `<b>${val}${g.value === null ? '' : '%'}</b> right, goal ${num(g.target)}%` : `<b>${val}</b> of ${num(g.target)} ${unit}`}${g.period === 'until' ? ` since ${fmtDate(g.start, { day: 'numeric', month: 'short' })}` : ''}</p>
    <p class="status ${cls}">${status}${left}</p>${hist}</div>`;
}
async function renderGoals(token) {
  const box = $('pfGoals');
  $('goalForm').hidden = !API.profile;
  if (!API.profile) { box.innerHTML = '<p class="hint">Choose a profile at the top to set goals.</p>'; return; }
  let goals;
  try { goals = await api(`/profiles/${API.profile}/goals`); } catch (e) { box.innerHTML = `<p class="form-msg bad">${esc(e.message)}</p>`; return; }
  if (token !== PF.token) return;
  const short = goals.filter(g => g.period !== 'until'), long = goals.filter(g => g.period === 'until');
  box.innerHTML = (goals.length ? '' : `<p class="hint">No goals yet. Some ideas: ${GOAL_EXAMPLES.map((g, i) => `<button class="linkbtn" data-example="${i}">${esc(goalTitle({ ...g, due: isoDay(new Date(Date.now() + 30 * 864e5)) }))}</button>`).join(', ')}.</p>`) +
    (short.length ? `<h3>Every day, week and month</h3><div class="goals">${short.map(goalCard).join('')}</div>` : '') +
    (long.length ? `<h3>Long-term</h3><div class="goals">${long.map(goalCard).join('')}</div>` : '');
}

/* ================= LEADERBOARD ================= */
async function renderBoard(token) {
  const box = $('pfBoard');
  setPressed($('boardPeriod'), PF.board);
  let rows;
  try { rows = await api(`/leaderboard?period=${PF.board}${$('boardSel').value ? '&exercise=' + $('boardSel').value : ''}`); } catch (e) { box.innerHTML = `<p class="form-msg bad">${esc(e.message)}</p>`; return; }
  if (token !== PF.token) return;
  const when = { week: 'this week', month: 'this month', all: 'overall' }[PF.board];
  const meI = rows.findIndex(r => r.id === API.profile), top = Math.max(1, ...rows.map(r => r.score));
  let standing = '';
  if (meI >= 0 && rows.length > 1) {
    const me = rows[meI];
    standing = meI === 0 ? `You lead ${when}, ${plural(me.score - rows[1].score, 'point')} ahead of ${esc(rows[1].name)}.`
      : `You are number ${meI + 1} of ${rows.length} ${when}, ${plural(rows[meI - 1].score - me.score, 'point')} behind ${esc(rows[meI - 1].name)}.`;
  }
  const S = API.scoring;
  box.innerHTML = (standing ? `<p class="phase">${standing}</p>` : '') +
    `<div class="scroll"><table class="tbl"><thead><tr><th class="num">#</th><th>Profile</th><th>Points</th><th class="num">Answers</th><th class="num">Right</th><th class="num">Practice</th><th class="num">Days</th></tr></thead><tbody>` +
    (rows.length ? rows.map((r, i) => `<tr class="${r.id === API.profile ? 'me' : ''}"><td class="num">${i + 1}</td><td>${esc(r.name)}</td>
      <td><span class="board-bar"><i style="width:${Math.round(90 * r.score / top)}px"></i>${num(r.score)}</span></td><td class="num">${r.attempts}</td>
      <td class="num">${pctTxt(r.accuracy)}</td><td class="num">${minTxt(r.minutes)}</td><td class="num">${r.active_days}</td></tr>`).join('')
      : '<tr><td colspan="7">No profiles yet.</td></tr>') + '</tbody></table></div>' +
    (S ? `<div class="card"><h3>How points work</h3><ul class="suggest">
      <li><span>A right answer gives ${[...new Set(Object.values(S.answer_points))].sort().join(' or ')} points: ${Object.entries(S.answer_points).filter(([, v]) => v > 1).map(([k]) => nameOf(k)).join(', ')} give ${Math.max(...Object.values(S.answer_points))}, because playing or singing takes more than choosing. Wrong answers give nothing, so guessing does not pay.</span></li>
      <li><span>Every ${S.streak_every}th right answer in a row gives ${S.streak_bonus} extra points.</span></li>
      <li><span>Practice without answers (the metronome, its exercises, play-along and One minute changes) gives 1 point a minute, at most ${S.practice_points_per_day} a day.</span></li>
      <li><span>Every day with any practice gives ${S.day_bonus} points, so practising often pays more than practising long.</span></li>
      <li><span>On the same points, the higher share of right answers ranks first. Choose an exercise above to compare only that exercise.</span></li></ul></div>` : '');
}

/* ================= PAGE ================= */
async function renderProfileTab(sub = current.sub) {
  $('noBackend').hidden = API.ok || !API.checked;
  $('newProfile').hidden = !API.ok;
  $('page-profile').querySelector('.subtabs').hidden = !API.ok;
  $$('#page-profile .sub').forEach(el => { el.hidden = !API.ok || el.dataset.sub !== sub; });
  if (!API.ok) return;
  const token = ++PF.token;
  if (sub === 'overview') await renderOverview(token);
  else if (sub === 'summary') await renderSummary(token);
  else if (sub === 'goals') await renderGoals(token);
  else await renderBoard(token);
  drawCharts();
}

PAGES.profile = {
  title: 'Profile',
  subs: ['overview', 'summary', 'goals', 'leaderboard'],
  init() {
    let resizing = null;
    addEventListener('resize', () => { clearTimeout(resizing); resizing = setTimeout(() => { if (current && current.page === 'profile') drawCharts(); }, 150); });
    $('profileSel').addEventListener('change', e => { selectProfile(+e.target.value || null); refreshProfiles(); if (current.page === 'profile') renderProfileTab(); });
    $('newProfile').addEventListener('submit', async e => {
      e.preventDefault();
      const msg = $('newMsg'), name = $('newName').value.trim();
      if (!name) { msg.className = 'form-msg bad'; msg.textContent = 'Enter a name first.'; return; }
      try {
        const p = await api('/profiles', { method: 'POST', body: JSON.stringify({ name }) });
        selectProfile(p.id);
        $('newName').value = '';
        msg.className = 'form-msg good'; msg.textContent = `Profile ${p.name} created and selected.`;
        await refreshProfiles(); renderProfileTab();
      } catch (err) { msg.className = 'form-msg bad'; msg.textContent = err.message; }
    });
    $('pfOverview').addEventListener('click', async e => {
      if (!e.target.closest('#delProfile')) return;
      if (!API.confirmDelete) { API.confirmDelete = true; renderProfileTab(); setTimeout(() => { if (API.confirmDelete) { API.confirmDelete = false; if (current.page === 'profile') renderProfileTab(); } }, 5000); return; }
      try { await api(`/profiles/${API.profile}`, { method: 'DELETE' }); selectProfile(null); await refreshProfiles(); renderProfileTab(); }
      catch (err) { $('newMsg').className = 'form-msg bad'; $('newMsg').textContent = err.message; }
    });
    // Summaries
    onButton($('sumPeriod'), b => { PF.summary.period = b.dataset.v; renderProfileTab(); });
    $('sumPrev').addEventListener('click', () => shiftSummary(-1));
    $('sumNext').addEventListener('click', () => shiftSummary(1));
    $('sumNow').addEventListener('click', () => { PF.summary.day = null; renderProfileTab(); });
    // Goals
    $('gMetric').innerHTML = Object.entries(METRICS).map(([k, m]) => `<option value="${k}">${m.name}</option>`).join('');
    $('gMetric').addEventListener('change', () => updateGoalForm());
    $('goalForm').addEventListener('input', () => { $('goalMsg').textContent = ''; });
    $('gPeriod').addEventListener('change', () => updateGoalForm(false));
    updateGoalForm();
    $('goalForm').addEventListener('submit', async e => {
      e.preventDefault();
      const msg = $('goalMsg'), period = $('gPeriod').value;
      const body = { metric: $('gMetric').value, scope: $('gScope').value || null, target: +$('gTarget').value, period,
        due: period === 'until' ? $('gDue').value : null, note: $('gNote').value.trim() || null };
      try {
        await api(`/profiles/${API.profile}/goals`, { method: 'POST', body: JSON.stringify(body) });
        msg.className = 'form-msg good'; msg.textContent = `Goal added: ${goalTitle(body)}.`;
        $('gNote').value = ''; renderProfileTab();
      } catch (err) { msg.className = 'form-msg bad'; msg.textContent = err.message; }
    });
    $('pfGoals').addEventListener('click', async e => {
      const ex = e.target.closest('[data-example]');
      if (ex) { fillGoalForm(GOAL_EXAMPLES[+ex.dataset.example]); $('gTarget').focus(); return; }
      const del = e.target.closest('[data-del]');
      if (del) { try { await api(`/goals/${del.dataset.del}`, { method: 'DELETE' }); renderProfileTab(); } catch (err) { /* already gone */ } }
    });
    // Leaderboard
    onButton($('boardPeriod'), b => { PF.board = b.dataset.v; renderProfileTab(); });
    $('boardSel').addEventListener('change', () => renderProfileTab());
    // Chart tooltips, on hover and on keyboard focus
    const page = $('page-profile');
    page.addEventListener('pointermove', e => { const el = e.target.closest('.chart [data-tip]'); if (el) showTip(el, e.clientX, e.clientY); });
    page.addEventListener('pointerout', e => { const el = e.target.closest('.chart [data-tip]'); if (el) hideTip(el); });
    page.addEventListener('focusin', e => { const el = e.target.closest('.chart [data-tip]'); if (el) { const r = el.getBoundingClientRect(); showTip(el, r.left + r.width / 2, r.top + 20); } });
    page.addEventListener('focusout', e => { const el = e.target.closest('.chart [data-tip]'); if (el) hideTip(el); });
  },
  render: renderProfileTab
};
