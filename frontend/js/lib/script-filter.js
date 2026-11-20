// The tutor writes Latin letters (Hinglish, English) or Devanagari (Hindi). If a word in another script slips in (a Bengali or Tamil word in a
// Hinglish line), the letters are dropped before the chat or the captions show it. Digits, punctuation and symbols stay; Greek stays for maths.
const KEEP = /[\p{Script=Latin}\p{Script=Devanagari}\p{Script=Greek}\p{Script=Inherited}]/u;

// tool-call markup the model sometimes writes into its spoken text ("<function_calls> <tool ..."): never shown
const TOOL_BLOCK = /<\s*(function_calls|tool_calls?|tool_code|invoke)\b[\s\S]*?(?:<\s*\/\s*\1\s*>|$)/gi;
const TOOL_TAG = /<\s*\/?\s*(?:function_calls|tool_calls?|tool_code|tool|invoke|parameter)\b[^>]*>?/gi;

export function stripForeignScripts(text) {
  const s = String(text ?? '');
  const out = s.replace(TOOL_BLOCK, '').replace(TOOL_TAG, '').replace(/[\p{L}\p{M}]/gu, (ch) => (KEEP.test(ch) ? ch : ''));
  return out === s ? s : out.replace(/[ \t]{2,}/g, ' ').replace(/ +([,.!?])/g, '$1');
}
