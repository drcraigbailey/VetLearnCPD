import { supabase } from "../supabaseClient";

export const logSiteActivity = async ({ userId, path, title, section, startedAt, endedAt, durationSeconds }) => {
  if (!userId || !path) return;

  await supabase.from("site_activity_events").insert({
    user_id: userId,
    path,
    title: title || path,
    section: section || "Other",
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: Math.max(0, Math.round(durationSeconds || 0)),
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null
  }).then(() => {});
};

export const logFileUpload = async ({ userId, file, context, storagePath }) => {
  if (!userId || !file) return;

  await supabase.from("file_upload_events").insert({
    user_id: userId,
    file_name: file.name || "Uploaded file",
    file_type: file.type || null,
    file_size: file.size || null,
    context: context || "general",
    storage_path: storagePath || null
  }).then(() => {});
};
