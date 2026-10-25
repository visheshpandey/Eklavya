// Tiny DOM helpers. Model output is only ever set via textContent, so nothing from Gemini is parsed as HTML.

/** Create an element: el('div', {class: 'x', text: 'hi', onclick: fn}, child, ...). */
export function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value !== false && value != null) node.setAttribute(key, value);
  }
  kids.flat().forEach((kid) => kid != null && node.append(kid.nodeType ? kid : document.createTextNode(kid)));
  return node;
}

/** getElementById that fails loudly if the page and the code disagree. */
export function byId(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`index.html is missing the element #${id}`);
  return node;
}

/**
 * Replace everything inside `root` with `kids`, skipping null/false/undefined pieces.
 * Use this instead of root.replaceChildren(...) whenever a piece is conditional:
 * replaceChildren(null) inserts the literal text "null".
 */
export function render(root, ...kids) {
  root.replaceChildren(...kids.flat().filter((kid) => kid != null && kid !== false));
}
