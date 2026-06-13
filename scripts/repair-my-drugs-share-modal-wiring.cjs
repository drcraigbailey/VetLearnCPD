const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'pages', 'Formulary.jsx');
let source = fs.readFileSync(filePath, 'utf8');
const before = source;

function insertBefore(anchor, insert, marker, label) {
  if (source.includes(marker)) return;
  const index = source.indexOf(anchor);
  if (index === -1) {
    console.warn(`Could not insert ${label}: anchor not found`);
    return;
  }
  source = source.slice(0, index) + insert + source.slice(index);
}

function insertAfter(anchor, insert, marker, label) {
  if (source.includes(marker)) return;
  const index = source.indexOf(anchor);
  if (index === -1) {
    console.warn(`Could not insert ${label}: anchor not found`);
    return;
  }
  source = source.slice(0, index + anchor.length) + insert + source.slice(index + anchor.length);
}

function replaceAll(find, replace) {
  source = source.split(find).join(replace);
}

// Ensure import exists.
if (!source.includes('MyDrugShareCollaborationModal')) {
  insertAfter(
    'import AppPopup, { popupPresets } from "../components/AppPopup";\n',
    'import MyDrugShareCollaborationModal from "../components/MyDrugShareCollaborationModal";\n',
    'MyDrugShareCollaborationModal',
    'modal import'
  );
}

// Ensure modal state exists. This handles the original old shareOpen state block.
if (!source.includes('const [shareModalOpen, setShareModalOpen]')) {
  source = source.replace(
    '  const [shareOpen, setShareOpen] = useState(false);\n  const [friendsList, setFriendsList] = useState([]);\n  const [shareBusyId, setShareBusyId] = useState(null);',
    '  const [shareModalOpen, setShareModalOpen] = useState(false);\n  const [shareMode, setShareMode] = useState("");\n  const [shareTargetDrug, setShareTargetDrug] = useState(null);\n  const [shareFocusRecipients, setShareFocusRecipients] = useState(false);\n  const [shareFriendsList, setShareFriendsList] = useState([]);\n  const [shareLoading, setShareLoading] = useState(false);\n  const [shareBusyId, setShareBusyId] = useState(null);'
  );
}

// If the old state block was already removed, add the new state after popup state.
if (!source.includes('const [shareModalOpen, setShareModalOpen]')) {
  insertAfter(
    '  const [appPopup, setAppPopup] = useState(null);\n',
    '  const [shareModalOpen, setShareModalOpen] = useState(false);\n  const [shareMode, setShareMode] = useState("");\n  const [shareTargetDrug, setShareTargetDrug] = useState(null);\n  const [shareFocusRecipients, setShareFocusRecipients] = useState(false);\n  const [shareFriendsList, setShareFriendsList] = useState([]);\n  const [shareLoading, setShareLoading] = useState(false);\n  const [shareBusyId, setShareBusyId] = useState(null);\n',
    'const [shareModalOpen, setShareModalOpen]',
    'modal state'
  );
}

// Ensure the share modal itself is rendered before the monograph.
if (!source.includes('<MyDrugShareCollaborationModal')) {
  insertBefore(
    '      <DrugMonograph',
    '      <MyDrugShareCollaborationModal\n        open={shareModalOpen}\n        darkMode={darkMode}\n        drug={shareTargetDrug}\n        mode={shareMode}\n        setMode={setShareMode}\n        colleagues={shareFriendsList}\n        loading={shareLoading}\n        busy={!!shareBusyId}\n        focusRecipients={shareFocusRecipients}\n        onClose={() => {\n          setShareModalOpen(false);\n          setShareTargetDrug(null);\n          setShareMode("");\n        }}\n        onSubmit={shareDrugWithColleague}\n      />\n\n',
    '<MyDrugShareCollaborationModal',
    'modal render'
  );
}

// Ensure opening always starts with no selected mode.
replaceAll('setShareMode(options.mode || "share");', 'setShareMode(options.mode || "");');
replaceAll('setShareMode("share");', 'setShareMode("");');
replaceAll('openDrugShareModal(drug, { mode: "share" })', 'openDrugShareModal(drug)');
replaceAll('openDrugShareModal(activeDrugName, { mode: "share", focusRecipients: true })', 'openDrugShareModal(activeDrugName, { focusRecipients: true })');

// Wire monograph share button prop to open the modal.
source = source.replace(
  /onOpenShare=\{[^\n]+\}\n\s*onShare=\{shareDrugWithColleague\}\n\s*shareBusyId=\{shareBusyId\}/,
  'onOpenShare={() => openDrugShareModal(activeDrugName, { focusRecipients: true })}'
);
source = source.replace(
  /onOpenShare=\{loadFriendsForSharing\}/,
  'onOpenShare={() => openDrugShareModal(activeDrugName, { focusRecipients: true })}'
);

// Wire MyDrugsTab share callback if the tab exists.
source = source.replace(
  /onShare=\{\(drug\) => openDrugShareModal\(drug, \{ mode: "share" \}\)\}/,
  'onShare={(drug) => openDrugShareModal(drug)}'
);

// Ensure the monograph ActionButton still calls onOpenShare.
source = source.replace(
  /<ActionButton[^>]*icon=\{<Share2 size=\{14\} \/>\}[^>]*>\s*Share\s*<\/ActionButton>/,
  '<ActionButton onClick={onOpenShare} icon={<Share2 size={14} />}>Share</ActionButton>'
);

if (source !== before) {
  fs.writeFileSync(filePath, source, 'utf8');
  console.log('Repaired My Drugs share/collaboration modal wiring in src/pages/Formulary.jsx');
} else {
  console.log('No changes made. Share modal wiring already looked present.');
}
