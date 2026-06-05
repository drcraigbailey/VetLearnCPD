import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, RotateCcw, Search, Trash2, Undo2, Upload } from "lucide-react";

const buttonBase = "min-h-[44px] rounded-lg px-3 py-2 text-sm font-black transition flex items-center justify-center gap-2";

const detectionModes = [
  { id: "strict", label: "Strict" },
  { id: "normal", label: "Normal" },
  { id: "sensitive", label: "Sensitive" },
];

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

export default function PillCounter({ darkMode = false }) {
  const [imageUrl, setImageUrl] = useState("");
  const [markers, setMarkers] = useState([]);
  const [detecting, setDetecting] = useState(false);
  const [detectionMode, setDetectionMode] = useState("normal");
  const [detectionMessage, setDetectionMessage] = useState("");
  const imageUrlRef = useRef("");

  useEffect(() => {
    imageUrlRef.current = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  useEffect(() => {
    if (!imageUrl) return undefined;

    let cancelled = false;
    const runInitialDetection = async () => {
      setDetecting(true);
      setDetectionMessage("Scanning image...");
      try {
        const detectedMarkers = await detectPillsFromImage(imageUrl, detectionMode);
        if (cancelled || imageUrlRef.current !== imageUrl) return;
        setMarkers(detectedMarkers);
        setDetectionMessage(formatDetectionMessage(detectedMarkers.length, detectionMode));
      } catch (error) {
        if (!cancelled) setDetectionMessage("Could not auto-detect this image. Tap tablets to mark them manually.");
      } finally {
        if (!cancelled) setDetecting(false);
      }
    };

    runInitialDetection();

    return () => {
      cancelled = true;
    };
  }, [imageUrl, detectionMode]);

  const handleImageSelection = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImageUrl(URL.createObjectURL(file));
    setMarkers([]);
    setDetectionMessage("Scanning image...");
    event.target.value = "";
  };

  const detectCurrentImage = async () => {
    if (!imageUrl) return;

    setDetecting(true);
    setDetectionMessage("Scanning image...");
    try {
      const detectedMarkers = await detectPillsFromImage(imageUrl, detectionMode);
      if (imageUrlRef.current !== imageUrl) return;
      setMarkers(detectedMarkers);
      setDetectionMessage(formatDetectionMessage(detectedMarkers.length, detectionMode));
    } catch (error) {
      setDetectionMessage("Could not auto-detect this image. Tap tablets to mark them manually.");
    } finally {
      setDetecting(false);
    }
  };

  const addMarker = (event) => {
    if (!imageUrl) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    setMarkers((current) => [
      ...current,
      {
        id: `${Date.now()}-${Math.random()}`,
        x: Math.min(100, Math.max(0, x)),
        y: Math.min(100, Math.max(0, y)),
        source: "manual",
      },
    ]);
    setDetectionMessage("Manual marker added. Tap any marker to remove it.");
  };

  const removeMarker = (event, markerId) => {
    event.stopPropagation();
    setMarkers((current) => current.filter((marker) => marker.id !== markerId));
    setDetectionMessage("Marker removed. Tap the image to add another marker.");
  };

  const resetPhoto = () => {
    setImageUrl("");
    setMarkers([]);
    setDetectionMessage("");
  };

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border p-4 ${darkMode ? "bg-white/5 border-white/10" : "bg-white border-[#DCEDEA]"}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[#0F8F83]">Tablet count</p>
            <p className="text-sm opacity-65 leading-6">Take a clear photo. VetLearn will mark likely tablets, then you can correct the count.</p>
          </div>
          <div className="text-center shrink-0">
            <div className="text-5xl font-black text-[#00C978] leading-none">{markers.length}</div>
            <div className="text-[11px] font-black uppercase tracking-widest opacity-55">Marked</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className={`${buttonBase} bg-[#71CFC2] text-[#062F63]`}>
          <Camera size={17} />
          Camera
          <input className="hidden" type="file" accept="image/*" capture="environment" onChange={handleImageSelection} />
        </label>
        <label className={`${buttonBase} ${darkMode ? "bg-white/10 text-white" : "bg-[#E8F8F5] text-[#0B3760]"}`}>
          <Upload size={17} />
          Upload
          <input className="hidden" type="file" accept="image/*" onChange={handleImageSelection} />
        </label>
      </div>

      {imageUrl ? (
        <>
          <div className={`rounded-lg border p-3 ${darkMode ? "bg-white/5 border-white/10" : "bg-[#F9FCFB] border-[#DCEDEA]"}`}>
            <p className="mb-2 text-xs font-black uppercase tracking-widest opacity-60">Detection sensitivity</p>
            <div className="grid grid-cols-3 gap-2">
              {detectionModes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setDetectionMode(mode.id)}
                  disabled={detecting}
                  className={`min-h-[40px] rounded-md px-2 py-2 text-xs font-black transition ${
                    detectionMode === mode.id
                      ? "bg-[#71CFC2] text-[#062F63] shadow-sm"
                      : darkMode ? "bg-white/10 text-slate-200" : "bg-[#E8F8F5] text-[#0B3760]"
                  } disabled:opacity-60`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {detectionMessage && (
            <div className={`rounded-lg border p-3 text-sm leading-6 ${darkMode ? "bg-white/5 border-white/10 text-slate-100" : "bg-[#F9FCFB] border-[#DCEDEA] text-[#113247]"}`}>
              {detecting ? "Scanning image..." : detectionMessage}
            </div>
          )}

          <div
            className={`relative overflow-hidden rounded-lg border ${darkMode ? "border-white/10 bg-black" : "border-[#DCEDEA] bg-[#113247]"}`}
            onClick={addMarker}
            role="button"
            tabIndex={0}
            aria-label="Tap tablets on the photo to mark them"
          >
            <img src={imageUrl} alt="Pills to count" className="block w-full select-none" draggable="false" />
            {markers.map((marker, index) => (
              <button
                key={marker.id}
                type="button"
                onClick={(event) => removeMarker(event, marker.id)}
                className={`absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white text-[#062F63] text-xs font-black shadow-[0_0_0_4px_rgba(0,201,120,0.25)] ${marker.source === "auto" ? "bg-[#00C978]" : "bg-[#71CFC2]"}`}
                style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                aria-label={`Remove tablet marker ${index + 1}`}
              >
                {index + 1}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={detectCurrentImage}
              disabled={detecting}
              className={`${buttonBase} bg-[#71CFC2] text-[#062F63] disabled:opacity-50`}
            >
              {detecting ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Detect
            </button>
            <button
              type="button"
              onClick={() => setMarkers((current) => current.slice(0, -1))}
              disabled={markers.length === 0}
              className={`${buttonBase} ${darkMode ? "bg-white/10 text-white" : "bg-[#E8F8F5] text-[#0B3760]"} disabled:opacity-40`}
            >
              <Undo2 size={16} />
              Undo
            </button>
            <button
              type="button"
              onClick={() => { setMarkers([]); setDetectionMessage("Markers reset. Tap the image or run detection again."); }}
              disabled={markers.length === 0}
              className={`${buttonBase} ${darkMode ? "bg-white/10 text-white" : "bg-[#E8F8F5] text-[#0B3760]"} disabled:opacity-40`}
            >
              <RotateCcw size={16} />
              Reset
            </button>
            <button
              type="button"
              onClick={resetPhoto}
              className={`${buttonBase} ${darkMode ? "bg-red-500/15 text-red-100" : "bg-red-50 text-red-700"}`}
            >
              <Trash2 size={16} />
              Clear
            </button>
          </div>
        </>
      ) : (
        <div className={`rounded-lg border border-dashed p-6 text-center ${darkMode ? "border-white/15 bg-white/5" : "border-[#B7D8D2] bg-[#F9FCFB]"}`}>
          <Camera size={30} className="mx-auto mb-3 text-[#0F8F83]" />
          <p className="text-sm font-black">No photo selected</p>
          <p className="text-xs opacity-60 leading-5 mt-1">Use the phone camera or upload a photo. For best detection, place tablets on a plain, contrasting surface.</p>
        </div>
      )}
    </div>
  );
}

function formatDetectionMessage(count, mode) {
  const modeLabel = detectionModes.find((item) => item.id === mode)?.label || "Normal";
  if (count === 0) return `${modeLabel} scan found no clear tablets. Try Sensitive mode, a plainer background, or tap tablets manually.`;
  if (count === 1) return `${modeLabel} scan found 1 likely tablet. Check the marker before relying on the count.`;
  return `${modeLabel} scan found ${count} likely tablets. Check the markers before relying on the count.`;
}

function detectPillsFromImage(imageUrl, mode = "normal") {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        resolve(findPillMarkers(image, mode));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("Image could not be loaded"));
    image.src = imageUrl;
  });
}

function findPillMarkers(image, mode = "normal") {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) return [];

  const preset = detectionPresets[mode] || detectionPresets.normal;
  const maxDimension = 760;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];

  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const pixelCount = width * height;
  const luminance = new Uint8Array(pixelCount);
  const saturation = new Uint8Array(pixelCount);
  const histogram = new Array(256).fill(0);
  let luminanceTotal = 0;

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
  }

  const averageLuminance = luminanceTotal / pixelCount;
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

  return connectedComponentMarkers(cleanedMask, width, height, pixelCount, preset);
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

function connectedComponentMarkers(mask, width, height, pixelCount, preset) {
  const visited = new Uint8Array(pixelCount);
  const stack = new Int32Array(pixelCount);
  const candidates = [];
  const minArea = Math.max(18, pixelCount * preset.minAreaFactor);
  const maxArea = pixelCount * preset.maxAreaFactor;

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

    if (!touchesEdge && isPillSized && isPillShaped) {
      candidates.push({
        id: `auto-${candidates.length}-${Date.now()}`,
        x: (sumX / area / width) * 100,
        y: (sumY / area / height) * 100,
        source: "auto",
        score: area * fill * Math.max(circularity, 0.01),
      });
    }
  }

  return mergeNearbyCandidates(candidates)
    .slice(0, 100)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map(({ score, ...marker }) => marker);
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
