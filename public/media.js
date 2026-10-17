// Photo compression and voice recording. Everything stays in the browser until encrypted.

// Resize + re-encode as JPEG. Re-encoding also strips EXIF data (GPS location, camera info).
export async function compressImage(file, maxDim = 1280, maxBytes = 1_500_000) {
  const bmp = await createImageBitmap(file);
  let scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  for (const q of [0.82, 0.68, 0.55, 0.4]) {
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // transparent PNGs get a white background
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= maxBytes) return { blob, w, h };
    scale *= 0.8;
  }
  throw new Error('Image is too large');
}

function pickAudioMime() {
  if (!window.MediaRecorder) return '';
  for (const m of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

export const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = pickAudioMime();
  const opts = { audioBitsPerSecond: 32000 };
  if (mime) opts.mimeType = mime;
  const rec = new MediaRecorder(stream, opts);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();
  const t0 = Date.now();
  const release = () => stream.getTracks().forEach((t) => t.stop()); // turn the mic light off
  return {
    stop: () => new Promise((resolve) => {
      rec.onstop = () => {
        release();
        resolve({ blob: new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }), dur: (Date.now() - t0) / 1000 });
      };
      rec.stop();
    }),
    cancel: () => { rec.onstop = release; try { rec.stop(); } catch { release(); } },
  };
}
