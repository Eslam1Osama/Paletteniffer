
// UI management and interaction handling

class UIManager {
  constructor() {
    this.colorExtractor = new ColorExtractor();
    this.currentPalette = null;
    this.isProcessing = false;
    this.currentFormat = 'hex';
    this.codeBlockVisible = false;
    this.initializeElements();
    this.attachEventListeners();
    this.initializeTheme();
  }

  initializeElements() {
    // Get DOM elements
    this.elements = {
      // Header
      themeToggle: document.getElementById('themeToggle'),
      exportBtn: document.getElementById('exportBtn'),
      exportDropdown: document.getElementById('exportDropdownContainer'),
      exportMenu: document.getElementById('exportMenu'),
      exportOptions: document.querySelectorAll('.export-option'),
      
      // Tabs
      tabBtns: document.querySelectorAll('.tab-btn'),
      tabPanes: document.querySelectorAll('.tab-pane'),
      
      // Image upload
      uploadArea: document.getElementById('uploadArea'),
      fileInput: document.getElementById('fileInput'),
      
      // URL analysis
      urlInput: document.getElementById('urlInput'),
      analyzeBtn: document.getElementById('analyzeBtn'),
      
      // Results
      loadingCard: document.getElementById('loadingCard'),
      resultsSection: document.getElementById('resultsSection'),
      previewCard: document.getElementById('previewCard'),
      previewImage: document.getElementById('previewImage'),
      
      // Color categories
      dominantColors: document.getElementById('dominantColors'),
      secondaryColors: document.getElementById('secondaryColors'),
      accentColors: document.getElementById('accentColors'),
      allColors: document.getElementById('allColors'),
      
      // Tooltip
      colorTooltip: document.getElementById('colorTooltip'),
      toastContainer: document.getElementById('toastContainer'),
      formatBtns: document.querySelectorAll('.format-btn'),
      copyAllBtn: document.getElementById('copyAllBtn'),
      showCodeBtn: document.getElementById('showCodeBtn'),
      paletteCodeBlock: document.getElementById('paletteCodeBlock')
    };
  }

  attachEventListeners() {
    // Theme toggle
    this.elements.themeToggle.addEventListener('click', () => this.toggleTheme());
    // Export dropdown logic
    if (this.elements.exportBtn && this.elements.exportDropdown && this.elements.exportMenu) {
      this.elements.exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const expanded = this.elements.exportDropdown.classList.toggle('open');
        this.elements.exportBtn.setAttribute('aria-expanded', expanded);
        this.elements.exportMenu.style.display = expanded ? 'block' : 'none';
        if (expanded) this.elements.exportMenu.focus();
      });
      // Option click
      this.elements.exportOptions.forEach(option => {
        option.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const type = option.getAttribute('data-type');
          this.exportPalette(type);
          this.elements.exportDropdown.classList.remove('open');
          this.elements.exportBtn.setAttribute('aria-expanded', 'false');
          this.elements.exportMenu.style.display = 'none';
        });
      });
      // Close on outside click
      document.addEventListener('click', (e) => {
        if (!this.elements.exportDropdown.contains(e.target)) {
          this.elements.exportDropdown.classList.remove('open');
          this.elements.exportBtn.setAttribute('aria-expanded', 'false');
          this.elements.exportMenu.style.display = 'none';
        }
      });
      // Close on Esc
      this.elements.exportMenu.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.elements.exportDropdown.classList.remove('open');
          this.elements.exportBtn.setAttribute('aria-expanded', 'false');
          this.elements.exportMenu.style.display = 'none';
          this.elements.exportBtn.focus();
        }
      });
    }
    
    // Tab switching
    this.elements.tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });
    
    // Image upload
    this.elements.uploadArea.addEventListener('click', () => this.elements.fileInput.click());
    this.elements.fileInput.addEventListener('change', (e) => this.handleImageUpload(e));
    
    // Drag and drop
    this.elements.uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
    this.elements.uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
    this.elements.uploadArea.addEventListener('drop', (e) => this.handleDrop(e));
    
    // URL analysis
    this.elements.analyzeBtn.addEventListener('click', () => this.handleUrlAnalysis());
    this.elements.urlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleUrlAnalysis();
    });
    
    // Global mouse events for tooltip
    document.addEventListener('mousemove', (e) => this.handleMouseMove(e));

    // Format toggle
    if (this.elements.formatBtns) {
      this.elements.formatBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          this.setFormat(btn.getAttribute('data-format'));
        });
      });
    }
    // Copy All
    if (this.elements.copyAllBtn) {
      this.elements.copyAllBtn.addEventListener('click', () => this.copyAllColors());
    }
    // Show Code
    if (this.elements.showCodeBtn) {
      this.elements.showCodeBtn.addEventListener('click', () => this.toggleCodeBlock());
    }
  }

  initializeTheme() {
    let savedTheme = localStorage.getItem('theme');
    try { savedTheme = JSON.parse(savedTheme); } catch (e) {}
    if (!savedTheme) savedTheme = 'light';
    this.setTheme(savedTheme);
    
    // Ensure logo is visible
    this.ensureLogoVisibility();
  }
  
  ensureLogoVisibility() {
    const logoImages = document.querySelectorAll('.logo-img');
    logoImages.forEach(img => {
      if (img.complete && img.naturalHeight === 0) {
        console.warn('Logo image failed to load:', img.src);
      }
    });
  }

  toggleTheme() {
    const currentTheme = document.body.dataset.theme || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    this.setTheme(newTheme);
  }

  setTheme(theme) {
    document.body.dataset.theme = theme;
    
    // Apply theme to body classes for cross-app compatibility
    if (theme === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    
    // Save to localStorage for cross-app persistence
    try {
      localStorage.setItem('theme', JSON.stringify(theme));
    } catch (e) {
      console.warn('Failed to save theme to localStorage:', e);
    }
    
    // Sync preloader if visible
    if (document.getElementById('platform-preloader')) {
      if (theme === 'dark') {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }
    }
    
    // Update custom SVG icons with cross-fade effect
    const sunIcon = this.elements.themeToggle.querySelector('.theme-icon-sun');
    const moonIcon = this.elements.themeToggle.querySelector('.theme-icon-moon');
    
    if (theme === 'light') {
      // Fade out sun, fade in moon
      sunIcon.classList.remove('active');
      moonIcon.classList.add('active');
    } else {
      // Fade out moon, fade in sun
      moonIcon.classList.remove('active');
      sunIcon.classList.add('active');
    }
    
    // Dispatch custom event for other components to listen
    window.dispatchEvent(new CustomEvent('themeChanged', { 
      detail: { theme: theme } 
    }));
  }

  switchTab(tabName) {
    // Update tab buttons
    this.elements.tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // Update tab panes
    this.elements.tabPanes.forEach(pane => {
      pane.classList.toggle('active', pane.id === `${tabName}-tab`);
    });
  }

  handleDragOver(e) {
    e.preventDefault();
    this.elements.uploadArea.classList.add('dragover');
  }

  handleDragLeave(e) {
    e.preventDefault();
    this.elements.uploadArea.classList.remove('dragover');
  }

  handleDrop(e) {
    e.preventDefault();
    this.elements.uploadArea.classList.remove('dragover');
    
    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => Utils.isValidImageFile(file));
    
    if (imageFile) {
      this.processImageFile(imageFile);
    } else {
      this.showToast('Please drop a valid image file (PNG, JPG, WebP)', 'error');
    }
  }

  async handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!Utils.isValidImageFile(file)) {
      this.showToast('Invalid file type. Please upload a PNG, JPG, or WebP image.', 'error');
      return;
    }

    await this.processImageFile(file);
  }

  async processImageFile(file) {
    try {
      this.setProcessingState(true);
      this.hideResults();
      
      // Show preview image
      const reader = new FileReader();
      reader.onload = (e) => {
        this.elements.previewImage.src = e.target.result;
        this.elements.previewCard.style.display = 'block';
      };
      reader.readAsDataURL(file);
      
      // Extract colors
      const palette = await this.colorExtractor.extractColorsFromImage(file);
      
      this.currentPalette = palette;
      this.displayPalette(palette);
      this.setProcessingState(false);
      this.showResults();
      
      this.showToast(`Colors extracted successfully! Found ${this.getTotalColorCount(palette)} unique colors.`, 'success');
      
    } catch (error) {
      this.setProcessingState(false);
      const errorInfo = Utils.handleError(error, 'Image Processing');
      this.showToast(errorInfo.message, 'error');
    }
  }

  async handleUrlAnalysis() {
    const url = this.elements.urlInput.value.trim();
    
    if (!url) {
      this.showToast('Please enter a valid URL', 'warning');
      return;
    }
    
    if (!Utils.isValidUrl(url)) {
      this.showToast('Please enter a valid HTTP or HTTPS URL', 'error');
      return;
    }

    try {
      this.setProcessingState(true);
      this.hideResults();
      this.elements.previewCard.style.display = 'none';
      
      // Extract colors from URL
      const palette = await this.colorExtractor.extractColorsFromUrl(url);
      
      // Patch: Use palette.colorPalette if present
      const paletteForDisplay = palette && palette.colorPalette ? palette.colorPalette : palette;
      this.currentPalette = paletteForDisplay;
      this.displayPalette(paletteForDisplay);
      this.setProcessingState(false);
      this.showResults();

      // Show a warning if this is a generated fallback palette (not real site colors)
      if (
        paletteForDisplay &&
        Array.isArray(paletteForDisplay.dominant) && paletteForDisplay.dominant.length === 2 &&
        Array.isArray(paletteForDisplay.secondary) && paletteForDisplay.secondary.length === 2 &&
        Array.isArray(paletteForDisplay.accent) && paletteForDisplay.accent.length === 2 &&
        paletteForDisplay.dominant.every(c => c.frequency === 0.5 || c.frequency === 0.3) &&
        paletteForDisplay.secondary.every(c => c.frequency === 0.2 || c.frequency === 0.15) &&
        paletteForDisplay.accent.every(c => c.frequency === 0.1 || c.frequency === 0.08)
      ) {
        this.showToast('Could not extract real colors from this website. Showing a generated palette instead.', 'warning');
      }

      this.showToast(`Website analyzed! Extracted color palette from ${url}`, 'success');
      
    } catch (error) {
      this.setProcessingState(false);
      const errorInfo = Utils.handleError(error, 'URL Analysis');
      this.showToast(errorInfo.message, 'error');
    }
  }

  setFormat(format) {
    this.currentFormat = format;
    // Update ARIA and active state
    this.elements.formatBtns.forEach(btn => {
      btn.setAttribute('aria-checked', btn.getAttribute('data-format') === format ? 'true' : 'false');
      btn.classList.toggle('active', btn.getAttribute('data-format') === format);
    });
    // Re-render palette
    if (this.currentPalette) this.displayPalette(this.currentPalette);
  }

  displayPalette(palette) {
    if (!palette || typeof palette !== 'object') return;
    this.renderColorCategory('dominant', Array.isArray(palette.dominant) ? palette.dominant : [], 'large');
    this.renderColorCategory('secondary', Array.isArray(palette.secondary) ? palette.secondary : [], 'medium');
    this.renderColorCategory('accent', Array.isArray(palette.accent) ? palette.accent : [], 'small');
    // Show all extracted colors in a new section for deep detail
    if (Array.isArray(palette.all)) {
      this.renderColorCategory('all', palette.all, 'small');
    }
    // If code block is visible, update it
    if (this.codeBlockVisible) this.renderCodeBlock();
  }

  renderColorCategory(categoryName, colors, size) {
    const categoryElement = this.elements[`${categoryName}Colors`];
    if (!categoryElement) return;
    const swatchesContainer = categoryElement.querySelector('.color-swatches');
    swatchesContainer.innerHTML = '';
    if (!Array.isArray(colors) || colors.length === 0) {
      categoryElement.style.display = 'none';
      return;
    }
    categoryElement.style.display = 'block';
    colors.forEach((color, index) => {
      const card = this.createColorCard(color, categoryName, index);
      swatchesContainer.appendChild(card);
      setTimeout(() => {
        card.classList.add('slide-in');
      }, index * 100);
    });
  }

  createColorCard(color, category, index) {
    // Card container
    const card = Utils.createElement('div', 'color-card');
    // Swatch
    const swatch = Utils.createElement('div', 'color-sample');
    swatch.style.backgroundColor = color.hex;
    swatch.setAttribute('aria-label', `Color sample for ${color.hex}`);
    // Meta
    const meta = Utils.createElement('div', 'color-meta');
    // Variable name
    const varName = `--color-${category}-${index+1}`;
    const varLabel = Utils.createElement('div', 'color-var');
    varLabel.textContent = varName;
    // Code
    const codeValue = this.getColorValue(color, this.currentFormat);
    const codeRow = Utils.createElement('div', 'color-code');
    codeRow.textContent = codeValue;
    // Copy button
    const copyBtn = Utils.createElement('button', 'color-copy-btn');
    copyBtn.setAttribute('aria-label', `Copy ${this.currentFormat.toUpperCase()} value`);
    copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
    copyBtn.tabIndex = 0;
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.copyColorValue(color, this.currentFormat, card);
    });
    copyBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.copyColorValue(color, this.currentFormat, card);
      }
    });
    codeRow.appendChild(copyBtn);
    // Assemble
    meta.appendChild(varLabel);
    meta.appendChild(codeRow);
    card.appendChild(swatch);
    card.appendChild(meta);
    // --- Hover Card ---
    const hoverCard = Utils.createElement('div', 'color-hover-card');
    // Codes
    const codes = Utils.createElement('div', 'color-hover-codes');
    codes.innerHTML =
      `<div><strong>HEX:</strong> ${color.hex}</div>` +
      `<div><strong>RGB:</strong> rgb(${color.rgb.join(', ')})</div>` +
      `<div><strong>HSL:</strong> hsl(${color.hsl[0]}, ${color.hsl[1]}%, ${color.hsl[2]}%)</div>`;
    hoverCard.appendChild(codes);
    // WCAG badge
    const analyzed = this.colorExtractor.analyzeColor(color);
    const badge = Utils.createElement('span', 'color-hover-badge ' + analyzed.wcagLevel.toLowerCase());
    badge.textContent = analyzed.wcagLevel;
    hoverCard.appendChild(badge);
    // Arrow
    const arrow = Utils.createElement('div', 'color-hover-card-arrow');
    arrow.innerHTML = '<svg viewBox="0 0 18 10"><polygon points="0,0 9,10 18,0" fill="var(--bg-glass, #fff)"/></svg>';
    hoverCard.appendChild(arrow);
    card.appendChild(hoverCard);
    // Show/hide hover card on card hover/focus
    card.addEventListener('mouseenter', () => { hoverCard.style.display = 'block'; });
    card.addEventListener('mouseleave', () => { hoverCard.style.display = 'none'; });
    card.addEventListener('focusin', () => { hoverCard.style.display = 'block'; });
    card.addEventListener('focusout', () => { hoverCard.style.display = 'none'; });
    hoverCard.style.display = 'none';
    return card;
  }

  getColorValue(color, format) {
    if (format === 'hex') return color.hex;
    if (format === 'rgb') return `rgb(${color.rgb.join(', ')})`;
    if (format === 'hsl') return `hsl(${color.hsl[0]}, ${color.hsl[1]}%, ${color.hsl[2]}%)`;
    return color.hex;
  }

  async copyColorValue(color, format, swatchElement) {
    const value = this.getColorValue(color, format);
    const success = await Utils.copyToClipboard(value);
    if (success) {
      swatchElement.classList.add('copied');
      setTimeout(() => {
        swatchElement.classList.remove('copied');
      }, 2000);
      this.showToast(`${value} copied to clipboard!`, 'success');
    } else {
      this.showToast('Failed to copy color to clipboard', 'error');
    }
  }

  copyAllColors() {
    if (!this.currentPalette) return;
    const allColors = [
      ...(Array.isArray(this.currentPalette.dominant) ? this.currentPalette.dominant : []),
      ...(Array.isArray(this.currentPalette.secondary) ? this.currentPalette.secondary : []),
      ...(Array.isArray(this.currentPalette.accent) ? this.currentPalette.accent : []),
      ...(Array.isArray(this.currentPalette.all) ? this.currentPalette.all : [])
    ];
    const values = allColors.map(color => this.getColorValue(color, this.currentFormat));
    const text = values.join(', ');
    Utils.copyToClipboard(text).then(success => {
      if (success) {
        this.showToast('All colors copied!', 'success');
      } else {
        this.showToast('Failed to copy colors', 'error');
      }
    });
  }

  toggleCodeBlock() {
    this.codeBlockVisible = !this.codeBlockVisible;
    this.elements.paletteCodeBlock.style.display = this.codeBlockVisible ? 'block' : 'none';
    if (this.codeBlockVisible) this.renderCodeBlock();
  }

  renderCodeBlock() {
    if (!this.currentPalette) return;
    const allColors = [
      ...(Array.isArray(this.currentPalette.dominant) ? this.currentPalette.dominant : []),
      ...(Array.isArray(this.currentPalette.secondary) ? this.currentPalette.secondary : []),
      ...(Array.isArray(this.currentPalette.accent) ? this.currentPalette.accent : []),
      ...(Array.isArray(this.currentPalette.all) ? this.currentPalette.all : [])
    ];
    // CSS Variables
    let cssVars = ':root {\n';
    allColors.forEach((color, i) => {
      cssVars += `  --color-palette-${i+1}: ${color.hex};\n`;
    });
    cssVars += '}\n';
    // SCSS
    let scssVars = '';
    allColors.forEach((color, i) => {
      scssVars += `$color-palette-${i+1}: ${color.hex};\n`;
    });
    // Tailwind config
    let tailwind = 'module.exports = {\n  theme: {\n    extend: {\n      colors: {\n';
    allColors.forEach((color, i) => {
      tailwind += `        palette${i+1}: '${color.hex}',\n`;
    });
    tailwind += '      }\n    }\n  }\n}\n';
    // JSON
    let json = JSON.stringify(allColors.map(c => c.hex), null, 2);
    // Render
    this.elements.paletteCodeBlock.innerHTML =
      `<div style="margin-bottom:0.7em;"><strong>CSS Variables</strong></div><pre><code>${cssVars}</code></pre>` +
      `<div style="margin-bottom:0.7em;"><strong>SCSS</strong></div><pre><code>${scssVars}</code></pre>` +
      `<div style="margin-bottom:0.7em;"><strong>Tailwind Config</strong></div><pre><code>${tailwind}</code></pre>` +
      `<div style="margin-bottom:0.7em;"><strong>JSON</strong></div><pre><code>${json}</code></pre>`;
  }

  async copyColor(color, swatchElement) {
    const success = await Utils.copyToClipboard(color.hex);
    
    if (success) {
      // Visual feedback
      swatchElement.classList.add('copied');
      setTimeout(() => {
        swatchElement.classList.remove('copied');
      }, 2000);
      
      this.showToast(`${color.hex} copied to clipboard!`, 'success');
    } else {
      this.showToast('Failed to copy color to clipboard', 'error');
    }
  }

  showColorTooltip(e, color) {
    const tooltip = this.elements.colorTooltip;
    const analyzedColor = this.colorExtractor.analyzeColor(color);
    
    // Update tooltip content
    tooltip.querySelector('.hex').textContent = analyzedColor.hex;
    tooltip.querySelector('.rgb').textContent = `RGB(${analyzedColor.rgb.join(', ')})`;
    tooltip.querySelector('.hsl').textContent = `HSL(${analyzedColor.hsl[0]}, ${analyzedColor.hsl[1]}%, ${analyzedColor.hsl[2]}%)`;
    
    const wcagBadge = tooltip.querySelector('.wcag-badge');
    wcagBadge.textContent = analyzedColor.wcagLevel;
    wcagBadge.className = `wcag-badge ${analyzedColor.wcagLevel.toLowerCase()}`;
    
    tooltip.querySelector('.frequency').textContent = Utils.formatPercentage(analyzedColor.frequency);
    
    // Position and show tooltip
    tooltip.style.display = 'block';
    this.positionTooltip(tooltip, e);
  }

  positionTooltip(tooltip, e) {
    const rect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let left = e.clientX - rect.width / 2;
    let top = e.clientY - rect.height - 10;
    
    // Adjust if tooltip goes off screen
    if (left < 10) left = 10;
    if (left + rect.width > viewportWidth - 10) left = viewportWidth - rect.width - 10;
    if (top < 10) top = e.clientY + 10;
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  hideColorTooltip() {
    this.elements.colorTooltip.style.display = 'none';
  }

  handleMouseMove(e) {
    if (this.elements.colorTooltip.style.display === 'block') {
      this.positionTooltip(this.elements.colorTooltip, e);
    }
  }

  setProcessingState(isProcessing) {
    this.isProcessing = isProcessing;
    this.elements.loadingCard.style.display = isProcessing ? 'block' : 'none';
    
    // Disable inputs during processing
    this.elements.analyzeBtn.disabled = isProcessing;
    this.elements.fileInput.disabled = isProcessing;
  }

  showResults() {
    this.elements.resultsSection.style.display = 'block';
    this.elements.resultsSection.classList.add('fade-in');
    if (this.elements.exportDropdown) this.elements.exportDropdown.style.display = 'inline-block';
  }

  hideResults() {
    this.elements.resultsSection.style.display = 'none';
    this.elements.resultsSection.classList.remove('fade-in');
    if (this.elements.exportDropdown) this.elements.exportDropdown.style.display = 'none';
  }

  exportPalette(type = 'json') {
    if (!this.currentPalette) {
      this.showToast('No palette to export', 'warning');
      return;
    }
    const dominant = Array.isArray(this.currentPalette.dominant) ? this.currentPalette.dominant : [];
    const secondary = Array.isArray(this.currentPalette.secondary) ? this.currentPalette.secondary : [];
    const accent = Array.isArray(this.currentPalette.accent) ? this.currentPalette.accent : [];
    const allColors = Array.isArray(this.currentPalette.all) && this.currentPalette.all.length > 0
      ? this.currentPalette.all
      : [ ...dominant, ...secondary, ...accent ];
    let blob, url, a;
    switch(type) {
      case 'json': {
    const paletteData = {
      timestamp: new Date().toISOString(),
      totalColors: allColors.length,
      categories: {
        dominant: dominant.length,
        secondary: secondary.length,
        accent: accent.length
      },
      colors: allColors.map(color => ({
        hex: color.hex,
        rgb: color.rgb,
        hsl: color.hsl,
        frequency: color.frequency
      }))
    };
        blob = new Blob([JSON.stringify(paletteData, null, 2)], { type: 'application/json' });
        url = URL.createObjectURL(blob);
        a = document.createElement('a');
    a.href = url;
    a.download = `color-palette-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
        this.showToast('Palette exported as JSON!', 'success');
        break;
      }
      case 'css': {
        let cssVars = ':root {\n';
        allColors.forEach((color, i) => {
          cssVars += `  --color-palette-${i+1}: ${color.hex};\n`;
        });
        cssVars += '}\n';
        blob = new Blob([cssVars], { type: 'text/css' });
        url = URL.createObjectURL(blob);
        a = document.createElement('a');
        a.href = url;
        a.download = `color-palette-${Date.now()}.css`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Palette exported as CSS!', 'success');
        break;
      }
      case 'svg': {
        let svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${allColors.length*40}' height='40'>`;
        allColors.forEach((color, i) => {
          svg += `<rect x='${i*40}' y='0' width='40' height='40' fill='${color.hex}' />`;
        });
        svg += '</svg>';
        blob = new Blob([svg], { type: 'image/svg+xml' });
        url = URL.createObjectURL(blob);
        a = document.createElement('a');
        a.href = url;
        a.download = `color-palette-${Date.now()}.svg`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Palette exported as SVG!', 'success');
        break;
      }
      case 'png': {
        // Use hidden canvas
        const canvas = document.getElementById('hiddenCanvas');
        const ctx = canvas.getContext('2d');
        canvas.width = allColors.length * 40;
        canvas.height = 40;
        allColors.forEach((color, i) => {
          ctx.fillStyle = color.hex;
          ctx.fillRect(i*40, 0, 40, 40);
        });
        canvas.toBlob((blob) => {
          url = URL.createObjectURL(blob);
          a = document.createElement('a');
          a.href = url;
          a.download = `color-palette-${Date.now()}.png`;
          a.click();
          URL.revokeObjectURL(url);
          this.showToast('Palette exported as PNG!', 'success');
        });
        break;
      }
      case 'ase': {
        // ASE export logic (assume implemented elsewhere)
        if (typeof Utils.exportASE === 'function') {
          Utils.exportASE(allColors).then((blob) => {
            url = URL.createObjectURL(blob);
            a = document.createElement('a');
            a.href = url;
            a.download = `color-palette-${Date.now()}.ase`;
            a.click();
            URL.revokeObjectURL(url);
            this.showToast('Palette exported as ASE!', 'success');
          }).catch(() => {
            this.showToast('Failed to export ASE file', 'error');
          });
        } else {
          this.showToast('ASE export not supported', 'error');
        }
        break;
      }
      default: {
        this.showToast('Unknown export type', 'error');
      }
    }
  }

  getTotalColorCount(palette) {
    // Patch: Use palette as flat palette
    const dominant = Array.isArray(palette.dominant) ? palette.dominant : [];
    const secondary = Array.isArray(palette.secondary) ? palette.secondary : [];
    const accent = Array.isArray(palette.accent) ? palette.accent : [];
    const all = Array.isArray(palette.all) ? palette.all : [];
    return dominant.length + secondary.length + accent.length + all.length;
  }

  showToast(message, type = 'info') {
    const toast = Utils.createElement('div', `toast ${type}`);
    toast.textContent = message;
    
    this.elements.toastContainer.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => {
      toast.classList.add('show');
    }, 100);
    
    // Remove toast after delay
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 4000);
  }
}

// Export for use in other modules
window.UIManager = UIManager;
