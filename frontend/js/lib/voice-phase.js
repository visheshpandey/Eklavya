// What the Study room says about the call, in plain words, and the first line shown before the voice connects. Pure.
import { SESSION_MODE, VOICE_STATUS } from './protocol.js';

/**
 * The status line's string key. The socket being open is not the same as Eklavya being ready: until the server says the
 * Gemini link is up (`live.ready`), a "listening" call is still connecting, so the student is never told to talk too early.
 * @param {{status: string, live?: {ready?: boolean, text?: boolean}}} input
 */
export function statusKey({ status, live = {} }) {
  if (status === VOICE_STATUS.IDLE) return 'stage.idle';
  if (live.text) return 'stage.text';
  if (status === VOICE_STATUS.CONNECTING || !live.ready) return 'stage.connecting';
  if (status === VOICE_STATUS.SPEAKING) return 'stage.speaking';
  return 'stage.yourTurn';
}

/** True while the call is up but the student should still wait (shows the small spinner). */
export const isConnecting = ({ status, live = {} }) => status !== VOICE_STATUS.IDLE && !live.text && (status === VOICE_STATUS.CONNECTING || !live.ready);

const LINES = {
  [SESSION_MODE.TEST]: {
    hinglish: (t) => `Chaliye, shuru karte hain aapka test on ${t}.`,
    english: (t) => `Let's begin your test on ${t}.`,
    hindi: (t) => `चलिए, ${t} पर आपका टेस्ट शुरू करते हैं।`,
  },
  [SESSION_MODE.LEARN]: {
    hinglish: (t) => `Chaliye, ${t} ko step by step samajhte hain.`,
    english: (t) => `Let's learn ${t} step by step.`,
    hindi: (t) => `चलिए, ${t} को कदम-दर-कदम समझते हैं।`,
  },
  [SESSION_MODE.REVISE]: {
    hinglish: (t) => `Chaliye, ${t} ka quick revision karte hain.`,
    english: (t) => `Let's do a quick revision of ${t}.`,
    hindi: (t) => `चलिए, ${t} का जल्दी से रिवीज़न करते हैं।`,
  },
  [SESSION_MODE.VIVA]: {
    hinglish: (t) => `Namaste, main aapka examiner hoon. Chaliye ${t} par viva shuru karte hain.`,
    english: (t) => `Good day, I am your examiner. Let's begin the viva on ${t}.`,
    hindi: (t) => `नमस्ते, मैं आपका परीक्षक हूँ। चलिए ${t} पर वाइवा शुरू करते हैं।`,
  },
  [SESSION_MODE.DEBATE]: {
    hinglish: (t) => `Chaliye, ${t} par debate karte hain. Apni baat taiyaar rakhiye.`,
    english: (t) => `Let's debate ${t}. Have your argument ready.`,
    hindi: (t) => `चलिए, ${t} पर बहस करते हैं। अपनी बात तैयार रखिए।`,
  },
  [SESSION_MODE.FREE]: {
    hinglish: () => 'Namaste! Aaj aap kya samajhna chahte hain?',
    english: () => 'Hi! What would you like to work on today?',
    hindi: () => 'नमस्ते! आज आप क्या समझना चाहते हैं?',
  },
};

/** The first thing Eklavya "says", shown at once in the chat while the voice connects (the real greeting replaces it when it arrives). */
export function firstLine({ mode = SESSION_MODE.FREE, language = 'hinglish', topic = '' } = {}) {
  const set = LINES[mode] ?? LINES[SESSION_MODE.FREE];
  const make = set[language] ?? set.hinglish;
  return make(topic || 'this topic');
}
