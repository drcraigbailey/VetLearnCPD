import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../supabaseClient";

const userIdTables = [
  "calculator_logs",
  "caselogs",
  "case_logs",
  "cpd_entries",
  "cpd_reading",
  "dashboard_favourites",
  "device_push_tokens",
  "file_upload_events",
  "notifications",
  "protocol_saves",
  "protocols",
  "recently_viewed",
  "site_activity_events",
  "user_feature_overrides",
  "user_preferences",
  "user_private_settings",
  "user_subscriptions",
  "vault_entries"
];

const relationshipTables = [
  { table: "messages", columns: ["sender_id", "recipient_id"] },
  { table: "conversations", columns: ["user1_id", "user2_id"] },
  { table: "connections", columns: ["requester_id", "receiver_id", "user1_id", "user2_id"] },
  { table: "shared_records", columns: ["sender_id", "recipient_id", "receiver_id"] },
  { table: "cpd_shares", columns: ["sender_id", "recipient_id", "receiver_id"] },
  { table: "shared_cpd_records", columns: ["sender_id", "recipient_id", "receiver_id"] }
];

export default function UserDataExportButton({ darkMode = false }) {
  const [exporting, setExporting] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Please sign in before exporting data");

      const user = authData.user;
      const exportPayload = {
        exported_at: new Date().toISOString(),
        export_type: "vetlearn_user_personal_data",
        user: {
          id: user.id,
          email: user.email || null
        },
        tables: {}
      };

      exportPayload.tables.profiles = await safeSelect("profiles", "id", user.id);
      exportPayload.tables.drugs = await safeSelect("drugs", "user_id", user.id);

      for (const table of userIdTables) {
        exportPayload.tables[table] = await safeSelect(table, "user_id", user.id);
      }

      for (const relationship of relationshipTables) {
        exportPayload.tables[relationship.table] = await selectRelationshipRows(relationship.table, relationship.columns, user.id);
      }

      downloadJson(exportPayload, `vetlearn-data-export-${new Date().toISOString().slice(0, 10)}.json`);
      toast.success("Data export downloaded");
    } catch (error) {
      toast.error(error.message || "Could not export your data");
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={exportData}
      disabled={exporting}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-black transition disabled:opacity-60 ${
        darkMode ? "bg-[#71CFC2] text-[#062F63]" : "bg-[#0B3760] text-white"
      }`}
    >
      {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
      {exporting ? "Preparing export..." : "Download My Data"}
    </button>
  );
}

async function selectRelationshipRows(table, columns, userId) {
  const rowsById = new Map();

  for (const column of columns) {
    const rows = await safeSelect(table, column, userId);
    for (const row of rows) {
      rowsById.set(row.id || JSON.stringify(row), row);
    }
  }

  return Array.from(rowsById.values());
}

async function safeSelect(table, column, value) {
  const { data, error } = await supabase.from(table).select("*").eq(column, value);
  if (isSafeToIgnoreSchemaError(error)) return [];
  if (error) throw error;
  return data || [];
}

function isSafeToIgnoreSchemaError(error) {
  if (!error) return false;
  const message = `${error.code || ""} ${error.message || ""}`.toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    message.includes("relation") ||
    message.includes("does not exist") ||
    message.includes("column") ||
    message.includes("schema cache")
  );
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
