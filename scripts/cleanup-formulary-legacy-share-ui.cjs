const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'pages', 'Formulary.jsx');
let source = fs.readFileSync(filePath, 'utf8');
const before = source;

function removeLegacyShareBlock() {
  let changed = false;
  let closeHandlerIndex = source.indexOf('onCloseShare');

  while (closeHandlerIndex !== -1) {
    const blockStart = source.lastIndexOf('\n      {shareOpen && (', closeHandlerIndex);
    const nextDoseBlock = source.indexOf('\n      {activeDrugDoses.length === 0 ?', closeHandlerIndex);
    const nextSectionBlock = source.indexOf('\n      <section', closeHandlerIndex);

    const candidates = [nextDoseBlock, nextSectionBlock].filter((index) => index !== -1);
    const blockEnd = candidates.length ? Math.min(...candidates) : -1;

    if (blockStart !== -1 && blockEnd !== -1 && blockEnd > blockStart) {
      source = source.slice(0, blockStart) + source.slice(blockEnd);
      changed = true;
      closeHandlerIndex = source.indexOf('onCloseShare');
      continue;
    }

    break;
  }

  return changed;
}

const removedOldBlock = removeLegacyShareBlock();

// Keep any remaining old close handler harmless if a custom local edit left it outside the block.
source = source.replace(/onCloseShare/g, '(() => {})');

// Remove old inline share props from DrugMonograph destructuring when present.
source = source.replace(/\n\s*shareOpen,\n\s*friendsList,\n\s*onShare,\n\s*shareBusyId,/g, '');
source = source.replace(/\n\s*shareOpen,\n\s*friendsList,\n\s*onOpenShare,\n\s*onShare,\n\s*shareBusyId/g, '\n    onOpenShare');

if (source !== before) {
  fs.writeFileSync(filePath, source, 'utf8');
  console.log(removedOldBlock ? 'Removed legacy inline share UI from DrugMonograph.' : 'Cleaned stale share handler references.');
} else {
  console.log('No legacy Formulary share UI found.');
}
