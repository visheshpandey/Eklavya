// Words for the Behind the scenes numbers (pure, so it can be tested). It only describes what the server reported: no data means it says so.

const seconds = (ms) => `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;

/** @returns {{label: string, value: string, note: string}[]} */
export function describeUsage(report) {
  const ask = report?.ask ?? {};
  const gemini = report?.gemini ?? {};
  const calls = gemini.gemini_calls ?? 0;
  return [
    { label: 'Your questions answered', value: String(ask.answered ?? 0),
      note: ask.answered ? `average ${seconds(ask.average_ms)} over the last ${ask.recent_ms.length}${ask.fallbacks ? `, ${ask.fallbacks} answered from your notes while Gemini was busy` : ''}` : 'Ask something and it is timed here.' },
    { label: 'Gemini calls', value: String(calls),
      note: calls ? `${gemini.gemini_failed ?? 0} failed, since the server last started (repeated questions are not counted)` : 'None since the server last started.' },
    { label: 'Answers from your notes alone', value: String(gemini.ask_fallbacks ?? 0),
      note: 'Used when Gemini is busy or out of quota, so you still get a cited answer.' },
  ];
}
