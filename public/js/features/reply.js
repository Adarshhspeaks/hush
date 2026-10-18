// Quoted reply controller: composer reply bar and jump-to-quote navigation
import { $, flashNotice } from '../core/dom.js';
import { hueFor } from '../core/names.js';

let activeReply = null;

export function getActiveReply() {
  return activeReply;
}

export function setReply(id, name, uid, snippet) {
  activeReply = {
    id,
    name: (name || 'Anonymous').slice(0, 30),
    uid: String(uid || ''),
    text: (snippet || 'Message').slice(0, 120),
  };

  const nameEl = $('replyToName');
  const textEl = $('replyToText');
  const bar = $('replyBar');
  const input = $('text');

  if (nameEl) nameEl.textContent = activeReply.name;
  if (textEl) textEl.textContent = activeReply.text;
  if (bar) {
    bar.style.setProperty('--reply-h', hueFor(activeReply.uid));
    bar.hidden = false;
  }
  if (input) input.focus();
}

export function clearReply() {
  activeReply = null;
  const bar = $('replyBar');
  if (bar) bar.hidden = true;
}

export function initReply() {
  const cancelBtn = $('cancelReply');
  if (cancelBtn) cancelBtn.onclick = clearReply;
}

export function jumpToMessage(msgId) {
  const target = document.getElementById('msg-' + msgId);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('pulse-highlight');
    void target.offsetWidth; // trigger reflow
    target.classList.add('pulse-highlight');
  } else {
    flashNotice('Quoted message not found (it may have been deleted or expired)');
  }
}
