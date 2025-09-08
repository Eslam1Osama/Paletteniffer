// Feature flags and environment configuration for Paletteniffer
// Keep minimal and readable; avoids duplicating logic elsewhere.
// Consumers should read from window.AppConfig for runtime flags.

(function() {
  const AppConfig = {
    // When false, external URL extraction strategies (headless APIs, proxies, SSR)
    // are disabled. The app will rely on metadata/heuristic fallbacks only.
    enableExternalUrlExtraction: true,

    // Optionally hide the URL analysis tab entirely when external extraction
    // is disabled. Keeps UI consistent for deployments without backend support.
    hideUrlAnalysisTabWhenDisabled: false,

    // Granular strategy toggles
    enableHeadlessProviders: false, // browserless/puppeteer/playwright APIs (require CORS+keys)
    enableServerSideRenderingProviders: false, // render/vercel screenshot APIs
    enableCORSProxies: true, // codetabs/corsproxy.io/cors-anywhere

    // Provider configuration (override endpoints/headers as needed)
    headlessProviders: [
      {
        name: 'browserless',
        endpoint: 'https://chrome.browserless.io/screenshot',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: (url) => JSON.stringify({ url, viewport: { width: 1280, height: 720 }, waitFor: 2000, options: { fullPage: false, type: 'png', quality: 80 } })
      },
      {
        name: 'puppeteer-api',
        endpoint: 'https://api.puppeteer.dev/screenshot',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: (url) => JSON.stringify({ url, viewport: { width: 1280, height: 720 }, waitUntil: 'networkidle2', timeout: 30000 })
      },
      {
        name: 'playwright-api',
        endpoint: 'https://api.playwright.dev/screenshot',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: (url) => JSON.stringify({ url, viewport: { width: 1280, height: 720 }, waitForLoadState: 'networkidle' })
      }
    ],

    ssrProviders: [
      {
        name: 'render-api',
        endpoint: 'https://api.render.com/v1/services/screenshot',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: (url) => JSON.stringify({ url, viewport: { width: 1280, height: 720 }, waitFor: 3000 })
      },
      {
        name: 'vercel-api',
        endpoint: 'https://api.vercel.com/v1/screenshot',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: (url) => JSON.stringify({ url, width: 1280, height: 720, wait: 3000 })
      }
    ],

    // Logging configuration for production MVP
    logging: {
      suppressLog: true,
      suppressInfo: true,
      suppressWarn: true,
      suppressDebug: true,
      suppressError: false,
      captureBuffer: false,
      maxBuffer: 500
    }
  };

  window.AppConfig = Object.freeze(AppConfig);
})();


