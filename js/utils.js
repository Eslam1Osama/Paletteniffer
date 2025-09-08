
// Utility functions for the Color Palette Extractor

class Utils {
  // Color conversion utilities
  static rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  }

  static rgbToHex(r, g, b) {
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  static hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  // WCAG contrast ratio calculation
  static getLuminance(rgb) {
    const [r, g, b] = rgb.map(c => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  static getContrastRatio(color1, color2) {
    const lum1 = this.getLuminance(color1);
    const lum2 = this.getLuminance(color2);
    const brighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);
    
    return (brighter + 0.05) / (darker + 0.05);
  }

  static getWCAGLevel(contrastRatio) {
    if (contrastRatio >= 7) return 'AAA';
    if (contrastRatio >= 4.5) return 'AA';
    return 'FAIL';
  }

  // Clipboard utilities
  static async copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const result = document.execCommand('copy');
        textArea.remove();
        return result;
      }
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      return false;
    }
  }

  // Validation utilities
  static isValidUrl(string) {
    try {
      const url = new URL(string);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  static isValidImageFile(file) {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    return validTypes.includes(file.type);
  }

  // Image utilities
  static resizeImage(canvas, ctx, img, maxSize = 800) {
    let { width, height } = img;
    
    if (width > height && width > maxSize) {
      height = (height * maxSize) / width;
      width = maxSize;
    } else if (height > maxSize) {
      width = (width * maxSize) / height;
      height = maxSize;
    }

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);
    
    return { width, height };
  }

  // DOM utilities
  static createElement(tag, className = '', attributes = {}) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
    
    return element;
  }

  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  static throttle(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    }
  }

  // Storage utilities
  static saveToLocalStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
      return false;
    }
  }

  static loadFromLocalStorage(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to load from localStorage:', error);
      return null;
    }
  }

  // Animation utilities
  static animateValue(obj, prop, start, end, duration, easing = 'easeOutCubic') {
    const startTime = performance.now();
    
    const easingFunctions = {
      linear: t => t,
      easeOutCubic: t => 1 - Math.pow(1 - t, 3),
      easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    };
    
    const easingFn = easingFunctions[easing] || easingFunctions.easeOutCubic;
    
    function animate(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easingFn(progress);
      
      obj[prop] = start + (end - start) * easedProgress;
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }
    
    requestAnimationFrame(animate);
  }

  // Format utilities
  static formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  static formatPercentage(value, decimals = 1) {
    return (value * 100).toFixed(decimals) + '%';
  }

  // Error handling utilities
  static createError(message, type = 'Error') {
    const error = new Error(message);
    error.name = type;
    return error;
  }

  static handleError(error, context = '') {
    console.error(`Error${context ? ` in ${context}` : ''}:`, error);
    
    // You could extend this to send errors to a logging service
    return {
      message: error.message || 'An unexpected error occurred',
      type: error.name || 'Error',
      context
    };
  }

  // --- ASE Export ---
  /**
   * Export an array of color objects to Adobe ASE format (RGB swatches)
   * @param {Array} colors - Array of color objects with .hex property
   * @returns {Promise<Blob>} Resolves to a Blob containing the ASE file
   */
  static exportASE(colors) {
    return new Promise((resolve, reject) => {
      try {
        // Helper: Write string as UTF-16BE
        function writeUTF16BE(str) {
          const buf = new Uint8Array(str.length * 2);
          for (let i = 0; i < str.length; i++) {
            const code = str.charCodeAt(i);
            buf[i * 2] = code >> 8;
            buf[i * 2 + 1] = code & 0xff;
          }
          return buf;
        }
        // Helper: Write float32 BE
        function writeFloat32BE(val) {
          const buf = new ArrayBuffer(4);
          new DataView(buf).setFloat32(0, val, false);
          return new Uint8Array(buf);
        }
        // Helper: Write uint16 BE
        function writeUint16BE(val) {
          return new Uint8Array([val >> 8, val & 0xff]);
        }
        // Helper: Write uint32 BE
        function writeUint32BE(val) {
          return new Uint8Array([
            (val >> 24) & 0xff,
            (val >> 16) & 0xff,
            (val >> 8) & 0xff,
            val & 0xff
          ]);
        }
        // ASE header
        const header = [
          ...writeUTF16BE('ASEF'), // Signature
          ...writeUint16BE(1),     // Major version
          ...writeUint16BE(0),     // Minor version
        ];
        // Color blocks
        const colorBlocks = [];
        colors.forEach((color, i) => {
          // Swatch name: 'Color 1', 'Color 2', ...
          const name = `Color ${i + 1}`;
          const nameBytes = writeUTF16BE(name + '\0');
          // Block type: 0x0001 (color entry)
          colorBlocks.push(0x00, 0x01);
          // Block length: name (2 + n*2), model (4), 3*float32, color type (2)
          const blockLen = 2 + nameBytes.length + 4 + 3 * 4 + 2;
          colorBlocks.push(...writeUint32BE(blockLen));
          // Name length (in 16-bit chars, including null)
          colorBlocks.push(...writeUint16BE(name.length + 1));
          // Name bytes
          colorBlocks.push(...nameBytes);
          // Color model: 'RGB '\n
          colorBlocks.push(0x52, 0x47, 0x42, 0x20); // 'RGB '
          // Color values (float32 BE, 0..1)
          let r = 0, g = 0, b = 0;
          if (color.hex) {
            const hex = color.hex.replace('#', '');
            r = parseInt(hex.substring(0, 2), 16) / 255;
            g = parseInt(hex.substring(2, 4), 16) / 255;
            b = parseInt(hex.substring(4, 6), 16) / 255;
          }
          colorBlocks.push(...writeFloat32BE(r));
          colorBlocks.push(...writeFloat32BE(g));
          colorBlocks.push(...writeFloat32BE(b));
          // Color type: 0x0000 (global)
          colorBlocks.push(0x00, 0x00);
        });
        // Block count
        const blockCount = colors.length;
        const blockCountBytes = writeUint32BE(blockCount);
        // Final buffer
        const totalLen = header.length + 4 + colorBlocks.length;
        const ase = new Uint8Array(totalLen);
        ase.set(header, 0);
        ase.set(blockCountBytes, header.length);
        ase.set(colorBlocks, header.length + 4);
        resolve(new Blob([ase], { type: 'application/octet-stream' }));
      } catch (err) {
        reject(err);
      }
    });
  }
}

// Export for use in other modules
window.Utils = Utils;
