import * as ort from 'onnxruntime-web';

// Optional: Force WebAssembly for consistent cross-device performance
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

let modelSession = null;

export async function detectPillsWithYOLO(imageUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = async () => {
      try {
        // 1. Initialize Model (Loads only once per session)
        if (!modelSession) {
          // Adjust this path to where your model lives in the public folder
          modelSession = await ort.InferenceSession.create('/models/yolov8n-pills.onnx', {
            executionProviders: ['wasm'] 
          });
        }

        // 2. Preprocess Image (YOLOv8 usually expects 640x640)
        const targetSize = 640;
        const tensor = preprocessImage(img, targetSize);

        // 3. Run Inference
        const feeds = { images: tensor }; // 'images' is the standard YOLOv8 input name
        const results = await modelSession.run(feeds);
        
        // 4. Post-process (Extract boxes, filter overlaps)
        const output = results[modelSession.outputNames[0]]; // Standard YOLOv8 output
        const markers = parseYOLOOutput(output.data, img.width, img.height, targetSize);

        // Return in the exact format PillCounter.jsx expects
        resolve({
          markers: markers,
          warnings: [] // YOLO handles lighting, so we don't need the old warnings
        });

      } catch (error) {
        console.error("YOLO Inference Error:", error);
        reject(error);
      }
    };
    img.onerror = () => reject(new Error("Failed to load image for YOLO"));
    img.src = imageUrl;
  });
}

// --- Helper: Convert Image to NCHW Tensor [1, 3, 640, 640] ---
function preprocessImage(image, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // Draw image stretched to 640x640 (can also use padding to preserve aspect ratio)
  ctx.drawImage(image, 0, 0, size, size);
  const imgData = ctx.getImageData(0, 0, size, size).data;
  
  const float32Data = new Float32Array(3 * size * size);
  
  // Convert RGBA to RGB and normalize (0-255 -> 0.0-1.0), formatting as NCHW
  for (let i = 0; i < size * size; i++) {
    float32Data[i] = imgData[i * 4] / 255.0;                   // Red
    float32Data[size * size + i] = imgData[i * 4 + 1] / 255.0; // Green
    float32Data[2 * size * size + i] = imgData[i * 4 + 2] / 255.0; // Blue
  }
  
  return new ort.Tensor('float32', float32Data, [1, 3, size, size]);
}

// --- Helper: Parse Bounding Boxes and Run NMS ---
function parseYOLOOutput(data, originalWidth, originalHeight, targetSize) {
  const numClasses = 1; // Just "pill"
  const numAnchors = 8400; // Standard YOLOv8 output grid
  
  let boxes = [];
  const confidenceThreshold = 0.5; // Ignore anything under 50% certainty
  
  // YOLOv8 format: [x, y, w, h, class_score] array mapped across 8400 anchors
  for (let i = 0; i < numAnchors; i++) {
    const score = data[4 * numAnchors + i]; // Index for class 0 score
    
    if (score > confidenceThreshold) {
      const centerX = data[0 * numAnchors + i];
      const centerY = data[1 * numAnchors + i];
      
      // Convert 640x640 coordinates back to percentages (0-100) for your UI
      const percentX = Math.max(0, Math.min(100, (centerX / targetSize) * 100));
      const percentY = Math.max(0, Math.min(100, (centerY / targetSize) * 100));
      
      boxes.push({
        id: `yolo-${Date.now()}-${Math.random()}`,
        x: percentX,
        y: percentY,
        score: score,
        source: 'auto'
      });
    }
  }

  // Optional: Run Non-Maximum Suppression (NMS) here to filter overlapping boxes.
  // For tightly packed pills, a simple distance check works well:
  return filterOverlaps(boxes, 2.5); // Minimum 2.5% distance between pills
}

function filterOverlaps(boxes, minDistancePercent) {
  const kept = [];
  // Sort by highest confidence first
  boxes.sort((a, b) => b.score - a.score).forEach(box => {
    const isOverlap = kept.some(k => Math.hypot(k.x - box.x, k.y - box.y) < minDistancePercent);
    if (!isOverlap) kept.push(box);
  });
  return kept;
}