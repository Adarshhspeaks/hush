// Photo resizing, quality stepdown, and EXIF metadata stripping via canvas
export async function compressImage(file, maxDim = 1280, maxBytes = 1_500_000) {
  const bmp = await createImageBitmap(file);
  let scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));

  for (const q of [0.82, 0.68, 0.55, 0.4]) {
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h); // transparent PNGs get a white background
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= maxBytes) return { blob, w, h };
    scale *= 0.8;
  }
  throw new Error('Image is too large');
}
