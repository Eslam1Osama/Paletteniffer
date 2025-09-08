// Image analysis Web Worker
// Loads shared utilities and algorithms, receives ImageData buffers, returns extracted colors

/* eslint-disable no-restricted-globals */
importScripts('../utils.js', '../color-algorithms.js');

self.onmessage = function(e) {
  try {
    var data = e.data || {};
    var id = data.id;
    var width = data.width;
    var height = data.height;

    // Rehydrate ImageData from transferred buffer
    var buffer = data.buffer;
    var clamped = new Uint8ClampedArray(buffer);
    var imageData = new ImageData(clamped, width, height);

    var k = typeof data.k === 'number' ? data.k : 32; // keep parity with main-thread default
    var opts = {
      alphaThreshold: typeof data.alphaThreshold === 'number' ? data.alphaThreshold : 128,
      sampleStep: typeof data.sampleStep === 'number' ? data.sampleStep : 16
    };

    var colors = self.ColorAlgorithms.extractColorsFromImageData(imageData, k, opts) || [];
    self.postMessage({ id: id, ok: true, colors: colors });
  } catch (err) {
    self.postMessage({ id: e.data && e.data.id, ok: false, error: (err && err.message) || 'Worker error' });
  }
};


