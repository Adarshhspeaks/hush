// Sticker tray UI builder: categories, search, custom sticker manager, and event wiring
import { BUILTIN_STICKERS, STICKER_CATEGORIES } from './constants.js';
import { getSavedStickers, saveCustomSticker, deleteCustomSticker } from './db.js';
import { processStickerImage } from './process.js';

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
