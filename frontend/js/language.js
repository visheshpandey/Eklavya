// Language the tutor starts in (it follows the student if they switch mid-sentence).
import { $ } from './dom.js';

export const getLanguage = () => $('lang').value;
