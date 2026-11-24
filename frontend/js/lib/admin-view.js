// Pure helpers for the owner's student list (admin.html), so they are tested without a browser.
import { ago } from './live-view.js';

const toMs = (stamp) => Date.parse(`${String(stamp).replace(' ', 'T')}Z`);

/** Students whose name or email contains the search text (case does not matter); empty text keeps everyone. */
export function filterStudents(students = [], text = '') {
  const needle = text.trim().toLowerCase();
  if (!needle) return students;
  return students.filter((s) => `${s.name} ${s.email}`.toLowerCase().includes(needle));
}

export const totalActions = (activity = {}) => Object.values(activity).reduce((sum, n) => sum + (Number(n) || 0), 0);

/** "5 min ago" for a UTC stamp, or a dash when there is none. */
export const seen = (stamp, nowMs) => (stamp ? ago(toMs(stamp), nowMs) : '–');

/** "20 Nov 2026" for a UTC stamp, or "before tracking" for accounts made before sign-up dates were kept. */
export function joined(stamp) {
  if (!stamp) return 'before tracking';
  return new Date(toMs(stamp)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Most recently active first; students who have never done anything go last, newest account first among them. */
export const byRecent = (students = []) => [...students].sort((a, b) => (b.last_active || '').localeCompare(a.last_active || '') || b.id - a.id);

/** The one-line summary of what a student has done, e.g. "12 questions · 5 quiz answers"; only non-zero parts. */
export function doneText(activity = {}) {
  const parts = [['questions', 'questions'], ['quiz_answers', 'quiz answers'], ['voice_sessions', 'voice sessions'], ['notes', 'notes'], ['flashcards', 'flashcards'], ['mock_exams', 'mock exams']]
    .filter(([key]) => Number(activity[key]) > 0).map(([key, label]) => `${activity[key]} ${label}`);
  return parts.length ? parts.join(' · ') : 'nothing yet';
}
