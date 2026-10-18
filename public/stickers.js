// Hush stickers module: built-in SVGs and custom client-side stickers.
// Strict security: built-in SVGs are validated against an allowlist;
// custom stickers are converted strictly to WebP/PNG under 100 KB and preserved in IndexedDB.

export const BUILTIN_STICKERS = [
  // Reactions
  { id: 'react_mind_blown', name: 'Mind Blown', cat: 'reactions', keywords: ['shocked', 'mind blown', 'explosion', 'brain', 'wow', 'omg', 'insane'] },
  { id: 'react_fire', name: 'Fire', cat: 'reactions', keywords: ['fire', 'flame', 'lit', 'hype', 'hot', 'shades', 'cool'] },
  { id: 'react_party', name: 'Party', cat: 'reactions', keywords: ['party', 'celebrate', 'popper', 'confetti', 'yay', 'congrats'] },
  { id: 'react_facepalm', name: 'Facepalm', cat: 'reactions', keywords: ['facepalm', 'ugh', 'sigh', 'smh', 'disbelief', 'oops'] },
  { id: 'react_eyes', name: 'Shifty Eyes', cat: 'reactions', keywords: ['eyes', 'side eye', 'suspicious', 'looking', 'drama', 'tea'] },
  { id: 'react_skull', name: 'Skull', cat: 'reactions', keywords: ['skull', 'dead', 'dying', 'lmao', 'rip', 'skeleton'] },

  // Love
  { id: 'love_heart_sparkle', name: 'Sparkle Heart', cat: 'love', keywords: ['heart', 'love', 'sparkle', 'crush', 'pink', 'romance'] },
  { id: 'love_cat_hearts', name: 'Heart Eyes Cat', cat: 'love', keywords: ['cat', 'heart eyes', 'love', 'adorable', 'kitty', 'crush'] },
  { id: 'love_bear_hug', name: 'Bear Hug', cat: 'love', keywords: ['bear', 'hug', 'comfort', 'warm', 'love', 'care', 'sweet'] },
  { id: 'love_kiss_wink', name: 'Blowing Kiss', cat: 'love', keywords: ['kiss', 'wink', 'flirt', 'love', 'sweet', 'xoxo'] },
  { id: 'love_heart_lock', name: 'Heart Lock', cat: 'love', keywords: ['lock', 'secret', 'key', 'promise', 'heart', 'secure', 'hush'] },
  { id: 'love_blushing_star', name: 'Blushing Star', cat: 'love', keywords: ['star', 'blush', 'cute', 'sweet', 'shy', 'sparkle'] },

  // Funny
  { id: 'fun_vibing_cat', name: 'Vibing Cat', cat: 'funny', keywords: ['vibing', 'cat', 'music', 'headphones', 'jamming', 'bop', 'chill'] },
  { id: 'fun_blob_popcorn', name: 'Popcorn Drama', cat: 'funny', keywords: ['popcorn', 'blob', 'drama', 'watching', 'tea', 'movie', 'eating'] },
  { id: 'fun_doge_shades', name: 'Deal With It', cat: 'funny', keywords: ['dog', 'doge', 'shades', 'deal with it', 'pixel', 'cool', 'swag'] },
  { id: 'fun_tea_sip', name: 'Sipping Tea', cat: 'funny', keywords: ['tea', 'sip', 'kermit', 'frog', 'none of my business', 'drama'] },
  { id: 'fun_ghost_boo', name: 'Ghost Boo', cat: 'funny', keywords: ['ghost', 'boo', 'scary', 'cute', 'spooky', 'surprise'] },
  { id: 'fun_potato_king', name: 'Potato King', cat: 'funny', keywords: ['potato', 'couch potato', 'crown', 'king', 'lazy', 'cute'] },

  // Words
  { id: 'word_omg', name: 'OMG!', cat: 'words', keywords: ['omg', 'oh my god', 'wow', 'comic', 'shock', 'badge'] },
  { id: 'word_lol', name: 'LOL!', cat: 'words', keywords: ['lol', 'laugh', 'haha', 'lmao', 'funny', 'tears'] },
  { id: 'word_noice', name: 'NOICE!', cat: 'words', keywords: ['noice', 'nice', 'sweet', 'cool', 'approved', 'stamp'] },
  { id: 'word_hush', name: 'HUSH 🤫', cat: 'words', keywords: ['hush', 'shh', 'secret', 'quiet', 'private', 'lock'] },
  { id: 'word_rip', name: 'R.I.P.', cat: 'words', keywords: ['rip', 'dead', 'grave', 'tombstone', 'over', 'rest in peace'] },
  { id: 'word_yass', name: 'YAAAS!', cat: 'words', keywords: ['yass', 'yaaas', 'yes', 'slay', 'rainbow', 'hype', 'celebrate'] },
];

export const ALLOWED_STICKER_IDS = new Set(BUILTIN_STICKERS.map((s) => s.id));
export const STICKER_CATEGORIES = [
  { id: 'my', label: '⭐ My Stickers' },
  { id: 'reactions', label: '😮 Reactions' },
  { id: 'love', label: '❤️ Love' },
  { id: 'funny', label: '😂 Funny' },
  { id: 'words', label: '💬 Words' },
];

// ---- IndexedDB for Custom Stickers ----
const DB_NAME = 'hush_stickers_db';
const DB_VERSION = 1;
const STORE_NAME = 'stickers';
const MAX_CUSTOM_STICKERS = 60;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'hash' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function sha256Hex(buffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getSavedStickers() {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Failed to load custom stickers:', err);
    return [];
  }
}

export async function saveCustomSticker(blob, mime = 'image/webp') {
  const buf = await blob.arrayBuffer();
  const hash = await sha256Hex(buf);
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const countReq = store.count();
    countReq.onsuccess = () => {
      if (countReq.result >= MAX_CUSTOM_STICKERS) {
        return reject(new Error(`Sticker storage is full (max ${MAX_CUSTOM_STICKERS} stickers). Delete some to save new ones.`));
      }
      const putReq = store.put({ hash, blob, mime, createdAt: Date.now() });
      putReq.onsuccess = () => resolve({ ok: true, hash });
      putReq.onerror = () => reject(putReq.error);
    };
    countReq.onerror = () => reject(countReq.error);
  });
}

export async function deleteCustomSticker(hash) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(hash);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// ---- Make-your-own Sticker Processor ----
// Center-crops to square, resizes to max 512x512, exports WebP/PNG keeping transparency under 100 KB
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

// ---- Sticker Tray UI Builder ----
export function buildStickerTray(container, { onSendBuiltin, onSendCustom, onNotice }) {
  container.innerHTML = `
    <div class="st-header">
      <div class="st-tabs" role="tablist"></div>
      <input type="text" class="st-search" id="stSearch" placeholder="Search stickers…" aria-label="Search stickers">
    </div>
    <div class="st-grid" id="stGrid"></div>
    <input type="file" id="stFileInput" accept="image/*" hidden>
  `;

  const tabsBar = container.querySelector('.st-tabs');
  const searchInput = container.querySelector('#stSearch');
  const grid = container.querySelector('#stGrid');
  const fileInput = container.querySelector('#stFileInput');

  let activeCat = 'my';
  let searchQuery = '';

  // Render Category Tabs
  STICKER_CATEGORIES.forEach((cat) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'st-tab' + (cat.id === activeCat ? ' on' : '');
    btn.textContent = cat.label;
    btn.dataset.cat = cat.id;
    btn.onclick = () => {
      activeCat = cat.id;
      searchInput.value = '';
      searchQuery = '';
      tabsBar.querySelectorAll('.st-tab').forEach((t) => t.classList.toggle('on', t.dataset.cat === activeCat));
      renderGrid();
    };
    tabsBar.append(btn);
  });

  searchInput.oninput = (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderGrid();
  };

  async function renderGrid() {
    grid.replaceChildren();

    // Search Mode across all built-in stickers
    if (searchQuery) {
      const matches = BUILTIN_STICKERS.filter((s) =>
        s.name.toLowerCase().includes(searchQuery) ||
        s.keywords.some((kw) => kw.toLowerCase().includes(searchQuery))
      );

      if (!matches.length) {
        const empty = document.createElement('div');
        empty.className = 'st-empty';
        empty.textContent = 'No stickers found for "' + searchQuery + '"';
        grid.append(empty);
        return;
      }

      for (const st of matches) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'st-item';
        item.title = st.name;
        item.innerHTML = `<img src="/stickers/${st.id}.svg" alt="${st.name}" loading="lazy"><span class="st-name">${st.name}</span>`;
        item.onclick = () => onSendBuiltin(st.id);
        grid.append(item);
      }
      return;
    }

    // Category: My Stickers (Custom stickers in IndexedDB)
    if (activeCat === 'my') {
      // 1. "+" button to create a new custom sticker
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'st-add-btn';
      addBtn.innerHTML = `<span class="st-add-icon">➕</span><span class="st-add-txt">Create</span>`;
      addBtn.title = 'Make your own custom sticker';
      addBtn.onclick = () => fileInput.click();
      grid.append(addBtn);

      const saved = await getSavedStickers();
      if (!saved.length) {
        const tip = document.createElement('div');
        tip.className = 'st-tip';
        tip.textContent = 'No custom stickers yet! Tap "+" to make your own or tap any received sticker to save it.';
        grid.append(tip);
      } else {
        for (const item of saved) {
          const url = URL.createObjectURL(item.blob);
          const stEl = document.createElement('div');
          stEl.className = 'st-custom-item';

          const imgBtn = document.createElement('button');
          imgBtn.type = 'button';
          imgBtn.className = 'st-custom-btn';
          imgBtn.innerHTML = `<img src="${url}" alt="My sticker">`;
          imgBtn.onclick = () => onSendCustom(item.blob, item.mime);

          // Delete button on custom sticker
          const delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'st-del-btn';
          delBtn.title = 'Remove sticker';
          delBtn.textContent = '✕';
          delBtn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm('Remove this sticker from My Stickers?')) {
              await deleteCustomSticker(item.hash);
              stEl.remove();
              onNotice?.('Sticker removed');
            }
          };

          // Long press / right-click delete support
          stEl.oncontextmenu = (e) => {
            e.preventDefault();
            delBtn.click();
          };

          stEl.append(imgBtn, delBtn);
          grid.append(stEl);
        }
      }
      return;
    }

    // Category: Built-in packs
    const list = BUILTIN_STICKERS.filter((s) => s.cat === activeCat);
    for (const st of list) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'st-item';
      item.title = st.name;
      item.innerHTML = `<img src="/stickers/${st.id}.svg" alt="${st.name}" loading="lazy"><span class="st-name">${st.name}</span>`;
      item.onclick = () => onSendBuiltin(st.id);
      grid.append(item);
    }
  }

  // Handle Make-Your-Own file selection
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;

    try {
      onNotice?.('Processing sticker…');
      const { blob, mime } = await processStickerImage(file);
      await saveCustomSticker(blob, mime);
      onNotice?.('Sticker created & saved to My Stickers! 🎉');
      renderGrid();
    } catch (err) {
      alert(err.message || 'Failed to create sticker.');
    }
  };

  renderGrid();

  return {
    refresh: () => renderGrid(),
  };
}
