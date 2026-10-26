// Photos for "snap a doubt": shrink a camera photo in the browser before it is sent, so it travels fast and stays
// under the backend's 4 MB limit. Browser-only (canvas); returns plain data the voice client can send.

const MAX_SIDE = 1280;       // enough for Gemini to read a textbook page
const QUALITY = 0.85;

/** @returns {Promise<{mime: string, data: string, previewUrl: string}>} JPEG as base64 plus a preview URL. */
export async function shrinkPhoto(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Choose a photo (JPG, PNG or WebP).');
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('This photo could not be opened.'); });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const previewUrl = canvas.toDataURL('image/jpeg', QUALITY);
  return { mime: 'image/jpeg', data: previewUrl.split(',')[1], previewUrl };
}
