// Account menu: daily reminders (push and email), change password, delete the account, sign out. A modal <dialog>.
import { el, render } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { deviceSubscribed, pushSupported, subscribeDevice, unsubscribeDevice } from '../lib/push.js';

export function mountAccountDialog({ dialog, backend, onSignOut, onDeleted, onPasswordChanged }) {
  let me = null;
  let reminders = null;
  let onThisDevice = false;
  const notes = { reminders: '', password: '', delete: '' };   // the message under each section
  let busy = '';

  const note = (section, text, tone = 'ok') => el('p', { class: `account-note is-${tone}`, role: 'status', text, hidden: text ? null : '' });

  async function act(section, task) {
    busy = section; notes[section] = ''; draw();
    try { notes[section] = (await task()) ?? ''; } catch (error) { notes[section] = `!${error.message}`; }
    busy = ''; draw();
  }
  const message = (section) => note(section, notes[section].replace(/^!/, ''), notes[section].startsWith('!') ? 'bad' : 'ok');

  function remindersSection() {
    if (!reminders) return el('p', { class: 'hint', text: 'Loading…' });
    const pushRow = reminders.push_available && pushSupported()
      ? el('label', { class: 'switch-row' },
        el('input', { type: 'checkbox', role: 'switch', checked: onThisDevice ? '' : null, disabled: busy ? '' : null,
          onchange: (event) => act('reminders', async () => {
            if (event.target.checked) {
              reminders = await backend.pushSubscribe(await subscribeDevice(reminders.push_key));
              onThisDevice = true;
              return 'Notifications are on for this device. You get one a day at about 7 pm.';
            }
            const old = await unsubscribeDevice();
            reminders = old ? await backend.pushUnsubscribe(old) : reminders;
            onThisDevice = false;
            return 'Notifications are off for this device.';
          }) }),
        el('span', {}, el('strong', { text: 'Notifications on this device' }), el('span', { class: 'hint', text: 'A short note when topics or cards are due.' })))
      : el('p', { class: 'hint', text: reminders.push_available ? 'This browser cannot show notifications. Use Chrome, or install the app.' : 'Notifications are not set up on this server yet.' });
    const emailRow = reminders.email_available
      ? el('label', { class: 'switch-row' },
        el('input', { type: 'checkbox', role: 'switch', checked: reminders.email ? '' : null, disabled: busy ? '' : null,
          onchange: (event) => act('reminders', async () => {
            reminders = await backend.saveReminders({ email: event.target.checked });
            return reminders.email ? `A daily email goes to ${me.email}.` : 'Daily emails are off.';
          }) }),
        el('span', {}, el('strong', { text: 'Daily email' }), el('span', { class: 'hint', text: me.email })))
      : null;
    const anyOn = onThisDevice || reminders.email;
    return el('div', { class: 'account-stack' }, pushRow, emailRow,
      anyOn ? el('button', { class: 'btn btn-secondary btn-sm', type: 'button', disabled: busy ? '' : null,
        onclick: () => act('reminders', async () => {
          const sent = await backend.testReminder();
          return sent.push || sent.email ? 'Sent. It should arrive in a few seconds.' : '!Nothing was delivered. Turn notifications off and on again.';
        }) }, icon('bell', { size: 16 }), 'Send me a test') : null,
      message('reminders'));
  }

  function passwordSection() {
    const hasPassword = me.has_password;
    const current = el('input', { id: 'acc-current', class: 'field', type: 'password', autocomplete: 'current-password' });
    const next = el('input', { id: 'acc-new', class: 'field', type: 'password', autocomplete: 'new-password', minlength: '8' });
    const form = el('form', { class: 'account-stack' },
      hasPassword ? el('label', { class: 'auth-field', for: 'acc-current' }, el('span', { text: 'Current password' }), current)
        : el('p', { class: 'hint', text: 'You sign in with Google. Set a password to also sign in with your email.' }),
      el('label', { class: 'auth-field', for: 'acc-new' }, el('span', { text: 'New password (at least 8 characters)' }), next),
      el('button', { class: 'btn btn-secondary', type: 'submit', disabled: busy ? '' : null }, busy === 'password' ? 'Saving…' : hasPassword ? 'Change password' : 'Set a password'),
      message('password'));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      act('password', async () => {
        await backend.changePassword(current.value, next.value);
        me = { ...me, has_password: true };
        onPasswordChanged?.();
        return 'Password saved.';
      });
    });
    return form;
  }

  function deleteSection() {
    const hasPassword = me.has_password;
    const input = el('input', { id: 'acc-delete', class: 'field', type: hasPassword ? 'password' : 'email', autocomplete: 'off' });
    const form = el('form', { class: 'account-stack' },
      el('p', { class: 'hint', text: 'This erases your account, notes, progress, flashcards and reminders. It cannot be undone.' }),
      el('label', { class: 'auth-field', for: 'acc-delete' }, el('span', { text: hasPassword ? 'Your password, to confirm' : `Type ${me.email} to confirm` }), input),
      el('button', { class: 'btn btn-danger', type: 'submit', disabled: busy ? '' : null }, busy === 'delete' ? 'Deleting…' : 'Delete my account forever'),
      message('delete'));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      act('delete', async () => {
        await backend.deleteAccount(hasPassword ? input.value : '', hasPassword ? '' : input.value);
        onDeleted();
        return 'Deleted.';
      });
    });
    return el('details', { class: 'notes account-danger' },
      el('summary', {}, el('span', { class: 'summary-text', text: 'Delete my account' }), icon('caret-down', { size: 16 })), el('div', { class: 'notes-body' }, form));
  }

  function draw() {
    if (!me) { render(dialog, el('div', { class: 'auth-card' }, el('p', { class: 'hint', text: 'Loading your account…' }))); return; }
    render(dialog, el('div', { class: 'auth-card account-card' },
      el('div', { class: 'account-head' },
        el('div', {}, el('h2', { id: 'account-title', text: me.name || 'Your account' }), el('p', { class: 'hint', text: `${me.email}${me.google ? ' · Google' : ''}` })),
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => dialog.close() }, icon('x', { size: 18 }))),
      el('section', { class: 'account-section', 'aria-labelledby': 'acc-rem' }, el('h3', { id: 'acc-rem', text: 'Daily reminder' }), remindersSection()),
      el('section', { class: 'account-section', 'aria-labelledby': 'acc-pw' }, el('h3', { id: 'acc-pw', text: 'Password' }), passwordSection()),
      deleteSection(),
      el('button', { class: 'btn btn-secondary', type: 'button', onclick: onSignOut }, 'Sign out')));
  }

  dialog.setAttribute('aria-labelledby', 'account-title');
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

  return {
    async open() {
      Object.keys(notes).forEach((key) => { notes[key] = ''; });
      draw();
      if (!dialog.open) dialog.showModal();
      try {
        [me, reminders, onThisDevice] = await Promise.all([backend.me(), backend.reminders(), deviceSubscribed()]);
      } catch (error) {
        me = me ?? { name: '', email: '', has_password: true };
        notes.reminders = `!${error.message}`;
      }
      draw();
    },
  };
}
