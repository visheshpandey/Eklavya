// Speech to text for typed boxes: the browser's own speech recognition (nothing is sent to our server).
// Where it is missing (Firefox, some in-app browsers) available() is false and the mic button is simply not shown.

/** Hindi is recognised as Hindi; English and Hinglish as Indian English (Hinglish stays in Roman letters). */
export const recognitionLang = (language) => (language === 'hindi' ? 'hi-IN' : 'en-IN');

export function createDictation({ getLanguage, onText, onState, host = globalThis }) {
  const Recognition = host.SpeechRecognition || host.webkitSpeechRecognition;
  let active = null;

  function stop() { try { active?.stop(); } catch { /* already stopped */ } }

  function start(baseText = '') {
    if (!Recognition || active) return;
    const recognition = new Recognition();
    recognition.lang = recognitionLang(getLanguage());
    recognition.interimResults = true;
    recognition.continuous = false;
    const prefix = baseText && !/\s$/.test(baseText) ? `${baseText} ` : baseText;
    recognition.onresult = (event) => {
      let said = '';
      for (const result of event.results) said += result[0].transcript;
      onText(`${prefix}${said}`.trimStart(), event.results[event.results.length - 1]?.isFinal ?? false);
    };
    recognition.onerror = (event) => { onState('error', event.error); };
    recognition.onend = () => { active = null; onState('idle'); };
    active = recognition;
    onState('listening');
    try { recognition.start(); } catch { active = null; onState('idle'); }
  }

  return { available: () => Boolean(Recognition), start, stop, listening: () => Boolean(active) };
}
