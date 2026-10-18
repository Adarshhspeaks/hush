// Image processor for custom stickers: square center-crop, WebP/PNG compression <= 100 KB
export async function processStickerImage(file) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Please select a valid image file.');
  }

  const bmp = await createImageBitmap(file);
  const sqSize = Math.min(bmp.width, bmp.height);
  const sx = Math.round((bmp.width - sqSize) / 2);
  const sy = Math.round((bmp.height - sqSize) / 2);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Try dimensions: 512, 384, 256
  for (const dim of [Math.min(512, sqSize), 384, 256]) {
    canvas.width = dim;
    canvas.height = dim;
    ctx.clearRect(0, 0, dim, dim); // Keep transparent background
    ctx.drawImage(bmp, sx, sy, sqSize, sqSize, 0, 0, dim, dim);

    for (const q of [0.92, 0.8, 0.65, 0.5]) {
      let blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', q));
      let mime = 'image/webp';
      if (!blob) {
        // Fallback to PNG if WebP is unsupported by browser canvas
        blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
        mime = 'image/png';
      }
      if (blob && blob.size <= 100_000) {
        return { blob, mime };
      }
    }
  }

  throw new Error('Could not compress sticker under 100 KB. Try another image.');
}
