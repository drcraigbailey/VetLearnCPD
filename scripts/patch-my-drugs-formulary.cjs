const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'pages', 'Formulary.jsx');
let src = fs.readFileSync(file, 'utf8');

function replaceOnce(find, replace, marker) {
  if (marker && src.includes(marker)) return;
  if (!src.includes(find)) {
    console.warn('Formulary My Drugs patch skipped missing block:', find.slice(0, 80));
    return;
  }
  src = src.replace(find, replace);
}

replaceOnce(
  '  const fieldClass = inputClass(darkMode);',
  '  const fieldClass = inputClass(darkMode);\n  const canUseMyDrugs = canUseFeature(featureAccess, featureKeys.myDrugs, adminAccess);',
  'const canUseMyDrugs = canUseFeature(featureAccess, featureKeys.myDrugs, adminAccess);'
);

replaceOnce('  }, [user]);', '  }, [user, canUseMyDrugs]);', '[user, canUseMyDrugs]');

replaceOnce(
  '      const [drugsRes, aliasesRes] = await Promise.all([\n        supabase.from("drugs").select("*").or(`user_id.is.null,user_id.eq.${user.id}`).eq("active", true).order("name"),\n        supabase.from("drug_aliases").select("*")\n      ]);',
  '      const drugsQuery = supabase.from("drugs").select("*").eq("active", true).order("name");\n      if (canUseMyDrugs) drugsQuery.or(`user_id.is.null,user_id.eq.${user.id}`);\n      else drugsQuery.is("user_id", null);\n\n      const [drugsRes, aliasesRes] = await Promise.all([\n        drugsQuery,\n        supabase.from("drug_aliases").select("*")\n      ]);',
  'const drugsQuery = supabase.from("drugs")'
);

replaceOnce(
  '  const saveDrug = async () => {\n    if (!drugForm.name.trim()) return toast.error("Drug name required");',
  '  const saveDrug = async () => {\n    if (!canUseMyDrugs) return toast.error("My Drugs is turned off for this user type");\n    if (!drugForm.name.trim()) return toast.error("Drug name required");',
  'My Drugs is turned off for this user type'
);

replaceOnce(
  '              fieldClass={fieldClass}',
  '              fieldClass={fieldClass}\n              canUseMyDrugs={canUseMyDrugs}',
  'canUseMyDrugs={canUseMyDrugs}'
);

replaceOnce(
  '    fieldClass,\n    uniqueDrugsList,',
  '    fieldClass,\n    canUseMyDrugs,\n    uniqueDrugsList,',
  'fieldClass,\n    canUseMyDrugs,'
);

replaceOnce(
  '          <button onClick={() => setShowAddDrug(!showAddDrug)} className="bg-[#71CFC2] text-[#062F63] px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-1 shadow-sm shrink-0">\n            <Plus size={14} /> Custom\n          </button>',
  '          {canUseMyDrugs && (\n            <button onClick={() => setShowAddDrug(!showAddDrug)} className="bg-[#71CFC2] text-[#062F63] px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-1 shadow-sm shrink-0">\n              <Plus size={14} /> My Drugs\n            </button>\n          )}',
  '<Plus size={14} /> My Drugs'
);

replaceOnce(
  '{showAddDrug && <CustomDrugForm panelClass={panelClass} fieldClass={fieldClass} drugForm={drugForm} setDrugForm={setDrugForm} saveDrug={saveDrug} onClose={() => setShowAddDrug(false)} />}',
  '{canUseMyDrugs && showAddDrug && <CustomDrugForm panelClass={panelClass} fieldClass={fieldClass} drugForm={drugForm} setDrugForm={setDrugForm} saveDrug={saveDrug} onClose={() => setShowAddDrug(false)} />}',
  'canUseMyDrugs && showAddDrug && <CustomDrugForm'
);

fs.writeFileSync(file, src, 'utf8');
console.log('Patched Formulary My Drugs feature gate.');
