/**
 * DriverGuard AI - Presentation & QR Code Share Modal
 * Allows presenter to display QR Code on classroom screen for audience to test live on mobile!
 */

import QRCode from 'qrcode';

export class PresentationModal {
  constructor() {
    this.modalEl = document.getElementById('qr-modal');
    this.canvasEl = document.getElementById('qr-canvas');
    this.urlInputEl = document.getElementById('qr-url-input');
    this.copyBtnEl = document.getElementById('qr-copy-btn');
    this.closeBtnEl = document.getElementById('qr-close-btn');
    this.openBtnEl = document.getElementById('open-presentation-btn');

    this.currentUrl = window.location.href;

    this.initEvents();
  }

  initEvents() {
    if (this.openBtnEl) {
      this.openBtnEl.addEventListener('click', () => this.open());
    }

    if (this.closeBtnEl) {
      this.closeBtnEl.addEventListener('click', () => this.close());
    }

    // Close on backdrop click
    if (this.modalEl) {
      this.modalEl.addEventListener('click', (e) => {
        if (e.target === this.modalEl) {
          this.close();
        }
      });
    }

    // Update QR code on input change
    if (this.urlInputEl) {
      this.urlInputEl.addEventListener('input', (e) => {
        this.renderQRCode(e.target.value.trim() || window.location.href);
      });
    }

    // Copy button
    if (this.copyBtnEl) {
      this.copyBtnEl.addEventListener('click', () => {
        const text = this.urlInputEl ? this.urlInputEl.value : window.location.href;
        navigator.clipboard.writeText(text).then(() => {
          const originalText = this.copyBtnEl.innerText;
          this.copyBtnEl.innerText = 'คัดลอกแล้ว! ✓';
          this.copyBtnEl.classList.add('bg-emerald-600');
          setTimeout(() => {
            this.copyBtnEl.innerText = originalText;
            this.copyBtnEl.classList.remove('bg-emerald-600');
          }, 2000);
        });
      });
    }
  }

  open() {
    if (!this.modalEl) return;
    this.modalEl.classList.remove('hidden');

    const currentLoc = window.location;
    let urlToUse = currentLoc.href;

    const noticeEl = document.getElementById('qr-localhost-notice');
    if (currentLoc.hostname === 'localhost' || currentLoc.hostname === '127.0.0.1') {
      if (noticeEl) noticeEl.classList.remove('hidden');
    } else {
      if (noticeEl) noticeEl.classList.add('hidden');
    }

    if (this.urlInputEl) {
      this.urlInputEl.value = urlToUse;
    }

    this.renderQRCode(urlToUse);
  }

  close() {
    if (!this.modalEl) return;
    this.modalEl.classList.add('hidden');
  }

  async renderQRCode(url) {
    if (!this.canvasEl) return;
    try {
      await QRCode.toCanvas(this.canvasEl, url, {
        width: 250,
        margin: 2,
        color: {
          dark: '#030712',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      });
    } catch (err) {
      console.error('Failed to generate QR Code:', err);
    }
  }
}
