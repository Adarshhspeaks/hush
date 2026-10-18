// Invite link sharing via Web Share API or clipboard copy fallback
import { $ } from '../core/dom.js';

export function setupInvite(getInviteLink) {
  const btn = $('invite');
  if (!btn) return;

  btn.onclick = async () => {
    const link = getInviteLink();
    if (navigator.share) {
      try {
        return await navigator.share({ url: link });
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(link);
      btn.textContent = 'Copied';
      setTimeout(() => {
        btn.textContent = 'Copy invite';
      }, 1500);
    } catch {
      prompt('Copy invite link:', link);
    }
  };
}
