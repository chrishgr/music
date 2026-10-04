/* Home: the main instrument and one card per page. In piano mode the guitar pages (CAGED, Triads) have no card,
   and the cards that differ say what the page does on the piano (piano). */
const HOME_CARDS = [
  { page: 'scales', title: 'Scales', text: 'Ten scales and modes on the whole neck or one position at a time, with the chords that belong to each scale.',
    piano: 'Ten scales and modes, played up and down the keyboard over one or two octaves, with the chords that belong to each scale.' },
  { page: 'chords', title: 'Chords', text: 'Fourteen chord types with grips you can play. Click a chord diagram to hear the grip and see it on the neck and the piano.',
    piano: 'Fourteen chord types with piano voicings: root position, every inversion and both hands. Click a voicing to hear it.' },
  { page: 'caged', title: 'CAGED', text: 'The five CAGED shapes for major, minor, 7, m7 and maj7 chords, what changes from the major shapes, and practice.' },
  { page: 'triads', title: 'Triads', text: 'Three-note chords and their inversions from any open chord, with a capo. Explore them or practise them.' },
  { page: 'progressions', title: 'Progressions', text: 'Well-known chord progressions in any key, and the Acoustic Indie Folk-Pop style with its typical spices. A capo helper shows which shapes to play, and Play along strums them in time.',
    piano: 'Well-known chord progressions in any key, and the Acoustic Indie Folk-Pop style. Each chord moves to the nearest inversion, and Play along plays them in time.' },
  { page: 'metronome', title: 'Metronome', text: 'A plain metronome with tap tempo, and eight well-known exercises for timing, speed and chord changes.' },
  { page: 'ear', title: 'Ear training', text: 'Name intervals and chord qualities by ear. The ones you miss most come up more often.' },
  { page: 'tuner', title: 'Tuner', text: 'Tune the guitar with the microphone, hit a note with your voice or instrument, or guess a note by ear.' },
  { page: 'profile', title: 'Profile', text: 'Your progress week by week, what to practise next, daily, weekly and monthly summaries, goals and a points leaderboard.' }
];
const MAIN_HINT = {
  guitar: 'The guitar neck is drawn large on every page, with the piano further down.',
  piano: 'The piano is drawn large on every page, with the guitar neck further down. Chords get piano voicings, progressions move to the nearest inversion and scales run up and down the keys. CAGED and Triads are about the guitar, so they are left out.'
};
PAGES.home = {
  title: 'Home',
  init() {
    // The sound of the Play buttons stays as it is (piano unless changed at the top)
    onButton($('mainInst'), b => {
      state.mainInst = b.dataset.v;
      save(); applyMode(); PAGES.home.render();
    });
  },
  render() {
    setPressed($('mainInst'), state.mainInst);
    $('mainInstHint').textContent = MAIN_HINT[state.mainInst];
    const piano = pianoMode();
    $('homeCards').innerHTML = HOME_CARDS.filter(c => (c.page !== 'profile' || API.ok) && !(piano && GUITAR_PAGES.includes(c.page))).map(c =>
      `<a class="card" href="#/${c.page}"><h3>${c.title}<span aria-hidden="true">→</span></h3><p>${piano && c.piano ? c.piano : c.text}</p></a>`).join('');
  }
};
