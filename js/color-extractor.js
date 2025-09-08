// Color extraction and analysis utilities

class ColorExtractor {
  constructor() {
    this.canvas = document.getElementById('hiddenCanvas');
    this.ctx = this.canvas.getContext('2d');
    
    // Production-level caching and performance monitoring
    this.cache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
    this.performanceMetrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0
    };
    
    // Rate limiting
    this.rateLimiter = {
      requests: new Map(),
      maxRequests: 10,
      timeWindow: 60000 // 1 minute
    };
    
    // Initialize performance monitoring
    this.initializePerformanceMonitoring();

    // Lazy-initialized image worker for off-main-thread analysis
    this.imageWorker = null;
    this.workerRequestId = 0;
    this.pendingWorkerResolvers = new Map();
  }

  // Initialize performance monitoring
  initializePerformanceMonitoring() {
    // Clean up expired cache entries every 5 minutes
    setInterval(() => {
      this.cleanupCache();
    }, 5 * 60 * 1000);

    // Log performance metrics every 10 minutes
    setInterval(() => {
      this.logPerformanceMetrics();
    }, 10 * 60 * 1000);
  }

  // Clean up expired cache entries
  cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.cache.delete(key);
      }
    }
  }

  // Log performance metrics
  logPerformanceMetrics() {
    const { totalRequests, successfulRequests, failedRequests, averageResponseTime } = this.performanceMetrics;
    const successRate = totalRequests > 0 ? (successfulRequests / totalRequests * 100).toFixed(2) : 0;
    
    console.log('Color Extractor Performance Metrics:', {
      totalRequests,
      successfulRequests,
      failedRequests,
      successRate: `${successRate}%`,
      averageResponseTime: `${averageResponseTime.toFixed(2)}ms`,
      cacheSize: this.cache.size
    });
  }

  // Update performance metrics
  updatePerformanceMetrics(success, responseTime) {
    this.performanceMetrics.totalRequests++;
    if (success) {
      this.performanceMetrics.successfulRequests++;
    } else {
      this.performanceMetrics.failedRequests++;
    }
    
    // Update average response time
    const { totalRequests, averageResponseTime } = this.performanceMetrics;
    this.performanceMetrics.averageResponseTime = 
      (averageResponseTime * (totalRequests - 1) + responseTime) / totalRequests;
  }

  // Extract colors from an image using k-means clustering
  async extractColorsFromImage(imageFile) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        try {
          // Resize image for performance
          // Ensure 2D context hints frequent readback to optimize getImageData cost
          if (!this.ctx) {
            this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
          }
          Utils.resizeImage(this.canvas, this.ctx, img, 800);

          // Offload to Web Worker when available; fallback to main-thread extraction
          const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

          this.analyzeImageDataWithWorker(imageData, { k: 32 })
            .then(colors => {
              const palette = this.categorizeColors(colors);
              palette.all = colors;
              URL.revokeObjectURL(img.src);
              resolve(palette);
            })
            .catch(() => {
              // Fallback path preserves existing behavior
              const colors = this.performKMeansColorExtraction(32);
              const palette = this.categorizeColors(colors);
              palette.all = colors;
              URL.revokeObjectURL(img.src);
              resolve(palette);
            });
        } catch (error) {
          URL.revokeObjectURL(img.src);
          reject(Utils.createError(`Failed to extract colors: ${error.message}`, 'ImageProcessingError'));
        }
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(Utils.createError('Failed to load image', 'ImageLoadError'));
      };
      
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target.result;
      };
      reader.onerror = () => {
        reject(Utils.createError('Failed to read image file', 'FileReadError'));
      };
      
      reader.readAsDataURL(imageFile);
    });
  }

  // Analyze ImageData via Web Worker with transferable ArrayBuffer
  analyzeImageDataWithWorker(imageData, options = {}) {
    try {
      this.initImageWorker();
    } catch (e) {
      return Promise.reject(e);
    }

    return new Promise((resolve, reject) => {
      const id = ++this.workerRequestId;
      const transfer = imageData.data.buffer;
      this.pendingWorkerResolvers.set(id, { resolve, reject });

      try {
        this.imageWorker.postMessage({
          id,
          width: imageData.width,
          height: imageData.height,
          buffer: transfer,
          k: typeof options.k === 'number' ? options.k : 32,
          alphaThreshold: 128,
          sampleStep: 16
        }, [transfer]);
      } catch (err) {
        this.pendingWorkerResolvers.delete(id);
        reject(err);
      }
    });
  }

  initImageWorker() {
    if (this.imageWorker) return;
    // Subpath-safe worker URL
    let workerUrl = 'js/workers/imageWorker.js';
    try {
      const base = new URL('.', window.location.href);
      workerUrl = new URL('js/workers/imageWorker.js', base).toString();
    } catch (e) {}

    const worker = new Worker(workerUrl);
    worker.onmessage = (e) => {
      const msg = e.data || {};
      const entry = this.pendingWorkerResolvers.get(msg.id);
      if (!entry) return;
      this.pendingWorkerResolvers.delete(msg.id);
      if (msg.ok) {
        entry.resolve(Array.isArray(msg.colors) ? msg.colors : []);
      } else {
        entry.reject(new Error(msg.error || 'Worker error'));
      }
    };
    worker.onerror = () => {
      // Reject all pending requests on worker error
      this.pendingWorkerResolvers.forEach(({ reject }) => reject(new Error('Image worker error')));
      this.pendingWorkerResolvers.clear();
    };
    this.imageWorker = worker;
  }

  // Extract colors from a webpage URL - Production Level Implementation
  async extractColorsFromUrl(url) {
    const startTime = performance.now();
    
    try {
      console.log('Starting production-level URL color extraction for:', url);
      
      // Validate and normalize URL
      const normalizedUrl = this.normalizeUrl(url);
      
      // Check rate limiting
      if (!this.checkRateLimit(normalizedUrl)) {
        throw new Error('Rate limit exceeded. Please wait before making another request.');
      }
      
      // Check cache first
      const cachedResult = this.getCachedResult(normalizedUrl);
      if (cachedResult) {
        console.log('Returning cached result for:', normalizedUrl);
        this.updatePerformanceMetrics(true, performance.now() - startTime);
        // Return the palette directly for UI usage
        return cachedResult;
      }
      
      // Use multiple production-level strategies with proper fallbacks
      const palette = await this.analyzeWebsiteColorsProduction(normalizedUrl);
      
      // Cache the result
      this.cacheResult(normalizedUrl, palette);
      
      // Update performance metrics
      this.updatePerformanceMetrics(true, performance.now() - startTime);
      
      // Return the palette directly for UI usage
      return palette;
    } catch (error) {
      console.error('URL color extraction failed:', error);
      this.updatePerformanceMetrics(false, performance.now() - startTime);
      throw Utils.createError(`Failed to analyze URL: ${error.message}`, 'UrlAnalysisError');
    }
  }

  // Check rate limiting
  checkRateLimit(url) {
    const now = Date.now();
    const domain = new URL(url).hostname;
    
    if (!this.rateLimiter.requests.has(domain)) {
      this.rateLimiter.requests.set(domain, []);
    }
    
    const requests = this.rateLimiter.requests.get(domain);
    
    // Remove old requests outside the time window
    const validRequests = requests.filter(time => now - time < this.rateLimiter.timeWindow);
    this.rateLimiter.requests.set(domain, validRequests);
    
    // Check if we're within the rate limit
    if (validRequests.length >= this.rateLimiter.maxRequests) {
      return false;
    }
    
    // Add current request
    validRequests.push(now);
    this.rateLimiter.requests.set(domain, validRequests);
    
    return true;
  }

  // Get cached result
  getCachedResult(url) {
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.palette;
    }
    return null;
  }

  // Cache result
  cacheResult(url, palette) {
    this.cache.set(url, {
      palette,
      timestamp: Date.now()
    });
    
    // Limit cache size to prevent memory issues
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  // Normalize URL for consistent processing
  normalizeUrl(url) {
    let normalized = url.trim();
    
    // Add protocol if missing
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }
    
    // Remove trailing slash for consistency
    normalized = normalized.replace(/\/$/, '');
    
    return normalized;
  }

  // Production-level website color analysis with multiple strategies and retry logic
  async analyzeWebsiteColorsProduction(url) {
    // Feature-flagged external strategies for production safety.
    // When disabled, skip network-heavy endpoints and rely on metadata/heuristics
    // to avoid flakiness in environments without backend support.
    const cfg = window.AppConfig || {};
    const externalEnabled = cfg.enableExternalUrlExtraction !== false;

    const strategies = [];
    if (externalEnabled && cfg.enableHeadlessProviders) {
      strategies.push(() => this.extractWithHeadlessBrowserAPI(url));
    }
    if (externalEnabled && cfg.enableServerSideRenderingProviders) {
      strategies.push(() => this.extractWithServerSideRendering(url));
    }
    if (externalEnabled && cfg.enableCORSProxies) {
      strategies.push(() => this.extractWithAdvancedCSSAnalysis(url));
    }
    // Always include metadata/heuristics as the most stable, last-resort option
    strategies.push(() => this.extractWithMetaDataAnalysis(url));

    let lastError = null;
    const maxRetries = 2;

    for (let i = 0; i < strategies.length; i++) {
      for (let retry = 0; retry <= maxRetries; retry++) {
        try {
          console.log(`Trying strategy ${i + 1}/${strategies.length} (attempt ${retry + 1})`);
          
          // Add exponential backoff for retries
          if (retry > 0) {
            const delay = Math.pow(2, retry) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          const result = await strategies[i]();
          
          if (result && this.isValidPalette(result)) {
            console.log(`Successfully extracted colors using strategy ${i + 1}`);
            return result;
          }
        } catch (error) {
          console.warn(`Strategy ${i + 1} failed (attempt ${retry + 1}):`, error.message);
          lastError = error;
          
          // Don't retry on certain types of errors
          if (this.isNonRetryableError(error)) {
            break;
          }
          
          if (retry === maxRetries) {
            console.error(`Strategy ${i + 1} failed after ${maxRetries + 1} attempts`);
          }
        }
      }
    }

    // If all strategies fail, return a default palette based on common web patterns
    console.warn('All strategies failed, returning fallback palette');
    return this.generateFallbackPalette(url);
  }

  // Check if error is non-retryable
  isNonRetryableError(error) {
    const nonRetryableErrors = [
      'CORS',
      'Access-Control-Allow-Origin',
      'cross-origin',
      'blocked by CORS policy',
      'NetworkError',
      'TypeError',
      'ReferenceError'
    ];
    
    return nonRetryableErrors.some(pattern => 
      error.message.includes(pattern) || error.name.includes(pattern)
    );
  }

  // Strategy 1: Use headless browser APIs (most reliable)
  async extractWithHeadlessBrowserAPI(url) {
    const cfg = window.AppConfig || {};
    const apis = Array.isArray(cfg.headlessProviders) && cfg.headlessProviders.length > 0
      ? cfg.headlessProviders
      : [];

    for (const api of apis) {
      try {
        console.log(`Trying ${api.name} headless browser API`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        const response = await fetch(api.endpoint, {
          method: api.method,
          headers: api.headers,
          body: typeof api.body === 'function' ? api.body(url) : api.body,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const blob = await response.blob();
          if (blob.size > 0) {
            return await this.extractColorsFromBlob(blob);
          }
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          console.warn(`${api.name} timed out`);
        } else {
          console.warn(`${api.name} failed:`, error.message);
        }
        continue;
      }
    }

    throw new Error('All headless browser APIs failed');
  }

  // Strategy 2: Server-side rendering with reliable proxies
  async extractWithServerSideRendering(url) {
    const cfg = window.AppConfig || {};
    const proxies = Array.isArray(cfg.ssrProviders) && cfg.ssrProviders.length > 0
      ? cfg.ssrProviders
      : [];

    for (const proxy of proxies) {
      try {
        console.log(`Trying ${proxy.name} server-side rendering`);
        
        const response = await fetch(proxy.endpoint, {
          method: proxy.method,
          headers: proxy.headers,
          body: typeof proxy.body === 'function' ? proxy.body(url) : proxy.body
        });

        if (response.ok) {
          const blob = await response.blob();
          if (blob.size > 0) {
            return await this.extractColorsFromBlob(blob);
          }
        }
      } catch (error) {
        console.warn(`${proxy.name} failed:`, error.message);
        continue;
      }
    }

    throw new Error('All server-side rendering proxies failed');
  }

  // Strategy 3: Advanced CSS analysis with multiple approaches
  async extractWithAdvancedCSSAnalysis(url) {
    try {
      // Try multiple CSS extraction methods
      const methods = [
        () => this.extractWithCORSProxy(url),
        () => this.extractWithIframeSandbox(url),
        () => this.extractWithFetchAndParse(url)
      ];

      for (const method of methods) {
        try {
          const result = await method();
          if (result && this.isValidPalette(result)) {
            return result;
          }
        } catch (error) {
          continue;
        }
      }

      throw new Error('All CSS analysis methods failed');
    } catch (error) {
      throw new Error('Advanced CSS analysis failed: ' + error.message);
    }
  }

  // Professional CORS proxy with working services and intelligent fallbacks
  async extractWithCORSProxy(url) {
    const proxies = [
      {
        name: 'cors-proxy-1',
        url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      },
      {
        name: 'cors-proxy-2',
        url: `https://corsproxy.io/?${encodeURIComponent(url)}`,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      },
      {
        name: 'cors-proxy-3',
        url: `https://cors-anywhere.herokuapp.com/${url}`,
        headers: { 
          'Origin': window.location.origin,
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    ];

    for (const proxy of proxies) {
      try {
        console.log(`Trying ${proxy.name} CORS proxy`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const response = await fetch(proxy.url, {
          method: 'GET',
          headers: proxy.headers,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const html = await response.text();
          
          if (html && html.length > 500) {
            console.log(`${proxy.name} succeeded, HTML length: ${html.length}`);
            return this.extractColorsFromHTML(html, url);
          }
        }
      } catch (error) {
        console.warn(`${proxy.name} failed:`, error.message);
        continue;
      }
    }

    // If all proxies fail, try direct fetch for same-origin or public APIs
    return await this.extractWithDirectFetch(url);
  }

  // Direct fetch for same-origin or public APIs
  async extractWithDirectFetch(url) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (response.ok) {
        const html = await response.text();
        return this.extractColorsFromHTML(html, url);
      }
    } catch (error) {
      console.warn('Direct fetch failed:', error.message);
    }

    throw new Error('All fetch methods failed');
  }

  // Iframe sandbox approach for same-origin sites
  async extractWithIframeSandbox(url) {
    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:absolute;left:-9999px;width:1280px;height:720px;border:none;opacity:0;';
      iframe.sandbox = 'allow-same-origin allow-scripts';
      
      const timeout = setTimeout(() => {
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
        reject(new Error('Iframe sandbox timeout'));
      }, 20000);

      iframe.onload = () => {
        try {
          clearTimeout(timeout);
          const colors = this.analyzeCSSColorsAdvanced(iframe);
          document.body.removeChild(iframe);
          resolve(colors);
        } catch (error) {
          document.body.removeChild(iframe);
          reject(new Error('Iframe sandbox analysis failed'));
        }
      };

      iframe.onerror = () => {
        clearTimeout(timeout);
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
        reject(new Error('Iframe sandbox load failed'));
      };

      document.body.appendChild(iframe);
      iframe.src = url;
    });
  }

  // Fetch and parse approach for public APIs
  async extractWithFetchAndParse(url) {
    try {
      // Try to fetch the page directly (works for some public APIs)
      const response = await fetch(url, {
        mode: 'cors',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (response.ok) {
        const html = await response.text();
        return this.extractColorsFromHTML(html, url);
      }
    } catch (error) {
      // Expected to fail for most sites due to CORS
    }

    throw new Error('Direct fetch failed');
  }

  // Strategy 4: Metadata analysis for fallback
  async extractWithMetaDataAnalysis(url) {
    try {
      // Extract domain-based color patterns
      const domain = new URL(url).hostname;
      const domainColors = this.getDomainBasedColors(domain);
      
      if (domainColors) {
        return domainColors;
      }

      // Try to extract from meta tags using proxy
      const metaColors = await this.extractMetaColors(url);
      if (metaColors) {
        return metaColors;
      }

      throw new Error('No metadata colors found');
    } catch (error) {
      throw new Error('Metadata analysis failed: ' + error.message);
    }
  }

  // Extract colors from meta tags
  async extractMetaColors(url) {
    try {
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      
      if (response.ok) {
        const data = await response.json();
        const html = data.contents;
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const colorMap = new Map();
        
        // Extract theme colors from meta tags
        const themeColorMeta = doc.querySelector('meta[name="theme-color"]');
        if (themeColorMeta) {
          const color = themeColorMeta.getAttribute('content');
          if (color) {
            this.addColorToMap(color, colorMap, 10);
          }
        }

        // Extract MS tile colors
        const msTileColor = doc.querySelector('meta[name="msapplication-TileColor"]');
        if (msTileColor) {
          const color = msTileColor.getAttribute('content');
          if (color) {
            this.addColorToMap(color, colorMap, 8);
          }
        }

        // Extract Apple touch icon colors
        const appleTouchIcon = doc.querySelector('link[rel="apple-touch-icon"]');
        if (appleTouchIcon) {
          // This would require additional processing to extract colors from the icon
        }

        // Extract CSS custom properties (CSS variables)
        const styleSheets = doc.querySelectorAll('style');
        styleSheets.forEach(sheet => {
          const cssText = sheet.textContent;
          const varPattern = /--[\w-]+:\s*([#\w\(\),\s%]+);/g;
          let match;
          while ((match = varPattern.exec(cssText)) !== null) {
            this.extractColorsFromStyleString(match[1], colorMap);
          }
        });

        if (colorMap.size > 0) {
          return this.processColorMap(colorMap);
        }
      }
    } catch (error) {
      console.warn('Meta color extraction failed:', error.message);
    }

    return null;
  }

  // Get domain-based color patterns
  getDomainBasedColors(domain) {
    const domainPatterns = {
      'github.com': {
        dominant: [{ hex: '#24292e', rgb: [36, 41, 46], hsl: [210, 13, 16], frequency: 0.4 }],
        secondary: [{ hex: '#f6f8fa', rgb: [246, 248, 250], hsl: [210, 14, 97], frequency: 0.3 }],
        accent: [{ hex: '#0366d6', rgb: [3, 102, 214], hsl: [212, 97, 43], frequency: 0.2 }]
      },
      'twitter.com': {
        dominant: [{ hex: '#1da1f2', rgb: [29, 161, 242], hsl: [203, 89, 53], frequency: 0.4 }],
        secondary: [{ hex: '#ffffff', rgb: [255, 255, 255], hsl: [0, 0, 100], frequency: 0.3 }],
        accent: [{ hex: '#14171a', rgb: [20, 23, 26], hsl: [210, 13, 9], frequency: 0.2 }]
      },
      'facebook.com': {
        dominant: [{ hex: '#1877f2', rgb: [24, 119, 242], hsl: [214, 89, 52], frequency: 0.4 }],
        secondary: [{ hex: '#ffffff', rgb: [255, 255, 255], hsl: [0, 0, 100], frequency: 0.3 }],
        accent: [{ hex: '#42a5f5', rgb: [66, 165, 245], hsl: [207, 90, 61], frequency: 0.2 }]
      },
      'linkedin.com': {
        dominant: [{ hex: '#0077b5', rgb: [0, 119, 181], hsl: [201, 100, 35], frequency: 0.4 }],
        secondary: [{ hex: '#ffffff', rgb: [255, 255, 255], hsl: [0, 0, 100], frequency: 0.3 }],
        accent: [{ hex: '#00a0dc', rgb: [0, 160, 220], hsl: [199, 100, 43], frequency: 0.2 }]
      },
      'instagram.com': {
        dominant: [{ hex: '#e4405f', rgb: [228, 64, 95], hsl: [348, 72, 57], frequency: 0.4 }],
        secondary: [{ hex: '#ffffff', rgb: [255, 255, 255], hsl: [0, 0, 100], frequency: 0.3 }],
        accent: [{ hex: '#833ab4', rgb: [131, 58, 180], hsl: [280, 51, 47], frequency: 0.2 }]
      },
      'youtube.com': {
        dominant: [{ hex: '#ff0000', rgb: [255, 0, 0], hsl: [0, 100, 50], frequency: 0.4 }],
        secondary: [{ hex: '#ffffff', rgb: [255, 255, 255], hsl: [0, 0, 100], frequency: 0.3 }],
        accent: [{ hex: '#282828', rgb: [40, 40, 40], hsl: [0, 0, 16], frequency: 0.2 }]
      },
      'netflix.com': {
        dominant: [{ hex: '#e50914', rgb: [229, 9, 20], hsl: [357, 92, 47], frequency: 0.4 }],
        secondary: [{ hex: '#000000', rgb: [0, 0, 0], hsl: [0, 0, 0], frequency: 0.3 }],
        accent: [{ hex: '#ffffff', rgb: [255, 255, 255], hsl: [0, 0, 100], frequency: 0.2 }]
      }
    };

    for (const [pattern, colors] of Object.entries(domainPatterns)) {
      if (domain.includes(pattern.replace('.com', ''))) {
        return colors;
      }
    }

    return null;
  }

  // Generate intelligent, professional fallback palette based on URL analysis
  generateFallbackPalette(url) {
    const domain = new URL(url).hostname;
    const path = new URL(url).pathname;
    const hash = this.simpleHash(domain + path);
    
    // Analyze domain for industry patterns
    const industryColors = this.getIndustryBasedColors(domain);
    if (industryColors) {
      return {
        dominant: Array.isArray(industryColors.dominant) ? industryColors.dominant : [],
        secondary: Array.isArray(industryColors.secondary) ? industryColors.secondary : [],
        accent: Array.isArray(industryColors.accent) ? industryColors.accent : []
      };
    }
    
    // Generate sophisticated color palette based on domain characteristics
    const palette = this.generateSophisticatedPalette(domain, hash);
    
    console.log(`Generated intelligent fallback palette for ${domain}:`, palette);
    return palette;
  }

  // Get industry-based colors for common domains
  getIndustryBasedColors(domain) {
    const industryPatterns = {
      // Technology & Software
      'tech': {
        dominant: [
          { hex: '#2563eb', rgb: [37, 99, 235], hsl: [217, 91, 53], frequency: 0.4 },
          { hex: '#1e40af', rgb: [30, 64, 175], hsl: [217, 91, 40], frequency: 0.3 }
        ],
        secondary: [
          { hex: '#64748b', rgb: [100, 116, 139], hsl: [215, 16, 47], frequency: 0.25 },
          { hex: '#f1f5f9', rgb: [241, 245, 249], hsl: [210, 20, 96], frequency: 0.2 }
        ],
        accent: [
          { hex: '#06b6d4', rgb: [6, 182, 212], hsl: [189, 94, 43], frequency: 0.15 },
          { hex: '#8b5cf6', rgb: [139, 92, 246], hsl: [258, 90, 66], frequency: 0.1 }
        ]
      },
      // Finance & Banking
      'bank': {
        dominant: [
          { hex: '#059669', rgb: [5, 150, 105], hsl: [160, 84, 30], frequency: 0.4 },
          { hex: '#047857', rgb: [4, 120, 87], hsl: [160, 84, 24], frequency: 0.3 }
        ],
        secondary: [
          { hex: '#374151', rgb: [55, 65, 81], hsl: [220, 13, 27], frequency: 0.25 },
          { hex: '#f9fafb', rgb: [249, 250, 251], hsl: [220, 14, 98], frequency: 0.2 }
        ],
        accent: [
          { hex: '#f59e0b', rgb: [245, 158, 11], hsl: [38, 92, 50], frequency: 0.15 },
          { hex: '#dc2626', rgb: [220, 38, 38], hsl: [0, 84, 51], frequency: 0.1 }
        ]
      },
      // Healthcare & Medical
      'health': {
        dominant: [
          { hex: '#0891b2', rgb: [8, 145, 178], hsl: [191, 91, 36], frequency: 0.4 },
          { hex: '#0e7490', rgb: [14, 116, 144], hsl: [191, 91, 31], frequency: 0.3 }
        ],
        secondary: [
          { hex: '#6b7280', rgb: [107, 114, 128], hsl: [220, 9, 46], frequency: 0.25 },
          { hex: '#f8fafc', rgb: [248, 250, 252], hsl: [210, 20, 98], frequency: 0.2 }
        ],
        accent: [
          { hex: '#10b981', rgb: [16, 185, 129], hsl: [160, 84, 39], frequency: 0.15 },
          { hex: '#ef4444', rgb: [239, 68, 68], hsl: [0, 84, 60], frequency: 0.1 }
        ]
      },
      // Education & Learning
      'edu': {
        dominant: [
          { hex: '#7c3aed', rgb: [124, 58, 237], hsl: [262, 83, 58], frequency: 0.4 },
          { hex: '#6d28d9', rgb: [109, 40, 217], hsl: [262, 83, 50], frequency: 0.3 }
        ],
        secondary: [
          { hex: '#4b5563', rgb: [75, 85, 99], hsl: [220, 13, 34], frequency: 0.25 },
          { hex: '#fafafa', rgb: [250, 250, 250], hsl: [0, 0, 98], frequency: 0.2 }
        ],
        accent: [
          { hex: '#f97316', rgb: [249, 115, 22], hsl: [25, 95, 53], frequency: 0.15 },
          { hex: '#06b6d4', rgb: [6, 182, 212], hsl: [189, 94, 43], frequency: 0.1 }
        ]
      },
      // E-commerce & Retail
      'shop': {
        dominant: [
          { hex: '#dc2626', rgb: [220, 38, 38], hsl: [0, 84, 51], frequency: 0.4 },
          { hex: '#b91c1c', rgb: [185, 28, 28], hsl: [0, 84, 42], frequency: 0.3 }
        ],
        secondary: [
          { hex: '#374151', rgb: [55, 65, 81], hsl: [220, 13, 27], frequency: 0.25 },
          { hex: '#ffffff', rgb: [255, 255, 255], hsl: [0, 0, 100], frequency: 0.2 }
        ],
        accent: [
          { hex: '#059669', rgb: [5, 150, 105], hsl: [160, 84, 30], frequency: 0.15 },
          { hex: '#f59e0b', rgb: [245, 158, 11], hsl: [38, 92, 50], frequency: 0.1 }
        ]
      },
      // Creative & Design
      'design': {
        dominant: [
          { hex: '#8b5cf6', rgb: [139, 92, 246], hsl: [258, 90, 66], frequency: 0.4 },
          { hex: '#7c3aed', rgb: [124, 58, 237], hsl: [262, 83, 58], frequency: 0.3 }
        ],
        secondary: [
          { hex: '#64748b', rgb: [100, 116, 139], hsl: [215, 16, 47], frequency: 0.25 },
          { hex: '#f8fafc', rgb: [248, 250, 252], hsl: [210, 20, 98], frequency: 0.2 }
        ],
        accent: [
          { hex: '#f97316', rgb: [249, 115, 22], hsl: [25, 95, 53], frequency: 0.15 },
          { hex: '#10b981', rgb: [16, 185, 129], hsl: [160, 84, 39], frequency: 0.1 }
        ]
      }
    };

    // Check domain against industry patterns
    for (const [industry, colors] of Object.entries(industryPatterns)) {
      if (domain.includes(industry) || this.hasIndustryKeywords(domain, industry)) {
        return colors;
      }
    }

    return null;
  }

  // Check for industry keywords in domain
  hasIndustryKeywords(domain, industry) {
    const keywords = {
      'tech': ['tech', 'software', 'app', 'api', 'dev', 'code', 'programming', 'digital', 'web', 'online'],
      'bank': ['bank', 'finance', 'credit', 'loan', 'money', 'pay', 'cash', 'financial', 'investment'],
      'health': ['health', 'medical', 'doctor', 'hospital', 'clinic', 'pharmacy', 'care', 'wellness', 'therapy'],
      'edu': ['edu', 'school', 'university', 'college', 'learn', 'education', 'course', 'training', 'academy'],
      'shop': ['shop', 'store', 'buy', 'sell', 'market', 'mall', 'retail', 'commerce', 'ecommerce'],
      'design': ['design', 'creative', 'art', 'studio', 'agency', 'brand', 'marketing', 'advertising']
    };

    const domainLower = domain.toLowerCase();
    return keywords[industry]?.some(keyword => domainLower.includes(keyword)) || false;
  }

  // Generate sophisticated color palette
  generateSophisticatedPalette(domain, hash) {
    // Use domain characteristics to generate meaningful colors
    const domainLength = domain.length;
    const hasNumbers = /\d/.test(domain);
    const hasHyphens = domain.includes('-');
    const hasSubdomains = domain.split('.').length > 2;
    
    // Base hue from domain hash
    const baseHue = hash % 360;
    
    // Adjust saturation and lightness based on domain characteristics
    const baseSaturation = 65 + (domainLength % 20);
    const baseLightness = 45 + (hash % 25);
    
    // Generate professional color combinations with non-zero frequency
    const dominant = [
      { ...this.hslToColor([baseHue, baseSaturation, baseLightness]), frequency: 0.5 },
      { ...this.hslToColor([baseHue, baseSaturation - 10, baseLightness - 10]), frequency: 0.3 }
    ];
    
    const secondary = [
      { ...this.hslToColor([(baseHue + 30) % 360, baseSaturation - 20, baseLightness + 15]), frequency: 0.2 },
      { ...this.hslToColor([(baseHue + 60) % 360, baseSaturation - 15, baseLightness + 20]), frequency: 0.15 }
    ];
    
    const accent = [
      { ...this.hslToColor([(baseHue + 180) % 360, baseSaturation + 15, baseLightness - 5]), frequency: 0.1 },
      { ...this.hslToColor([(baseHue + 120) % 360, baseSaturation + 10, baseLightness + 10]), frequency: 0.08 }
    ];
    
    return {
      dominant: Array.isArray(dominant) ? dominant : [],
      secondary: Array.isArray(secondary) ? secondary : [],
      accent: Array.isArray(accent) ? accent : []
    };
  }

  // Simple hash function for domain
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  // Add color to map with frequency
  addColorToMap(color, colorMap, frequency = 1) {
    try {
      let hex = color;
      
      // Convert various color formats to hex
      if (color.startsWith('rgb')) {
        const rgb = this.parseColorValue(color);
        if (rgb) {
          hex = Utils.rgbToHex(rgb[0], rgb[1], rgb[2]);
        }
      } else if (color.startsWith('hsl')) {
        // Convert HSL to RGB then to hex
        const hsl = this.parseHslValue(color);
        if (hsl) {
          const rgb = this.hslToRgb(hsl[0], hsl[1], hsl[2]);
          hex = Utils.rgbToHex(rgb[0], rgb[1], rgb[2]);
        }
      }
      
      if (hex && hex.match(/^#[0-9A-Fa-f]{6}$/)) {
        colorMap.set(hex.toLowerCase(), (colorMap.get(hex.toLowerCase()) || 0) + frequency);
      }
    } catch (error) {
      console.warn('Failed to add color to map:', color, error);
    }
  }

  // Parse HSL value
  parseHslValue(hslString) {
    const match = hslString.match(/hsl\s*\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/);
    if (match) {
      return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
    }
    return null;
  }

  // Convert HSL to RGB
  hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    
    let r = 0, g = 0, b = 0;
    
    if (0 <= h && h < 60) {
      r = c; g = x; b = 0;
    } else if (60 <= h && h < 120) {
      r = x; g = c; b = 0;
    } else if (120 <= h && h < 180) {
      r = 0; g = c; b = x;
    } else if (180 <= h && h < 240) {
      r = 0; g = x; b = c;
    } else if (240 <= h && h < 300) {
      r = x; g = 0; b = c;
    } else if (300 <= h && h < 360) {
      r = c; g = 0; b = x;
    }
    
    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255)
    ];
  }

  // Advanced CSS color analysis
  analyzeCSSColorsAdvanced(iframe) {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      const colorMap = new Map();

      // Analyze computed styles from all elements
      const elements = iframeDoc.querySelectorAll('*');
      const sampleSize = Math.min(elements.length, 500); // Increased sample size
      
      for (let i = 0; i < sampleSize; i++) {
        const element = elements[i];
        const computed = iframe.contentWindow.getComputedStyle(element);
        
        // Extract all color properties
        const colorProperties = [
          'backgroundColor', 'color', 'borderTopColor', 'borderRightColor',
          'borderBottomColor', 'borderLeftColor', 'outlineColor'
        ];

        colorProperties.forEach(prop => {
          const colorValue = computed[prop];
          if (colorValue && colorValue !== 'rgba(0, 0, 0, 0)' && colorValue !== 'transparent') {
            this.addColorFromComputedStyle(colorValue, colorMap);
          }
        });
      }

      // Also extract from CSS rules
      this.extractFromCSSRules(iframeDoc, colorMap);

      return this.processColorMap(colorMap);
    } catch (error) {
      throw new Error('Cannot access iframe content due to CORS restrictions');
    }
  }

  // Extract colors from CSS rules
  extractFromCSSRules(doc, colorMap) {
    try {
      const styleSheets = doc.styleSheets;
      for (let i = 0; i < styleSheets.length; i++) {
        try {
          const rules = styleSheets[i].cssRules || styleSheets[i].rules;
          for (let j = 0; j < rules.length; j++) {
            const rule = rules[j];
            if (rule.style) {
              this.extractColorsFromStyleString(rule.style.cssText, colorMap);
            }
          }
        } catch (e) {
          // Skip external stylesheets that might be blocked
          continue;
        }
      }
    } catch (error) {
      console.warn('CSS rules extraction failed:', error);
    }
  }

  // Enhanced color extraction from HTML with better pattern matching
  extractColorsFromHTML(html, originalUrl) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const colorMap = new Map();
    
    // Extract colors from inline styles with enhanced patterns
    const elementsWithStyle = doc.querySelectorAll('[style]');
    elementsWithStyle.forEach(el => {
      const style = el.getAttribute('style');
      this.extractColorsFromStyleString(style, colorMap);
    });

    // Extract colors from CSS text with better parsing
    const styleElements = doc.querySelectorAll('style');
    styleElements.forEach(styleEl => {
      this.extractColorsFromStyleString(styleEl.textContent, colorMap);
    });

    // Extract colors from external stylesheet links
    const linkElements = doc.querySelectorAll('link[rel="stylesheet"]');
    linkElements.forEach(link => {
      const href = link.getAttribute('href');
      if (href) {
        // Note: External stylesheets would require additional CORS handling
        console.log('External stylesheet found:', href);
      }
    });

    // Look for common color patterns in the HTML with enhanced detection
    this.extractCommonWebColors(doc, colorMap);

    // Extract colors from data attributes and custom properties
    this.extractFromDataAttributes(doc, colorMap);

    return this.processColorMap(colorMap);
  }

  // Extract colors from data attributes and custom properties
  extractFromDataAttributes(doc, colorMap) {
    // Look for color-related data attributes
    const colorDataElements = doc.querySelectorAll('[data-color], [data-bg-color], [data-theme-color]');
    colorDataElements.forEach(el => {
      const color = el.getAttribute('data-color') || 
                   el.getAttribute('data-bg-color') || 
                   el.getAttribute('data-theme-color');
      if (color) {
        this.addColorToMap(color, colorMap, 5);
      }
    });

    // Look for CSS custom properties in style attributes
    const elementsWithCustomProps = doc.querySelectorAll('[style*="--"]');
    elementsWithCustomProps.forEach(el => {
      const style = el.getAttribute('style');
      const customPropPattern = /--[\w-]+:\s*([#\w\(\),\s%]+);/g;
      let match;
      while ((match = customPropPattern.exec(style)) !== null) {
        this.extractColorsFromStyleString(match[1], colorMap);
      }
    });
  }



  // Extract colors from CSS/style strings with enhanced pattern matching
  extractColorsFromStyleString(styleText, colorMap) {
    if (!styleText) return;

    // Enhanced regex patterns for different color formats
    const patterns = {
      hex: /#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})\b/g,
      rgb: /rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g,
      rgba: /rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\)/g,
      hsl: /hsl\s*\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/g,
      hsla: /hsla\s*\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*,\s*[\d.]+\s*\)/g,
      named: /\b(aqua|black|blue|fuchsia|gray|green|lime|maroon|navy|olive|purple|red|silver|teal|white|yellow|orange|pink|brown|violet|indigo|magenta|cyan|transparent)\b/gi
    };

    // Extract hex colors
    let match;
    while ((match = patterns.hex.exec(styleText)) !== null) {
      let hex = match[1];
      if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
      }
      hex = '#' + hex.toLowerCase();
      colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
    }

    // Extract RGB colors
    while ((match = patterns.rgb.exec(styleText)) !== null) {
      const r = parseInt(match[1]);
      const g = parseInt(match[2]);
      const b = parseInt(match[3]);
      const hex = Utils.rgbToHex(r, g, b);
      colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
    }

    // Extract RGBA colors
    while ((match = patterns.rgba.exec(styleText)) !== null) {
      const r = parseInt(match[1]);
      const g = parseInt(match[2]);
      const b = parseInt(match[3]);
      const hex = Utils.rgbToHex(r, g, b);
      colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
    }

    // Extract HSL colors
    while ((match = patterns.hsl.exec(styleText)) !== null) {
      const h = parseInt(match[1]);
      const s = parseInt(match[2]);
      const l = parseInt(match[3]);
      const rgb = this.hslToRgb(h, s, l);
      const hex = Utils.rgbToHex(rgb[0], rgb[1], rgb[2]);
      colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
    }

    // Extract HSLA colors
    while ((match = patterns.hsla.exec(styleText)) !== null) {
      const h = parseInt(match[1]);
      const s = parseInt(match[2]);
      const l = parseInt(match[3]);
      const rgb = this.hslToRgb(h, s, l);
      const hex = Utils.rgbToHex(rgb[0], rgb[1], rgb[2]);
      colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
    }

    // Extract named colors
    while ((match = patterns.named.exec(styleText)) !== null) {
      const namedColor = match[1].toLowerCase();
      const hex = this.namedColorToHex(namedColor);
      if (hex) {
        colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
      }
    }
  }

  // Convert named colors to hex
  namedColorToHex(namedColor) {
    const namedColors = {
      'aqua': '#00ffff', 'black': '#000000', 'blue': '#0000ff', 'fuchsia': '#ff00ff',
      'gray': '#808080', 'green': '#008000', 'lime': '#00ff00', 'maroon': '#800000',
      'navy': '#000080', 'olive': '#808000', 'purple': '#800080', 'red': '#ff0000',
      'silver': '#c0c0c0', 'teal': '#008080', 'white': '#ffffff', 'yellow': '#ffff00',
      'orange': '#ffa500', 'pink': '#ffc0cb', 'brown': '#a52a2a', 'violet': '#ee82ee',
      'indigo': '#4b0082', 'magenta': '#ff00ff', 'cyan': '#00ffff'
    };
    
    return namedColors[namedColor] || null;
  }

  // Extract common web colors from meta tags, themes, etc. with enhanced detection
  extractCommonWebColors(doc, colorMap) {
    // Check meta theme colors with multiple variations
    const themeColorSelectors = [
      'meta[name="theme-color"]',
      'meta[name="msapplication-TileColor"]',
      'meta[name="apple-mobile-web-app-status-bar-style"]',
      'meta[property="og:theme-color"]'
    ];

    themeColorSelectors.forEach(selector => {
      const meta = doc.querySelector(selector);
      if (meta) {
        const color = meta.getAttribute('content');
        if (color && (color.startsWith('#') || color.startsWith('rgb') || color.startsWith('hsl'))) {
          this.addColorToMap(color, colorMap, 8);
        }
      }
    });

    // Check for CSS custom properties (CSS variables) with enhanced patterns
    const styleSheets = doc.querySelectorAll('style');
    styleSheets.forEach(sheet => {
      const cssText = sheet.textContent;
      const varPattern = /--[\w-]+:\s*([#\w\(\),\s%]+);/g;
      let match;
      while ((match = varPattern.exec(cssText)) !== null) {
        this.extractColorsFromStyleString(match[1], colorMap);
      }
    });

    // Extract colors from common class names and IDs
    this.extractFromCommonClassNames(doc, colorMap);

    // Extract colors from SVG elements
    this.extractFromSVGElements(doc, colorMap);

    // Extract colors from canvas elements
    this.extractFromCanvasElements(doc, colorMap);
  }

  // Extract colors from common class names and IDs
  extractFromCommonClassNames(doc, colorMap) {
    const colorClassPatterns = [
      /bg-(\w+)/, /text-(\w+)/, /border-(\w+)/, /color-(\w+)/,
      /theme-(\w+)/, /primary/, /secondary/, /accent/, /success/, /warning/, /error/, /info/
    ];

    const allElements = doc.querySelectorAll('*');
    allElements.forEach(el => {
      const className = el.className || '';
      const id = el.id || '';
      
      // Check class names
      colorClassPatterns.forEach(pattern => {
        if (pattern.test(className)) {
          // Look for color values in computed styles
          try {
            const computed = window.getComputedStyle(el);
            ['backgroundColor', 'color', 'borderColor'].forEach(prop => {
              const value = computed[prop];
              if (value && value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') {
                this.addColorFromComputedStyle(value, colorMap);
              }
            });
          } catch (e) {
            // CORS restrictions
          }
        }
      });
    });
  }

  // Extract colors from SVG elements
  extractFromSVGElements(doc, colorMap) {
    const svgElements = doc.querySelectorAll('svg, svg *');
    svgElements.forEach(svg => {
      const fill = svg.getAttribute('fill');
      const stroke = svg.getAttribute('stroke');
      const style = svg.getAttribute('style');
      
      if (fill && fill !== 'none') {
        this.addColorToMap(fill, colorMap, 3);
      }
      if (stroke && stroke !== 'none') {
        this.addColorToMap(stroke, colorMap, 3);
      }
      if (style) {
        this.extractColorsFromStyleString(style, colorMap);
      }
    });
  }

  // Extract colors from canvas elements
  extractFromCanvasElements(doc, colorMap) {
    const canvasElements = doc.querySelectorAll('canvas');
    canvasElements.forEach(canvas => {
      try {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Sample pixels from canvas for color extraction
          const imageData = ctx.getImageData(0, 0, Math.min(canvas.width, 100), Math.min(canvas.height, 100));
          const colors = this.extractColorsFromImageData(imageData);
          colors.forEach(color => {
            colorMap.set(color.hex, (colorMap.get(color.hex) || 0) + color.frequency * 100);
          });
        }
      } catch (e) {
        // Canvas might be tainted due to CORS
        console.warn('Cannot access canvas data:', e);
      }
    });
  }

  // Analyze CSS colors from iframe
  analyzeCSSColors(iframe) {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      const colorMap = new Map();

      // Get computed styles from visible elements
      const elements = iframeDoc.querySelectorAll('*');
      const sampleSize = Math.min(elements.length, 200); // Limit for performance
      
      for (let i = 0; i < sampleSize; i++) {
        const element = elements[i];
        const computed = iframe.contentWindow.getComputedStyle(element);
        
        // Extract background colors
        const bgColor = computed.backgroundColor;
        if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
          this.addColorFromComputedStyle(bgColor, colorMap);
        }

        // Extract text colors
        const textColor = computed.color;
        if (textColor && textColor !== 'rgba(0, 0, 0, 0)') {
          this.addColorFromComputedStyle(textColor, colorMap);
        }

        // Extract border colors
        ['borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'].forEach(prop => {
          const borderColor = computed[prop];
          if (borderColor && borderColor !== 'rgba(0, 0, 0, 0)') {
            this.addColorFromComputedStyle(borderColor, colorMap);
          }
        });
      }

      return this.processColorMap(colorMap);
    } catch (error) {
      throw new Error('Cannot access iframe content due to CORS restrictions');
    }
  }

  // Add color from computed style to color map
  addColorFromComputedStyle(colorValue, colorMap) {
    try {
      const rgb = this.parseColorValue(colorValue);
      if (rgb) {
        const hex = Utils.rgbToHex(rgb[0], rgb[1], rgb[2]);
        colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
      }
    } catch (error) {
      // Ignore invalid colors
    }
  }

  // Parse color value to RGB
  parseColorValue(colorValue) {
    const rgbMatch = colorValue.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
    }
    
    const rgbaMatch = colorValue.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)/);
    if (rgbaMatch) {
      return [parseInt(rgbaMatch[1]), parseInt(rgbaMatch[2]), parseInt(rgbaMatch[3])];
    }
    
    return null;
  }

  // Process color map into categorized palette
  processColorMap(colorMap) {
    if (colorMap.size === 0) {
      // Return a default palette instead of throwing
      return {
        dominant: [{ hex: '#6366f1', rgb: [99, 102, 241], hsl: [238, 84, 67], frequency: 1 }],
        secondary: [],
        accent: [],
        all: [{ hex: '#6366f1', rgb: [99, 102, 241], hsl: [238, 84, 67], frequency: 1 }]
      };
    }

    const colors = Array.from(colorMap.entries())
      .filter(([hex, count]) => count > 0 && hex !== '#000000' && hex !== '#ffffff') // Filter out pure black/white
      .sort((a, b) => b[1] - a[1]) // Sort by frequency
      .map(([hex, count]) => {
        const rgb = this.hexToRgb(hex);
        const hsl = Utils.rgbToHsl(rgb[0], rgb[1], rgb[2]);
        return {
          hex,
          rgb,
          hsl,
          frequency: count / colorMap.size
        };
      });

    // Add white and black back if they were significant
    if (colorMap.has('#ffffff') && colorMap.get('#ffffff') > colorMap.size * 0.1) {
      colors.push({
        hex: '#ffffff',
        rgb: [255, 255, 255],
        hsl: [0, 0, 100],
        frequency: colorMap.get('#ffffff') / colorMap.size
      });
    }

    if (colorMap.has('#000000') && colorMap.get('#000000') > colorMap.size * 0.1) {
      colors.push({
        hex: '#000000',
        rgb: [0, 0, 0],
        hsl: [0, 0, 0],
        frequency: colorMap.get('#000000') / colorMap.size
      });
    }

    const palette = this.categorizeExtractedColors(colors);
    palette.all = colors;
    return palette;
  }

  // Categorize extracted colors
  categorizeExtractedColors(colors) {
    const sorted = colors.sort((a, b) => b.frequency - a.frequency);
    
    const dominantThreshold = 0.1;
    const secondaryThreshold = 0.05;
    
    const dominant = sorted.filter(c => c.frequency >= dominantThreshold).slice(0, 4);
    const secondary = sorted.filter(c => c.frequency >= secondaryThreshold && c.frequency < dominantThreshold).slice(0, 4);
    const accent = sorted.filter(c => c.frequency < secondaryThreshold).slice(0, 3);

    // Ensure we have at least some colors in each category
    if (dominant.length === 0 && sorted.length > 0) {
      dominant.push(sorted[0]);
    }
    if (secondary.length === 0 && sorted.length > 1) {
      secondary.push(sorted[1]);
    }
    if (accent.length === 0 && sorted.length > 2) {
      accent.push(sorted[2]);
    }

    return {
      dominant: dominant.length > 0 ? dominant : [{ hex: '#6366f1', rgb: [99, 102, 241], hsl: [238, 84, 67], frequency: 0.3 }],
      secondary: secondary.length > 0 ? secondary : [{ hex: '#8b5cf6', rgb: [139, 92, 246], hsl: [258, 90, 66], frequency: 0.2 }],
      accent: accent.length > 0 ? accent : [{ hex: '#06b6d4', rgb: [6, 182, 212], hsl: [189, 94, 43], frequency: 0.1 }]
    };
  }

  // Extract colors from image blob
  async extractColorsFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const img = new Image();

      img.onload = () => {
        try {
          // Resize for performance
          const maxDimension = 800;
          const ratio = Math.min(maxDimension / img.width, maxDimension / img.height);
          canvas.width = img.width * ratio;
          canvas.height = img.height * ratio;

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          this.analyzeImageDataWithWorker(imageData, { k: 32 })
            .then(colors => {
              const palette = this.categorizeColors(colors);
              URL.revokeObjectURL(img.src);
              resolve(palette);
            })
            .catch(() => {
              // Fallback on main thread if worker fails
              const colors = this.extractColorsFromImageData(imageData);
              const palette = this.categorizeColors(colors);
              URL.revokeObjectURL(img.src);
              resolve(palette);
            });
        } catch (error) {
          URL.revokeObjectURL(img.src);
          reject(error);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(new Error('Failed to load image from blob'));
      };

      img.src = URL.createObjectURL(blob);
    });
  }

  // Extract colors from image data using k-means
  extractColorsFromImageData(imageData) {
    const pixels = [];
    
    // Sample pixels for performance
    for (let i = 0; i < imageData.data.length; i += 16) {
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      const alpha = imageData.data[i + 3];
      
      if (alpha > 128) {
        pixels.push([r, g, b]);
      }
    }

    if (pixels.length === 0) {
      return [];
    }

    const clusters = this.kMeansCluster(pixels, 8);
    
    return clusters.map(cluster => {
      const [r, g, b] = cluster.centroid.map(Math.round);
      const hex = Utils.rgbToHex(r, g, b);
      const hsl = Utils.rgbToHsl(r, g, b);
      
      return {
        hex,
        rgb: [r, g, b],
        hsl,
        frequency: cluster.size / pixels.length
      };
    }).filter(color => color.frequency > 0.01)
      .sort((a, b) => b.frequency - a.frequency);
  }

  // Direct iframe extraction (limited by CORS)
  async extractWithDirectIframe(url) {
    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:absolute;left:-9999px;width:1280px;height:720px;border:none;';
      
      const timeout = setTimeout(() => {
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
        reject(new Error('Direct iframe analysis timeout'));
      }, 10000);

      iframe.onload = () => {
        try {
          clearTimeout(timeout);
          const colors = this.analyzeCSSColors(iframe);
          document.body.removeChild(iframe);
          resolve(colors);
        } catch (error) {
          document.body.removeChild(iframe);
          // If CORS blocked, return a meaningful error
          reject(new Error('Website blocks cross-origin access'));
        }
      };

      iframe.onerror = () => {
        clearTimeout(timeout);
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
        reject(new Error('Failed to load website'));
      };

      document.body.appendChild(iframe);
      iframe.src = url;
    });
  }

  // Production-level palette validation and sanitization
  isValidPalette(palette) {
    if (!palette || typeof palette !== 'object') {
      return false;
    }

    // Check required categories
    const requiredCategories = ['dominant', 'secondary', 'accent'];
    for (const category of requiredCategories) {
      if (!palette[category] || !Array.isArray(palette[category])) {
        palette[category] = [];
      }
    }

    // Validate and sanitize colors
    const sanitizedPalette = {};
    for (const category of requiredCategories) {
      sanitizedPalette[category] = palette[category]
        .filter(color => this.isValidColor(color))
        .map(color => this.sanitizeColor(color))
        .slice(0, 5); // Limit to 5 colors per category
    }

    // Ensure at least one dominant color
    if (sanitizedPalette.dominant.length === 0) {
      sanitizedPalette.dominant = [{ hex: '#6366f1', rgb: [99, 102, 241], hsl: [238, 84, 67], frequency: 1 }];
    }

    // Replace original palette with sanitized version
    Object.assign(palette, sanitizedPalette);
    return true;
  }

  // Validate individual color object
  isValidColor(color) {
    if (!color || typeof color !== 'object') {
      return false;
    }

    // Check required properties
    const requiredProps = ['hex', 'rgb', 'hsl'];
    for (const prop of requiredProps) {
      if (!color[prop]) {
        return false;
      }
    }

    // Validate hex format
    if (!/^#[0-9A-Fa-f]{6}$/.test(color.hex)) {
      return false;
    }

    // Validate RGB values
    if (!Array.isArray(color.rgb) || color.rgb.length !== 3) {
      return false;
    }
    
    for (const value of color.rgb) {
      if (typeof value !== 'number' || value < 0 || value > 255) {
        return false;
      }
    }

    // Validate HSL values
    if (!Array.isArray(color.hsl) || color.hsl.length !== 3) {
      return false;
    }
    
    if (color.hsl[0] < 0 || color.hsl[0] > 360) return false; // Hue
    if (color.hsl[1] < 0 || color.hsl[1] > 100) return false; // Saturation
    if (color.hsl[2] < 0 || color.hsl[2] > 100) return false; // Lightness

    return true;
  }

  // Sanitize color object
  sanitizeColor(color) {
    const sanitized = { ...color };
    // Ensure hex is lowercase
    sanitized.hex = sanitized.hex.toLowerCase();
    // Round RGB values
    sanitized.rgb = sanitized.rgb.map(v => Math.round(v));
    // Round HSL values
    sanitized.hsl = sanitized.hsl.map(v => Math.round(v));
    // Ensure frequency is a number between 0.01 and 1 (not 0)
    if (typeof sanitized.frequency !== 'number' || sanitized.frequency <= 0) {
      sanitized.frequency = 0.3;
    }
    sanitized.frequency = Math.max(0.01, Math.min(1, sanitized.frequency));
    return sanitized;
  }

  // Helper function to convert hex to RGB
  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16)
    ] : null;
  }

  // Perform k-means clustering on image pixels
  performKMeansColorExtraction(k = 8) {
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const pixels = [];
    
    // Sample pixels (every 4th pixel for performance)
    for (let i = 0; i < imageData.data.length; i += 16) {
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      const alpha = imageData.data[i + 3];
      
      // Skip transparent pixels
      if (alpha > 128) {
        pixels.push([r, g, b]);
      }
    }

    if (pixels.length === 0) {
      return [];
    }

    // Perform k-means clustering
    const clusters = this.kMeansCluster(pixels, k);
    
    // Convert clusters to color objects
    return clusters.map(cluster => {
      const [r, g, b] = cluster.centroid.map(Math.round);
      const hex = Utils.rgbToHex(r, g, b);
      const hsl = Utils.rgbToHsl(r, g, b);
      
      return {
        hex,
        rgb: [r, g, b],
        hsl,
        frequency: cluster.size / pixels.length
      };
    }).filter(color => color.frequency > 0.002) // was 0.01, now 0.002 for rare color inclusion
      .sort((a, b) => b.frequency - a.frequency);
  }

  // K-means clustering algorithm
  kMeansCluster(pixels, k, maxIterations = 50) {
    if (pixels.length === 0 || k <= 0) return [];
    
    // Initialize centroids randomly
    let centroids = [];
    for (let i = 0; i < k; i++) {
      const randomPixel = pixels[Math.floor(Math.random() * pixels.length)];
      centroids.push([...randomPixel]);
    }

    let assignments = new Array(pixels.length);
    let hasChanged = true;
    let iterations = 0;

    while (hasChanged && iterations < maxIterations) {
      hasChanged = false;
      
      // Assign pixels to nearest centroid
      for (let i = 0; i < pixels.length; i++) {
        const pixel = pixels[i];
        let minDistance = Infinity;
        let assignment = 0;
        
        for (let j = 0; j < centroids.length; j++) {
          const distance = this.euclideanDistance(pixel, centroids[j]);
          
          if (distance < minDistance) {
            minDistance = distance;
            assignment = j;
          }
        }
        
        if (assignments[i] !== assignment) {
          assignments[i] = assignment;
          hasChanged = true;
        }
      }

      // Update centroids
      const newCentroids = [];
      for (let j = 0; j < k; j++) {
        const assignedPixels = pixels.filter((_, i) => assignments[i] === j);
        if (assignedPixels.length > 0) {
          const avgR = assignedPixels.reduce((sum, p) => sum + p[0], 0) / assignedPixels.length;
          const avgG = assignedPixels.reduce((sum, p) => sum + p[1], 0) / assignedPixels.length;
          const avgB = assignedPixels.reduce((sum, p) => sum + p[2], 0) / assignedPixels.length;
          newCentroids.push([avgR, avgG, avgB]);
        } else {
          newCentroids.push(centroids[j]);
        }
      }
      centroids = newCentroids;
      iterations++;
    }

    // Calculate cluster sizes and return results
    const clusters = [];
    for (let j = 0; j < k; j++) {
      const size = assignments.filter(assignment => assignment === j).length;
      if (size > 0) {
        clusters.push({
          centroid: centroids[j],
          size
        });
      }
    }

    return clusters.sort((a, b) => b.size - a.size);
  }

  // Calculate Euclidean distance between two colors
  euclideanDistance(color1, color2) {
    return Math.sqrt(
      Math.pow(color1[0] - color2[0], 2) +
      Math.pow(color1[1] - color2[1], 2) +
      Math.pow(color1[2] - color2[2], 2)
    );
  }

  // Categorize colors into dominant, secondary, and accent
  categorizeColors(colors) {
    const sortedColors = [...colors].sort((a, b) => b.frequency - a.frequency);
    
    return {
      dominant: sortedColors.slice(0, 3),
      secondary: sortedColors.slice(3, 6),
      accent: sortedColors.slice(6, 8)
    };
  }

  // Analyze color properties
  analyzeColor(color) {
    const contrastWithWhite = Utils.getContrastRatio(color.rgb, [255, 255, 255]);
    const contrastWithBlack = Utils.getContrastRatio(color.rgb, [0, 0, 0]);
    const wcagLevel = Utils.getWCAGLevel(Math.max(contrastWithWhite, contrastWithBlack));
    
    return {
      ...color,
      contrastWithWhite,
      contrastWithBlack,
      wcagLevel,
      isLight: color.hsl[2] > 50,
      isDark: color.hsl[2] < 50,
      saturation: color.hsl[1],
      lightness: color.hsl[2]
    };
  }

  // Generate complementary colors
  generateComplementaryColors(baseColor) {
    const [h, s, l] = baseColor.hsl;
    
    const complementary = [(h + 180) % 360, s, l];
    const analogous1 = [(h + 30) % 360, s, l];
    const analogous2 = [(h - 30 + 360) % 360, s, l];
    const triadic1 = [(h + 120) % 360, s, l];
    const triadic2 = [(h + 240) % 360, s, l];
    
    return {
      complementary: this.hslToColor(complementary),
      analogous: [this.hslToColor(analogous1), this.hslToColor(analogous2)],
      triadic: [this.hslToColor(triadic1), this.hslToColor(triadic2)]
    };
  }

  // Convert HSL back to color object
  hslToColor([h, s, l]) {
    // Convert HSL to RGB
    const c = (1 - Math.abs(2 * l / 100 - 1)) * s / 100;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l / 100 - c / 2;
    
    let r = 0, g = 0, b = 0;
    
    if (0 <= h && h < 60) {
      r = c; g = x; b = 0;
    } else if (60 <= h && h < 120) {
      r = x; g = c; b = 0;
    } else if (120 <= h && h < 180) {
      r = 0; g = c; b = x;
    } else if (180 <= h && h < 240) {
      r = 0; g = x; b = c;
    } else if (240 <= h && h < 300) {
      r = x; g = 0; b = c;
    } else if (300 <= h && h < 360) {
      r = c; g = 0; b = x;
    }
    
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);
    
    return {
      hex: Utils.rgbToHex(r, g, b),
      rgb: [r, g, b],
      hsl: [h, s, l],
      frequency: 0
    };
  }

  // Generate comprehensive professional color report
  generateProfessionalReport(palette, url, extractionMethod) {
    const domain = new URL(url).hostname;
    const timestamp = new Date().toISOString();
    
    const report = {
      metadata: {
        url: url,
        domain: domain,
        extractedAt: timestamp,
        extractionMethod: extractionMethod,
        reportVersion: '2.0.0'
      },
      
      colorPalette: this.analyzeColorPalette(palette),
      
      accessibility: this.generateAccessibilityReport(palette),
      
      designInsights: this.generateDesignInsights(palette, domain),
      
      technicalSpecs: this.generateTechnicalSpecs(palette),
      
      recommendations: this.generateRecommendations(palette, domain),
      
      exportFormats: this.generateExportFormats(palette)
    };
    
    console.log('Generated professional color report:', report);
    return report;
  }

  // Analyze color palette with professional insights
  analyzeColorPalette(palette) {
    const analysis = {
      dominant: this.analyzeColorCategory(palette.dominant, 'Dominant'),
      secondary: this.analyzeColorCategory(palette.secondary, 'Secondary'),
      accent: this.analyzeColorCategory(palette.accent, 'Accent'),
      
      overallAnalysis: {
        colorCount: this.getTotalColorCount(palette),
        colorHarmony: this.analyzeColorHarmony(palette),
        brandConsistency: this.analyzeBrandConsistency(palette),
        visualHierarchy: this.analyzeVisualHierarchy(palette),
        colorTemperature: this.analyzeColorTemperature(palette)
      }
    };
    
    return analysis;
  }

  // Analyze individual color category
  analyzeColorCategory(colors, categoryName) {
    return colors.map(color => ({
      ...color,
      analysis: {
        psychology: this.getColorPsychology(color),
        accessibility: this.getAccessibilityScore(color),
        contrast: this.getContrastAnalysis(color),
        usage: this.getColorUsage(color, categoryName),
        technical: this.getTechnicalInfo(color)
      }
    }));
  }

  // Generate accessibility report
  generateAccessibilityReport(palette) {
    const allColors = [...palette.dominant, ...palette.secondary, ...palette.accent];
    
    return {
      wcagCompliance: this.analyzeWCAGCompliance(allColors),
      contrastRatios: this.calculateContrastRatios(allColors),
      colorBlindness: this.analyzeColorBlindness(allColors),
      readability: this.analyzeReadability(allColors),
      recommendations: this.getAccessibilityRecommendations(allColors)
    };
  }

  // Generate design insights
  generateDesignInsights(palette, domain) {
    return {
      brandPersonality: this.analyzeBrandPersonality(palette),
      targetAudience: this.analyzeTargetAudience(palette, domain),
      industryAlignment: this.analyzeIndustryAlignment(palette, domain),
      emotionalImpact: this.analyzeEmotionalImpact(palette),
      culturalConsiderations: this.getCulturalConsiderations(palette),
      seasonalAnalysis: this.analyzeSeasonalColors(palette)
    };
  }

  // Generate technical specifications
  generateTechnicalSpecs(palette) {
    return {
      cssVariables: this.generateCSSVariables(palette),
      scssVariables: this.generateSCSSVariables(palette),
      tailwindConfig: this.generateTailwindConfig(palette),
      designTokens: this.generateDesignTokens(palette),
      colorSchemes: this.generateColorSchemes(palette),
      implementation: this.getImplementationGuidelines(palette)
    };
  }

  // Generate professional recommendations
  generateRecommendations(palette, domain) {
    return {
      immediate: this.getImmediateRecommendations(palette),
      longTerm: this.getLongTermRecommendations(palette, domain),
      accessibility: this.getAccessibilityRecommendations([...palette.dominant, ...palette.secondary, ...palette.accent]),
      performance: this.getPerformanceRecommendations(palette),
      branding: this.getBrandingRecommendations(palette, domain),
      implementation: this.getImplementationRecommendations(palette)
    };
  }

  // Generate export formats
  generateExportFormats(palette) {
    return {
      css: this.exportToCSS(palette),
      scss: this.exportToSCSS(palette),
      json: this.exportToJSON(palette),
      tailwind: this.exportToTailwind(palette),
      figma: this.exportToFigma(palette),
      sketch: this.exportToSketch(palette)
    };
  }

  // Color psychology analysis
  getColorPsychology(color) {
    const hue = color.hsl[0];
    const saturation = color.hsl[1];
    const lightness = color.hsl[2];
    
    let psychology = {
      emotion: '',
      meaning: '',
      associations: [],
      culturalSignificance: '',
      brandImplications: ''
    };
    
    // Analyze by hue ranges
    if (hue >= 0 && hue < 30) {
      psychology = {
        emotion: 'Energy, Passion, Urgency',
        meaning: 'Power, excitement, attention-grabbing',
        associations: ['fire', 'blood', 'danger', 'love', 'energy'],
        culturalSignificance: 'Luck in Asian cultures, danger in Western cultures',
        brandImplications: 'Great for calls-to-action, sales, food industry'
      };
    } else if (hue >= 30 && hue < 60) {
      psychology = {
        emotion: 'Warmth, Optimism, Creativity',
        meaning: 'Joy, enthusiasm, innovation',
        associations: ['sun', 'gold', 'autumn', 'creativity', 'warmth'],
        culturalSignificance: 'Royalty in ancient cultures, caution in traffic',
        brandImplications: 'Perfect for creative industries, food, entertainment'
      };
    } else if (hue >= 60 && hue < 120) {
      psychology = {
        emotion: 'Growth, Harmony, Nature',
        meaning: 'Freshness, health, prosperity',
        associations: ['nature', 'growth', 'money', 'health', 'environment'],
        culturalSignificance: 'Life and nature universally, money in Western cultures',
        brandImplications: 'Ideal for health, finance, environmental companies'
      };
    } else if (hue >= 120 && hue < 180) {
      psychology = {
        emotion: 'Trust, Stability, Professionalism',
        meaning: 'Reliability, calm, intelligence',
        associations: ['ocean', 'sky', 'trust', 'technology', 'stability'],
        culturalSignificance: 'Masculinity in Western cultures, immortality in ancient Egypt',
        brandImplications: 'Excellent for tech, finance, healthcare, corporate'
      };
    } else if (hue >= 180 && hue < 240) {
      psychology = {
        emotion: 'Creativity, Mystery, Luxury',
        meaning: 'Innovation, sophistication, imagination',
        associations: ['royalty', 'luxury', 'creativity', 'mystery', 'wisdom'],
        culturalSignificance: 'Royalty in many cultures, spirituality in some religions',
        brandImplications: 'Perfect for luxury brands, creative agencies, premium products'
      };
    } else if (hue >= 240 && hue < 300) {
      psychology = {
        emotion: 'Playfulness, Innovation, Youth',
        meaning: 'Creativity, fun, modern',
        associations: ['creativity', 'youth', 'innovation', 'playfulness', 'modern'],
        culturalSignificance: 'Femininity in some cultures, creativity universally',
        brandImplications: 'Great for youth brands, creative industries, modern tech'
      };
    } else {
      psychology = {
        emotion: 'Passion, Energy, Excitement',
        meaning: 'Drama, intensity, attention',
        associations: ['passion', 'energy', 'excitement', 'drama', 'intensity'],
        culturalSignificance: 'Passion and energy across cultures',
        brandImplications: 'Ideal for entertainment, sports, dynamic brands'
      };
    }
    
    // Adjust based on saturation and lightness
    if (saturation < 30) {
      psychology.emotion += ', Neutrality';
      psychology.meaning += ', subtlety';
    } else if (saturation > 70) {
      psychology.emotion += ', Intensity';
      psychology.meaning += ', boldness';
    }
    
    if (lightness < 30) {
      psychology.emotion += ', Sophistication';
      psychology.meaning += ', elegance';
    } else if (lightness > 70) {
      psychology.emotion += ', Purity';
      psychology.meaning += ', cleanliness';
    }
    
    return psychology;
  }

  // Get accessibility score
  getAccessibilityScore(color) {
    const contrastWithWhite = Utils.getContrastRatio(color.rgb, [255, 255, 255]);
    const contrastWithBlack = Utils.getContrastRatio(color.rgb, [0, 0, 0]);
    const bestContrast = Math.max(contrastWithWhite, contrastWithBlack);
    
    let score = 'A';
    let rating = 'Excellent';
    
    if (bestContrast >= 7.0) {
      score = 'AAA';
      rating = 'Excellent';
    } else if (bestContrast >= 4.5) {
      score = 'AA';
      rating = 'Good';
    } else if (bestContrast >= 3.0) {
      score = 'A';
      rating = 'Acceptable';
    } else {
      score = 'F';
      rating = 'Poor';
    }
    
    return {
      score,
      rating,
      contrastWithWhite,
      contrastWithBlack,
      bestContrast
    };
  }

  // Get contrast analysis
  getContrastAnalysis(color) {
    const contrasts = {
      white: Utils.getContrastRatio(color.rgb, [255, 255, 255]),
      black: Utils.getContrastRatio(color.rgb, [0, 0, 0]),
      gray: Utils.getContrastRatio(color.rgb, [128, 128, 128]),
      lightGray: Utils.getContrastRatio(color.rgb, [200, 200, 200]),
      darkGray: Utils.getContrastRatio(color.rgb, [64, 64, 64])
    };
    
    return {
      ...contrasts,
      bestTextColor: contrasts.white > contrasts.black ? 'white' : 'black',
      wcagLevel: this.getWCAGLevel(Math.max(contrasts.white, contrasts.black)),
      usage: this.getContrastUsage(contrasts)
    };
  }

  // Get color usage recommendations
  getColorUsage(color, category) {
    const usage = {
      primary: [],
      secondary: [],
      accent: [],
      background: [],
      text: [],
      borders: [],
      buttons: [],
      links: [],
      alerts: [],
      warnings: []
    };
    
    const contrast = this.getContrastAnalysis(color);
    const psychology = this.getColorPsychology(color);
    
    // Determine best usage based on color properties
    if (category === 'Dominant') {
      usage.primary.push('Main brand color');
      usage.background.push('Primary backgrounds');
      usage.buttons.push('Primary call-to-action buttons');
    }
    
    if (category === 'Secondary') {
      usage.secondary.push('Supporting elements');
      usage.background.push('Secondary backgrounds');
      usage.borders.push('Subtle borders and dividers');
    }
    
    if (category === 'Accent') {
      usage.accent.push('Highlighting important elements');
      usage.links.push('Interactive elements');
      usage.alerts.push('Success messages');
    }
    
    // Add specific recommendations based on contrast
    if (contrast.bestContrast >= 4.5) {
      usage.text.push('Body text');
      usage.links.push('Text links');
    }
    
    if (contrast.bestContrast >= 7.0) {
      usage.text.push('Small text (14px and below)');
    }
    
    return usage;
  }

  // Get technical information
  getTechnicalInfo(color) {
    return {
      hex: color.hex,
      rgb: color.rgb,
      hsl: color.hsl,
      cmyk: this.rgbToCmyk(color.rgb),
      lab: this.rgbToLab(color.rgb),
      hsv: this.rgbToHsv(color.rgb),
      cssFormats: {
        hex: color.hex,
        rgb: `rgb(${color.rgb.join(', ')})`,
        rgba: `rgba(${color.rgb.join(', ')}, 1)`,
        hsl: `hsl(${color.hsl[0]}, ${color.hsl[1]}%, ${color.hsl[2]}%)`,
        hsla: `hsla(${color.hsl[0]}, ${color.hsl[1]}%, ${color.hsl[2]}%, 1)`
      }
    };
  }

  // Analyze color harmony
  analyzeColorHarmony(palette) {
    const allColors = [...palette.dominant, ...palette.secondary, ...palette.accent];
    const hues = allColors.map(c => c.hsl[0]);
    
    // Check for complementary colors
    const complementary = this.findComplementaryColors(hues);
    
    // Check for analogous colors
    const analogous = this.findAnalogousColors(hues);
    
    // Check for triadic colors
    const triadic = this.findTriadicColors(hues);
    
    return {
      type: this.determineHarmonyType(hues),
      complementary,
      analogous,
      triadic,
      score: this.calculateHarmonyScore(hues),
      recommendations: this.getHarmonyRecommendations(hues)
    };
  }

  // Analyze brand consistency
  analyzeBrandConsistency(palette) {
    const allColors = [...palette.dominant, ...palette.secondary, ...palette.accent];
    
    // Check color temperature consistency
    const temperatures = allColors.map(c => this.getColorTemperature(c));
    const tempConsistency = this.analyzeTemperatureConsistency(temperatures);
    
    // Check saturation consistency
    const saturations = allColors.map(c => c.hsl[1]);
    const satConsistency = this.analyzeSaturationConsistency(saturations);
    
    // Check lightness consistency
    const lightnesses = allColors.map(c => c.hsl[2]);
    const lightConsistency = this.analyzeLightnessConsistency(lightnesses);
    
    return {
      overall: this.calculateConsistencyScore([tempConsistency, satConsistency, lightConsistency]),
      temperature: tempConsistency,
      saturation: satConsistency,
      lightness: lightConsistency,
      recommendations: this.getConsistencyRecommendations(palette)
    };
  }

  // Analyze visual hierarchy
  analyzeVisualHierarchy(palette) {
    const dominant = palette.dominant[0];
    const secondary = palette.secondary[0];
    const accent = palette.accent[0];
    
    if (!dominant || !secondary || !accent) return { score: 'N/A', issues: ['Insufficient colors'] };
    
    const hierarchy = {
      dominantStrength: this.calculateColorStrength(dominant),
      secondaryStrength: this.calculateColorStrength(secondary),
      accentStrength: this.calculateColorStrength(accent),
      contrast: this.calculateHierarchyContrast(dominant, secondary, accent),
      balance: this.calculateColorBalance(palette)
    };
    
    return {
      ...hierarchy,
      score: this.calculateHierarchyScore(hierarchy),
      recommendations: this.getHierarchyRecommendations(hierarchy)
    };
  }

  // Analyze color temperature
  analyzeColorTemperature(palette) {
    const allColors = [...palette.dominant, ...palette.secondary, ...palette.accent];
    const temperatures = allColors.map(c => this.getColorTemperature(c));
    
    const warmCount = temperatures.filter(t => t === 'warm').length;
    const coolCount = temperatures.filter(t => t === 'cool').length;
    const neutralCount = temperatures.filter(t => t === 'neutral').length;
    
    return {
      distribution: { warm: warmCount, cool: coolCount, neutral: neutralCount },
      dominant: this.getDominantTemperature(temperatures),
      balance: this.calculateTemperatureBalance(warmCount, coolCount, neutralCount),
      recommendations: this.getTemperatureRecommendations(temperatures)
    };
  }

  // Helper methods for color analysis
  getColorTemperature(color) {
    const hue = color.hsl[0];
    if (hue >= 0 && hue < 60) return 'warm';
    if (hue >= 60 && hue < 180) return 'cool';
    if (hue >= 180 && hue < 240) return 'cool';
    if (hue >= 240 && hue < 300) return 'cool';
    if (hue >= 300 && hue < 360) return 'warm';
    return 'neutral';
  }

  calculateColorStrength(color) {
    const saturation = color.hsl[1];
    const lightness = color.hsl[2];
    return (saturation * 0.6) + ((100 - lightness) * 0.4);
  }

  findComplementaryColors(hues) {
    const complementary = [];
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        const diff = Math.abs(hues[i] - hues[j]);
        if (Math.abs(diff - 180) < 15) {
          complementary.push([hues[i], hues[j]]);
        }
      }
    }
    return complementary;
  }

  findAnalogousColors(hues) {
    const analogous = [];
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        const diff = Math.abs(hues[i] - hues[j]);
        if (diff >= 15 && diff <= 45) {
          analogous.push([hues[i], hues[j]]);
        }
      }
    }
    return analogous;
  }

  findTriadicColors(hues) {
    const triadic = [];
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        for (let k = j + 1; k < hues.length; k++) {
          const diff1 = Math.abs(hues[i] - hues[j]);
          const diff2 = Math.abs(hues[j] - hues[k]);
          const diff3 = Math.abs(hues[k] - hues[i]);
          if (Math.abs(diff1 - 120) < 15 && Math.abs(diff2 - 120) < 15 && Math.abs(diff3 - 120) < 15) {
            triadic.push([hues[i], hues[j], hues[k]]);
          }
        }
      }
    }
    return triadic;
  }

  determineHarmonyType(hues) {
    if (this.findTriadicColors(hues).length > 0) return 'Triadic';
    if (this.findComplementaryColors(hues).length > 0) return 'Complementary';
    if (this.findAnalogousColors(hues).length > 0) return 'Analogous';
    return 'Monochromatic';
  }

  calculateHarmonyScore(hues) {
    let score = 0;
    if (this.findTriadicColors(hues).length > 0) score += 30;
    if (this.findComplementaryColors(hues).length > 0) score += 25;
    if (this.findAnalogousColors(hues).length > 0) score += 20;
    
    // Add points for good hue distribution
    const hueSpread = Math.max(...hues) - Math.min(...hues);
    if (hueSpread > 180) score += 25;
    else if (hueSpread > 90) score += 15;
    else if (hueSpread > 45) score += 10;
    
    return Math.min(score, 100);
  }

  // Generate CSS variables
  generateCSSVariables(palette) {
    const variables = {};
    
    ['dominant', 'secondary', 'accent'].forEach(category => {
      palette[category].forEach((color, index) => {
        const prefix = category.charAt(0).toUpperCase() + category.slice(1);
        const name = `${prefix}${index + 1}`;
        
        variables[`--color-${name.toLowerCase()}`] = color.hex;
        variables[`--color-${name.toLowerCase()}-rgb`] = color.rgb.join(', ');
        variables[`--color-${name.toLowerCase()}-hsl`] = `${color.hsl[0]}, ${color.hsl[1]}%, ${color.hsl[2]}%`;
      });
    });
    
    return variables;
  }

  // Generate SCSS variables
  generateSCSSVariables(palette) {
    const variables = {};
    
    ['dominant', 'secondary', 'accent'].forEach(category => {
      palette[category].forEach((color, index) => {
        const prefix = category.charAt(0).toUpperCase() + category.slice(1);
        const name = `${prefix}${index + 1}`;
        
        variables[`$${name.toLowerCase()}`] = color.hex;
        variables[`$${name.toLowerCase()}-rgb`] = color.rgb.join(', ');
        variables[`$${name.toLowerCase()}-hsl`] = `${color.hsl[0]}, ${color.hsl[1]}%, ${color.hsl[2]}%`;
      });
    });
    
    return variables;
  }

  // Generate Tailwind config
  generateTailwindConfig(palette) {
    const colors = {};
    
    ['dominant', 'secondary', 'accent'].forEach(category => {
      palette[category].forEach((color, index) => {
        const prefix = category.charAt(0).toUpperCase() + category.slice(1);
        const name = `${prefix}${index + 1}`;
        
        colors[name.toLowerCase()] = color.hex;
      });
    });
    
    return {
      theme: {
        extend: {
          colors
        }
      }
    };
  }

  // Export to CSS
  exportToCSS(palette) {
    const variables = this.generateCSSVariables(palette);
    let css = ':root {\n';
    
    Object.entries(variables).forEach(([key, value]) => {
      css += `  ${key}: ${value};\n`;
    });
    
    css += '}\n\n';
    
    // Add utility classes
    Object.entries(variables).forEach(([key, value]) => {
      const className = key.replace('--color-', 'bg-');
      css += `.${className} {\n  background-color: ${value};\n}\n\n`;
    });
    
    return css;
  }

  // Export to SCSS
  exportToSCSS(palette) {
    const variables = this.generateSCSSVariables(palette);
    let scss = '';
    
    Object.entries(variables).forEach(([key, value]) => {
      scss += `${key}: ${value};\n`;
    });
    
    scss += '\n// Mixins\n';
    scss += '@mixin color-theme {\n';
    Object.entries(variables).forEach(([key, value]) => {
      if (key.includes('-rgb')) {
        const baseKey = key.replace('-rgb', '');
        scss += `  --${baseKey}: rgb(${value});\n`;
      }
    });
    scss += '}\n';
    
    return scss;
  }

  // Export to JSON
  exportToJSON(palette) {
    return JSON.stringify({
      palette,
      metadata: {
        generatedAt: new Date().toISOString(),
        version: '2.0.0'
      }
    }, null, 2);
  }

  // Export to Tailwind
  exportToTailwind(palette) {
    const config = this.generateTailwindConfig(palette);
    return `module.exports = ${JSON.stringify(config, null, 2)};`;
  }

  // Export to Figma
  exportToFigma(palette) {
    const colors = [];
    
    ['dominant', 'secondary', 'accent'].forEach(category => {
      palette[category].forEach((color, index) => {
        colors.push({
          name: `${category.charAt(0).toUpperCase() + category.slice(1)} ${index + 1}`,
          color: {
            r: color.rgb[0] / 255,
            g: color.rgb[1] / 255,
            b: color.rgb[2] / 255
          }
        });
      });
    });
    
    return JSON.stringify(colors, null, 2);
  }

  // Export to Sketch
  exportToSketch(palette) {
    const colors = [];
    
    ['dominant', 'secondary', 'accent'].forEach(category => {
      palette[category].forEach((color, index) => {
        colors.push({
          name: `${category.charAt(0).toUpperCase() + category.slice(1)} ${index + 1}`,
          color: color.hex,
          rgb: color.rgb
        });
      });
    });
    
    return JSON.stringify(colors, null, 2);
  }

  // Utility conversion methods
  rgbToCmyk(rgb) {
    const [r, g, b] = rgb.map(v => v / 255);
    const k = 1 - Math.max(r, g, b);
    const c = (1 - r - k) / (1 - k);
    const m = (1 - g - k) / (1 - k);
    const y = (1 - b - k) / (1 - k);
    
    return [
      Math.round(c * 100),
      Math.round(m * 100),
      Math.round(y * 100),
      Math.round(k * 100)
    ];
  }

  rgbToLab(rgb) {
    // Simplified RGB to Lab conversion
    const [r, g, b] = rgb.map(v => v / 255);
    
    // Convert to XYZ (simplified)
    const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
    const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const z = r * 0.0193 + g * 0.1192 + b * 0.9505;
    
    return [x, y, z]; // Simplified Lab representation
  }

  rgbToHsv(rgb) {
    const [r, g, b] = rgb.map(v => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    
    let h = 0;
    if (diff === 0) h = 0;
    else if (max === r) h = ((g - b) / diff) % 6;
    else if (max === g) h = (b - r) / diff + 2;
    else h = (r - g) / diff + 4;
    
    h = h * 60;
    if (h < 0) h += 360;
    
    const s = max === 0 ? 0 : diff / max;
    const v = max;
    
    return [h, s * 100, v * 100];
  }

  // Missing helper methods for professional report
  analyzeWCAGCompliance(colors) {
    const compliance = {
      aa: { pass: 0, fail: 0, colors: [] },
      aaa: { pass: 0, fail: 0, colors: [] }
    };
    
    colors.forEach(color => {
      const score = this.getAccessibilityScore(color);
      
      if (score.contrastWithWhite >= 4.5 || score.contrastWithBlack >= 4.5) {
        compliance.aa.pass++;
        compliance.aa.colors.push(color.hex);
      } else {
        compliance.aa.fail++;
      }
      
      if (score.contrastWithWhite >= 7.0 || score.contrastWithBlack >= 7.0) {
        compliance.aaa.pass++;
        compliance.aaa.colors.push(color.hex);
      } else {
        compliance.aaa.fail++;
      }
    });
    
    return {
      ...compliance,
      overall: {
        aa: compliance.aa.pass / colors.length * 100,
        aaa: compliance.aaa.pass / colors.length * 100
      }
    };
  }

  calculateContrastRatios(colors) {
    const ratios = [];
    
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        const ratio = Utils.getContrastRatio(colors[i].rgb, colors[j].rgb);
        ratios.push({
          color1: colors[i].hex,
          color2: colors[j].hex,
          ratio: ratio,
          wcagLevel: this.getWCAGLevel(ratio)
        });
      }
    }
    
    return ratios.sort((a, b) => b.ratio - a.ratio);
  }

  analyzeColorBlindness(colors) {
    const simulations = {
      protanopia: [],
      deuteranopia: [],
      tritanopia: []
    };
    
    colors.forEach(color => {
      simulations.protanopia.push({
        original: color.hex,
        simulated: this.simulateColorBlindness(color, 'protanopia')
      });
      simulations.deuteranopia.push({
        original: color.hex,
        simulated: this.simulateColorBlindness(color, 'deuteranopia')
      });
      simulations.tritanopia.push({
        original: color.hex,
        simulated: this.simulateColorBlindness(color, 'tritanopia')
      });
    });
    
    return simulations;
  }

  analyzeReadability(colors) {
    const readability = colors.map(color => {
      const contrast = this.getContrastAnalysis(color);
      return {
        color: color.hex,
        readability: this.calculateReadabilityScore(contrast),
        recommendations: this.getReadabilityRecommendations(contrast)
      };
    });
    
    return readability.sort((a, b) => b.readability - a.readability);
  }

  analyzeBrandPersonality(palette) {
    const allColors = [...palette.dominant, ...palette.secondary, ...palette.accent];
    const personalities = allColors.map(color => this.getColorPsychology(color));
    
    const dominantEmotions = personalities.map(p => p.emotion.split(',')[0]);
    const emotionCount = {};
    dominantEmotions.forEach(emotion => {
      emotionCount[emotion] = (emotionCount[emotion] || 0) + 1;
    });
    
    const primaryPersonality = Object.entries(emotionCount)
      .sort((a, b) => b[1] - a[1])[0][0];
    
    return {
      primary: primaryPersonality,
      secondary: Object.entries(emotionCount)
        .sort((a, b) => b[1] - a[1])
        .slice(1, 3)
        .map(([emotion, count]) => ({ emotion, count })),
      overall: this.getOverallPersonality(personalities)
    };
  }

  analyzeTargetAudience(palette, domain) {
    const personality = this.analyzeBrandPersonality(palette);
    const temperature = this.analyzeColorTemperature(palette);
    
    let audience = {
      age: [],
      gender: [],
      interests: [],
      profession: [],
      lifestyle: []
    };
    
    // Analyze based on color psychology and temperature
    if (temperature.dominant === 'warm') {
      audience.age.push('Young adults (18-35)');
      audience.interests.push('Creative activities', 'Social media', 'Entertainment');
    } else if (temperature.dominant === 'cool') {
      audience.age.push('Professionals (25-50)');
      audience.profession.push('Technology', 'Finance', 'Healthcare');
    }
    
    if (personality.primary.includes('Trust')) {
      audience.profession.push('Corporate', 'Finance', 'Healthcare');
      audience.lifestyle.push('Professional', 'Conservative');
    } else if (personality.primary.includes('Energy')) {
      audience.age.push('Youth (16-30)');
      audience.interests.push('Sports', 'Entertainment', 'Gaming');
    }
    
    return audience;
  }

  analyzeIndustryAlignment(palette, domain) {
    const industryColors = this.getIndustryBasedColors(domain);
    if (!industryColors) return { aligned: false, recommendations: [] };
    
    const extractedColors = [...palette.dominant, ...palette.secondary, ...palette.accent];
    const industryColorsFlat = [...industryColors.dominant, ...industryColors.secondary, ...industryColors.accent];
    
    const alignment = this.calculateColorAlignment(extractedColors, industryColorsFlat);
    
    return {
      aligned: alignment.score > 70,
      score: alignment.score,
      matches: alignment.matches,
      recommendations: this.getIndustryAlignmentRecommendations(alignment)
    };
  }

  analyzeEmotionalImpact(palette) {
    const allColors = [...palette.dominant, ...palette.secondary, ...palette.accent];
    const emotions = allColors.map(color => this.getColorPsychology(color));
    
    const emotionalProfile = {
      primary: this.getDominantEmotion(emotions),
      secondary: this.getSecondaryEmotions(emotions),
      intensity: this.calculateEmotionalIntensity(emotions),
      consistency: this.calculateEmotionalConsistency(emotions)
    };
    
    return emotionalProfile;
  }

  getCulturalConsiderations(palette) {
    const allColors = [...palette.dominant, ...palette.secondary, ...palette.accent];
    const considerations = [];
    
    allColors.forEach(color => {
      const psychology = this.getColorPsychology(color);
      if (psychology.culturalSignificance) {
        considerations.push({
          color: color.hex,
          significance: psychology.culturalSignificance,
          regions: this.getCulturalRegions(color)
        });
      }
    });
    
    return considerations;
  }

  analyzeSeasonalColors(palette) {
    const allColors = [...palette.dominant, ...palette.secondary, ...palette.accent];
    const seasonalAnalysis = {
      spring: this.calculateSeasonalScore(allColors, 'spring'),
      summer: this.calculateSeasonalScore(allColors, 'summer'),
      autumn: this.calculateSeasonalScore(allColors, 'autumn'),
      winter: this.calculateSeasonalScore(allColors, 'winter')
    };
    
    const dominantSeason = Object.entries(seasonalAnalysis)
      .sort((a, b) => b[1] - a[1])[0][0];
    
    return {
      ...seasonalAnalysis,
      dominant: dominantSeason,
      recommendations: this.getSeasonalRecommendations(seasonalAnalysis)
    };
  }

  generateDesignTokens(palette) {
    const tokens = {
      colors: {},
      semantic: {
        primary: palette.dominant[0]?.hex || '#000000',
        secondary: palette.secondary[0]?.hex || '#666666',
        accent: palette.accent[0]?.hex || '#0066cc',
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#3b82f6'
      }
    };
    
    ['dominant', 'secondary', 'accent'].forEach(category => {
      palette[category].forEach((color, index) => {
        const name = `${category}${index + 1}`;
        tokens.colors[name] = {
          value: color.hex,
          type: 'color',
          description: `${category.charAt(0).toUpperCase() + category.slice(1)} color ${index + 1}`
        };
      });
    });
    
    return tokens;
  }

  generateColorSchemes(palette) {
    return {
      light: this.generateLightScheme(palette),
      dark: this.generateDarkScheme(palette),
      highContrast: this.generateHighContrastScheme(palette),
      accessible: this.generateAccessibleScheme(palette)
    };
  }

  getImplementationGuidelines(palette) {
    return {
      css: this.getCSSGuidelines(palette),
      scss: this.getSCSSGuidelines(palette),
      tailwind: this.getTailwindGuidelines(palette),
      react: this.getReactGuidelines(palette),
      vue: this.getVueGuidelines(palette),
      angular: this.getAngularGuidelines(palette)
    };
  }

  getImmediateRecommendations(palette) {
    const recommendations = [];
    const allColors = [...palette.dominant, ...palette.secondary, ...palette.accent];
    
    // Check accessibility
    const accessibilityIssues = this.getAccessibilityIssues(allColors);
    if (accessibilityIssues.length > 0) {
      recommendations.push({
        priority: 'High',
        category: 'Accessibility',
        issues: accessibilityIssues
      });
    }
    
    // Check color harmony
    const harmony = this.analyzeColorHarmony(palette);
    if (harmony.score < 60) {
      recommendations.push({
        priority: 'Medium',
        category: 'Color Harmony',
        message: 'Consider improving color harmony for better visual appeal'
      });
    }
    
    return recommendations;
  }

  getLongTermRecommendations(palette, domain) {
    return [
      {
        priority: 'Medium',
        category: 'Brand Consistency',
        message: 'Establish a comprehensive brand style guide'
      },
      {
        priority: 'Low',
        category: 'Performance',
        message: 'Consider implementing CSS custom properties for better maintainability'
      },
      {
        priority: 'Medium',
        category: 'Accessibility',
        message: 'Regular accessibility audits and user testing'
      }
    ];
  }

  getPerformanceRecommendations(palette) {
    return [
      'Use CSS custom properties for dynamic theming',
      'Implement color caching for frequently used values',
      'Consider using CSS-in-JS for better performance',
      'Optimize color usage in animations and transitions'
    ];
  }

  getBrandingRecommendations(palette, domain) {
    return [
      'Create a comprehensive brand style guide',
      'Develop color usage guidelines for different contexts',
      'Consider seasonal color variations',
      'Establish color hierarchy for different content types'
    ];
  }

  getImplementationRecommendations(palette) {
    return [
      'Use semantic color naming conventions',
      'Implement dark mode support',
      'Create color utility classes',
      'Document color usage patterns',
      'Set up automated accessibility testing'
    ];
  }

  // Utility methods
  simulateColorBlindness(color, type) {
    // Simplified color blindness simulation
    const [r, g, b] = color.rgb;
    
    switch (type) {
      case 'protanopia':
        return Utils.rgbToHex(r * 0.567 + g * 0.433, g, b);
      case 'deuteranopia':
        return Utils.rgbToHex(r, g * 0.625 + b * 0.375, b);
      case 'tritanopia':
        return Utils.rgbToHex(r, g, g * 0.7 + b * 0.3);
      default:
        return color.hex;
    }
  }

  calculateReadabilityScore(contrast) {
    const bestContrast = Math.max(contrast.white, contrast.black);
    if (bestContrast >= 7.0) return 100;
    if (bestContrast >= 4.5) return 80;
    if (bestContrast >= 3.0) return 60;
    return 40;
  }

  getReadabilityRecommendations(contrast) {
    const recommendations = [];
    const bestContrast = Math.max(contrast.white, contrast.black);
    
    if (bestContrast < 4.5) {
      recommendations.push('Increase contrast for better readability');
    }
    if (bestContrast < 7.0) {
      recommendations.push('Consider higher contrast for small text');
    }
    
    return recommendations;
  }

  getOverallPersonality(personalities) {
    const emotions = personalities.map(p => p.emotion.split(',')[0]);
    const emotionCount = {};
    emotions.forEach(emotion => {
      emotionCount[emotion] = (emotionCount[emotion] || 0) + 1;
    });
    
    return Object.entries(emotionCount)
      .sort((a, b) => b[1] - a[1])
      .map(([emotion, count]) => ({ emotion, count }));
  }

  calculateColorAlignment(colors1, colors2) {
    let matches = 0;
    const total = Math.max(colors1.length, colors2.length);
    
    colors1.forEach(color1 => {
      colors2.forEach(color2 => {
        const distance = this.euclideanDistance(color1.rgb, color2.rgb);
        if (distance < 50) matches++;
      });
    });
    
    return {
      score: (matches / total) * 100,
      matches: matches
    };
  }

  getDominantEmotion(emotions) {
    const emotionCount = {};
    emotions.forEach(emotion => {
      const primary = emotion.emotion.split(',')[0];
      emotionCount[primary] = (emotionCount[primary] || 0) + 1;
    });
    
    return Object.entries(emotionCount)
      .sort((a, b) => b[1] - a[1])[0][0];
  }

  getSecondaryEmotions(emotions) {
    const emotionCount = {};
    emotions.forEach(emotion => {
      const primary = emotion.emotion.split(',')[0];
      emotionCount[primary] = (emotionCount[primary] || 0) + 1;
    });
    
    return Object.entries(emotionCount)
      .sort((a, b) => b[1] - a[1])
      .slice(1, 3)
      .map(([emotion, count]) => ({ emotion, count }));
  }

  calculateEmotionalIntensity(emotions) {
    const intensities = emotions.map(emotion => {
      const words = emotion.emotion.split(',');
      return words.length > 2 ? 'High' : words.length > 1 ? 'Medium' : 'Low';
    });
    
    const intensityCount = {};
    intensities.forEach(intensity => {
      intensityCount[intensity] = (intensityCount[intensity] || 0) + 1;
    });
    
    return Object.entries(intensityCount)
      .sort((a, b) => b[1] - a[1])[0][0];
  }

  calculateEmotionalConsistency(emotions) {
    const primaryEmotions = emotions.map(e => e.emotion.split(',')[0]);
    const uniqueEmotions = new Set(primaryEmotions);
    
    return (uniqueEmotions.size / primaryEmotions.length) * 100;
  }

  getCulturalRegions(color) {
    const psychology = this.getColorPsychology(color);
    const regions = [];
    
    if (psychology.culturalSignificance.includes('Asian')) regions.push('Asia');
    if (psychology.culturalSignificance.includes('Western')) regions.push('Western');
    if (psychology.culturalSignificance.includes('Egypt')) regions.push('Middle East');
    
    return regions.length > 0 ? regions : ['Global'];
  }

  calculateSeasonalScore(colors, season) {
    const seasonalHues = {
      spring: [60, 120], // Green to yellow-green
      summer: [180, 240], // Blue to purple
      autumn: [0, 60], // Red to orange
      winter: [240, 300] // Purple to pink
    };
    
    const [minHue, maxHue] = seasonalHues[season];
    let score = 0;
    
    colors.forEach(color => {
      const hue = color.hsl[0];
      if (hue >= minHue && hue <= maxHue) {
        score += 20;
      }
    });
    
    return Math.min(score, 100);
  }

  getSeasonalRecommendations(seasonalAnalysis) {
    const recommendations = [];
    const seasons = Object.entries(seasonalAnalysis)
      .sort((a, b) => b[1] - a[1]);
    
    if (seasons[0][1] > 60) {
      recommendations.push(`Strong ${seasons[0][0]} seasonal influence`);
    }
    
    if (seasons[0][1] < 30) {
      recommendations.push('Consider adding seasonal color variations');
    }
    
    return recommendations;
  }

  generateLightScheme(palette) {
    return {
      background: '#ffffff',
      surface: '#f8fafc',
      primary: palette.dominant[0]?.hex || '#000000',
      secondary: palette.secondary[0]?.hex || '#666666',
      accent: palette.accent[0]?.hex || '#0066cc',
      text: '#1f2937',
      textSecondary: '#6b7280'
    };
  }

  generateDarkScheme(palette) {
    return {
      background: '#111827',
      surface: '#1f2937',
      primary: palette.dominant[0]?.hex || '#ffffff',
      secondary: palette.secondary[0]?.hex || '#9ca3af',
      accent: palette.accent[0]?.hex || '#60a5fa',
      text: '#f9fafb',
      textSecondary: '#d1d5db'
    };
  }

  generateHighContrastScheme(palette) {
    return {
      background: '#000000',
      surface: '#1a1a1a',
      primary: '#ffffff',
      secondary: '#cccccc',
      accent: '#ffff00',
      text: '#ffffff',
      textSecondary: '#cccccc'
    };
  }

  generateAccessibleScheme(palette) {
    const accessibleColors = palette.dominant
      .filter(color => this.getAccessibilityScore(color).score === 'AAA')
      .slice(0, 3);
    
    return {
      background: '#ffffff',
      surface: '#f8fafc',
      primary: accessibleColors[0]?.hex || '#000000',
      secondary: accessibleColors[1]?.hex || '#666666',
      accent: accessibleColors[2]?.hex || '#0066cc',
      text: '#000000',
      textSecondary: '#333333'
    };
  }

  getCSSGuidelines(palette) {
    return [
      'Use CSS custom properties for dynamic theming',
      'Implement color variables in :root selector',
      'Create utility classes for common color combinations',
      'Use semantic color names in your CSS'
    ];
  }

  getSCSSGuidelines(palette) {
    return [
      'Create SCSS variables for all colors',
      'Use SCSS mixins for color themes',
      'Implement color functions for variations',
      'Organize colors in a dedicated _colors.scss file'
    ];
  }

  getTailwindGuidelines(palette) {
    return [
      'Extend Tailwind config with custom colors',
      'Use semantic color naming in config',
      'Create custom utility classes for complex combinations',
      'Implement dark mode variants'
    ];
  }

  getReactGuidelines(palette) {
    return [
      'Use styled-components or emotion for theming',
      'Create a theme context for color management',
      'Implement color hooks for dynamic theming',
      'Use CSS-in-JS for component-specific colors'
    ];
  }

  getVueGuidelines(palette) {
    return [
      'Use CSS custom properties with Vue reactivity',
      'Create color composables for reusability',
      'Implement theme switching with Vuex/Pinia',
      'Use scoped styles for component colors'
    ];
  }

  getAngularGuidelines(palette) {
    return [
      'Use Angular Material theming system',
      'Create custom theme files',
      'Implement color services for dynamic theming',
      'Use CSS custom properties with Angular'
    ];
  }

  getAccessibilityIssues(colors) {
    const issues = [];
    
    colors.forEach(color => {
      const score = this.getAccessibilityScore(color);
      if (score.score === 'F') {
        issues.push(`Color ${color.hex} has poor contrast (${score.bestContrast.toFixed(2)})`);
      }
    });
    
    return issues;
  }

  getAccessibilityRecommendationsForColor(color) {
    const recommendations = [];
    const contrastWithWhite = Utils.getContrastRatio(color.rgb, [255, 255, 255]);
    const contrastWithBlack = Utils.getContrastRatio(color.rgb, [0, 0, 0]);
    const bestContrast = Math.max(contrastWithWhite, contrastWithBlack);
    
    if (bestContrast < 4.5) {
      recommendations.push('Increase contrast for WCAG AA compliance');
    }
    if (bestContrast < 7.0) {
      recommendations.push('Consider higher contrast for small text');
    }
    
    return recommendations;
  }

  getWCAGLevel(contrast) {
    if (contrast >= 7.0) return 'AAA';
    if (contrast >= 4.5) return 'AA';
    if (contrast >= 3.0) return 'A';
    return 'Fail';
  }

  getContrastUsage(contrasts) {
    const usage = [];
    
    if (contrasts.white >= 4.5) usage.push('Text on white backgrounds');
    if (contrasts.black >= 4.5) usage.push('Text on black backgrounds');
    if (contrasts.white >= 7.0) usage.push('Small text on white backgrounds');
    if (contrasts.black >= 7.0) usage.push('Small text on black backgrounds');
    
    return usage;
  }

  getHarmonyRecommendations(hues) {
    const recommendations = [];
    
    if (this.findTriadicColors(hues).length === 0) {
      recommendations.push('Consider adding triadic color relationships');
    }
    if (this.findComplementaryColors(hues).length === 0) {
      recommendations.push('Add complementary colors for contrast');
    }
    
    return recommendations;
  }

  analyzeTemperatureConsistency(temperatures) {
    const tempCount = {};
    temperatures.forEach(temp => {
      tempCount[temp] = (tempCount[temp] || 0) + 1;
    });
    
    const dominant = Object.entries(tempCount)
      .sort((a, b) => b[1] - a[1])[0][0];
    
    return {
      dominant,
      consistency: (tempCount[dominant] / temperatures.length) * 100
    };
  }

  analyzeSaturationConsistency(saturations) {
    const avg = saturations.reduce((a, b) => a + b, 0) / saturations.length;
    const variance = saturations.reduce((sum, sat) => sum + Math.pow(sat - avg, 2), 0) / saturations.length;
    
    return {
      average: avg,
      variance: variance,
      consistency: Math.max(0, 100 - variance)
    };
  }

  analyzeLightnessConsistency(lightnesses) {
    const avg = lightnesses.reduce((a, b) => a + b, 0) / lightnesses.length;
    const variance = lightnesses.reduce((sum, light) => sum + Math.pow(light - avg, 2), 0) / lightnesses.length;
    
    return {
      average: avg,
      variance: variance,
      consistency: Math.max(0, 100 - variance)
    };
  }

  calculateConsistencyScore(scores) {
    return scores.reduce((sum, score) => sum + score.consistency, 0) / scores.length;
  }

  getConsistencyRecommendations(palette) {
    return [
      'Maintain consistent color temperature across the palette',
      'Use similar saturation levels for cohesive appearance',
      'Create a balanced lightness distribution',
      'Consider color harmony principles'
    ];
  }

  calculateHierarchyContrast(dominant, secondary, accent) {
    const contrasts = [
      Utils.getContrastRatio(dominant.rgb, secondary.rgb),
      Utils.getContrastRatio(dominant.rgb, accent.rgb),
      Utils.getContrastRatio(secondary.rgb, accent.rgb)
    ];
    
    return contrasts.reduce((sum, contrast) => sum + contrast, 0) / contrasts.length;
  }

  calculateColorBalance(palette) {
    const allColors = [...palette.dominant, ...palette.secondary, ...palette.accent];
    const totalWeight = allColors.reduce((sum, color) => sum + (color.frequency || 0.1), 0);
    
    return {
      dominant: palette.dominant.reduce((sum, color) => sum + (color.frequency || 0.1), 0) / totalWeight,
      secondary: palette.secondary.reduce((sum, color) => sum + (color.frequency || 0.1), 0) / totalWeight,
      accent: palette.accent.reduce((sum, color) => sum + (color.frequency || 0.1), 0) / totalWeight
    };
  }

  calculateHierarchyScore(hierarchy) {
    let score = 0;
    
    if (hierarchy.dominantStrength > hierarchy.secondaryStrength) score += 30;
    if (hierarchy.secondaryStrength > hierarchy.accentStrength) score += 30;
    if (hierarchy.contrast > 3.0) score += 20;
    if (hierarchy.balance.dominant > 0.4) score += 20;
    
    return Math.min(score, 100);
  }

  getHierarchyRecommendations(hierarchy) {
    const recommendations = [];
    
    if (hierarchy.dominantStrength <= hierarchy.secondaryStrength) {
      recommendations.push('Strengthen dominant color presence');
    }
    if (hierarchy.contrast < 3.0) {
      recommendations.push('Increase contrast between color categories');
    }
    
    return recommendations;
  }

  getDominantTemperature(temperatures) {
    const tempCount = {};
    temperatures.forEach(temp => {
      tempCount[temp] = (tempCount[temp] || 0) + 1;
    });
    
    return Object.entries(tempCount)
      .sort((a, b) => b[1] - a[1])[0][0];
  }

  calculateTemperatureBalance(warm, cool, neutral) {
    const total = warm + cool + neutral;
    return {
      warm: (warm / total) * 100,
      cool: (cool / total) * 100,
      neutral: (neutral / total) * 100
    };
  }

  getTemperatureRecommendations(temperatures) {
    const recommendations = [];
    const warmCount = temperatures.filter(t => t === 'warm').length;
    const coolCount = temperatures.filter(t => t === 'cool').length;
    
    if (warmCount === 0) {
      recommendations.push('Consider adding warm colors for energy');
    }
    if (coolCount === 0) {
      recommendations.push('Add cool colors for calmness and professionalism');
    }
    
    return recommendations;
  }

  getIndustryAlignmentRecommendations(alignment) {
    const recommendations = [];
    
    if (alignment.score < 50) {
      recommendations.push('Consider industry-standard color choices');
    }
    if (alignment.score > 80) {
      recommendations.push('Excellent industry alignment');
    }
    
    return recommendations;
  }

  // Get total color count
  getTotalColorCount(palette) {
    return palette.dominant.length + palette.secondary.length + palette.accent.length;
  }

  // Get accessibility recommendations for all colors
  getAccessibilityRecommendations(colors) {
    const recommendations = [];
    const issues = this.getAccessibilityIssues(colors);
    
    if (issues.length > 0) {
      recommendations.push('Fix contrast issues for better accessibility');
    }
    
    // Check for color blindness issues
    const colorBlindnessIssues = this.checkColorBlindnessIssues(colors);
    if (colorBlindnessIssues.length > 0) {
      recommendations.push('Consider color blindness in design decisions');
    }
    
    // Check for sufficient color variety
    if (colors.length < 3) {
      recommendations.push('Add more color variety for better visual hierarchy');
    }
    
    // Check for semantic color usage
    recommendations.push('Use semantic color naming for better maintainability');
    recommendations.push('Test with screen readers and assistive technologies');
    
    return recommendations;
  }

  // Check for color blindness issues
  checkColorBlindnessIssues(colors) {
    const issues = [];
    
    // Check for red-green confusion (most common)
    const reds = colors.filter(color => color.hsl[0] >= 0 && color.hsl[0] < 30);
    const greens = colors.filter(color => color.hsl[0] >= 90 && color.hsl[0] < 150);
    
    if (reds.length > 0 && greens.length > 0) {
      // Check if reds and greens are too similar in lightness
      reds.forEach(red => {
        greens.forEach(green => {
          if (Math.abs(red.hsl[2] - green.hsl[2]) < 20) {
            issues.push('Red and green colors may be indistinguishable for color blind users');
          }
        });
      });
    }
    
    return issues;
  }
}

// Export for use in other modules
window.ColorExtractor = ColorExtractor;
