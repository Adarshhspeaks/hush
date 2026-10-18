// Fullscreen photo lightbox modal controller
import { $ } from '../core/dom.js';

export function setupLightbox() {
  const lbClose = $('lbclose');
  const lightbox = $('lightbox');

  if (lbClose) {
    lbClose.onclick = () => {
      if (lightbox) lightbox.hidden = true;
    };
  }

  if (lightbox) {
    lightbox.onclick = (e) => {
      if (e.target === lightbox) lightbox.hidden = true;
    };
  }
}
