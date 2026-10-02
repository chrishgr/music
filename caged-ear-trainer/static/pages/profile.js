/* Profiles: only when the FastAPI backend is running. Without it the app works the same, but nothing is saved to a profile. */
const API = { ok: false, checked: false, profile: null, profiles: [], confirmDelete: false };
const PROFILE_KEY = 'gehor-profile';
const EXERCISES = {
  interval: 'Intervals', chord: 'Chord qualities', triad_play: 'Play the triad', triad_recognize: 'Recognise the triad',
  tuner_hit: 'Hit the note', tuner_guess: 'Guess the note', caged_play: 'Play the CAGED shape', caged_recognize: 'Name the CAGED shape'
};
const pctTxt = a => a === null || a === undefined ? 'no attempts' : `${Math.round(a * 100)}%`;

async function api(path, opts = {}) {
  const r = await fetch('/api' + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!r.ok) {
    let detail = null;
    try { detail = (await r.json()).detail; } catch (e) { /* not JSON */ }
    throw new Error(typeof detail === 'string' ? detail : r.status === 422 ? 'The name must be between 1 and 40 characters.' : `The server answered with error ${r.status}.`);
  }
  return r.status === 204 ? null : r.json();
}

// Fire and forget: practice is never blocked by the network, and without a backend nothing is sent
function logAttempt(exercise, item, answer, correct, cents = null) {
  if (!API.ok || !API.profile) return;
  api('/attempts', { method: 'POST', body: JSON.stringify({ profile_id: API.profile, exercise, item, answer, correct, cents }) })
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
  $('f-profile').hidden = false;
  $('nav-profile').hidden = false;
  $('boardSel').innerHTML = '<option value="">All exercises</option>' +
    Object.entries(EXERCISES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
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
  $('profileScore').innerHTML = me ? `Points <b>${me.correct}</b>, ${pctTxt(me.accuracy)}` : 'Answers are not saved';
  if (current && current.page === 'profile') renderProfileTab();
}

function selectProfile(id) {
  API.profile = id; API.confirmDelete = false;
  try { if (id) localStorage.setItem(PROFILE_KEY, String(id)); else localStorage.removeItem(PROFILE_KEY); } catch (e) { /* optional */ }
}

async function renderProfileTab() {
  $('noBackend').hidden = API.ok || !API.checked;
  $('newProfile').hidden = !API.ok;
  if (!API.ok) { $('profileStats').innerHTML = ''; $('board').innerHTML = ''; return; }
  const box = $('profileStats');
  if (!API.profile) {
    box.innerHTML = '<p class="hint">Choose a profile at the top, or create a new one. Your answers are saved to it from then on.</p>';
  } else {
    try {
      const st = await api(`/profiles/${API.profile}/stats`);
      const maxDay = Math.max(1, ...st.days.map(d => d.attempts));
      const dayBars = st.days.length ? `<div class="days" aria-label="Attempts per day">${st.days.map(d =>
        `<div style="height:${(100 * d.attempts / maxDay).toFixed(0)}%" title="${d.day}, ${d.correct} of ${d.attempts} correct"><i style="height:${(100 * d.correct / Math.max(1, d.attempts)).toFixed(0)}%"></i></div>`).join('')}</div>` : '';
      box.innerHTML = `
        <div class="stats-head"><h2>${esc(st.profile.name)}</h2>
          <button class="ghost danger" id="delProfile">${API.confirmDelete ? 'Click again to delete the profile and all its answers' : 'Delete profile'}</button></div>
        <div class="tiles" style="margin-top:12px">
          <div class="tile"><b>${st.totals.correct}</b><span>points</span></div>
          <div class="tile"><b>${st.totals.attempts}</b><span>attempts</span></div>
          <div class="tile"><b>${pctTxt(st.totals.accuracy)}</b><span>correct</span></div>
          <div class="tile"><b>${st.current_streak}</b><span>current streak, best ${st.best_streak}</span></div>
        </div>
        <h3 style="margin-top:18px">By exercise</h3>
        <div class="scroll"><table class="tbl"><thead><tr><th>Exercise</th><th class="num">Attempts</th><th class="num">Correct</th><th class="num">Accuracy</th></tr></thead><tbody>
          ${st.exercises.length ? st.exercises.map(e => `<tr><td>${EXERCISES[e.exercise] || esc(e.exercise)}</td><td class="num">${e.attempts}</td><td class="num">${e.correct}</td><td class="num">${pctTxt(e.accuracy)}</td></tr>`).join('')
            : '<tr><td colspan="4">No answers saved yet. Do a few tasks on the other pages.</td></tr>'}
        </tbody></table></div>
        ${st.weakest.length ? `<h3 style="margin-top:18px">Most to gain</h3>
        <p class="hint">Items with at least three attempts, weakest first.</p>
        <div class="scroll"><table class="tbl"><tbody>${st.weakest.map(w =>
          `<tr><td>${esc(w.item)}</td><td>${EXERCISES[w.exercise] || ''}</td><td class="num">${w.correct} of ${w.attempts}</td><td class="num">${pctTxt(w.accuracy)}</td></tr>`).join('')}</tbody></table></div>` : ''}
        ${dayBars ? `<h3 style="margin-top:18px">Last 14 days</h3><p class="hint">Bar height is the number of attempts, the coloured part is the share correct.</p>${dayBars}` : ''}`;
    } catch (e) {
      box.innerHTML = `<p class="form-msg bad">${esc(e.message)}</p>`;
    }
  }
  try {
    const ex = $('boardSel').value;
    const rows = await api('/leaderboard' + (ex ? `?exercise=${ex}` : ''));
    $('board').innerHTML = `<thead><tr><th class="num">#</th><th>Profile</th><th class="num">Points</th><th class="num">Attempts</th><th class="num">Accuracy</th></tr></thead><tbody>` +
      (rows.length ? rows.map((r, i) => `<tr class="${r.id === API.profile ? 'me' : ''}"><td class="num">${i + 1}</td><td>${esc(r.name)}</td><td class="num">${r.correct}</td><td class="num">${r.attempts}</td><td class="num">${pctTxt(r.accuracy)}</td></tr>`).join('')
        : '<tr><td colspan="5">No profiles yet.</td></tr>') + '</tbody>';
  } catch (e) { $('board').innerHTML = ''; }
}

PAGES.profile = {
  title: 'Profile',
  init() {
    $('profileSel').addEventListener('change', e => { selectProfile(+e.target.value || null); refreshProfiles(); });
    $('boardSel').addEventListener('change', renderProfileTab);
    $('newProfile').addEventListener('submit', async e => {
      e.preventDefault();
      const msg = $('newMsg'), name = $('newName').value.trim();
      if (!name) { msg.className = 'form-msg bad'; msg.textContent = 'Enter a name first.'; return; }
      try {
        const p = await api('/profiles', { method: 'POST', body: JSON.stringify({ name }) });
        selectProfile(p.id);
        $('newName').value = '';
        msg.className = 'form-msg good'; msg.textContent = `Profile ${p.name} created and selected.`;
        await refreshProfiles();
      } catch (err) { msg.className = 'form-msg bad'; msg.textContent = err.message; }
    });
    $('profileStats').addEventListener('click', async e => {
      if (!e.target.closest('#delProfile')) return;
      if (!API.confirmDelete) { API.confirmDelete = true; renderProfileTab(); setTimeout(() => { if (API.confirmDelete) { API.confirmDelete = false; renderProfileTab(); } }, 5000); return; }
      try { await api(`/profiles/${API.profile}`, { method: 'DELETE' }); selectProfile(null); await refreshProfiles(); }
      catch (err) { $('newMsg').className = 'form-msg bad'; $('newMsg').textContent = err.message; }
    });
  },
  render: renderProfileTab
};
