import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, Crop, Crosshair, Loader2, RotateCcw, Search, Trash2, Undo2, Upload, X, Plus, Minus } from "lucide-react";
// Swapped the old pixel-based detector for the new YOLO-based vision engine
import { detectPillsWithYOLO } from "./yoloDetection";

const buttonBase = "min-h-[44px] rounded-lg px-3 py-2 text-sm font-black transition flex items-center justify-center gap-2";

const detectionModes = [
  { id: "strict", label: "Strict" },
  { id: "normal", label: "Normal" },
  { id: "sensitive", label: "Sensitive" },
];

export default function PillCounter({ darkMode = false }) {
  const [imageUrl, setImageUrl] = useState("");
  const [markers, setMarkers] = useState([]);
  const [numberCounted, setNumberCounted] = useState(0); // Replacing 'marked' concept
  const [detecting, setDetecting] = useState(false);
  const [detectionMode, setDetectionMode] = useState("normal");
  const [detectionMessage, setDetectionMessage] = useState("");
  const [qualityWarnings, setQualityWarnings] = useState([]);
  const [crop, setCrop] = useState(null);
  const [cropDraft, setCropDraft] = useState(null);
  const [cropMode, setCropMode] = useState(false);
  const [cropStart, setCropStart] = useState(null);
  const [calibration, setCalibration] = useState(null);
  const [calibrationMode, setCalibrationMode] = useState(false);
  
  const imageUrlRef = useRef("");
  const imageStageRef = useRef(null);

  // Sync the external numberCounted state with the actual markers array length
  useEffect(() => {
    setNumberCounted(markers.length);
  }, [markers]);

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
      setDetectionMessage("Initializing Vision Engine...");
      try {
        // Wired to the new YOLO engine. Passing crop/calibration for future compatibility.
        const result = await detectPillsWithYOLO(imageUrl, detectionMode, crop, calibration);
        if (cancelled || imageUrlRef.current !== imageUrl) return;
        setMarkers(result.markers);
        setQualityWarnings(result.warnings || []);
        setDetectionMessage(formatDetectionMessage(result.markers.length, detectionMode));
      } catch (error) {
        if (!cancelled) setDetectionMessage("Could not auto-detect this image. Tap tablets to mark them manually.");
        console.error(error);
      } finally {
        if (!cancelled) setDetecting(false);
      }
    };

    runInitialDetection();

    return () => {
      cancelled = true;
    };
  }, [imageUrl, detectionMode, crop, calibration]);

  const handleImageSelection = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImageUrl(URL.createObjectURL(file));
    setMarkers([]);
    setQualityWarnings([]);
    setCrop(null);
    setCropDraft(null);
    setCropMode(false);
    setCalibration(null);
    setCalibrationMode(false);
    setDetectionMessage("Loading image...");
    event.target.value = "";
  };

  const detectCurrentImage = async () => {
    if (!imageUrl) return;

    setDetecting(true);
    setDetectionMessage("Running YOLO scan...");
    try {
      // Wired to the new YOLO engine
      const result = await detectPillsWithYOLO(imageUrl, detectionMode, crop, calibration);
      if (imageUrlRef.current !== imageUrl) return;
      setMarkers(result.markers);
      setQualityWarnings(result.warnings || []);
      setDetectionMessage(formatDetectionMessage(result.markers.length, detectionMode));
    } catch (error) {
      setDetectionMessage("Could not auto-detect this image. Tap tablets to mark them manually.");
      console.error(error);
    } finally {
      setDetecting(false);
    }
  };

  const addMarker = (event) => {
    if (!imageUrl || cropMode || calibrationMode) return;

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

  const getStagePoint = (event) => {
    const rect = imageStageRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100)),
    };
  };

  const beginCrop = (event) => {
    if (!cropMode) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = getStagePoint(event);
    if (!point) return;
    setCropStart(point);
    setCropDraft({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const updateCrop = (event) => {
    if (!cropMode || !cropStart) return;
    event.preventDefault();
    const point = getStagePoint(event);
    if (!point) return;
    setCropDraft({
      x: Math.min(cropStart.x, point.x),
      y: Math.min(cropStart.y, point.y),
      width: Math.abs(point.x - cropStart.x),
      height: Math.abs(point.y - cropStart.y),
    });
  };

  const finishCrop = (event) => {
    if (!cropMode || !cropStart) return;
    event.preventDefault();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setCropStart(null);
  };

  const applyCrop = () => {
    if (!cropDraft || cropDraft.width < 5 || cropDraft.height < 5) {
      setDetectionMessage("Drag a larger crop area around the tablets.");
      return;
    }
    setCrop(cropDraft);
    setCropMode(false);
    setMarkers([]);
    setDetectionMessage("Crop applied. Scanning the selected area...");
  };

  const cancelCrop = () => {
    setCropDraft(crop);
    setCropMode(false);
    setCropStart(null);
  };

  const clearCrop = () => {
    setCrop(null);
    setCropDraft(null);
    setCropMode(false);
    setMarkers([]);
    setDetectionMessage("Crop cleared. Scanning the full image...");
  };

  const calibrateAtPoint = (event) => {
    if (!calibrationMode) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getStagePoint(event);
    if (!point) return;

    const nearest = markers
      .map((marker) => ({
        marker,
        distance: Math.hypot(marker.x - point.x, marker.y - point.y),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    const matched = nearest?.distance <= 8 ? nearest.marker : null;
    const estimatedDiameterPercent = matched?.diameterPercent || 5;
    const estimatedAreaPercent = matched?.areaPercent || Math.PI * (estimatedDiameterPercent / 2) ** 2;

    setCalibration({
      x: matched?.x ?? point.x,
      y: matched?.y ?? point.y,
      estimatedDiameterPercent,
      estimatedAreaPercent,
    });
    setCalibrationMode(false);
    setDetectionMessage("Tablet size calibrated. Detection now favours similarly sized tablets.");
  };

  const removeMarker = (event, markerId) => {
    event.stopPropagation();
    setMarkers((current) => current.filter((marker) => marker.id !== markerId));
    setDetectionMessage("Marker removed. Tap the image to add another marker.");
  };
  
  // Fast Manual Override Handlers
  const incrementCount = () => setNumberCounted(prev => prev + 1);
  const decrementCount = () => setNumberCounted(prev => Math.max(0, prev - 1));

  const resetPhoto = () => {
    setImageUrl("");
    setMarkers([]);
    setDetectionMessage("");
    setQualityWarnings([]);
    setCrop(null);
    setCropDraft(null);
    setCropMode(false);
    setCalibration(null);
    setCalibrationMode(false);
  };

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border p-4 ${darkMode ? "bg-white/5 border-white/10" : "bg-white border-[#DCEDEA]"}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[#0F8F83]">Result</p>
            <p className="text-sm opacity-65 leading-6">Take a clear photo. VetLearn will mark likely tablets, then you can correct the count.</p>
          </div>
          <div className="text-center shrink-0">
            <div className="text-5xl font-black text-[#71CFC2] leading-none">{numberCounted}</div>
            <div className="text-[11px] font-black uppercase tracking-widest opacity-55 text-[#0B3760] mt-1">Number Counted</div>
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

      {/* Manual Override Controls */}
      {imageUrl && (
        <div className="grid grid-cols-2 gap-2">
           <button
             type="button"
             onClick={decrementCount}
             className={`${buttonBase} ${darkMode ? "bg-white/10 text-white" : "bg-[#E8F8F5] text-[#0B3760]"}`}
           >
             <Minus size={16} />
             Manual -1
           </button>
           <button
             type="button"
             onClick={incrementCount}
             className={`${buttonBase} bg-[#71CFC2] text-[#062F63]`}
           >
             <Plus size={16} />
             Manual +1
           </button>
        </div>
      )}

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

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setCropDraft(crop || { x: 10, y: 10, width: 80, height: 80 });
                setCropMode(true);
                setCalibrationMode(false);
              }}
              className={`${buttonBase} ${darkMode ? "bg-white/10 text-white" : "bg-[#E8F8F5] text-[#0B3760]"}`}
            >
              <Crop size={16} />
              {crop ? "Adjust crop" : "Crop area"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCalibrationMode(true);
                setCropMode(false);
              }}
              className={`${buttonBase} ${calibrationMode ? "bg-[#71CFC2] text-[#062F63]" : darkMode ? "bg-white/10 text-white" : "bg-[#E8F8F5] text-[#0B3760]"}`}
            >
              <Crosshair size={16} />
              Calibrate size
            </button>
            {crop && (
              <button type="button" onClick={clearCrop} className={`${buttonBase} ${darkMode ? "bg-white/10 text-white" : "bg-[#E8F8F5] text-[#0B3760]"}`}>
                <X size={16} />
                Clear crop
              </button>
            )}
            {calibration && (
              <button
                type="button"
                onClick={() => {
                  setCalibration(null);
                  setCalibrationMode(false);
                  setMarkers([]);
                  setDetectionMessage("Tablet calibration cleared. Scanning with standard size filters...");
                }}
                className={`${buttonBase} ${darkMode ? "bg-white/10 text-white" : "bg-[#E8F8F5] text-[#0B3760]"}`}
              >
                <X size={16} />
                Clear calibration
              </button>
            )}
          </div>

          {cropMode && (
            <div className={`rounded-lg border p-3 text-sm ${darkMode ? "bg-white/5 border-white/10" : "bg-[#F9FCFB] border-[#DCEDEA]"}`}>
              <p className="font-black">Drag over the tablets to set the crop area.</p>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button type="button" onClick={applyCrop} className={`${buttonBase} bg-[#71CFC2] text-[#062F63]`}>Apply crop</button>
                <button type="button" onClick={cancelCrop} className={`${buttonBase} ${darkMode ? "bg-white/10 text-white" : "bg-[#E8F8F5] text-[#0B3760]"}`}>Cancel crop</button>
              </div>
            </div>
          )}

          {calibrationMode && (
            <div className={`rounded-lg border p-3 text-sm font-bold ${darkMode ? "bg-white/5 border-white/10" : "bg-[#F9FCFB] border-[#DCEDEA]"}`}>
              Tap one clear, correctly marked tablet to calibrate its approximate size.
            </div>
          )}

          {qualityWarnings.length > 0 && (
            <div className={`rounded-lg border p-3 ${darkMode ? "bg-amber-400/10 border-amber-300/20 text-amber-100" : "bg-amber-50 border-amber-200 text-amber-900"}`}>
              <div className="flex items-center gap-2 mb-2 font-black text-sm">
                <AlertTriangle size={17} />
                Photo tips
              </div>
              <ul className="space-y-1 text-xs leading-5">
                {qualityWarnings.map((warning) => <li key={warning}>- {warning}</li>)}
              </ul>
            </div>
          )}

          {detectionMessage && (
            <div className={`rounded-lg border p-3 text-sm leading-6 ${darkMode ? "bg-white/5 border-white/10 text-slate-100" : "bg-[#F9FCFB] border-[#DCEDEA] text-[#113247]"}`}>
              {detecting ? "Scanning image..." : detectionMessage}
            </div>
          )}

          <div
            ref={imageStageRef}
            className={`relative overflow-hidden rounded-lg border ${darkMode ? "border-white/10 bg-black" : "border-[#DCEDEA] bg-[#113247]"}`}
            onClick={addMarker}
            onPointerDown={beginCrop}
            onPointerMove={updateCrop}
            onPointerUp={finishCrop}
            onPointerCancel={finishCrop}
            role="button"
            tabIndex={0}
            aria-label="Tap tablets on the photo to mark them"
            style={{ touchAction: cropMode ? "none" : "pan-y" }}
          >
            <img src={imageUrl} alt="Pills to count" className="block w-full select-none" draggable="false" />
            {(cropMode ? cropDraft : crop) && (
              <div
                className={`absolute border-2 pointer-events-none ${cropMode ? "border-amber-400 bg-amber-300/10" : "border-[#71CFC2] bg-[#71CFC2]/10"}`}
                style={{
                  left: `${(cropMode ? cropDraft : crop).x}%`,
                  top: `${(cropMode ? cropDraft : crop).y}%`,
                  width: `${(cropMode ? cropDraft : crop).width}%`,
                  height: `${(cropMode ? cropDraft : crop).height}%`,
                }}
              />
            )}
            {calibration && (
              <div
                className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-300 bg-amber-300/22 pointer-events-none"
                style={{ left: `${calibration.x}%`, top: `${calibration.y}%` }}
              >
                <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 rounded bg-amber-300 px-1.5 py-0.5 text-[9px] font-black text-[#062F63] whitespace-nowrap">Calibrated</span>
              </div>
            )}
            {calibrationMode && (
              <button type="button" className="absolute inset-0 z-20 cursor-crosshair bg-transparent" onClick={calibrateAtPoint} aria-label="Tap a tablet to calibrate its size" />
            )}
            {markers.map((marker, index) => (
              <button
                key={marker.id}
                type="button"
                onClick={(event) => removeMarker(event, marker.id)}
                className={`absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white text-[#062F63] text-xs font-black shadow-[0_0_0_4px_rgba(0,201,120,0.25)] ${marker.source === "manual" ? "bg-[#71CFC2]" : marker.source === "auto-split" ? "bg-amber-300" : "bg-[#71CFC2]"}`}
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
              onClick={() => { setMarkers([]); setDetectionMessage("Markers reset. Tap the image or run detection again."); setNumberCounted(0); }}
              disabled={markers.length === 0 && numberCounted === 0}
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
          <p className="text-xs opacity-65 leading-5">Auto count is an estimate. Check markers before relying on the count.</p>
        </>
      ) : (
        <div className={`rounded-lg border border-dashed p-6 text-center ${darkMode ? "border-white/15 bg-white/5" : "border-[#B7D8D2] bo-[#F9FCFB]"}`}>
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
  if (count === 0) return `${modeLabel} scan found no clear tablets. Try a plainer background or tap tablets manually.`;
  if (count === 1) return `${modeLabel} scan found 1 likely tablet. Check the marker before relying on the count.`;
  return `${modeLabel} scan found ${count} likely tablets. Check the markers before relying on the count.`;
}