// Dark and light mode toggle controller and system preference sync
const THEME_KEY = 'hush-theme';

export function getPreferredTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {}
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

export function initTheme(btnId) {
  const current = getPreferredTheme();
  setTheme(current);

  const btn = typeof btnId === 'string' ? document.getElementById(btnId) : btnId;
  if (!btn) return;

  const updateIcon = (t) => {
    btn.textContent = t === 'dark' ? '☀️' : '🌙';
    btn.setAttribute('title', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    btn.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  };

  updateIcon(current);

  btn.addEventListener('click', () => {
    const next = toggleTheme();
    updateIcon(next);
  });

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      try {
        if (!localStorage.getItem(THEME_KEY)) {
          const t = e.matches ? 'dark' : 'light';
          setTheme(t);
          updateIcon(t);
        }
      } catch {}
    });
  }
}
