// The character count under the Ask box (pure): hidden until the question is close to the limit, then "1,650 / 2,000", and flagged
// once it is over (the question is then not sent and the student is told exactly why).
export const ASK_MAX = 2000;            // must match TutorAskRequest.question max_length on the backend
export const WARN_SHARE = 0.8;          // the count appears from 80% of the limit

export function charCount(length, max = ASK_MAX) {
  return { show: length >= Math.floor(max * WARN_SHARE), over: length > max, text: `${length.toLocaleString('en-IN')} / ${max.toLocaleString('en-IN')}` };
}
