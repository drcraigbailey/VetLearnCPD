const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const warnings = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content, "utf8");
}

function replaceOnce(source, relativePath, description, find, replace, alreadyAppliedNeedle) {
  if (alreadyAppliedNeedle && source.includes(alreadyAppliedNeedle)) return source;
  if (!source.includes(find)) {
    warnings.push(`${relativePath}: skipped ${description}; matching code was not found.`);
    return source;
  }
  return source.replace(find, replace);
}

function patchNetwork() {
  const relativePath = "src/pages/Network.jsx";
  let source = read(relativePath);
  const original = source;

  source = replaceOnce(
    source,
    relativePath,
    "default post form drug selections",
    `  images: [],\n  existing_urls: []\n};`,
    `  images: [],\n  existing_urls: [],\n  selected_drug_ids: []\n};`,
    `selected_drug_ids`
  );

  source = replaceOnce(
    source,
    relativePath,
    "shareable custom drug state",
    `  const [shareableProtocols, setShareableProtocols] = useState([]);\n`,
    `  const [shareableProtocols, setShareableProtocols] = useState([]);\n  const [shareableDrugs, setShareableDrugs] = useState([]);\n`,
    `const [shareableDrugs, setShareableDrugs]`
  );

  source = replaceOnce(
    source,
    relativePath,
    "load custom drugs as shareable items",
    `    const [casesRes, protocolsRes] = await Promise.all([\n      supabase.from("caselogs").select("id, title, category, patient_name, species, breed, age, gender, description, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),\n      supabase.from("protocols").select("id, name, indication, drug_ids, drug_doses, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30)\n    ]);\n    if (!casesRes.error) setShareableCases(casesRes.data || []);\n    if (!protocolsRes.error) setShareableProtocols(protocolsRes.data || []);`,
    `    const [casesRes, protocolsRes, drugsRes] = await Promise.all([\n      supabase.from("caselogs").select("id, title, category, patient_name, species, breed, age, gender, description, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),\n      supabase.from("protocols").select("id, name, indication, drug_ids, drug_doses, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),\n      supabase.from("drugs").select("id, name, species, concentration, dose_min, dose_max, route, category, notes, created_at").eq("user_id", user.id).eq("active", true).order("name", { ascending: true }).limit(80)\n    ]);\n    if (!casesRes.error) setShareableCases(casesRes.data || []);\n    if (!protocolsRes.error) setShareableProtocols(protocolsRes.data || []);\n    if (!drugsRes.error) setShareableDrugs(drugsRes.data || []);`,
    `setShareableDrugs(drugsRes.data || [])`
  );

  source = replaceOnce(
    source,
    relativePath,
    "safe attachment reset helpers",
    `  const updatePostForm = (field, value) => setPostForm(prev => ({ ...prev, [field]: value, ...(field === "shared_type" || field === "shared_title" || field === "shared_url" ? { shared_payload: null } : {}) }));\n  const updateEditForm = (field, value) => setEditForm(prev => ({ ...prev, [field]: value, ...(field === "shared_type" || field === "shared_title" || field === "shared_url" ? { shared_payload: null } : {}) }));`,
    `  const attachmentFieldClearsPayload = (field) => field === "shared_type" || field === "shared_title" || field === "shared_url";\n  const updatePostForm = (field, value) => setPostForm(prev => ({ ...prev, [field]: value, ...(attachmentFieldClearsPayload(field) ? { shared_payload: null, selected_drug_ids: [] } : {}) }));\n  const updateEditForm = (field, value) => setEditForm(prev => ({ ...prev, [field]: value, ...(attachmentFieldClearsPayload(field) ? { shared_payload: null, selected_drug_ids: [] } : {}) }));`,
    `attachmentFieldClearsPayload`
  );

  source = replaceOnce(
    source,
    relativePath,
    "drug bundle attachment helper",
    `  const attachOwnItem = (kind, id, isEditing = false) => {\n    const source = kind === "caselog" ? shareableCases : shareableProtocols;\n    const item = source.find(entry => String(entry.id) === String(id));\n    if (!item) return;\n\n    const nextAttachment = { \n      shared_type: kind, \n      shared_title: kind === "caselog" ? item.title : item.name, \n      shared_url: \`shared://\${kind}/\${item.id}\`, \n      shared_payload: buildSharedPayload(kind, item) \n    };\n\n    if (isEditing) setEditForm(prev => ({ ...prev, ...nextAttachment }));\n    else setPostForm(prev => ({ ...prev, ...nextAttachment }));\n  };`,
    `  const attachOwnItem = (kind, id, isEditing = false) => {\n    const source = kind === "caselog" ? shareableCases : shareableProtocols;\n    const item = source.find(entry => String(entry.id) === String(id));\n    if (!item) return;\n\n    const nextAttachment = { \n      shared_type: kind, \n      shared_title: kind === "caselog" ? item.title : item.name, \n      shared_url: \`shared://\${kind}/\${item.id}\`, \n      shared_payload: buildSharedPayload(kind, item),\n      selected_drug_ids: []\n    };\n\n    if (isEditing) setEditForm(prev => ({ ...prev, ...nextAttachment }));\n    else setPostForm(prev => ({ ...prev, ...nextAttachment }));\n  };\n\n  const toggleDrugAttachment = (id, isEditing = false) => {\n    const setter = isEditing ? setEditForm : setPostForm;\n\n    setter((prev) => {\n      const currentIds = (prev.selected_drug_ids?.length ? prev.selected_drug_ids : getDrugPayloadIds(prev.shared_payload)).map(String);\n      const nextIds = currentIds.includes(String(id))\n        ? currentIds.filter((drugId) => drugId !== String(id))\n        : [...currentIds, String(id)];\n      const selectedDrugs = shareableDrugs.filter((drug) => nextIds.includes(String(drug.id)));\n\n      if (selectedDrugs.length === 0) {\n        return {\n          ...prev,\n          shared_type: prev.shared_type === "drug" ? "" : prev.shared_type,\n          shared_title: prev.shared_type === "drug" ? "" : prev.shared_title,\n          shared_url: prev.shared_type === "drug" ? "" : prev.shared_url,\n          shared_payload: prev.shared_type === "drug" ? null : prev.shared_payload,\n          selected_drug_ids: []\n        };\n      }\n\n      return {\n        ...prev,\n        shared_type: "drug",\n        shared_title: summariseDrugPackTitle(selectedDrugs),\n        shared_url: \`shared://drug-pack/\${selectedDrugs.map((drug) => drug.id).join(",")}\`,\n        shared_payload: buildSharedPayload("drug_pack", selectedDrugs),\n        selected_drug_ids: nextIds,\n        post_category: prev.post_category === "General" ? "Drugs" : prev.post_category\n      };\n    });\n  };`,
    `toggleDrugAttachment`
  );

  source = replaceOnce(
    source,
    relativePath,
    "clear selected drug attachment ids",
    `    const blank = { shared_type: "", shared_title: "", shared_url: "", shared_payload: null };`,
    `    const blank = { shared_type: "", shared_title: "", shared_url: "", shared_payload: null, selected_drug_ids: [] };`,
    `const blank = { shared_type: "", shared_title: "", shared_url: "", shared_payload: null, selected_drug_ids: [] };`
  );

  source = replaceOnce(
    source,
    relativePath,
    "restore selected drugs when editing posts",
    `      visibility: post.visibility || "network",\n      images: [],\n      existing_urls: post.attachment_urls || []\n    });`,
    `      visibility: post.visibility || "network",\n      images: [],\n      existing_urls: post.attachment_urls || [],\n      selected_drug_ids: post.shared_type === "drug" ? getDrugPayloadIds(post.shared_payload) : []\n    });`,
    `selected_drug_ids: post.shared_type === "drug" ? getDrugPayloadIds(post.shared_payload) : []`
  );

  source = replaceOnce(
    source,
    relativePath,
    "shared drug URL parsing",
    `    const sharedMatch = rawUrl.match(/^shared:\\/\\/(caselog|protocol)\\/([^/?#]+)/);\n    const kind = sharedMatch?.[1] || post.shared_type;`,
    `    const sharedMatch = rawUrl.match(/^shared:\\/\\/(caselog|protocol|drug|drug-pack)\\/([^/?#]+)/);\n    const kind = sharedMatch?.[1] === "drug-pack" ? "drug" : sharedMatch?.[1] || post.shared_type;`,
    `drug-pack)\\/([^/?#]+)`
  );

  source = replaceOnce(
    source,
    relativePath,
    "shared drug fallback guard",
    `    if (!["caselog", "protocol"].includes(kind) || !sharedId) {\n      toast.error("This shared item has no popup preview. Ask the author to reattach it.");\n      return;\n    }`,
    `    if (!["caselog", "protocol", "drug"].includes(kind) || !sharedId) {\n      toast.error("This shared item has no popup preview. Ask the author to reattach it.");\n      return;\n    }\n\n    if (kind === "drug") {\n      toast.error("This shared drug has no snapshot. Ask the author to reattach it.");\n      return;\n    }`,
    `This shared drug has no snapshot`
  );

  source = replaceOnce(
    source,
    relativePath,
    "pass shareable drugs into posts tab",
    `          postForm={postForm} postSaving={postSaving} shareableCases={shareableCases} shareableProtocols={shareableProtocols}\n          updatePostForm={updatePostForm} attachOwnItem={attachOwnItem} clearAttachment={clearAttachment} requestPostSave={() => requestPostSave("create")}`,
    `          postForm={postForm} postSaving={postSaving} shareableCases={shareableCases} shareableProtocols={shareableProtocols} shareableDrugs={shareableDrugs}\n          updatePostForm={updatePostForm} attachOwnItem={attachOwnItem} onToggleDrugAttachment={toggleDrugAttachment} clearAttachment={clearAttachment} requestPostSave={() => requestPostSave("create")}`,
    `shareableDrugs={shareableDrugs}`
  );

  source = replaceOnce(
    source,
    relativePath,
    "posts tab props include drug helpers",
    `    postForm, postSaving, shareableCases, shareableProtocols, updatePostForm, attachOwnItem, clearAttachment, requestPostSave,\n    posts, postLoading, user, editForm, editingPostId, postUpdating, startEditingPost, cancelEditingPost, updateEditForm,\n    onRemoveExistingImage, requestUpdateSave, deletePost, setSharedViewer, setFullImagePreview`,
    `    postForm, postSaving, shareableCases, shareableProtocols, shareableDrugs, updatePostForm, attachOwnItem, onToggleDrugAttachment, clearAttachment, requestPostSave,\n    posts, postLoading, user, editForm, editingPostId, postUpdating, startEditingPost, cancelEditingPost, updateEditForm,\n    onRemoveExistingImage, requestUpdateSave, deletePost, setSharedViewer, setFullImagePreview`,
    `onToggleDrugAttachment`
  );

  source = replaceOnce(
    source,
    relativePath,
    "composer receives shareable drugs",
    `          shareableCases={shareableCases} shareableProtocols={shareableProtocols}\n          saving={postSaving} saveLabel="Share post"\n          onChange={updatePostForm} onAttach={attachOwnItem} onClearAttachment={() => clearAttachment(false)} onSave={requestPostSave}`,
    `          shareableCases={shareableCases} shareableProtocols={shareableProtocols} shareableDrugs={shareableDrugs}\n          saving={postSaving} saveLabel="Share post"\n          onChange={updatePostForm} onAttach={attachOwnItem} onToggleDrug={onToggleDrugAttachment} onClearAttachment={() => clearAttachment(false)} onSave={requestPostSave}`,
    `onToggleDrug={onToggleDrugAttachment}`
  );

  source = replaceOnce(
    source,
    relativePath,
    "network post receives shareable drugs",
    `            shareableCases={shareableCases} shareableProtocols={shareableProtocols}\n            onEdit={() => startEditingPost(post)} onCancelEdit={cancelEditingPost} onEditChange={updateEditForm}`,
    `            shareableCases={shareableCases} shareableProtocols={shareableProtocols} shareableDrugs={shareableDrugs}\n            onEdit={() => startEditingPost(post)} onCancelEdit={cancelEditingPost} onEditChange={updateEditForm}`,
    `shareableProtocols={shareableProtocols} shareableDrugs={shareableDrugs}`
  );

  source = replaceOnce(
    source,
    relativePath,
    "network post edit drug toggle",
    `            onAttachEdit={(kind, id) => attachOwnItem(kind, id, true)} onClearEditAttachment={() => clearAttachment(true)}`,
    `            onAttachEdit={(kind, id) => attachOwnItem(kind, id, true)} onToggleDrugEdit={(id) => onToggleDrugAttachment(id, true)} onClearEditAttachment={() => clearAttachment(true)}`,
    `onToggleDrugEdit={(id) => onToggleDrugAttachment(id, true)}`
  );

  source = replaceOnce(
    source,
    relativePath,
    "post composer drug props",
    `function PostComposer({ title, subtitle, icon: HeaderIcon = Newspaper, form, darkMode, panelClass, fieldClass, shareableCases, shareableProtocols, saving, saveLabel, onChange, onAttach, onClearAttachment, onSave, onRemoveExistingImage }) {`,
    `function PostComposer({ title, subtitle, icon: HeaderIcon = Newspaper, form, darkMode, panelClass, fieldClass, shareableCases, shareableProtocols, shareableDrugs = [], saving, saveLabel, onChange, onAttach, onToggleDrug, onClearAttachment, onSave, onRemoveExistingImage }) {`,
    `shareableDrugs = []`
  );

  source = replaceOnce(
    source,
    relativePath,
    "selected drug ids in composer",
    `  const removeNewImage = (index) => {\n    const newImgs = [...form.images];\n    newImgs.splice(index, 1);\n    onChange("images", newImgs);\n  };`,
    `  const removeNewImage = (index) => {\n    const newImgs = [...form.images];\n    newImgs.splice(index, 1);\n    onChange("images", newImgs);\n  };\n\n  const selectedDrugIds = (form.selected_drug_ids?.length ? form.selected_drug_ids : getDrugPayloadIds(form.shared_payload)).map(String);`,
    `selectedDrugIds = (form.selected_drug_ids?.length`
  );

  source = replaceOnce(
    source,
    relativePath,
    "custom drug picker UI",
    `        </div>\n\n        {form.shared_type && form.shared_title && (`,
    `        </div>\n\n        <div className={\`rounded-lg border p-3 \${darkMode ? "bg-white/5 border-white/10" : "bg-white border-[#DCEDEA]"}\`}>\n          <div className="flex items-center justify-between gap-3 mb-2">\n            <div>\n              <p className="font-black text-sm">Attach my custom drugs</p>\n              <p className="text-xs opacity-60 leading-5">Choose one or several personal formulary entries to share as a saveable snapshot.</p>\n            </div>\n            {selectedDrugIds.length > 0 && <span className="text-[10px] font-black uppercase tracking-widest text-[#0F8F83]">{selectedDrugIds.length} selected</span>}\n          </div>\n          {shareableDrugs.length === 0 ? (\n            <p className="text-xs opacity-55">Your custom drugs will appear here after you add them in the formulary.</p>\n          ) : (\n            <div className="grid gap-2 sm:grid-cols-2 max-h-56 overflow-y-auto pr-1">\n              {shareableDrugs.map((drug) => (\n                <label key={drug.id} className={\`flex items-start gap-2 rounded-lg p-2 text-xs cursor-pointer transition \${selectedDrugIds.includes(String(drug.id)) ? "bg-[#71CFC2]/20 text-[#0B3760] dark:text-[#71CFC2]" : darkMode ? "bg-white/5 hover:bg-white/10" : "bg-[#F0F6F5] hover:bg-[#E8F8F5]"}\`}>\n                  <input\n                    type="checkbox"\n                    className="mt-0.5 accent-[#71CFC2]"\n                    checked={selectedDrugIds.includes(String(drug.id))}\n                    onChange={() => onToggleDrug?.(drug.id)}\n                  />\n                  <span className="min-w-0">\n                    <span className="block font-black truncate">{drug.name || "Unnamed drug"}</span>\n                    <span className="block opacity-60 leading-5">{formatDrugDose(drug)}</span>\n                  </span>\n                </label>\n              ))}\n            </div>\n          )}\n        </div>\n\n        {form.shared_type && form.shared_title && (`,
    `Attach my custom drugs`
  );

  source = replaceOnce(
    source,
    relativePath,
    "network post drug props",
    `function NetworkPost({ post, user, darkMode, panelClass, fieldClass, editForm, editing, postUpdating, shareableCases, shareableProtocols, onEdit, onCancelEdit, onEditChange, onRemoveExistingImage, onAttachEdit, onClearEditAttachment, onUpdate, onDelete, onOpenShared, onOpenImage }) {`,
    `function NetworkPost({ post, user, darkMode, panelClass, fieldClass, editForm, editing, postUpdating, shareableCases, shareableProtocols, shareableDrugs, onEdit, onCancelEdit, onEditChange, onRemoveExistingImage, onAttachEdit, onToggleDrugEdit, onClearEditAttachment, onUpdate, onDelete, onOpenShared, onOpenImage }) {`,
    `onToggleDrugEdit`
  );

  source = replaceOnce(
    source,
    relativePath,
    "network post drug label",
    `  const shareLabel = postShareTypes.find(type => type.value === post.shared_type)?.label || "Shared item";\n  const sharedUrl = normaliseSharedUrl(post.shared_url);`,
    `  const sharedDrugs = post.shared_type === "drug" ? getDrugPayloads(post.shared_payload) : [];\n  const shareLabel = post.shared_type === "drug"\n    ? (sharedDrugs.length > 1 ? \`${sharedDrugs.length} shared drugs\` : "Drug")\n    : postShareTypes.find(type => type.value === post.shared_type)?.label || "Shared item";\n  const sharedUrl = normaliseSharedUrl(post.shared_url);`,
    `const sharedDrugs = post.shared_type === "drug"`
  );

  source = replaceOnce(
    source,
    relativePath,
    "drug posts open shared modal",
    `  const opensSharedModal = ["caselog", "protocol", "cpd", "resource"].includes(post.shared_type);`,
    `  const opensSharedModal = ["caselog", "protocol", "drug", "cpd", "resource"].includes(post.shared_type);`,
    `["caselog", "protocol", "drug", "cpd", "resource"]`
  );

  source = replaceOnce(
    source,
    relativePath,
    "edit composer receives shareable drugs",
    `        shareableCases={shareableCases} shareableProtocols={shareableProtocols} saving={postUpdating} \n        saveLabel="Save changes" onChange={onEditChange} onRemoveExistingImage={onRemoveExistingImage} \n        onAttach={onAttachEdit} onClearAttachment={onClearEditAttachment} onSave={onUpdate} `,
    `        shareableCases={shareableCases} shareableProtocols={shareableProtocols} shareableDrugs={shareableDrugs} saving={postUpdating} \n        saveLabel="Save changes" onChange={onEditChange} onRemoveExistingImage={onRemoveExistingImage} \n        onAttach={onAttachEdit} onToggleDrug={onToggleDrugEdit} onClearAttachment={onClearEditAttachment} onSave={onUpdate} `,
    `onToggleDrug={onToggleDrugEdit}`
  );

  source = replaceOnce(
    source,
    relativePath,
    "shared modal payload drugs",
    `  const payload = post.shared_payload || {};\n  const modalClass = darkMode ? "bg-[#0B242B] text-white" : "bg-white text-[#113247]";`,
    `  const payload = post.shared_payload || {};\n  const payloadDrugs = getDrugPayloads(payload);\n  const modalClass = darkMode ? "bg-[#0B242B] text-white" : "bg-white text-[#113247]";`,
    `const payloadDrugs = getDrugPayloads(payload);`
  );

  source = replaceOnce(
    source,
    relativePath,
    "save shared drugs to formulary",
    `  const saveSharedItem = async () => {\n    if (!user?.id || saving) return;\n    setSaving(true);\n    \n    const isCase = post.shared_type === "caselog";\n    const table = isCase ? "caselogs" : "protocols";\n    \n    const payloadToInsert = isCase \n      ? { \n          user_id: user.id, \n          title: \`${post.shared_title || payload.title || "Shared case"} (shared)\`, \n          category: payload.category || "Other", \n          patient_name: null, \n          species: payload.species || null, \n          breed: payload.breed || null, \n          age: payload.age || null, \n          gender: payload.gender || null, \n          description: payload.description || null, \n          media_urls: [] \n        }\n      : { \n          user_id: user.id, \n          name: \`${post.shared_title || payload.name || "Shared protocol"} (shared)\`, \n          indication: payload.indication || "", \n          drug_ids: Array.isArray(payload.drug_ids) ? payload.drug_ids : [], \n          drug_doses: payload.drug_doses && typeof payload.drug_doses === "object" ? payload.drug_doses : {} \n        };\n\n    const { error } = await supabase.from(table).insert(payloadToInsert);\n    setSaving(false);\n    \n    if (error) return toast.error(\`Could not save shared ${isCase ? "case" : "protocol"}\`);\n    toast.success(\`Saved to your ${isCase ? "case logs" : "protocols"}\`);\n    onClose();\n  };`,
    `  const saveSharedItem = async () => {\n    if (!user?.id || saving) return;\n    setSaving(true);\n\n    if (post.shared_type === "drug") {\n      const rows = payloadDrugs.map((drug) => ({\n        user_id: user.id,\n        name: \`${drug.name || "Shared drug"} (shared)\`,\n        species: drug.species || "Other",\n        concentration: drug.concentration ?? null,\n        dose_min: drug.dose_min ?? null,\n        dose_max: drug.dose_max ?? null,\n        route: drug.route || null,\n        category: drug.category || "Custom",\n        notes: drug.notes || null,\n        active: true\n      }));\n\n      if (rows.length === 0) {\n        setSaving(false);\n        return toast.error("No drug snapshot found");\n      }\n\n      const { error } = await supabase.from("drugs").insert(rows);\n      setSaving(false);\n      if (error) return toast.error("Could not save shared drug");\n      toast.success(rows.length === 1 ? "Saved to your formulary" : \`Saved ${rows.length} drugs to your formulary\`);\n      onClose();\n      return;\n    }\n    \n    const isCase = post.shared_type === "caselog";\n    const table = isCase ? "caselogs" : "protocols";\n    \n    const payloadToInsert = isCase \n      ? { \n          user_id: user.id, \n          title: \`${post.shared_title || payload.title || "Shared case"} (shared)\`, \n          category: payload.category || "Other", \n          patient_name: null, \n          species: payload.species || null, \n          breed: payload.breed || null, \n          age: payload.age || null, \n          gender: payload.gender || null, \n          description: payload.description || null, \n          media_urls: [] \n        }\n      : { \n          user_id: user.id, \n          name: \`${post.shared_title || payload.name || "Shared protocol"} (shared)\`, \n          indication: payload.indication || "", \n          drug_ids: Array.isArray(payload.drug_ids) ? payload.drug_ids : [], \n          drug_doses: payload.drug_doses && typeof payload.drug_doses === "object" ? payload.drug_doses : {} \n        };\n\n    const { error } = await supabase.from(table).insert(payloadToInsert);\n    setSaving(false);\n    \n    if (error) return toast.error(\`Could not save shared ${isCase ? "case" : "protocol"}\`);\n    toast.success(\`Saved to your ${isCase ? "case logs" : "protocols"}\`);\n    onClose();\n  };`,
    `post.shared_type === "drug") {`
  );

  source = replaceOnce(
    source,
    relativePath,
    "shared drug modal preview",
    `        ) : post.shared_type === "protocol" ? (\n          <div className="space-y-3">\n            <SharedRow label="Indication" value={payload.indication} softClass={softClass} multiline />\n            <SharedRow label="Selected drug IDs" value={Array.isArray(payload.drug_ids) ? payload.drug_ids.join(", ") : ""} softClass={softClass} />\n            {payload.drug_doses && <SharedRow label="Dose notes" value={JSON.stringify(payload.drug_doses, null, 2)} softClass={softClass} multiline />}\n          </div>\n        ) : post.shared_type === "cpd" || post.shared_type === "resource" ? (`,
    `        ) : post.shared_type === "protocol" ? (\n          <div className="space-y-3">\n            <SharedRow label="Indication" value={payload.indication} softClass={softClass} multiline />\n            <SharedRow label="Selected drug IDs" value={Array.isArray(payload.drug_ids) ? payload.drug_ids.join(", ") : ""} softClass={softClass} />\n            {payload.drug_doses && <SharedRow label="Dose notes" value={JSON.stringify(payload.drug_doses, null, 2)} softClass={softClass} multiline />}\n          </div>\n        ) : post.shared_type === "drug" ? (\n          <div className="space-y-3">\n            {payloadDrugs.length === 0 ? (\n              <div className={\`${softClass} rounded-lg border p-4 text-sm opacity-80\`}>No drug snapshot is available.</div>\n            ) : payloadDrugs.map((drug, index) => (\n              <div key={drug.id || index} className={\`${softClass} rounded-lg border p-3\`}>\n                <div className="flex items-start justify-between gap-3">\n                  <div>\n                    <div className="text-xs font-black uppercase tracking-widest opacity-50 mb-1">Custom drug</div>\n                    <div className="text-lg font-black">{drug.name || "Unnamed drug"}</div>\n                  </div>\n                  {drug.category && <span className="rounded-full bg-[#71CFC2]/20 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-[#0F8F83] dark:text-[#71CFC2]">{drug.category}</span>}\n                </div>\n                <div className="mt-2 text-sm font-bold opacity-75">{formatDrugDose(drug)}</div>\n                {drug.notes && <div className="mt-2 text-sm leading-6 opacity-70 whitespace-pre-wrap">{drug.notes}</div>}\n              </div>\n            ))}\n          </div>\n        ) : post.shared_type === "cpd" || post.shared_type === "resource" ? (`,
    `post.shared_type === "drug" ? (`
  );

  source = replaceOnce(
    source,
    relativePath,
    "shared drug save button",
    `        {(post.shared_type === "caselog" || post.shared_type === "protocol") && (\n          <button onClick={saveSharedItem} disabled={saving} className="mt-5 w-full rounded-lg bg-[#71CFC2] text-[#062F63] p-3 font-black flex items-center justify-center gap-2 disabled:opacity-50">\n            {saving ? <Loader2 size={18} className="animate-spin" /> : <PlusCircle size={18} />} {post.shared_type === "caselog" ? "Add to my Case Logs" : "Save to my Protocols"}\n          </button>\n        )}`,
    `        {(post.shared_type === "caselog" || post.shared_type === "protocol" || post.shared_type === "drug") && (\n          <button onClick={saveSharedItem} disabled={saving} className="mt-5 w-full rounded-lg bg-[#71CFC2] text-[#062F63] p-3 font-black flex items-center justify-center gap-2 disabled:opacity-50">\n            {saving ? <Loader2 size={18} className="animate-spin" /> : <PlusCircle size={18} />} {post.shared_type === "caselog" ? "Add to my Case Logs" : post.shared_type === "protocol" ? "Save to my Protocols" : payloadDrugs.length > 1 ? "Add drugs to my Formulary" : "Add drug to my Formulary"}\n          </button>\n        )}`,
    `Add drugs to my Formulary`
  );

  source = replaceOnce(
    source,
    relativePath,
    "drug shared payload helpers",
    `function buildSharedPayload(kind, item) {\n  if (kind === "caselog") {\n    return { \n      id: item.id, title: item.title, category: item.category, species: item.species, \n      breed: item.breed, age: item.age, gender: item.gender, description: item.description, \n      created_at: item.created_at \n    };\n  }\n  return { \n    id: item.id, name: item.name, indication: item.indication, \n    drug_ids: item.drug_ids, drug_doses: item.drug_doses, created_at: item.created_at \n  };\n}\n\nfunction normaliseSharedUrl(url = "") {`,
    `function buildSharedPayload(kind, item) {\n  if (kind === "caselog") {\n    return { \n      id: item.id, title: item.title, category: item.category, species: item.species, \n      breed: item.breed, age: item.age, gender: item.gender, description: item.description, \n      created_at: item.created_at \n    };\n  }\n\n  if (kind === "drug") {\n    return {\n      id: item.id,\n      name: item.name,\n      species: item.species,\n      concentration: item.concentration,\n      dose_min: item.dose_min,\n      dose_max: item.dose_max,\n      route: item.route,\n      category: item.category,\n      notes: item.notes,\n      created_at: item.created_at\n    };\n  }\n\n  if (kind === "drug_pack") {\n    return {\n      kind: "drug_pack",\n      drugs: (item || []).map((drug) => buildSharedPayload("drug", drug)),\n      created_at: new Date().toISOString()\n    };\n  }\n\n  return { \n    id: item.id, name: item.name, indication: item.indication, \n    drug_ids: item.drug_ids, drug_doses: item.drug_doses, created_at: item.created_at \n  };\n}\n\nfunction getDrugPayloads(payload) {\n  if (!payload) return [];\n  if (Array.isArray(payload.drugs)) return payload.drugs;\n  if (payload.name || payload.dose_min || payload.concentration) return [payload];\n  return [];\n}\n\nfunction getDrugPayloadIds(payload) {\n  return getDrugPayloads(payload).map((drug) => String(drug.id)).filter(Boolean);\n}\n\nfunction summariseDrugPackTitle(drugs) {\n  if (!drugs.length) return "";\n  if (drugs.length === 1) return drugs[0].name || "Shared drug";\n  const preview = drugs.slice(0, 2).map((drug) => drug.name || "Unnamed drug").join(", ");\n  return \`${drugs.length} drugs: ${preview}${drugs.length > 2 ? ` +${drugs.length - 2}` : ""}\`;\n}\n\nfunction formatDrugDose(drug = {}) {\n  const dose = [drug.dose_min, drug.dose_max && drug.dose_max !== drug.dose_min ? drug.dose_max : null].filter(Boolean).join(" - ");\n  return [\n    drug.species,\n    drug.route,\n    dose ? \`${dose} mg/kg\` : null,\n    drug.concentration ? \`${drug.concentration} mg/ml\` : null\n  ].filter(Boolean).join(" · ") || "Custom drug";\n}\n\nfunction normaliseSharedUrl(url = "") {`,
    `function getDrugPayloads(payload)`
  );

  if (source !== original) write(relativePath, source);
}

function patchFormulary() {
  const relativePath = "src/pages/Formulary.jsx";
  let source = read(relativePath);
  const original = source;

  source = replaceOnce(
    source,
    relativePath,
    "quick share handler",
    `  const shareDrugWithColleague = async (friendId) => {\n    setShareBusyId(friendId);\n    const { error } = await supabase.from("shared_records").insert({\n      sender_id: user.id,\n      receiver_id: friendId,\n      record_type: "drug",\n      record_id: activeDrugName,\n      record_title: activeDrugName\n    });\n    setShareBusyId(null);\n    if (error) return toast.error("Could not share drug");\n    toast.success("Drug shared");\n    setShareOpen(false);\n  };`,
    `  const shareDrugWithColleague = async (friendId) => {\n    setShareBusyId(friendId);\n    const { error } = await supabase.from("shared_records").insert({\n      sender_id: user.id,\n      receiver_id: friendId,\n      record_type: "drug",\n      record_id: activeDrugName,\n      record_title: activeDrugName\n    });\n    setShareBusyId(null);\n    if (error) return toast.error("Could not share drug");\n    toast.success("Drug shared");\n    setShareOpen(false);\n  };\n\n  const openShareForDrug = async (drugName) => {\n    if (!drugName) return;\n    await openMonograph(drugName);\n    await loadFriendsForSharing();\n  };`,
    `openShareForDrug`
  );

  source = replaceOnce(
    source,
    relativePath,
    "pass quick share handler to library tab",
    `              setDrugForm={setDrugForm}\n              saveDrug={saveDrug}\n            />`,
    `              setDrugForm={setDrugForm}\n              saveDrug={saveDrug}\n              openShareForDrug={openShareForDrug}\n            />`,
    `openShareForDrug={openShareForDrug}`
  );

  source = replaceOnce(
    source,
    relativePath,
    "library tab quick share prop",
    `    drugForm,\n    setDrugForm,\n    saveDrug\n  } = props;`,
    `    drugForm,\n    setDrugForm,\n    saveDrug,\n    openShareForDrug\n  } = props;`,
    `openShareForDrug\n  } = props;`
  );

  source = replaceOnce(
    source,
    relativePath,
    "drug result card quick share prop",
    `            <DrugResultCard key={drug.id} drug={drug} darkMode={darkMode} panelClass={panelClass} search={drugSearch} onOpen={() => openMonograph(drug.name)} />`,
    `            <DrugResultCard key={drug.id} drug={drug} darkMode={darkMode} panelClass={panelClass} search={drugSearch} onOpen={() => openMonograph(drug.name)} onShare={openShareForDrug} />`,
    `onShare={openShareForDrug}`
  );

  source = replaceOnce(
    source,
    relativePath,
    "drug result card signature includes share",
    `function DrugResultCard({ drug, darkMode, panelClass, search, onOpen }) {`,
    `function DrugResultCard({ drug, darkMode, panelClass, search, onOpen, onShare }) {`,
    `onOpen, onShare`
  );

  source = replaceOnce(
    source,
    relativePath,
    "custom drug card share icon",
    `      <ChevronRight size={20} className="opacity-30 shrink-0" />\n    </button>`,
    `      <div className="flex items-center gap-2 shrink-0">\n        {drug.isCustom && (\n          <span\n            role="button"\n            tabIndex={0}\n            aria-label={\`Share ${drug.name}\`}\n            onClick={(event) => {\n              event.stopPropagation();\n              onShare?.(drug.name);\n            }}\n            onKeyDown={(event) => {\n              if (event.key === "Enter" || event.key === " ") {\n                event.preventDefault();\n                event.stopPropagation();\n                onShare?.(drug.name);\n              }\n            }}\n            className={\`h-9 w-9 rounded-full grid place-items-center transition \${darkMode ? "bg-white/10 text-[#71CFC2] hover:bg-white/15" : "bg-[#E8F8F5] text-[#0F8F83] hover:bg-white"}\`}\n          >\n            <Share2 size={16} />\n          </span>\n        )}\n        <ChevronRight size={20} className="opacity-30" />\n      </div>\n    </button>`,
    `aria-label={\`Share ${drug.name}\`}`
  );

  if (source !== original) write(relativePath, source);
}

try {
  patchNetwork();
  patchFormulary();
  if (warnings.length) {
    console.warn("VetLearn drug sharing patch completed with warnings:");
    warnings.forEach((warning) => console.warn(`- ${warning}`));
  } else {
    console.log("VetLearn drug sharing patch applied.");
  }
} catch (error) {
  console.error("VetLearn drug sharing patch failed:", error);
  process.exitCode = 1;
}
