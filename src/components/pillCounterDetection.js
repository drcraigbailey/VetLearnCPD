const detectionPresets = {
  strict: {
    brightBoost: 34,
    colorBoost: 46,
    darkBoost: 42,
    minAreaFactor: 0.00012,
    maxAreaFactor: 0.04,
    minFill: 0.42,
    minCircularity: 0.19,
    minDiameter: 8,
    closeIterations: 1,
  },
  normal: {
    brightBoost: 22,
    colorBoost: 32,
    darkBoost: 34,
    minAreaFactor: 0.000075,
    maxAreaFactor: 0.06,
    minFill: 0.32,
    minCircularity: 0.11,
    minDiameter: 7,
    closeIterations: 1,
  },
  sensitive: {
    brightBoost: 12,
    colorBoost: 20,
    darkBoost: 26,
    minAreaFactor: 0.000045,
    maxAreaFactor: 0.075,
    minFill: 0.23,
    minCircularity: 0.06,
    minDiameter: 6,
    closeIterations: 2,
  },
};

export function detectPillsFromImage(imageUrl, mode = "normal", crop = null, calibration = null) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const result = findPillMarkers(image, mode, crop, calibration);
        const warnings = analysePillPhotoQuality(image, result.analysis);
        resolve({ markers: result.markers, warnings });
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("Image could not be loaded"));
    image.src = imageUrl;
  });
}

function findPillMarkers(image, mode = "normal", crop = null, calibration = null) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) return { markers: [], analysis: {} };

  const preset = detectionPresets[mode] || detectionPresets.normal;
  const cropRegion = normaliseCrop(crop);
  const sourceX = Math.round((cropRegion.x / 100) * sourceWidth);
  const sourceY = Math.round((cropRegion.y / 100) * sourceHeight);
  const croppedWidth = Math.max(1, Math.round((cropRegion.width / 100) * sourceWidth));
  const croppedHeight = Math.max(1, Math.round((cropRegion.height / 100) * sourceHeight));
  const maxDimension = 760;
  const scale = Math.min(1, maxDimension / Math.max(croppedWidth, croppedHeight));
  const width = Math.max(1, Math.round(croppedWidth * scale));
  const height = Math.max(1, Math.round(croppedHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { markers: [], analysis: {} };

  context.drawImage(image, sourceX, sourceY, croppedWidth, croppedHeight, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const pixelCount = width * height;
  const luminance = new Uint8Array(pixelCount);
  const saturation = new Uint8Array(pixelCount);
  const histogram = new Array(256).fill(0);
  let luminanceTotal = 0;
  let glarePixels = 0;
  let gradientTotal = 0;
  let gradientSquaredTotal = 0;
  let gradientSamples = 0;

  for (let pixel = 0, dataIndex = 0; pixel < pixelCount; pixel += 1, dataIndex += 4) {
    const red = data[dataIndex];
    const green = data[dataIndex + 1];
    const blue = data[dataIndex + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const lum = Math.round(0.299 * red + 0.587 * green + 0.114 * blue);
    const sat = max === 0 ? 0 : Math.round(((max - min) / max) * 255);
    luminance[pixel] = lum;
    saturation[pixel] = sat;
    histogram[lum] += 1;
    luminanceTotal += lum;
    if (lum >= 246 && sat <= 34) glarePixels += 1;
    if (pixel > width) {
      const gradient = Math.abs(lum - luminance[pixel - 1]) + Math.abs(lum - luminance[pixel - width]);
      gradientTotal += gradient;
      gradientSquaredTotal += gradient * gradient;
      gradientSamples += 1;
    }
  }

  const averageLuminance = luminanceTotal / pixelCount;
  const luminanceVariance = histogram.reduce((total, count, value) => total + count * (value - averageLuminance) ** 2, 0) / pixelCount;
  const contrast = Math.sqrt(luminanceVariance);
  const averageGradient = gradientSamples ? gradientTotal / gradientSamples : 0;
  const gradientVariance = gradientSamples ? gradientSquaredTotal / gradientSamples - averageGradient ** 2 : 0;
  const otsu = otsuThreshold(histogram, pixelCount);
  const brightThreshold = Math.min(246, Math.max(76, otsu + 8, averageLuminance + preset.brightBoost));
  const colorThreshold = Math.min(238, Math.max(86, averageLuminance + preset.colorBoost));
  const darkThreshold = Math.max(12, Math.min(otsu - 8, averageLuminance - preset.darkBoost));
  const allowDarkObjects = averageLuminance > 145;
  const rawMask = new Uint8Array(pixelCount);

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const lum = luminance[pixel];
    const sat = saturation[pixel];
    const brightTablet = lum >= brightThreshold && sat <= 205;
    const coloredTablet = lum >= colorThreshold && sat >= 28 && sat <= 225;
    const darkTablet = allowDarkObjects && lum <= darkThreshold && sat >= 18 && sat <= 230;
    rawMask[pixel] = brightTablet || coloredTablet || darkTablet ? 1 : 0;
  }

  const openedMask = dilateMask(erodeMask(rawMask, width, height), width, height);
  let cleanedMask = openedMask;
  for (let i = 0; i < preset.closeIterations; i += 1) {
    cleanedMask = erodeMask(dilateMask(cleanedMask, width, height), width, height);
  }

  const componentResult = connectedComponentMarkers(cleanedMask, width, height, pixelCount, preset, calibration, cropRegion);
  return {
    markers: componentResult.markers,
    analysis: {
      sourceWidth,
      sourceHeight,
      averageLuminance,
      contrast,
      glareRatio: glarePixels / pixelCount,
      sharpness: Math.max(0, gradientVariance),
      edgeComponents: componentResult.edgeComponents,
      splitBlobs: componentResult.splitBlobs,
      noisyComponentCount: componentResult.noisyComponentCount,
    },
  };
}

function normaliseCrop(crop) {
  if (!crop) return { x: 0, y: 0, width: 100, height: 100 };
  const x = Math.min(95, Math.max(0, Number(crop.x) || 0));
  const y = Math.min(95, Math.max(0, Number(crop.y) || 0));
  return {
    x,
    y,
    width: Math.min(100 - x, Math.max(5, Number(crop.width) || 100)),
    height: Math.min(100 - y, Math.max(5, Number(crop.height) || 100)),
  };
}

function analysePillPhotoQuality(image, analysis = {}) {
  const warnings = [];
  const width = image.naturalWidth || image.width || 0;
  const height = image.naturalHeight || image.height || 0;

  if (width < 640 || height < 480) warnings.push("Image resolution is low. Move closer or use a larger photo.");
  if (analysis.averageLuminance < 58) warnings.push("Image looks quite dark. Use brighter, even lighting.");
  if (analysis.averageLuminance > 220 || analysis.glareRatio > 0.1) warnings.push("Possible glare detected. Move away from direct light.");
  if (analysis.contrast > 0 && analysis.contrast < 28) warnings.push("Low contrast detected. Use a plain contrasting background.");
  if (analysis.sharpness > 0 && analysis.sharpness < 90) warnings.push("Image may be blurred. Hold the camera steady and refocus.");
  if (analysis.edgeComponents > 0) warnings.push("Some tablets may touch the image edge. Keep all tablets fully in frame.");
  if (analysis.splitBlobs > 0) warnings.push("Some tablets appear to touch. Spread tablets apart for best accuracy.");
  if (analysis.noisyComponentCount > 45) warnings.push("The background looks busy. Use a plain surface where possible.");

  return [...new Set(warnings)].slice(0, 5);
}

function otsuThreshold(histogram, total) {
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * histogram[i];

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let i = 0; i < 256; i += 1) {
    weightBackground += histogram[i];
    if (weightBackground === 0) continue;

    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += i * histogram[i];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = i;
    }
  }

  return threshold;
}

function erodeMask(mask, width, height) {
  const output = new Uint8Array(mask.length);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;

      let keep = 1;
      for (let dy = -1; dy <= 1 && keep; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!mask[index + dy * width + dx]) {
            keep = 0;
            break;
          }
        }
      }
      output[index] = keep;
    }
  }

  return output;
}

function dilateMask(mask, width, height) {
  const output = new Uint8Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;

      for (let dy = -1; dy <= 1; dy += 1) {
        const nextY = y + dy;
        if (nextY < 0 || nextY >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nextX = x + dx;
          if (nextX < 0 || nextX >= width) continue;
          output[nextY * width + nextX] = 1;
        }
      }
    }
  }

  return output;
}

function connectedComponentMarkers(mask, width, height, pixelCount, preset, calibration, cropRegion) {
  const visited = new Uint8Array(pixelCount);
  const stack = new Int32Array(pixelCount);
  const components = [];
  const minArea = Math.max(18, pixelCount * preset.minAreaFactor);
  const maxArea = pixelCount * preset.maxAreaFactor;
  let edgeComponents = 0;
  let noisyComponentCount = 0;

  for (let start = 0; start < pixelCount; start += 1) {
    if (!mask[start] || visited[start]) continue;

    let top = 0;
    let area = 0;
    let perimeter = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let touchesEdge = false;

    stack[top] = start;
    top += 1;
    visited[start] = 1;

    while (top > 0) {
      top -= 1;
      const index = stack[top];
      const x = index % width;
      const y = Math.floor(index / width);

      area += 1;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x <= 1 || y <= 1 || x >= width - 2 || y >= height - 2) touchesEdge = true;

      const left = index - 1;
      const right = index + 1;
      const up = index - width;
      const down = index + width;

      if (x === 0 || !mask[left]) perimeter += 1;
      else if (!visited[left]) {
        visited[left] = 1;
        stack[top] = left;
        top += 1;
      }

      if (x === width - 1 || !mask[right]) perimeter += 1;
      else if (!visited[right]) {
        visited[right] = 1;
        stack[top] = right;
        top += 1;
      }

      if (y === 0 || !mask[up]) perimeter += 1;
      else if (!visited[up]) {
        visited[up] = 1;
        stack[top] = up;
        top += 1;
      }

      if (y === height - 1 || !mask[down]) perimeter += 1;
      else if (!visited[down]) {
        visited[down] = 1;
        stack[top] = down;
        top += 1;
      }
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const boxArea = boxWidth * boxHeight;
    const aspect = boxWidth / Math.max(boxHeight, 1);
    const fill = area / Math.max(boxArea, 1);
    const diameter = Math.max(boxWidth, boxHeight);
    const circularity = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;
    const isPillSized = area >= minArea && area <= maxArea && diameter >= preset.minDiameter;
    const isPillShaped = aspect >= 0.42 && aspect <= 2.4 && fill >= preset.minFill && circularity >= preset.minCircularity;

    if (touchesEdge && area >= minArea) edgeComponents += 1;
    if (area >= Math.max(5, minArea * 0.2)) noisyComponentCount += 1;
    if (touchesEdge || diameter < preset.minDiameter) continue;

    const plausibleSingle = isPillSized && isPillShaped;
    const plausibleCluster = area > maxArea * 0.7
      && area <= maxArea * 4
      && aspect >= 0.24
      && aspect <= 4.2
      && fill >= Math.max(0.16, preset.minFill * 0.55)
      && circularity >= Math.max(0.025, preset.minCircularity * 0.35);

    if (plausibleSingle || plausibleCluster) {
      const localX = (sumX / area / width) * 100;
      const localY = (sumY / area / height) * 100;
      const areaPercent = (area / pixelCount) * (cropRegion.width / 100) * (cropRegion.height / 100) * 100;
      const diameterPercent = Math.max(
        (boxWidth / width) * cropRegion.width,
        (boxHeight / height) * cropRegion.height,
      );
      components.push({
        area,
        minX,
        maxX,
        minY,
        maxY,
        boxWidth,
        boxHeight,
        x: cropRegion.x + localX * (cropRegion.width / 100),
        y: cropRegion.y + localY * (cropRegion.height / 100),
        areaPercent,
        diameterPercent,
        fill,
        circularity,
        plausibleSingle,
        score: area * fill * Math.max(circularity, 0.01),
      });
    }
  }

  const normalAreas = components
    .filter((component) => component.plausibleSingle && component.area <= maxArea)
    .map((component) => component.area)
    .sort((a, b) => a - b);
  const calibratedArea = calibration?.estimatedAreaPercent
    ? (calibration.estimatedAreaPercent / 100)
      / ((cropRegion.width / 100) * (cropRegion.height / 100))
      * pixelCount
    : 0;
  const medianArea = normalAreas.length >= 3 ? median(normalAreas) : 0;
  const fallbackArea = Math.sqrt(minArea * maxArea);
  const typicalArea = calibratedArea > 0 ? calibratedArea : medianArea || fallbackArea;
  const candidates = [];
  let splitBlobs = 0;

  components.forEach((component, componentIndex) => {
    const sizeRatio = component.area / Math.max(typicalArea, 1);
    const calibrationBoost = calibratedArea > 0
      ? Math.max(0.35, 1 - Math.min(0.65, Math.abs(Math.log(Math.max(sizeRatio, 0.01))) * 0.35))
      : 1;
    const estimatedCount = sizeRatio > 1.55
      ? Math.min(8, Math.max(2, Math.round(sizeRatio)))
      : 1;
    const shouldSplit = estimatedCount > 1
      && component.area <= typicalArea * 8.75
      && (component.boxWidth >= component.boxHeight * 1.12 || component.boxHeight >= component.boxWidth * 1.12 || sizeRatio >= 2.2);

    if (!shouldSplit) {
      candidates.push({
        id: `auto-${componentIndex}-${Date.now()}`,
        x: component.x,
        y: component.y,
        source: "auto",
        score: component.score * calibrationBoost,
        areaPercent: component.areaPercent,
        diameterPercent: component.diameterPercent,
      });
      return;
    }

    splitBlobs += 1;
    const horizontal = component.boxWidth >= component.boxHeight;
    const spacing = 1 / (estimatedCount + 1);
    for (let index = 1; index <= estimatedCount; index += 1) {
      const localX = horizontal
        ? component.minX + component.boxWidth * spacing * index
        : (component.minX + component.maxX) / 2;
      const localY = horizontal
        ? (component.minY + component.maxY) / 2
        : component.minY + component.boxHeight * spacing * index;
      candidates.push({
        id: `auto-split-${componentIndex}-${index}-${Date.now()}`,
        x: cropRegion.x + (localX / width) * cropRegion.width,
        y: cropRegion.y + (localY / height) * cropRegion.height,
        source: "auto-split",
        score: component.score / estimatedCount,
        areaPercent: component.areaPercent / estimatedCount,
        diameterPercent: component.diameterPercent / Math.sqrt(estimatedCount),
      });
    }
  });

  const markers = mergeNearbyCandidates(candidates)
    .slice(0, 100)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map(({ score, ...marker }) => marker);

  return { markers, edgeComponents, splitBlobs, noisyComponentCount };
}

function median(values) {
  if (!values.length) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function mergeNearbyCandidates(candidates) {
  const accepted = [];
  const minDistancePercent = 2.2;

  candidates
    .sort((a, b) => b.score - a.score)
    .forEach((candidate) => {
      const duplicate = accepted.some((item) => {
        const dx = item.x - candidate.x;
        const dy = item.y - candidate.y;
        return Math.sqrt(dx * dx + dy * dy) < minDistancePercent;
      });
      if (!duplicate) accepted.push(candidate);
    });

  return accepted;
}
