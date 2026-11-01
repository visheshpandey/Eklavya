// Notes buttons: load demo notes, upload notes (PDFs, text files or photos of pages, one or many; or drop them on the drop zone).
// Each button is disabled while its action runs; its icon and label come back afterwards.

async function withBusy(button, label, action) {
  const original = [...button.childNodes];   // keep the icon and the translated label, not just the text
  button.disabled = true;
  button.textContent = label;
  try { await action(); }
  finally { button.disabled = false; button.replaceChildren(...original); }
}

const labelFor = (file, count) => (count > 1 ? `Reading ${count} files…` : file.type.startsWith('image/') ? 'Reading the photo…' : 'Reading notes…');

export function mountHeaderControls({ demoButton, uploadButton, fileInput, dropZone, onLoadDemo, onUpload }) {
  /** One file after the other: each is read by Gemini, and one failing must not stop the rest (the controller reports it). */
  async function uploadAll(files) {
    const list = [...files];
    if (!list.length) return;
    await withBusy(uploadButton, labelFor(list[0], list.length), async () => { for (const file of list) await onUpload(file); });
  }

  demoButton.addEventListener('click', () => withBusy(demoButton, 'Loading…', onLoadDemo));
  uploadButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const files = [...fileInput.files];
    fileInput.value = '';
    await uploadAll(files);
  });

  if (dropZone) {
    ['dragenter', 'dragover'].forEach((type) => dropZone.addEventListener(type, (event) => { event.preventDefault(); dropZone.classList.add('dragging'); }));
    ['dragleave', 'drop'].forEach((type) => dropZone.addEventListener(type, (event) => { event.preventDefault(); dropZone.classList.remove('dragging'); }));
    dropZone.addEventListener('drop', (event) => uploadAll(event.dataTransfer?.files ?? []));
  }
}
