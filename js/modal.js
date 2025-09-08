// Accessible Modal component for Paletteniffer
// Provides: open(contentHTML, options), close(), and focus trapping.

(function() {
  class Modal {
    constructor() {
      this.active = false;
      this.previouslyFocused = null;
      this.handleKeydown = this.handleKeydown.bind(this);
      this.handleOverlayClick = this.handleOverlayClick.bind(this);
      // Tooltip handlers
      this.onMouseOverToken = this.onMouseOverToken.bind(this);
      this.onMouseOutToken = this.onMouseOutToken.bind(this);
      this.onMouseMove = this.onMouseMove.bind(this);
      this.onTokenFocus = this.onTokenFocus.bind(this);
      this.onTokenBlur = this.onTokenBlur.bind(this);
      this.modalRoot = null;
      this.build();
    }

    build() {
      // Create a root container appended to body to avoid clipping/overflow.
      this.modalRoot = document.createElement('div');
      this.modalRoot.className = 'pf-modal-root';
      this.modalRoot.style.display = 'none';
      this.modalRoot.innerHTML = `
        <div class="pf-modal-overlay" role="presentation"></div>
        <div class="pf-modal" role="dialog" aria-modal="true" aria-labelledby="pf-modal-title" aria-describedby="pf-modal-content">
          <div class="pf-modal-header">
            <h2 id="pf-modal-title" class="pf-modal-title">Code Output</h2>
            <button type="button" class="pf-modal-close" aria-label="Close dialog">✕</button>
          </div>
          <div id="pf-modal-content" class="pf-modal-content" tabindex="0"></div>
          <div class="pf-modal-footer">
            <button type="button" class="btn btn-secondary pf-modal-copy" aria-label="Copy code">Copy</button>
            <button type="button" class="btn btn-secondary pf-modal-close-btn" aria-label="Close">Close</button>
          </div>
        </div>
        <div class="pf-modal-sr" aria-live="polite" aria-atomic="true" style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;"></div>
      `;
      document.body.appendChild(this.modalRoot);

      this.overlayEl = this.modalRoot.querySelector('.pf-modal-overlay');
      this.dialogEl = this.modalRoot.querySelector('.pf-modal');
      this.contentEl = this.modalRoot.querySelector('#pf-modal-content');
      this.closeIconBtn = this.modalRoot.querySelector('.pf-modal-close');
      this.closeBtn = this.modalRoot.querySelector('.pf-modal-close-btn');
      this.copyBtn = this.modalRoot.querySelector('.pf-modal-copy');
      this.srLive = this.modalRoot.querySelector('.pf-modal-sr');

      // Tooltip node for color previews
      this.tooltipEl = document.createElement('div');
      this.tooltipEl.className = 'pf-color-tooltip';
      this.tooltipEl.style.display = 'none';
      this.tooltipEl.innerHTML = `
        <div class="pf-color-tooltip-swatch"></div>
        <div class="pf-color-tooltip-text"></div>
      `;
      this.modalRoot.appendChild(this.tooltipEl);

      this.overlayEl.addEventListener('click', this.handleOverlayClick);
      this.closeIconBtn.addEventListener('click', () => this.close());
      this.closeBtn.addEventListener('click', () => this.close());
      this.copyBtn.addEventListener('click', async () => {
        const text = this.extractTextFromContent();
        const ok = await (window.Utils && Utils.copyToClipboard ? Utils.copyToClipboard(text) : Promise.resolve(false));
        this.announce(ok ? 'Code copied to clipboard' : 'Failed to copy');
      });
    }

    open(contentHTML, options = {}) {
      if (this.active) return;
      this.active = true;
      this.previouslyFocused = document.activeElement;

      // Inject provided content
      this.contentEl.innerHTML = contentHTML;
      // Enhance code with color tokens and wire tooltip interactions
      this.enhanceCodeBlocksWithColorTokens();
      this.contentEl.addEventListener('mouseover', this.onMouseOverToken);
      this.contentEl.addEventListener('mouseout', this.onMouseOutToken);
      this.contentEl.addEventListener('mousemove', this.onMouseMove);
      this.contentEl.addEventListener('focusin', this.onTokenFocus);
      this.contentEl.addEventListener('focusout', this.onTokenBlur);
      this.modalRoot.style.display = 'block';

      // Animate in
      requestAnimationFrame(() => {
        this.modalRoot.classList.add('pf-open');
        this.dialogEl.focus();
      });

      document.addEventListener('keydown', this.handleKeydown);
      this.trapFocus();
      this.announce('Dialog opened');
    }

    close() {
      if (!this.active) return;
      this.active = false;
      this.modalRoot.classList.remove('pf-open');
      this.modalRoot.style.display = 'none';
      document.removeEventListener('keydown', this.handleKeydown);
      // Remove tooltip listeners and hide the tooltip
      this.contentEl.removeEventListener('mouseover', this.onMouseOverToken);
      this.contentEl.removeEventListener('mouseout', this.onMouseOutToken);
      this.contentEl.removeEventListener('mousemove', this.onMouseMove);
      this.contentEl.removeEventListener('focusin', this.onTokenFocus);
      this.contentEl.removeEventListener('focusout', this.onTokenBlur);
      this.hideTooltip();
      if (this.previouslyFocused && this.previouslyFocused.focus) {
        this.previouslyFocused.focus();
      }
      this.announce('Dialog closed');
    }

    handleOverlayClick(e) {
      if (e.target === this.overlayEl) this.close();
    }

    handleKeydown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
        return;
      }
      if (e.key === 'Tab') {
        this.maintainFocus(e);
      }
    }

    trapFocus() {
      const focusableSelectors = [
        'a[href]','area[href]','input:not([disabled])','select:not([disabled])','textarea:not([disabled])',
        'button:not([disabled])','iframe','object','embed','[tabindex]:not([tabindex="-1"])','[contenteditable]'
      ];
      this.focusable = Array.from(this.dialogEl.querySelectorAll(focusableSelectors.join(',')))
        .filter(el => el.offsetParent !== null);
      if (this.focusable.length === 0) {
        this.dialogEl.setAttribute('tabindex','0');
        this.focusable = [this.dialogEl];
      }
      this.firstEl = this.focusable[0];
      this.lastEl = this.focusable[this.focusable.length - 1];
    }

    maintainFocus(e) {
      if (!this.focusable || this.focusable.length === 0) return;
      if (e.shiftKey && document.activeElement === this.firstEl) {
        e.preventDefault();
        this.lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === this.lastEl) {
        e.preventDefault();
        this.firstEl.focus();
      }
    }

    extractTextFromContent() {
      // Prefer raw text inside <code> blocks; fallback to all content text
      const codes = this.contentEl.querySelectorAll('code');
      if (codes.length) {
        return Array.from(codes).map(c => c.textContent).join('\n\n');
      }
      return this.contentEl.textContent || '';
    }

    announce(msg) {
      if (!this.srLive) return;
      this.srLive.textContent = '';
      setTimeout(() => { this.srLive.textContent = msg; }, 10);
    }

    // --- Color token enhancement & tooltip logic ---
    enhanceCodeBlocksWithColorTokens() {
      const codeBlocks = this.contentEl.querySelectorAll('pre > code');
      const hexPattern = /(#[0-9A-Fa-f]{6})\b/g;
      codeBlocks.forEach(code => {
        if (code.getAttribute('data-enhanced') === 'true') return;
        // Keep original whitespace; operate on innerHTML to preserve formatting
        const html = code.innerHTML;
        const enhanced = html.replace(hexPattern, (m) => {
          const hex = m;
          return `<span class="pf-color-token" data-hex="${hex}" tabindex="0" aria-label="Color ${hex}">${hex}</span>`;
        });
        code.innerHTML = enhanced;
        code.setAttribute('data-enhanced','true');
      });
    }

    onMouseOverToken(e) {
      const token = e.target.closest('.pf-color-token');
      if (!token) return;
      const hex = token.getAttribute('data-hex');
      this.showTooltip(hex, e.clientX, e.clientY);
    }

    onMouseOutToken(e) {
      const token = e.target.closest('.pf-color-token');
      if (!token) return;
      if (!e.relatedTarget || !this.tooltipEl.contains(e.relatedTarget)) {
        this.hideTooltip();
      }
    }

    onMouseMove(e) {
      if (this.tooltipEl.style.display !== 'block') return;
      this.positionTooltip(e.clientX, e.clientY);
    }

    onTokenFocus(e) {
      const token = e.target.closest('.pf-color-token');
      if (!token) return;
      const rect = token.getBoundingClientRect();
      const hex = token.getAttribute('data-hex');
      this.showTooltip(hex, rect.left + rect.width / 2, rect.top);
    }

    onTokenBlur(e) {
      const token = e.target.closest('.pf-color-token');
      if (!token) return;
      this.hideTooltip();
    }

    showTooltip(hex, x, y) {
      const swatch = this.tooltipEl.querySelector('.pf-color-tooltip-swatch');
      const text = this.tooltipEl.querySelector('.pf-color-tooltip-text');
      swatch.style.background = hex;
      text.textContent = hex;
      this.tooltipEl.style.display = 'block';
      this.positionTooltip(x, y);
    }

    positionTooltip(x, y) {
      const padding = 12;
      const rect = this.tooltipEl.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = x + 14;
      let top = y + 14;
      if (left + rect.width + padding > vw) left = vw - rect.width - padding;
      if (top + rect.height + padding > vh) top = vh - rect.height - padding;
      this.tooltipEl.style.left = left + 'px';
      this.tooltipEl.style.top = top + 'px';
    }

    hideTooltip() {
      this.tooltipEl.style.display = 'none';
    }
  }

  window.PFModal = new Modal();
})();


