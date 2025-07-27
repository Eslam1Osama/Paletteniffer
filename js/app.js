
// Main application entry point

const preloaderMinTime = 1200;

class ColorPaletteExtractorApp {
  constructor() {
    this.uiManager = null;
    this.init();
  }

  async init() {
    try {
      // Wait for DOM to be fully loaded
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.start());
      } else {
        this.start();
      }
    } catch (error) {
      console.error('Failed to initialize app:', error);
      this.showFallbackError();
    }
  }

  start() {
    try {
      const startTime = Date.now();
      // Initialize UI Manager
      try {
        this.uiManager = new UIManager();
      } catch (uiError) {
        console.error('UIManager initialization error:', uiError);
        this.showFallbackError('UIManager failed: ' + (uiError && uiError.stack ? uiError.stack : uiError));
        return;
      }
      
      // Initialize service worker for PWA functionality (optional)
      this.initializeServiceWorker();
      
      // Set up global error handling
      this.setupErrorHandling();
      
      // Initialize accessibility features
      this.initializeAccessibility();
      
      // Wait for preloaderMinTime and then hide preloader when app is ready
      const ready = () => {
        const elapsed = Date.now() - startTime;
        const wait = Math.max(0, preloaderMinTime - elapsed);
        setTimeout(() => {
          if (window.hidePlatformPreloader) window.hidePlatformPreloader();
          document.body.classList.add('loaded');
        }, wait);
      };
      // If you have async loading, call ready() after all is done. For now, call immediately after UIManager is ready:
      ready();
      console.log('Color Palette Extractor App initialized successfully');
      
    } catch (error) {
      console.error('Failed to start app:', error);
      this.showFallbackError(error && error.stack ? error.stack : error);
    }
  }

  async initializeServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered:', registration);
        
        // Handle service worker updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker available
              this.showUpdateNotification();
            }
          });
        });
        
        // Handle service worker messages
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'CACHE_UPDATED') {
            console.log('Cache updated successfully');
          }
        });
        
      } catch (error) {
        console.log('Service Worker registration failed:', error);
      }
    }
  }
  
  showUpdateNotification() {
    if (this.uiManager) {
      this.uiManager.showToast('New version available! Refresh to update.', 'info');
    }
  }

  setupErrorHandling() {
    // Global error handler
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error);
      if (this.uiManager) {
        this.uiManager.showToast('An unexpected error occurred. Please try again.', 'error');
      }
    });

    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      if (this.uiManager) {
        this.uiManager.showToast('An unexpected error occurred. Please try again.', 'error');
      }
      event.preventDefault();
    });
  }

  initializeAccessibility() {
    // Add keyboard navigation support
    document.addEventListener('keydown', (e) => {
      this.handleKeyboardNavigation(e);
    });

    // Add focus management
    this.setupFocusManagement();
    
    // Add screen reader announcements
    this.setupScreenReaderSupport();
  }

  handleKeyboardNavigation(e) {
    // ESC key to close tooltip
    if (e.key === 'Escape') {
      if (this.uiManager) {
        this.uiManager.hideColorTooltip();
      }
    }
  }

  setupFocusManagement() {
    // Ensure proper focus management for dynamically created elements
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Add tabindex to color swatches for keyboard accessibility
              const swatches = node.querySelectorAll('.color-swatch');
              swatches.forEach((swatch, index) => {
                swatch.setAttribute('tabindex', '0');
                swatch.setAttribute('role', 'button');
                swatch.setAttribute('aria-label', `Color ${swatch.style.backgroundColor}, click to copy`);
                
                // Add keyboard event listener
                swatch.addEventListener('keydown', (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    swatch.click();
                  }
                });
              });
            }
          });
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  setupScreenReaderSupport() {
    // Create live region for announcements
    const liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.className = 'sr-only';
    liveRegion.style.cssText = 'position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;';
    document.body.appendChild(liveRegion);

    // Function to announce messages to screen readers
    window.announceToScreenReader = (message) => {
      liveRegion.textContent = message;
      setTimeout(() => {
        liveRegion.textContent = '';
      }, 1000);
    };
  }

  showFallbackError(msg) {
    const errorHtml = `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        text-align: center;
        padding: 2rem;
        background: linear-gradient(135deg, #f0f4f8, #e2e8f0);
        color: #2d3748;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">
        <div style="
          background: white;
          padding: 3rem;
          border-radius: 1rem;
          box-shadow: 0 10px 25px rgba(0,0,0,0.1);
          max-width: 500px;
        ">
          <div style="
            width: 4rem;
            height: 4rem;
            background: #e53e3e;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 1.5rem;
            color: white;
            font-size: 1.5rem;
          ">⚠</div>
          <h1 style="margin: 0 0 1rem; font-size: 1.5rem; font-weight: 600;">
            Application Error
          </h1>
          <p style="margin: 0 0 1.5rem; color: #718096; line-height: 1.6;">
            We're sorry, but the Color Palette Extractor failed to load properly.<br>
            <span style='color:#e53e3e;font-size:0.95em;word-break:break-all;'>${msg ? msg : ''}</span><br>
            Please refresh the page and try again.
          </p>
          <button onclick="window.location.reload()" style="
            background: #3182ce;
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 0.5rem;
            cursor: pointer;
            font-weight: 500;
            transition: background 0.2s;
          " onmouseover="this.style.background='#2c5282'" onmouseout="this.style.background='#3182ce'">
            Refresh Page
          </button>
        </div>
      </div>
    `;
    
    document.body.innerHTML = errorHtml;
  }
}

// Initialize the application
const app = new ColorPaletteExtractorApp();

// Export for global access
window.ColorPaletteExtractorApp = ColorPaletteExtractorApp;

// Initialize platform navigation after DOM is ready and app is initialized
document.addEventListener('DOMContentLoaded', function() {
  if (window.PlatformNavigationManager) {
    const platformNav = new PlatformNavigationManager();
    platformNav.init({
      insertAfter: '.header-actions'
    });
  }
});
