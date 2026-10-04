/* Home: one card per page */
const HOME_CARDS = [
  { page: 'scales', title: 'Scales', text: 'Ten scales and modes on the whole neck or one position at a time, with the chords that belong to each scale.' },
  { page: 'chords', title: 'Chords', text: 'Thirteen chord types with grips you can play. Click a chord diagram to hear the grip and see it on the neck and the piano.' },
  { page: 'caged', title: 'CAGED', text: 'The five CAGED shapes for major, minor, 7, m7 and maj7 chords, what changes from the major shapes, and practice.' },
  { page: 'triads', title: 'Triads', text: 'Three-note chords and their inversions from any open chord, with a capo. Explore them or practise them.' },
  { page: 'progressions', title: 'Progressions', text: 'Twelve well-known chord progressions in any key. A capo helper shows which shapes to play, and Play along strums them in time.' },
  { page: 'metronome', title: 'Metronome', text: 'A plain metronome with tap tempo, and eight well-known exercises for timing, speed and chord changes.' },
  { page: 'ear', title: 'Ear training', text: 'Name intervals and chord qualities by ear. The ones you miss most come up more often.' },
  { page: 'tuner', title: 'Tuner', text: 'Tune the guitar with the microphone, hit a note with your voice or instrument, or guess a note by ear.' },
  { page: 'profile', title: 'Profile', text: 'Points, accuracy per exercise, your weakest items, the last 14 days and a leaderboard.' }
];
PAGES.home = {
  title: 'Home',
  render() {
    $('homeCards').innerHTML = HOME_CARDS.filter(c => c.page !== 'profile' || API.ok).map(c =>
      `<a class="card" href="#/${c.page}"><h3>${c.title}<span aria-hidden="true">→</span></h3><p>${c.text}</p></a>`).join('');
  }
};
