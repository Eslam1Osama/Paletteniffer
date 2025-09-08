# Paletteniffer – Color Palette Extractor (1.2 Version)

> Production-grade color analysis and export for design and engineering teams.

[![License: Commercial](https://img.shields.io/badge/license-Commercial-orange.svg)](#license)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://paletteniffer.vercel.app/)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-brightgreen.svg)](https://web.dev/progressive-web-apps/)
[![WCAG AA](https://img.shields.io/badge/WCAG-AA%20Compliant-green.svg)](https://www.w3.org/WAI/WCAG2AA-Conformance)

Paletteniffer is a professional-grade color palette extractor. It analyzes images and (optionally) websites to derive brand-ready palettes with accessibility insights and developer exports. This edition is delivered commercially by EasOfTopia.

## Contents
- Overview
- Features
- Architecture
- Getting started
- Configuration (feature flags)
- PWA and offline
- Accessibility (A11y)
- Security and hardening
- Performance guidance
- Deployment
- Troubleshooting
- Roadmap
- Versioning
- License and ownership
- Support & contact

## Overview
Paletteniffer provides:
- Accurate, fast color extraction from images (Web Worker accelerated)
- Optional website analysis via multiple strategies (feature-gated)
- A11y scoring and developer-friendly exports (CSS/SCSS/Tailwind/JSON/ASE)
- PWA installability, offline fallback, and subpath-safe hosting

## Features
- Image analysis
  - K-means clustering with adaptive sampling
  - Off-main-thread processing via Web Worker
  - Large image handling with optimized canvas reads
- Website analysis (feature-gated)
  - Multi-strategy with CORS-proxy and metadata fallbacks
  - Retries, exponential backoff, and safe defaults
- Professional exports
  - CSS variables, SCSS variables, Tailwind config, JSON, Adobe ASE
- Accessibility & UX
  - WCAG contrast metrics and guidance
  - Accessible tabs, modals, keyboard navigation, and focus management
- PWA
  - Offline support, installable manifest, resilient service worker

## Architecture
```
paletteniffer/
├── index.html
├── styles.css
├── manifest.json
├── sw.js
├── offline.html
├── robots.txt
├── sitemap.xml
├── browserconfig.xml
├── js/
│   ├── app.js                # App bootstrap, SW reg, fallbacks, a11y setup
│   ├── ui-manager.js         # UI state, interactions, a11y tab semantics
│   ├── color-extractor.js    # Orchestration (fetch, analysis, exports)
│   ├── color-algorithms.js   # Shared k-means & sampling (main + worker)
│   ├── workers/
│   │   └── imageWorker.js    # Off-main-thread image analysis
│   ├── modal.js              # Accessible modal component
│   ├── utils.js              # Math, color utils, clipboard, helpers
│   ├── config.js             # Feature flags and providers
│   ├── logger.js             # Environment-driven logging suppression
│   └── platformNavigation.js # Optional platform navigation integration
└── assets/
    ├── logo_light.png
    └── logo_dark.png
```

## PWA and offline
- `manifest.json`: subpath-safe (`start_url`/`scope` = "."), correct icons, theme colors
- `sw.js`: cache-first for static assets, dynamic cache for same-origin, guards for non-http(s)/extensions; offline fallback `offline.html`

## Accessibility (A11y)
- Tabs: `role=tablist/tab/tabpanel`, keyboard navigation (Arrow/Home/End)
- Modal: focus trap, Esc/overlay dismiss, copy controls
- Tooltips: keyboard focusable; tokens sized for readability

## Security and hardening
- Prefer self-hosted icon sets or add SRI when loading from CDNs
- Recommended CSP (example):
```
Content-Security-Policy:
  default-src 'self';
  img-src 'self' data: https:; 
  style-src 'self' https: 'unsafe-inline';
  script-src 'self';
  connect-src 'self' https:; 
  worker-src 'self';
```
- Service worker skips non-http(s) schemes and extension URLs
- URL analysis strategies are gated; expect CORS constraints on public sites

## Performance guidance
- Web Worker handles image clustering off the main thread
- Canvas contexts use `willReadFrequently` for efficient readbacks
- For very large images, prefer downscaling before analysis
- Optional: move heavy HTML parsing to a worker for extreme pages

## Troubleshooting
- URL analysis fails with CORS errors
  - Disable headless/SSR providers or proxy through a backend you control
- SW not updating
  - Bump cache names in `sw.js` and hard refresh (Shift+Reload)
- Console noise
  - Adjust `js/config.js` logging flags; service worker console is suppressed by default

## Roadmap
- Workerization of HTML/CSS parsing
- 512×512 icon variants and PWA shortcuts
- CSP/SRI presets and optional reporting integration
- Unit tests for algorithms, E2E smoke flows, CI pipeline

## Versioning
- Semantic Versioning. Current version: `1.0.0`.

## License and ownership
This software is commercially licensed by **EasOfTopia**. All rights reserved.

- Unauthorized use, copying, modification, distribution, or sale is prohibited.
- For licensing inquiries, enterprise distribution, and OEM/white-label, contact EOPeak.

## Support & contact
- Brand: **EasOfTopia**
- Maintainer: **Eng/Dev/Design/CEO: Eslam Osama Saad**
- Live demo: `https://paletteniffer.vercel.app/`
- Email: eo6014501@gmail.com 
- Phone Number: +201555489089

## Acknowledgments
- Color science and WCAG guidance
- Web standards and PWA community
