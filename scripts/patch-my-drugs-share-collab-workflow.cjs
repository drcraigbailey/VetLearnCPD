const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'pages', 'Formulary.jsx');
let src = fs.readFileSync(file, 'utf8');
const original = src;

function replaceOnce(find, replace, label) {
  if (!src.includes(find)) {
    console.warn(`Skipped ${label}: block not found`);
    return false;
  }
  src = src.replace(find, replace);
  return true;
}

function insertAfter(find, insert, marker, label) {
  if (src.includes(marker)) return true;
  if (!src.includes(find)) {
    console.warn(`Skipped ${label}: anchor not found`);
    return false;
  }
  src = src.replace(find, `${find}${insert}`);
  return true;
}

function replaceRegex(regex, replace, marker, label) {
  if (marker && src.includes(marker)) return true;
  if (!regex.test(src)) {
    console.warn(`Skipped ${label}: pattern not found`);
    return false;
  }
  src = src.replace(regex, replace);
  return true;
}

insertAfter(
  'import AppPopup, { popupPresets } from "../components/AppPopup";\n',
  'import MyDrugShareCollaborationModal from "../components/MyDrugShareCollaborationModal";\n',
  'MyDrugShareCollaborationModal',
  'modal import'
);

replaceOnce(
  '  const [shareOpen, setShareOpen] = useState(false);\n  const [friendsList, setFriendsList] = useState([]);\n  const [shareBusyId, setShareBusyId] = useState(null);',
  '  const [shareModalOpen, setShareModalOpen] = useState(false);\n  const [shareMode, setShareMode] = useState("share");\n  const [shareTargetDrug, setShareTargetDrug] = useState(null);\n  const [shareFocusRecipients, setShareFocusRecipients] = useState(false);\n  const [shareFriendsList, setShareFriendsList] = useState([]);\n  const [shareLoading, setShareLoading] = useState(false);\n  const [shareBusyId, setShareBusyId] = useState(null);',
  'share modal state'
);

insertAfter(
  '  const panelClass = sectionClass(darkMode);\n  const fieldClass = inputClass(darkMode);\n',
  '  const canUseMyDrugs = canUseFeature(featureAccess, featureKeys.myDrugs, adminAccess);\n',
  'const canUseMyDrugs = canUseFeature',
  'my drugs feature flag'
);

src = src.replace('  }, [user]);', '  }, [user, canUseMyDrugs]);');

replaceOnce(
  '      const [drugsRes, aliasesRes] = await Promise.all([\n        supabase.from("drugs").select("*").or(`user_id.is.null,user_id.eq.${user.id}`).eq("active", true).order("name"),\n        supabase.from("drug_aliases").select("*")\n      ]);',
  '      const drugsQuery = supabase.from("drugs").select("*").eq("active", true).order("name");\n      if (canUseMyDrugs) drugsQuery.or(`user_id.is.null,user_id.eq.${user.id}`);\n      else drugsQuery.is("user_id", null);\n\n      const [drugsRes, aliasesRes] = await Promise.all([\n        drugsQuery,\n        supabase.from("drug_aliases").select("*")\n      ]);',
  'feature gated drug query'
);

replaceOnce(
  '    setShareOpen(false);',
  '    setShareModalOpen(false);\n    setShareTargetDrug(null);',
  'close share modal on monograph open'
);

insertAfter(
  '  const activeDrugRecord = uniqueDrugsList.find((drug) => normalise(drug.name) === normalise(activeDrugName));\n',
  `  const myDrugsList = useMemo(() => {\n    const map = new Map();\n    drugs\n      .filter((drug) => drug.user_id === user.id)\n      .forEach((drug) => {\n        const key = normalise(drug.name);\n        if (!key) return;\n        const current = map.get(key) || {\n          id: drug.id,\n          name: drug.name,\n          category: drug.category || drug.drug_class || "Custom",\n          species: new Set(),\n          routes: new Set(),\n          doseCount: 0,\n          ids: [],\n          isCustom: true\n        };\n        current.species.add(drug.species || "General");\n        current.routes.add(drug.route || "General");\n        current.doseCount += 1;\n        current.ids.push(drug.id);\n        map.set(key, current);\n      });\n\n    return Array.from(map.values()).map((drug) => ({\n      ...drug,\n      species: Array.from(drug.species),\n      routes: Array.from(drug.routes)\n    })).sort((a, b) => a.name.localeCompare(b.name));\n  }, [drugs, user.id]);\n`,
  'const myDrugsList = useMemo',
  'my drugs list memo'
);

const sharingFunctions = `  const getOwnedDrugRowsForName = (drugName) => drugs.filter((drug) => drug.user_id === user.id && normalise(drug.name) === normalise(drugName));\n\n  const buildDrugSharePayload = (drugName) => {\n    const ownedRows = getOwnedDrugRowsForName(drugName);\n    return {\n      source: "formulary",\n      drug_name: drugName,\n      owner_id: user.id,\n      read_only: true,\n      custom_drug_ids: ownedRows.map((row) => row.id),\n      doses: ownedRows.map((row) => ({\n        id: row.id,\n        species: row.species,\n        concentration: row.concentration,\n        dose_min: row.dose_min,\n        dose_max: row.dose_max,\n        route: row.route,\n        category: row.category,\n        notes: row.notes || row.custom_details || null\n      }))\n    };\n  };\n\n  const loadFriendsForSharing = async () => {\n    setShareLoading(true);\n    const { data, error } = await supabase\n      .from("connections")\n      .select("id, requester_id, receiver_id, requester:profiles!connections_requester_id_fkey(id, full_name, title, practice_name), receiver:profiles!connections_receiver_id_fkey(id, full_name, title, practice_name)")\n      .eq("status", "accepted")\n      .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);\n\n    setShareLoading(false);\n    if (error) {\n      setShareFriendsList([]);\n      toast.error("Could not load colleagues");\n      return [];\n    }\n\n    const colleagues = (data || [])\n      .map((connection) => connection.requester_id === user.id ? connection.receiver : connection.requester)\n      .filter((colleague) => colleague?.id);\n    setShareFriendsList(colleagues);\n    return colleagues;\n  };\n\n  const openDrugShareModal = async (drugOrName, options = {}) => {\n    const drugName = typeof drugOrName === "string" ? drugOrName : drugOrName?.name;\n    if (!drugName) return toast.error("Open a My Drug before sharing");\n\n    const ownedRows = getOwnedDrugRowsForName(drugName);\n    if (ownedRows.length === 0) {\n      toast.error("Only your own My Drugs can be shared or collaborated on from here");\n      return;\n    }\n\n    const target = myDrugsList.find((drug) => normalise(drug.name) === normalise(drugName)) || {\n      id: ownedRows[0].id,\n      name: drugName,\n      ids: ownedRows.map((row) => row.id),\n      isCustom: true\n    };\n\n    setShareTargetDrug(target);\n    setShareMode(options.mode || "share");\n    setShareFocusRecipients(Boolean(options.focusRecipients));\n    setShareModalOpen(true);\n    await loadFriendsForSharing();\n  };\n\n  const insertSharedDrugRecord = async ({ colleagueId, mode }) => {\n    const drugName = shareTargetDrug?.name;\n    const ownedRows = getOwnedDrugRowsForName(drugName);\n    const primaryDrugId = ownedRows[0]?.id || shareTargetDrug?.id || drugName;\n    const baseRecord = {\n      sender_id: user.id,\n      receiver_id: colleagueId,\n      record_type: mode === "collaborate" ? "drug_collaboration" : "drug_monograph",\n      record_id: String(primaryDrugId),\n      record_title: drugName\n    };\n\n    const result = await supabase.from("shared_records").insert({\n      ...baseRecord,\n      metadata: {\n        mode,\n        ...buildDrugSharePayload(drugName)\n      }\n    });\n\n    if (!result.error) return result;\n    const message = result.error.message || "";\n    if (message.includes("metadata") || message.includes("column")) {\n      return supabase.from("shared_records").insert(baseRecord);\n    }\n    return result;\n  };\n\n  const shareDrugWithColleague = async ({ colleagueId, mode }) => {\n    if (!shareTargetDrug?.name) return toast.error("Choose a drug first");\n    if (!colleagueId) return toast.error("Choose a colleague");\n\n    const ownedRows = getOwnedDrugRowsForName(shareTargetDrug.name);\n    if (ownedRows.length === 0) return toast.error("Only your own My Drugs can be shared or collaborated on");\n\n    setShareBusyId(colleagueId);\n\n    if (mode === "collaborate") {\n      const { error } = await supabase.from("drug_collaborators").upsert({\n        drug_id: ownedRows[0].id,\n        owner_id: user.id,\n        collaborator_id: colleagueId,\n        permission: "editor",\n        status: "pending",\n        updated_at: new Date().toISOString()\n      }, { onConflict: "drug_id,collaborator_id" });\n\n      if (error) {\n        setShareBusyId(null);\n        const message = error.message || "";\n        if (message.includes("drug_collaborators") || message.includes("relation") || message.includes("schema cache")) {\n          toast.error("Collaboration is not ready yet. Run supabase/my_drugs_collaboration.sql in Supabase.");\n        } else {\n          toast.error("Could not invite collaborator");\n        }\n        return;\n      }\n    }\n\n    const { error } = await insertSharedDrugRecord({ colleagueId, mode });\n    setShareBusyId(null);\n    if (error) return toast.error(mode === "collaborate" ? "Invite saved, but message/share record failed" : "Could not share monograph");\n\n    toast.success(mode === "collaborate" ? "Collaborator invited" : "Monograph sent");\n    setShareModalOpen(false);\n    setShareTargetDrug(null);\n  };\n\n`;

replaceRegex(
  /  const loadFriendsForSharing = async \(\) => \{[\s\S]*?\n  const saveDrug = async \(\) => \{/,
  `${sharingFunctions}  const saveDrug = async () => {`,
  'const openDrugShareModal = async',
  'sharing functions'
);

insertAfter(
  '  const saveDrug = async () => {\n    if (!drugForm.name.trim()) return toast.error("Drug name required");\n',
  '    if (!canUseMyDrugs) return toast.error("My Drugs is turned off for this user type");\n',
  'My Drugs is turned off for this user type',
  'save drug feature guard'
);

insertAfter(
  '  const requestDeleteDrug = (id) => {\n',
  '    // Existing dose-level delete used inside the monograph.\n',
  'Existing dose-level delete used inside the monograph',
  'dose delete comment'
);

insertAfter(
  '  const requestDeleteDrug = (id) => {\n    // Existing dose-level delete used inside the monograph.\n',
  '',
  'Existing dose-level delete used inside the monograph',
  'noop'
);

insertAfter(
  '  const addDrugToActiveCalc = (drug) => {\n',
  `  const deleteMyDrug = async (drugName) => {\n    const ownedRows = getOwnedDrugRowsForName(drugName);\n    if (ownedRows.length === 0) return toast.error("Only your own My Drugs can be deleted");\n    const ownedIds = ownedRows.map((row) => row.id);\n    const { error } = await supabase.from("drugs").delete().in("id", ownedIds).eq("user_id", user.id);\n    if (error) return toast.error("Could not delete My Drug");\n    setDrugs((prev) => prev.filter((drug) => !ownedIds.includes(drug.id)));\n    if (normalise(activeDrugName) === normalise(drugName)) {\n      setMonographOpen(false);\n      setActiveDrugName("");\n      setActiveDrugDoses([]);\n    }\n    toast.success("My Drug deleted");\n  };\n\n  const requestDeleteMyDrug = (drugName) => {\n    setAppPopup({\n      tone: "danger",\n      icon: Trash2,\n      title: "Delete My Drug?",\n      message: `This will remove ${drugName || "this custom monograph"} from your My Drugs. Main formulary drugs will not be deleted.`,\n      footerLabel: "MY DRUGS",\n      primaryLabel: "Delete My Drug",\n      secondaryLabel: "Cancel",\n      onPrimary: () => {\n        closeAppPopup();\n        deleteMyDrug(drugName);\n      },\n      onSecondary: closeAppPopup\n    });\n  };\n\n`,
  'const deleteMyDrug = async',
  'delete my drug functions'
);

replaceOnce(
  '  const canUseCalculator = canUseFeature(featureAccess, featureKeys.drugCalculator, adminAccess);\n  const canUseLibrary = canUseFeature(featureAccess, featureKeys.library, adminAccess);\n  const formularyTabs = useMemo(() => [\n    ...(canUseLibrary ? [{ id: "library", label: "Library" }] : []),\n    ...(canUseCalculator ? [{ id: "calculator", label: "Calculator" }] : []),\n    { id: "history", label: "History" }\n  ], [canUseCalculator, canUseLibrary]);',
  '  const canUseCalculator = canUseFeature(featureAccess, featureKeys.drugCalculator, adminAccess);\n  const canUseLibrary = canUseFeature(featureAccess, featureKeys.library, adminAccess);\n  const formularyTabs = useMemo(() => [\n    ...(canUseLibrary ? [{ id: "library", label: "Library" }] : []),\n    ...(canUseMyDrugs ? [{ id: "myDrugs", label: "My Drugs" }] : []),\n    ...(canUseCalculator ? [{ id: "calculator", label: "Calculator" }] : []),\n    { id: "history", label: "History" }\n  ], [canUseCalculator, canUseLibrary, canUseMyDrugs]);',
  'my drugs formulary tab'
);

replaceOnce(
  '      <DrugMonograph',
  '      <MyDrugShareCollaborationModal\n        open={shareModalOpen}\n        darkMode={darkMode}\n        drug={shareTargetDrug}\n        mode={shareMode}\n        setMode={setShareMode}\n        colleagues={shareFriendsList}\n        loading={shareLoading}\n        busy={!!shareBusyId}\n        focusRecipients={shareFocusRecipients}\n        onClose={() => { setShareModalOpen(false); setShareTargetDrug(null); }}\n        onSubmit={shareDrugWithColleague}\n      />\n\n      <DrugMonograph',
  'MyDrugShareCollaborationModal'
);

replaceOnce(
  '        onOpenShare={loadFriendsForSharing}\n        onShare={shareDrugWithColleague}\n        shareBusyId={shareBusyId}',
  '        onOpenShare={() => openDrugShareModal(activeDrugName, { mode: "share", focusRecipients: true })}',
  'monograph share modal prop'
);

replaceOnce(
  '               saveDrug={saveDrug}\n             />',
  '               saveDrug={saveDrug}\n               canUseMyDrugs={canUseMyDrugs}\n             />',
  'library can use my drugs prop'
);

insertAfter(
  '           )}\n\n           {canUseCalculator && activeTab === "calculator" && (',
  '           {canUseMyDrugs && activeTab === "myDrugs" && (\n             <MyDrugsTab\n               darkMode={darkMode}\n               panelClass={panelClass}\n               myDrugsList={myDrugsList}\n               openMonograph={openMonograph}\n               onShare={(drug) => openDrugShareModal(drug, { mode: "share" })}\n               onDelete={requestDeleteMyDrug}\n             />\n           )}\n\n',
  'function MyDrugsTab',
  'my drugs tab render'
);

replaceOnce(
  '    saveDrug\n  } = props;',
  '    saveDrug,\n    canUseMyDrugs\n  } = props;',
  'library destructure canUseMyDrugs'
);

replaceOnce(
  '          <button onClick={() => setShowAddDrug(!showAddDrug)} className="bg-[#71CFC2] text-[#062F63] px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-1 shadow-sm shrink-0">\n            <Plus size={14} /> Custom\n          </button>',
  '          {canUseMyDrugs && (\n            <button onClick={() => setShowAddDrug(!showAddDrug)} className="bg-[#71CFC2] text-[#062F63] px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-1 shadow-sm shrink-0">\n              <Plus size={14} /> Custom\n            </button>\n          )}',
  'hide custom button when my drugs off'
);

replaceOnce(
  '      {showAddDrug && <CustomDrugForm panelClass={panelClass} fieldClass={fieldClass} drugForm={drugForm} setDrugForm={setDrugForm} saveDrug={saveDrug} onClose={() => setShowAddDrug(false)} />}',
  '      {canUseMyDrugs && showAddDrug && <CustomDrugForm panelClass={panelClass} fieldClass={fieldClass} drugForm={drugForm} setDrugForm={setDrugForm} saveDrug={saveDrug} onClose={() => setShowAddDrug(false)} />}',
  'hide custom form when my drugs off'
);

const myDrugsTabComponent = `\nfunction MyDrugsTab({ darkMode, panelClass, myDrugsList, openMonograph, onShare, onDelete }) {\n  return (\n    <div className="space-y-4">\n      <div className={panelClass}>\n        <h2 className="font-black text-lg mb-2">My Drugs / Monographs</h2>\n        <p className="text-sm opacity-65 leading-6">Your custom drug monographs and dosing records. Share read-only copies, invite collaborators, or delete records you own.</p>\n      </div>\n\n      {myDrugsList.length === 0 ? (\n        <div className={`${panelClass} text-center opacity-70 text-sm`}>No custom drugs yet. Add one from the Library tab.</div>\n      ) : (\n        <div className="space-y-3">\n          {myDrugsList.map((drug) => (\n            <div key={drug.name} className={panelClass}>\n              <div className="flex items-start justify-between gap-3">\n                <button type="button" onClick={() => openMonograph(drug.name)} className="min-w-0 flex-1 text-left">\n                  <h3 className="font-black text-lg truncate">{drug.name}</h3>\n                  <p className="text-xs opacity-60 mt-1">{drug.category || "Custom"} | {drug.doseCount} dose record{drug.doseCount === 1 ? "" : "s"}</p>\n                  <div className="flex gap-2 flex-wrap mt-2">\n                    {drug.species.slice(0, 3).map((species) => <span key={species} className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${darkMode ? "bg-white/10 text-slate-300" : "bg-slate-100 text-slate-500"}`}>{species}</span>)}\n                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#71CFC2]/20 text-[#0F8F83] flex items-center gap-1"><UserIcon size={10} /> My Drug</span>\n                  </div>\n                </button>\n                <ChevronRight size={20} className="opacity-30 shrink-0 mt-1" />\n              </div>\n              <div className="grid grid-cols-2 gap-2 mt-4">\n                <button type="button" onClick={() => onShare(drug)} className="rounded-lg bg-[#71CFC2] text-[#062F63] px-3 py-2 text-xs font-black flex items-center justify-center gap-2"><Share2 size={14} /> Share</button>\n                <button type="button" onClick={() => onDelete(drug.name)} className="rounded-lg bg-red-50 text-red-600 px-3 py-2 text-xs font-black flex items-center justify-center gap-2"><Trash2 size={14} /> Delete</button>\n              </div>\n            </div>\n          ))}\n        </div>\n      )}\n    </div>\n  );\n}\n`;

insertAfter(
  'function LibraryTab(props) {\n',
  myDrugsTabComponent,
  'function MyDrugsTab',
  'my drugs tab component'
);

replaceRegex(
  /    shareOpen,\n    friendsList,\n    onOpenShare,\n    onShare,\n    shareBusyId\n  \} = props;/,
  '    onOpenShare\n  } = props;',
  'monograph props cleaned',
  'monograph prop cleanup'
);

replaceRegex(
  /\n\s*\{shareOpen && \(\n\s*<div className=\{`rounded-lg p-3 mt-4 \$\{darkMode \? "bg-white\/5" : "bg\[#F0F6F5\]"\}`}\>[\s\S]*?\n\s*\)\}/,
  '',
  'old inline share removed',
  'old inline share block removal'
);

replaceOnce(
  'function ActionButton({ children, icon, onClick, active }) {\n  return <button onClick={onClick}',
  'function ActionButton({ children, icon, onClick, active }) {\n  return <button type="button" onClick={onClick}',
  'action button type'
);

if (src !== original) {
  fs.writeFileSync(file, src, 'utf8');
  console.log('Patched src/pages/Formulary.jsx with My Drugs sharing, collaboration invite, My Drugs tab, and owner-only delete controls.');
} else {
  console.log('No changes made. Formulary.jsx already looked patched.');
}
