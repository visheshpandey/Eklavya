// Login screen: sign in, create an account, Google, forgotten password (an emailed link), or try the demo as a guest.
// A modal <dialog>. It cannot be dismissed while the visitor has made no choice yet; a guest can close it and come back
// from the top bar. Google and the reset email only appear when the server has them set up (features()).
import { el, render } from '../lib/dom.js';

const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';
let googleScript = null;

function loadGoogle() {
  googleScript ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GOOGLE_SCRIPT;
    script.async = true;
    script.onload = () => resolve(globalThis.google);
    script.onerror = () => { googleScript = null; reject(new Error('Google sign-in could not load.')); };
    document.head.append(script);
  });
  return googleScript;
}

export function mountAuthDialog({ dialog, onSignIn, onSignUp, onGuest, onGoogle, onForgot, onReset, features, mustChoose }) {
  let mode = 'login';   // login | signup | forgot | reset
  let resetToken = null;
  let busy = false;
  let message = '';
  let info = '';

  const field = (id, label, props) => el('label', { class: 'auth-field', for: id },
    el('span', { text: label }), el('input', { id, class: 'field', required: '', ...props }));

  function switchTo(next) { mode = next; message = ''; info = ''; busy = false; draw(); }

  async function submit(task) {
    busy = true; message = ''; info = ''; draw();
    try {
      info = (await task()) ?? '';
    } catch (error) {
      message = error.message;
    }
    busy = false; draw();
  }

  function formFor() {
    const value = (form, id) => form.querySelector(`#${id}`)?.value ?? '';
    const titles = { login: 'Welcome back', signup: 'Create your account', forgot: 'Reset your password', reset: 'Choose a new password' };
    const button = { login: 'Sign in', signup: 'Create my account', forgot: 'Email me a reset link', reset: 'Save and sign in' }[mode];
    const fields = {
      login: [field('auth-email', 'Email', { type: 'email', autocomplete: 'email', inputmode: 'email' }),
        field('auth-password', 'Password', { type: 'password', autocomplete: 'current-password' })],
      signup: [field('auth-name', 'Your name', { type: 'text', autocomplete: 'name', maxlength: '80' }),
        field('auth-email', 'Email', { type: 'email', autocomplete: 'email', inputmode: 'email' }),
        field('auth-password', 'Password', { type: 'password', autocomplete: 'new-password', minlength: '8' }),
        el('p', { class: 'hint', text: 'At least 8 characters.' })],
      forgot: [el('p', { class: 'hint', text: 'Enter your account email. We send a link that lets you choose a new password.' }),
        field('auth-email', 'Email', { type: 'email', autocomplete: 'email', inputmode: 'email' })],
      reset: [field('auth-password', 'New password', { type: 'password', autocomplete: 'new-password', minlength: '8' }),
        el('p', { class: 'hint', text: 'At least 8 characters.' })],
    }[mode];

    const form = el('form', { class: 'auth-form', novalidate: '' }, ...fields,
      el('p', { class: 'auth-error', role: 'alert', text: message, hidden: message ? null : '' }),
      el('p', { class: 'auth-info', role: 'status', text: info, hidden: info ? null : '' }),
      el('button', { class: 'btn btn-primary btn-lg', type: 'submit', disabled: busy ? '' : null }, busy ? 'One moment…' : button));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const email = value(form, 'auth-email').trim();
      const password = value(form, 'auth-password');
      if (mode === 'login' || mode === 'signup') {
        if (!email || !password) { message = 'Enter your email and password.'; draw(); return; }
        submit(() => (mode === 'signup' ? onSignUp({ name: value(form, 'auth-name').trim(), email, password }) : onSignIn({ email, password })));
      } else if (mode === 'forgot') {
        if (!email) { message = 'Enter your email.'; draw(); return; }
        submit(async () => (await onForgot(email)).message);
      } else {
        submit(() => onReset(resetToken, password));
      }
    });
    return { title: titles[mode], form };
  }

  function draw() {
    const { title, form } = formFor();
    const { google_client_id: googleId, email: emailOn } = features() ?? {};
    const showGoogle = Boolean(googleId) && (mode === 'login' || mode === 'signup');
    const googleSlot = showGoogle ? el('div', { class: 'google-slot' }) : null;
    const links = {
      login: [emailOn ? el('button', { class: 'link-btn', type: 'button', onclick: () => switchTo('forgot') }, 'Forgot password?') : null,
        el('button', { class: 'link-btn', type: 'button', onclick: () => switchTo('signup') }, 'New here? Create an account')],
      signup: [el('button', { class: 'link-btn', type: 'button', onclick: () => switchTo('login') }, 'I already have an account')],
      forgot: [el('button', { class: 'link-btn', type: 'button', onclick: () => switchTo('login') }, 'Back to sign in')],
      reset: [el('button', { class: 'link-btn', type: 'button', onclick: () => switchTo('login') }, 'Back to sign in')],
    }[mode];

    render(dialog,
      el('div', { class: 'auth-card' },
        el('div', { class: 'auth-brand' }, el('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'E'),
          el('div', {}, el('h2', { id: 'auth-title', text: title }),
            el('p', { class: 'hint', text: 'Your notes and progress stay with your account.' }))),
        googleSlot,
        showGoogle ? el('div', { class: 'auth-or', 'aria-hidden': 'true' }, el('span', { text: 'or with email' })) : null,
        form,
        el('div', { class: 'auth-links' }, ...links),
        mode === 'login' || mode === 'signup' ? el('div', { class: 'auth-or', 'aria-hidden': 'true' }, el('span', { text: 'or' })) : null,
        mode === 'login' || mode === 'signup' ? el('button', { class: 'btn btn-secondary', type: 'button', onclick: onGuest }, 'Try the demo without an account') : null));

    if (googleSlot) {
      loadGoogle().then((google) => {
        if (!googleSlot.isConnected) return;
        google.accounts.id.initialize({ client_id: googleId, callback: ({ credential }) => submit(() => onGoogle(credential)) });
        google.accounts.id.renderButton(googleSlot, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 320 });
      }).catch(() => { googleSlot.replaceChildren(el('p', { class: 'hint', text: 'Google sign-in could not load. Use your email instead.' })); });
    }
    if (!busy) dialog.querySelector(mode === 'signup' ? '#auth-name' : mode === 'reset' ? '#auth-password' : '#auth-email')?.focus();
  }

  dialog.setAttribute('aria-labelledby', 'auth-title');
  dialog.addEventListener('cancel', (event) => { if (mustChoose() || mode === 'reset') event.preventDefault(); });   // Escape does nothing until a choice is made

  return {
    open(startMode = 'login', token = null) {
      mode = startMode; resetToken = token; busy = false; message = ''; info = '';
      draw();
      if (!dialog.open) dialog.showModal();
    },
    refresh() { if (dialog.open && !busy) draw(); },   // the server's features arrived: show Google / "Forgot password?"
    close() { if (dialog.open) dialog.close(); },
  };
}
