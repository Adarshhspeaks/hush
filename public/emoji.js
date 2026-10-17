const SETS = {
  '😀': '😀 😃 😄 😁 😆 😅 😂 🤣 🥲 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😋 😛 😜 🤪 😎 🤓 🥳 😏 😒 😞 😔 😟 😕 🙁 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😮 😲 🥱 😴 🤤 😪 😵 🤐 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👻 💀 👽 🤖 💩',
  '👍': '👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖖 👋 🤝 🙏 ✍️ 💪 👏 🙌 👐 🤲 🫶 🫡 👀 🧠 👑 💅',
  '❤️': '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 💤 🔥 ✨ ⭐ 🌟 🎉 🎊',
  '🐶': '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🦆 🦉 🦇 🐺 🐴 🦄 🐝 🦋 🐢 🐍 🐙 🐬 🐳 🦈 🌸 🌹 🌻 🌈 ☀️ 🌙 ⚡ ❄️',
  '🍕': '🍎 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥑 🌽 🥕 🍞 🧀 🍳 🥞 🍔 🍟 🍕 🌭 🌮 🌯 🍝 🍜 🍣 🍩 🍪 🎂 🍰 🍫 🍿 ☕ 🍵 🥤 🍺 🍻',
  '⚽': '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏏 🎱 ♟️ 🎮 🎲 🎯 🎵 🎶 🎤 🎧 🎸 📱 💻 📷 🎬 📚 ✏️ 💡 🎁 🏆 🚗 ✈️ 🚀 🏠 💰',
};

export const QUICK = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// builds tabs + grid inside `box`; calls onPick(emoji) when one is tapped
export function buildPicker(box, onPick) {
  const tabs = document.createElement('div'); tabs.className = 'etabs';
  const grid = document.createElement('div'); grid.className = 'egrid';
  box.append(tabs, grid);
  const show = (key) => {
    [...tabs.children].forEach((t) => t.classList.toggle('on', t.dataset.k === key));
    grid.replaceChildren(...SETS[key].split(' ').map((e) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = e; b.setAttribute('aria-label', e);
      b.onclick = () => onPick(e);
      return b;
    }));
  };
  for (const key of Object.keys(SETS)) {
    const t = document.createElement('button');
    t.type = 'button'; t.textContent = key; t.dataset.k = key;
    t.onclick = () => show(key);
    tabs.append(t);
  }
  show('😀');
}
