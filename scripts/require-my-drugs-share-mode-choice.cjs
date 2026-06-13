const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'pages', 'Formulary.jsx');
let source = fs.readFileSync(filePath, 'utf8');
const before = source;

// Open the modal with no selected action, so the user must choose Share or Collaborate inside the pop-up.
source = source.replaceAll('setShareMode(options.mode || "share");', 'setShareMode(options.mode || "");');
source = source.replaceAll('setShareMode("share");', 'setShareMode("");');

// Remove preselected mode options from share button entry points when present.
source = source.replaceAll('openDrugShareModal(drug, { mode: "share" })', 'openDrugShareModal(drug)');
source = source.replaceAll('openDrugShareModal(activeDrugName, { mode: "share", focusRecipients: true })', 'openDrugShareModal(activeDrugName, { focusRecipients: true })');

if (source !== before) {
  fs.writeFileSync(filePath, source, 'utf8');
  console.log('Updated Formulary.jsx so My Drugs share modal requires choosing Share or Collaborate.');
} else {
  console.log('No preselected My Drugs share mode found, or Formulary.jsx was already updated.');
}
