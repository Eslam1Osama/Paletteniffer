// Service Worker for Paletteniffer
const CACHE_NAME = 'paletteniffer-v1.0.0';
const STATIC_CACHE = 'paletteniffer-static-v1.0.0';
const DYNAMIC_CACHE = 'paletteniffer-dynamic-v1.0.0';

// Files to cache immediately
const STATIC_FILES = [
  '/',
  '/index.html',
  '/styles.css',
  '/js/app.js',
  '/js/ui-manager.js',
  '/js/color-extractor.js',
  '/js/utils.js',
  '/assets/logo_light.png',
  '/assets/logo_dark.png',
  '/manifest.json',
  '/offline.html',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// Install event - cache static files
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('Service Worker: Caching static files');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('Service Worker: Static files cached successfully');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('Service Worker: Failed to cache static files', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('Service Worker: Deleting old cache', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker: Activated successfully');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip unsupported schemes
  if (request.url.startsWith('chrome-extension://') || 
      request.url.startsWith('chrome://') || 
      request.url.startsWith('moz-extension://') ||
      request.url.startsWith('edge://')) {
    return;
  }
  
  // Handle different types of requests
  if (request.destination === 'image') {
    // Images: Cache first, then network
    event.respondWith(handleImageRequest(request));
  } else if (url.pathname.startsWith('/js/') || url.pathname.startsWith('/css/')) {
    // JS/CSS: Cache first, then network
    event.respondWith(handleStaticRequest(request));
  } else if (url.origin === location.origin) {
    // Same-origin requests: Network first, then cache
    event.respondWith(handleSameOriginRequest(request));
  } else {
    // External requests: Network only
    event.respondWith(handleExternalRequest(request));
  }
});

// Handle image requests (cache first)
async function handleImageRequest(request) {
  try {
    // Skip chrome-extension and other unsupported schemes
    if (request.url.startsWith('chrome-extension://') || 
        request.url.startsWith('chrome://') || 
        request.url.startsWith('moz-extension://') ||
        request.url.startsWith('edge://')) {
      return fetch(request);
    }
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('Service Worker: Image fetch failed', error);
    return new Response('Image not available', { status: 404 });
  }
}

// Handle static file requests (cache first)
async function handleStaticRequest(request) {
  try {
    // Skip chrome-extension and other unsupported schemes
    if (request.url.startsWith('chrome-extension://') || 
        request.url.startsWith('chrome://') || 
        request.url.startsWith('moz-extension://') ||
        request.url.startsWith('edge://')) {
      return fetch(request);
    }
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Update cache in background
      fetch(request).then(response => {
        if (response.ok) {
          caches.open(STATIC_CACHE).then(cache => {
            cache.put(request, response);
          });
        }
      });
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('Service Worker: Static file fetch failed', error);
    return new Response('Resource not available', { status: 404 });
  }
}

// Handle same-origin requests (network first)
async function handleSameOriginRequest(request) {
  try {
    // Skip chrome-extension and other unsupported schemes
    if (request.url.startsWith('chrome-extension://') || 
        request.url.startsWith('chrome://') || 
        request.url.startsWith('moz-extension://') ||
        request.url.startsWith('edge://')) {
      return fetch(request);
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('Service Worker: Same-origin fetch failed', error);
    
    // Fallback to cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page for HTML requests
    if (request.headers.get('accept').includes('text/html')) {
      return caches.match('/offline.html');
    }
    
    return new Response('Network error', { status: 503 });
  }
}

// Handle external requests (network only)
async function handleExternalRequest(request) {
  try {
    // Skip chrome-extension and other unsupported schemes
    if (request.url.startsWith('chrome-extension://') || 
        request.url.startsWith('chrome://') || 
        request.url.startsWith('moz-extension://') ||
        request.url.startsWith('edge://')) {
      return fetch(request);
    }
    
    return await fetch(request);
  } catch (error) {
    console.error('Service Worker: External fetch failed', error);
    return new Response('External resource not available', { status: 503 });
  }
}







// Message handling for communication with main thread
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
}); 