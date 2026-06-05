import { useEffect, useState } from "react";
import { Camera, RotateCcw, Trash2, Undo2, Upload } from "lucide-react";

const buttonBase = "min-h-[44px] rounded-lg px-3 py-2 text-sm font-black transition flex items-center justify-center gap-2";

export default function PillCounter({ darkMode = false }) {
  const [imageUrl, setImageUrl] = useState("");
  const [markers, setMarkers] = useState([]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const handleImageSelection = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImageUrl(URL.createObjectURL(file));
    setMarkers([]);
    event.target.value = "";
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
      },
    ]);
  };

  const removeMarker = (event, markerId) => {
    event.stopPropagation();
    setMarkers((current) => current.filter((marker) => marker.id !== markerId));
  };

  const resetPhoto = () => {
    setImageUrl("");
    setMarkers([]);
  };

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border p-4 ${darkMode ? "bg-white/5 border-white/10" : "bg-white border-[#DCEDEA]"}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[#0F8F83]">Tablet count</p>
            <p className="text-sm opacity-65 leading-6">Take a photo, then tap each tablet to mark it.</p>
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
                className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#00C978] text-[#062F63] text-xs font-black shadow-[0_0_0_4px_rgba(0,201,120,0.25)]"
                style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                aria-label={`Remove tablet marker ${index + 1}`}
              >
                {index + 1}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
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
              onClick={() => setMarkers([])}
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
          <p className="text-xs opacity-60 leading-5 mt-1">Use the phone camera or upload a photo, then tap each tablet once.</p>
        </div>
      )}
    </div>
  );
}
