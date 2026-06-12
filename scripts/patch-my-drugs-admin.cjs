const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'src/pages/AdminDashboard.jsx');
let src = fs.readFileSync(file, 'utf8');

if (!src.includes('my_drugs: "My Drugs"')) {
  src = src.replace(
    '  drug_database: "Drug Database",\n  library: "Library",',
    '  drug_database: "Drug Database",\n  my_drugs: "My Drugs",\n  library: "Library",'
  );
}

if (!src.includes('window.dispatchEvent(new Event("featureAccessUpdated"));')) {
  src = src.replace(
    '      await audit("feature_access_changed", null, { userType, featureKey, enabled });\n      toast.success("Feature access updated");',
    '      await audit("feature_access_changed", null, { userType, featureKey, enabled });\n      window.dispatchEvent(new Event("featureAccessUpdated"));\n      toast.success("Feature access updated");'
  );
}

fs.writeFileSync(file, src, 'utf8');
console.log('Patched AdminDashboard My Drugs feature toggle.');
