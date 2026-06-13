const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'pages', 'Formulary.jsx');
let source = fs.readFileSync(filePath, 'utf8');
let changed = false;

function replaceOnce(find, replacement, label) {
  if (!source.includes(find)) {
    console.log(`Skipped ${label}: already patched or marker not found.`);
    return;
  }
  source = source.replace(find, replacement);
  changed = true;
  console.log(`Patched ${label}.`);
}

replaceOnce(
  '        shareBusyId={shareBusyId}\n      />',
  '        shareBusyId={shareBusyId}\n        onCloseShare={() => setShareOpen(false)}\n      />',
  'DrugMonograph onCloseShare prop'
);

replaceOnce(
  '    shareBusyId\n  } = props;',
  '    shareBusyId,\n    onCloseShare\n  } = props;',
  'DrugMonograph onCloseShare destructure'
);

replaceOnce(
  '    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">\n      <div className={`w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-3xl overflow-y-auto sm:rounded-2xl shadow-2xl relative ${darkMode ? "bg-[#0B242B] text-white" : "bg-[#F9FCFB] text-[#113247]"}`}>',
  '    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">\n      <DrugSharePopup\n        open={shareOpen}\n        darkMode={darkMode}\n        drugName={drugName}\n        friendsList={friendsList}\n        supportsCollaboration={supportsCollaboration}\n        shareBusyId={shareBusyId}\n        onClose={onCloseShare}\n        onShare={onShare}\n      />\n      <div className={`w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-3xl overflow-y-auto sm:rounded-2xl shadow-2xl relative ${darkMode ? "bg-[#0B242B] text-white" : "bg-[#F9FCFB] text-[#113247]"}`}>',
  'DrugSharePopup render'
);

const inlineShareBlock = `\n\n                {shareOpen && (\n                  <div className={\`rounded-lg p-3 mt-4 ${darkMode ? "bg-white/5" : "bg-[#F0F6F5]"}\`}>\n                    {friendsList.length === 0 ? <p className="text-sm opacity-55">No colleagues available to share with.</p> : friendsList.map((friend) => (\n                      <div key={friend.connection_id} className="flex flex-col gap-2 border-b border-slate-200/60 py-3 last:border-b-0 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">\n                        <span className="text-sm font-bold">{friend.colleague?.title} {friend.colleague?.full_name}</span>\n                        <div className={\`grid gap-2 ${supportsCollaboration ? "grid-cols-2" : "grid-cols-1"}\`}>\n                          <button onClick={() => onShare(friend.colleague.id, "read")} disabled={Boolean(shareBusyId)} className="rounded-lg bg-[#E8F8F5] text-[#0B3760] px-3 py-2 text-xs font-black disabled:opacity-50">\n                            {shareBusyId === \`${friend.colleague.id}:read\` ? "Sharing..." : "Share read-only"}\n                          </button>\n                          {supportsCollaboration && (\n                            <button onClick={() => onShare(friend.colleague.id, "edit")} disabled={Boolean(shareBusyId)} className="rounded-lg bg-[#71CFC2] text-[#062F63] px-3 py-2 text-xs font-black disabled:opacity-50">\n                              {shareBusyId === \`${friend.colleague.id}:edit\` ? "Inviting..." : "Collaborate"}\n                            </button>\n                          )}\n                        </div>\n                      </div>\n                    ))}\n                  </div>\n                )}`;

replaceOnce(
  inlineShareBlock,
  '',
  'inline User Tools share list removal'
);

const popupComponent = `
function DrugSharePopup({ open, darkMode, drugName, friendsList, supportsCollaboration, shareBusyId, onClose, onShare }) {
  const [mode, setMode] = useState(supportsCollaboration ? "" : "read");
  const [selectedFriendId, setSelectedFriendId] = useState("");

  useEffect(() => {
    if (open) {
      setMode(supportsCollaboration ? "" : "read");
      setSelectedFriendId("");
    }
  }, [open, supportsCollaboration]);

  if (!open) return null;

  const selectedFriend = friendsList.find((friend) => String(friend.colleague?.id) === String(selectedFriendId));
  const selectedMode = supportsCollaboration ? mode : "read";
  const disabled = !selectedFriendId || !selectedMode || Boolean(shareBusyId);

  const handleSubmit = () => {
    if (disabled) return;
    onShare(selectedFriendId, selectedMode);
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/45 p-4 animate-in fade-in">
      <div className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl ${darkMode ? "border-white/10 bg-[#0B242B] text-white" : "border-[#DCEDEA] bg-white text-[#113247]"}`}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200/70 pb-4 dark:border-white/10">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[#0F8F83]">Share drug monograph</p>
            <h3 className="mt-1 text-xl font-black">{drugName}</h3>
            <p className="mt-1 text-sm opacity-65">Choose a colleague, then share read-only or invite them to collaborate.</p>
          </div>
          <button type="button" onClick={onClose} className={`rounded-full p-2 ${darkMode ? "bg-white/10" : "bg-[#F0F6F5]"}`} aria-label="Close share popup">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {supportsCollaboration && (
            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-widest opacity-60">What do you want to do?</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setMode("read")} className={`rounded-xl border px-3 py-3 text-left text-sm font-black ${mode === "read" ? "border-[#71CFC2] bg-[#E8F8F5] text-[#0B3760]" : darkMode ? "border-white/10 bg-white/5" : "border-[#DCEDEA] bg-[#F9FCFB]"}`}>
                  Share
                  <span className="mt-1 block text-xs font-bold opacity-60">Read-only access</span>
                </button>
                <button type="button" onClick={() => setMode("edit")} className={`rounded-xl border px-3 py-3 text-left text-sm font-black ${mode === "edit" ? "border-[#71CFC2] bg-[#71CFC2] text-[#062F63]" : darkMode ? "border-white/10 bg-white/5" : "border-[#DCEDEA] bg-[#F9FCFB]"}`}>
                  Collaborate
                  <span className="mt-1 block text-xs font-bold opacity-60">Can edit this monograph</span>
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="mb-2 block text-xs font-black uppercase tracking-widest opacity-60">Choose colleague</label>
            {friendsList.length === 0 ? (
              <div className={`rounded-xl p-4 text-sm ${darkMode ? "bg-white/5" : "bg-[#F0F6F5]"}`}>No colleagues available to share with.</div>
            ) : (
              <select value={selectedFriendId} onChange={(event) => setSelectedFriendId(event.target.value)} className={`${inputClass(darkMode)} font-bold`}>
                <option value="">Select a colleague...</option>
                {friendsList.map((friend) => (
                  <option key={friend.connection_id} value={friend.colleague?.id}>
                    {[friend.colleague?.title, friend.colleague?.full_name].filter(Boolean).join(" ") || "Unnamed colleague"}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedFriend && selectedMode && (
            <div className={`rounded-xl p-3 text-sm ${darkMode ? "bg-white/5" : "bg-[#F0F6F5]"}`}>
              {selectedMode === "edit" ? "Invite" : "Share with"} <strong>{[selectedFriend.colleague?.title, selectedFriend.colleague?.full_name].filter(Boolean).join(" ")}</strong>
            </div>
          )}

          <button type="button" onClick={handleSubmit} disabled={disabled} className="w-full rounded-xl bg-[#71CFC2] py-3 font-black text-[#062F63] disabled:cursor-not-allowed disabled:opacity-50">
            {shareBusyId ? (selectedMode === "edit" ? "Inviting..." : "Sharing...") : selectedMode === "edit" ? "Invite collaborator" : "Share read-only"}
          </button>
        </div>
      </div>
    </div>
  );
}
`;

if (!source.includes('function DrugSharePopup(')) {
  const marker = '\nfunction MonographSection({ title, icon, darkMode, children }) {';
  if (!source.includes(marker)) {
    throw new Error('Could not find MonographSection marker to insert DrugSharePopup.');
  }
  source = source.replace(marker, `${popupComponent}${marker}`);
  changed = true;
  console.log('Inserted DrugSharePopup component.');
} else {
  console.log('Skipped DrugSharePopup component: already present.');
}

if (!changed) {
  console.log('No changes needed. Drug share popup is already patched.');
  process.exit(0);
}

fs.writeFileSync(filePath, source);
console.log('Updated src/pages/Formulary.jsx to use a popup for Share/Collaborate.');
