const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'pages', 'Formulary.jsx');
let src = fs.readFileSync(file, 'utf8');
const original = src;

function replaceOnce(find, replace, marker) {
  if (marker && src.includes(marker)) return;
  if (!src.includes(find)) {
    console.warn('Skipped missing block:', find.slice(0, 100));
    return;
  }
  src = src.replace(find, replace);
}

replaceOnce(
  '  const loadFriendsForSharing = async () => {\n    setShareOpen(true);',
  '  const loadFriendsForSharing = async () => {\n    if (!activeDrugName) return toast.error("Open a drug before sharing");\n    setShareOpen(true);\n    setFriendsList([]);',
  'Open a drug before sharing'
);

replaceOnce(
  '    if (error) return toast.error("Could not load colleagues");\n    setFriendsList((data || []).map((connection) => ({',
  '    if (error) return toast.error("Could not load colleagues");\n    const colleagues = (data || []).map((connection) => ({',
  'const colleagues = (data || []).map((connection) => ({'
);

replaceOnce(
  '      colleague: connection.requester_id === user.id ? connection.receiver : connection.requester\n    })));\n  };',
  '      colleague: connection.requester_id === user.id ? connection.receiver : connection.requester\n    })).filter((item) => item.colleague?.id);\n    setFriendsList(colleagues);\n    if (colleagues.length === 0) toast("No accepted colleagues found to share with yet.");\n  };',
  'No accepted colleagues found to share with yet.'
);

replaceOnce(
  '  const shareDrugWithColleague = async (friendId) => {\n    setShareBusyId(friendId);',
  '  const shareDrugWithColleague = async (friendId) => {\n    if (!activeDrugName) return toast.error("Open a drug before sharing");\n    setShareBusyId(friendId);',
  'Open a drug before sharing'
);

replaceOnce(
  '      record_id: activeDrugName,\n      record_title: activeDrugName\n    });',
  '      record_id: activeDrugName,\n      record_title: activeDrugName,\n      metadata: {\n        source: "formulary",\n        drug_name: activeDrugName,\n        drug_id: activeDrugRecord?.id || null,\n        is_custom_drug: activeDrugRecord?.isCustom === true\n      }\n    });',
  'is_custom_drug: activeDrugRecord?.isCustom === true'
);

replaceOnce(
  '        onShare={shareDrugWithColleague}\n        shareBusyId={shareBusyId}',
  '        onShare={shareDrugWithColleague}\n        onCloseShare={() => setShareOpen(false)}\n        shareBusyId={shareBusyId}',
  'onCloseShare={() => setShareOpen(false)}'
);

replaceOnce(
  '    shareBusyId\n  } = props;',
  '    shareBusyId,\n    onCloseShare\n  } = props;',
  'onCloseShare\n  } = props;'
);

replaceOnce(
  'function ActionButton({ children, icon, onClick, active }) {\n  return <button onClick={onClick}',
  'function ActionButton({ children, icon, onClick, active }) {\n  return <button type="button" onClick={onClick}',
  'return <button type="button" onClick={onClick}'
);

replaceOnce(
  '                {shareOpen && (\n                  <div className={`rounded-lg p-3 mt-4 ${darkMode ? "bg-white/5" : "bg-[#F0F6F5]"}`}>\n                    {friendsList.length === 0 ? <p className="text-sm opacity-55">No colleagues available to share with.</p> : friendsList.map((friend) => (\n                      <div key={friend.connection_id} className="flex items-center justify-between gap-3 py-2">\n                        <span className="text-sm font-bold">{friend.colleague?.title} {friend.colleague?.full_name}</span>\n                        <button onClick={() => onShare(friend.colleague.id)} className="rounded-lg bg-[#71CFC2] text-[#062F63] px-3 py-2 text-xs font-black">\n                          {shareBusyId === friend.colleague.id ? "Sending..." : "Send"}\n                        </button>\n                      </div>\n                    ))}\n                  </div>\n                )}',
  '',
  'Choose a colleague to share this drug with'
);

replaceOnce(
  '        <div className="p-6 space-y-5">',
  '        {shareOpen && (\n          <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onCloseShare}>\n            <div className={`w-full max-w-sm rounded-2xl shadow-2xl p-5 ${darkMode ? "bg-[#0B242B] text-white border border-white/10" : "bg-white text-[#113247] border border-[#DCEDEA]"}`} onClick={(event) => event.stopPropagation()}>\n              <div className="flex items-start justify-between gap-3 mb-4">\n                <div>\n                  <h3 className="text-lg font-black">Share drug</h3>\n                  <p className="text-sm opacity-65 mt-1">Choose a colleague to share this drug with.</p>\n                  <p className="text-xs font-black text-[#0F8F83] mt-2">{drugName}</p>\n                </div>\n                <button type="button" onClick={onCloseShare} className={`p-2 rounded-full ${darkMode ? "bg-white/10" : "bg-slate-100"}`}><X size={18} /></button>\n              </div>\n              <div className="space-y-2 max-h-72 overflow-y-auto">\n                {friendsList.length === 0 ? (\n                  <p className="rounded-lg p-3 text-sm opacity-65 bg-[#71CFC2]/10">No accepted colleagues found yet. Add a colleague in Network first, then come back to share.</p>\n                ) : friendsList.map((friend) => (\n                  <button\n                    key={friend.connection_id}\n                    type="button"\n                    disabled={shareBusyId === friend.colleague.id}\n                    onClick={() => onShare(friend.colleague.id)}\n                    className={`w-full flex items-center justify-between gap-3 rounded-xl p-3 text-left border transition disabled:opacity-60 ${darkMode ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-[#DCEDEA] bg-[#F9FCFB] hover:bg-[#F0F6F5]"}`}\n                  >\n                    <span>\n                      <span className="block text-sm font-black">{[friend.colleague?.title, friend.colleague?.full_name].filter(Boolean).join(" ") || "Colleague"}</span>\n                      <span className="block text-xs opacity-55">Collaborate via shared records</span>\n                    </span>\n                    <span className="rounded-lg bg-[#71CFC2] text-[#062F63] px-3 py-2 text-xs font-black">{shareBusyId === friend.colleague.id ? "Sending..." : "Share"}</span>\n                  </button>\n                ))}\n              </div>\n            </div>\n          </div>\n        )}\n\n        <div className="p-6 space-y-5">',
  'Choose a colleague to share this drug with.'
);

if (src !== original) {
  fs.writeFileSync(file, src, 'utf8');
  console.log('Formulary drug sharing has been wired to an immediate colleague picker.');
} else {
  console.log('No changes made. Formulary drug sharing looked already patched.');
}
