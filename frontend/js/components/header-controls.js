// Notes buttons: load demo notes, upload notes (a PDF, a text file or a photo of a page).
// Each button is disabled while its action runs; its icon and label come back afterwards.

async function withBusy(button, label, action) {
  const original = [...button.childNodes];   // keep the icon and the translated label, not just the text
  button.disabled = true;
  button.textContent = label;
  try { await action(); }
  finally { button.disabled = false; button.replaceChildren(...original); }
}

export function mountHeaderControls({ demoButton, uploadButton, fileInput, onLoadDemo, onUpload }) {
  demoButton.addEventListener('click', () => withBusy(demoButton, 'Loading…', onLoadDemo));
  uploadButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    await withBusy(uploadButton, file.type.startsWith('image/') ? 'Reading the photo…' : 'Reading notes…', () => onUpload(file));
    fileInput.value = '';
  });
}
