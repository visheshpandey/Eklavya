// Which tutor personality and voice to talk to ('mentor' = calm, 'senior' = friendly and upbeat), remembered in localStorage.
export const TUTOR_KEY = 'eklavya.tutor';
export const TUTORS = Object.freeze(['mentor', 'senior']);

export function loadTutor() {
  try {
    const saved = localStorage.getItem(TUTOR_KEY);
    return TUTORS.includes(saved) ? saved : 'mentor';
  } catch { return 'mentor'; }          // storage blocked (private window): use the default
}

export function saveTutor(tutor) {
  try { localStorage.setItem(TUTOR_KEY, tutor); } catch { /* not remembered, still applied */ }
}
