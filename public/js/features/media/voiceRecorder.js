// MediaRecorder wrapper for encrypted voice notes
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
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          release();
          resolve({
            blob: new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }),
            dur: (Date.now() - t0) / 1000,
          });
        };
        rec.stop();
      }),
    cancel: () => {
      rec.onstop = release;
      try {
        rec.stop();
      } catch {
        release();
      }
    },
  };
}
