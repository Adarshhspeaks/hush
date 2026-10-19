// QR code modal generation and display
import { $ } from '../core/dom.js';
import qrcode from '../../vendor/qrcode.mjs';

export function setupQrModal(getInviteLink) {
  const qrBtn = $('qr');
  const qrClose = $('qrclose');
  const qrBox = $('qrbox');
  const qrImg = $('qrimg');

  if (qrBtn) {
    qrBtn.onclick = () => {
      const q = qrcode(0, 'M');
      q.addData(getInviteLink());
      q.make();
      if (qrImg) qrImg.src = q.createDataURL(6, 4);
      if (qrBox) qrBox.hidden = false;
    };
  }

  if (qrClose) {
    qrClose.onclick = () => {
      if (qrBox) qrBox.hidden = true;
    };
  }

  if (qrBox) {
    qrBox.onclick = (e) => {
      if (e.target === qrBox) qrBox.hidden = true;
    };
  }
}
