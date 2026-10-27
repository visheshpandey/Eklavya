// Login screen: sign in, create an account, or try the demo as a guest. A modal <dialog>.
// It cannot be dismissed while the visitor has made no choice yet; a guest can close it and come back from the top bar.
import { el, render } from '../lib/dom.js';

export function mountAuthDialog({ dialog, onSignIn, onSignUp, onGuest, mustChoose }) {
  let mode = 'login';
  let busy = false;
  let message = '';

  function draw() {
    const signingUp = mode === 'signup';
    const field = (id, label, props) => el('label', { class: 'auth-field', for: id },
      el('span', { text: label }), el('input', { id, class: 'field', required: '', ...props }));
    const form = el('form', { class: 'auth-form', novalidate: '' },
      signingUp ? field('auth-name', 'Your name', { type: 'text', autocomplete: 'name', maxlength: '80' }) : null,
      field('auth-email', 'Email', { type: 'email', autocomplete: 'email', inputmode: 'email' }),
      field('auth-password', 'Password', { type: 'password', autocomplete: signingUp ? 'new-password' : 'current-password', minlength: '8' }),
      signingUp ? el('p', { class: 'hint', text: 'At least 8 characters.' }) : null,
      el('p', { class: 'auth-error', role: 'alert', text: message, hidden: message ? null : '' }),
      el('button', { class: 'btn btn-primary btn-lg', type: 'submit', disabled: busy ? '' : null },
        busy ? 'One moment…' : (signingUp ? 'Create my account' : 'Sign in')));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const value = (id) => form.querySelector(`#${id}`)?.value ?? '';
      const email = value('auth-email').trim();
      const password = value('auth-password');
      if (!email || !password) { message = 'Enter your email and password.'; draw(); return; }
      busy = true; message = ''; draw();
      try {
        await (signingUp ? onSignUp({ name: value('auth-name').trim(), email, password }) : onSignIn({ email, password }));
      } catch (error) {
        busy = false; message = error.message; draw();
        dialog.querySelector('#auth-email')?.focus();
      }
    });

    render(dialog,
      el('div', { class: 'auth-card' },
        el('div', { class: 'auth-brand' }, el('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'E'),
          el('div', {}, el('h2', { id: 'auth-title', text: signingUp ? 'Create your account' : 'Welcome back' }),
            el('p', { class: 'hint', text: 'Your notes and progress stay with your account.' }))),
        form,
        el('button', { class: 'link-btn auth-switch', type: 'button', onclick: () => { mode = signingUp ? 'login' : 'signup'; message = ''; draw(); } },
          signingUp ? 'I already have an account' : 'New here? Create an account'),
        el('div', { class: 'auth-or', 'aria-hidden': 'true' }, el('span', { text: 'or' })),
        el('button', { class: 'btn btn-secondary', type: 'button', onclick: onGuest }, 'Try the demo without an account')));
    dialog.querySelector(signingUp ? '#auth-name' : '#auth-email')?.focus();
  }

  dialog.setAttribute('aria-labelledby', 'auth-title');
  dialog.addEventListener('cancel', (event) => { if (mustChoose()) event.preventDefault(); });   // Escape does nothing until a choice is made

  return {
    open(startMode = 'login') {
      mode = startMode; busy = false; message = '';
      draw();
      if (!dialog.open) dialog.showModal();
    },
    close() { if (dialog.open) dialog.close(); },
  };
}
