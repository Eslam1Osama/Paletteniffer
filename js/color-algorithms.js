// ColorAlgorithms: shared, pure functions for pixel sampling and k-means clustering
// This module is used by both the main thread and the Web Worker to avoid duplication.
(function() {
  var root = (typeof self !== 'undefined') ? self : window;

  if (root.ColorAlgorithms) {
    return; // Avoid redefining if already present
  }

  var ColorAlgorithms = {
    // Extract representative colors from ImageData using k-means
    extractColorsFromImageData: function(imageData, k, options) {
      options = options || {};
      var alphaThreshold = typeof options.alphaThreshold === 'number' ? options.alphaThreshold : 128;
      var sampleStep = typeof options.sampleStep === 'number' ? options.sampleStep : 16; // match existing sampling cadence

      var pixels = ColorAlgorithms.samplePixels(imageData, sampleStep, alphaThreshold);
      if (pixels.length === 0) return [];

      var clusters = ColorAlgorithms.kMeansCluster(pixels, k || 8, 50);
      return clusters
        .map(function(cluster) {
          var r = Math.round(cluster.centroid[0]);
          var g = Math.round(cluster.centroid[1]);
          var b = Math.round(cluster.centroid[2]);
          var hex = Utils.rgbToHex(r, g, b);
          var hsl = Utils.rgbToHsl(r, g, b);
          return {
            hex: hex,
            rgb: [r, g, b],
            hsl: hsl,
            frequency: cluster.size / pixels.length
          };
        })
        .filter(function(color) { return color.frequency > 0.002; })
        .sort(function(a, b) { return b.frequency - a.frequency; });
    },

    // Sample pixels from ImageData using step and alpha threshold
    samplePixels: function(imageData, step, alphaThreshold) {
      var data = imageData.data;
      var pixels = [];
      var stride = Math.max(1, step || 16);
      var alphaMin = typeof alphaThreshold === 'number' ? alphaThreshold : 128;

      for (var i = 0; i < data.length; i += 4 * stride) {
        var r = data[i];
        var g = data[i + 1];
        var b = data[i + 2];
        var a = data[i + 3];
        if (a > alphaMin) {
          pixels.push([r, g, b]);
        }
      }
      return pixels;
    },

    // K-means clustering
    kMeansCluster: function(pixels, k, maxIterations) {
      if (!pixels || pixels.length === 0 || !k || k <= 0) return [];
      var iterations = Math.max(1, maxIterations || 50);

      // Initialize centroids randomly
      var centroids = [];
      for (var i = 0; i < k; i++) {
        var randomPixel = pixels[Math.floor(Math.random() * pixels.length)];
        centroids.push([randomPixel[0], randomPixel[1], randomPixel[2]]);
      }

      var assignments = new Array(pixels.length);
      var hasChanged = true;
      var loops = 0;

      while (hasChanged && loops < iterations) {
        hasChanged = false;

        // Assign
        for (var pi = 0; pi < pixels.length; pi++) {
          var pixel = pixels[pi];
          var minDistance = Infinity;
          var assignment = 0;
          for (var cj = 0; cj < centroids.length; cj++) {
            var distance = ColorAlgorithms.euclideanDistance(pixel, centroids[cj]);
            if (distance < minDistance) {
              minDistance = distance;
              assignment = cj;
            }
          }
          if (assignments[pi] !== assignment) {
            assignments[pi] = assignment;
            hasChanged = true;
          }
        }

        // Update
        var newCentroids = [];
        for (var ck = 0; ck < k; ck++) {
          var sumR = 0, sumG = 0, sumB = 0, count = 0;
          for (var ai = 0; ai < pixels.length; ai++) {
            if (assignments[ai] === ck) {
              sumR += pixels[ai][0];
              sumG += pixels[ai][1];
              sumB += pixels[ai][2];
              count++;
            }
          }
          if (count > 0) {
            newCentroids.push([sumR / count, sumG / count, sumB / count]);
          } else {
            newCentroids.push(centroids[ck]);
          }
        }
        centroids = newCentroids;
        loops++;
      }

      // Build cluster list with sizes
      var sizes = new Array(k).fill(0);
      assignments.forEach(function(a) { if (typeof a === 'number') sizes[a]++; });
      var clusters = [];
      for (var i2 = 0; i2 < k; i2++) {
        if (sizes[i2] > 0) {
          clusters.push({ centroid: centroids[i2], size: sizes[i2] });
        }
      }
      return clusters.sort(function(a, b) { return b.size - a.size; });
    },

    euclideanDistance: function(c1, c2) {
      var dr = c1[0] - c2[0];
      var dg = c1[1] - c2[1];
      var db = c1[2] - c2[2];
      return Math.sqrt(dr * dr + dg * dg + db * db);
    }
  };

  root.ColorAlgorithms = ColorAlgorithms;
})();


