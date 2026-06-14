const fs = require('fs');

const file = 'src/pages/Formulary.jsx';
let source = fs.readFileSync(file, 'utf8');

const before = source;
source = source.replace(/\n\s*<button onClick=\{\(\) => onOpen\(drug\)\} className="p-2\.5 rounded-lg bg-\[#71CFC2\] text-\[#062F63\]" aria-label=\{`Open \$\{drug\.name\}`\}>\n\s*<ChevronRight size=\{17\} \/>\n\s*<\/button>/, '');

if (source === before) {
  console.log('My Drugs open arrow button was not found. It may already be removed.');
} else {
  fs.writeFileSync(file, source);
  console.log('Removed the green open arrow button from My Drugs cards.');
}
