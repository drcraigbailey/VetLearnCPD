import { supabase } from "../supabaseClient";

export const isSupabaseSchemaCompatibilityError = (error) => {
  const raw = String(error?.message || error?.error_description || error?.details || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return (
    code === "pgrst204"
    || raw.includes("schema cache")
    || (raw.includes("schema") && (raw.includes("invalid") || raw.includes("incompatible") || raw.includes("cache")))
  );
};

export const uploadFileWithSchemaRetry = async ({ bucket, path, file, options = {} }) => {
  const storage = supabase.storage.from(bucket);
  const firstAttempt = await storage.upload(path, file, options);

  if (!firstAttempt.error || !isSupabaseSchemaCompatibilityError(firstAttempt.error) || typeof file?.arrayBuffer !== "function") {
    return firstAttempt;
  }

  const retryOptions = {
    ...options,
    contentType: options.contentType || file.type || "application/octet-stream"
  };

  return storage.upload(path, await file.arrayBuffer(), retryOptions);
};

export const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(reader.error || new Error("Could not read file"));
  reader.readAsDataURL(file);
});

export const createInlineImageDataUrl = async (file, { maxSide = 640, quality = 0.78 } = {}) => {
  if (typeof Image === "undefined" || typeof document === "undefined") return fileToDataUrl(file);

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not load image"));
      img.src = objectUrl;
    });

    const scale = Math.min(1, maxSide / Math.max(image.width || 1, image.height || 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((image.width || maxSide) * scale));
    canvas.height = Math.max(1, Math.round((image.height || maxSide) * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

export const isLikelyImageFile = (file) => {
  const name = String(file?.name || "");
  return String(file?.type || "").startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(name);
};
