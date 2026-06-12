const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'src', 'App.jsx');
let src = fs.readFileSync(file, 'utf8');
const needle = '<Network user={session.user} darkMode={darkMode} />';
const replacement = '<Network user={session.user} darkMode={darkMode} featureAccess={featureAccess} adminAccess={adminAccess} />';
if (!src.includes('featureAccess={featureAccess} adminAccess={adminAccess} />)} />') && src.includes(needle)) {
  src = src.replace(needle, replacement);
}
fs.writeFileSync(file, src, 'utf8');
console.log('Patched Network route props.');
