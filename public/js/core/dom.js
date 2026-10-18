// DOM helper utilities, scrolling helpers, and notices
export const $ = (id) => document.getElementById(id);

export function el(tag, className, props = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  Object.assign(node, props);
  return node;
}

export function flashNotice(txt) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const n = document.createElement('div');
  n.className = 'toast';
  n.textContent = txt;
  document.body.append(n);
  setTimeout(() => n.classList.add('out'), 2000);
  setTimeout(() => n.remove(), 2350);
}

export function fatal(msg) {
  const log = $('log');
  if (log) {
    log.textContent = msg;
    log.className = 'log fatal';
  }
  for (const id of ['f', 'recbar', 'pickerBox', 'typing', 'replyBar']) {
    const el = $(id);
    if (el) el.hidden = true;
  }
}

export const atBottom = (logEl = $('log')) =>
  logEl ? logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 90 : true;

export const toBottom = (logEl = $('log')) => {
  if (logEl) logEl.scrollTop = logEl.scrollHeight;
};

export const fmtDur = (s) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
