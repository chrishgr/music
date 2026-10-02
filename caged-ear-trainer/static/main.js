/* Start-up and the controls that every page shares: sound, note names, root, labels, Stop,
   clicks on a neck or a piano, and the keyboard. */
function initGlobals() {
  setPressed($('inst'), state.inst);
  setPressed($('nota'), state.notation);
  onButton($('inst'), b => { state.inst = b.dataset.v; setPressed($('inst'), state.inst); save(); });
  onButton($('nota'), b => {
    state.notation = naming.system = b.dataset.v;
    setPressed($('nota'), state.notation); save(); rerender();
  });
  document.addEventListener('click', e => {
    // Root, shared by Scales, Chords and CAGED. A page can ask to play something once it has redrawn.
    const root = e.target.closest('[data-roots] button');
    if (root) {
      state.root = root.dataset.v; save(); stopAll();
      const P = PAGES[current.page], after = P.onRoot ? P.onRoot(current.sub) : null;
      rerender();
      if (typeof after === 'function') after();
      return;
    }
    const lab = e.target.closest('[data-labels] button');
    if (lab) { state.labels = lab.dataset.v; save(); rerender(); return; }
    if (e.target.closest('[data-stop]')) { stopAll(); return; }
    // A note on a neck plays as guitar, lights up on the piano, and counts as a mark in the practice tasks
    const cell = e.target.closest('svg.neck [data-k]');
    if (cell) {
      play(+cell.dataset.m, 0, 'guitar', cell.dataset.k);
      const P = PAGES[current.page];
      if (P.onNeck) P.onNeck(cell.dataset.k, +cell.dataset.m, current.sub);
      return;
    }
    // A piano key plays as piano and lights up every place on the neck with the same pitch
    const key = e.target.closest('svg.keys [data-m]');
    if (key) play(+key.dataset.m, 0, 'piano', '*');
  });
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || !current) return;
    const tag = document.activeElement.tagName;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
    const P = PAGES[current.page];
    if (P.keys) P.keys(e, current.sub, tag === 'BUTTON');   // Enter on a focused button presses the button
  });
  window.addEventListener('hashchange', route);
}

Object.values(PAGES).forEach(p => { if (p.init) p.init(); });
initGlobals();
route();
initBackend();
