// Header buttons: load demo notes, upload notes. Each button is disabled while its action runs.

async function withBusy(button, label, action) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try { await action(); }
  finally { button.disabled = false; button.textContent = original; }
}

export function mountHeaderControls({ demoButton, uploadButton, fileInput, onLoadDemo, onUpload }) {
  demoButton.addEventListener('click', () => withBusy(demoButton, 'Loading…', onLoadDemo));
  uploadButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    await withBusy(uploadButton, 'Reading notes…', () => onUpload(file));
    fileInput.value = '';
  });
}
