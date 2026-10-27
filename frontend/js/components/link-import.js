// "Add from a link": notes from a YouTube video or a web article. A small form that opens under the notes buttons.
import { el, render } from '../lib/dom.js';
import { icon } from '../lib/icons.js';

export function mountLinkImport({ root, onImport }) {
  let open = false;
  let busy = false;

  function draw() {
    const toggle = el('button', { class: 'btn btn-quiet link-toggle', type: 'button', 'aria-expanded': String(open), 'aria-controls': 'link-form',
      onclick: () => { open = !open; draw(); if (open) root.querySelector('#link-url')?.focus(); } }, icon('link', { size: 18 }), 'Add from a link');
    if (!open) { render(root, toggle); return; }
    const input = el('input', { id: 'link-url', class: 'field', type: 'url', inputmode: 'url', autocomplete: 'off', required: '',
      placeholder: 'YouTube video or article link', disabled: busy ? '' : null });
    const form = el('form', { id: 'link-form', class: 'link-form' },
      el('label', { class: 'visually-hidden', for: 'link-url', text: 'Link to a YouTube video or a web article' }), input,
      el('button', { class: 'btn btn-primary', type: 'submit', disabled: busy ? '' : null }, busy ? 'Reading…' : 'Add'),
      el('p', { class: 'hint', text: busy ? 'Eklavya is reading it. A video can take up to a minute.' : 'A public YouTube video, or an article or blog post.' }));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const url = input.value.trim();
      if (!url) return;
      busy = true; draw();
      const added = await onImport(url);
      busy = false;
      if (added) open = false;
      draw();
      if (!added) root.querySelector('#link-url').value = url;   // keep it so a typo can be fixed
    });
    render(root, toggle, form);
  }
  draw();
}
