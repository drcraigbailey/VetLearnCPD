const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'pages', 'Formulary.jsx');
let source = fs.readFileSync(filePath, 'utf8');
const before = source;

function findExpressionEnd(text, start) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }

    if (char === '/' && next === '/') {
      const newline = text.indexOf('\n', index + 2);
      index = newline === -1 ? text.length : newline;
    }
  }

  return -1;
}

function removeBlocksMatching(regex, label) {
  let removed = 0;
  let match;

  while ((match = regex.exec(source)) !== null) {
    const expressionStart = match.index;
    const lineStart = source.lastIndexOf('\n', expressionStart);
    const removeStart = lineStart === -1 ? expressionStart : lineStart;
    const removeEnd = findExpressionEnd(source, expressionStart);

    if (removeEnd === -1 || removeEnd <= expressionStart) {
      console.warn(`Could not safely remove ${label} near index ${expressionStart}`);
      break;
    }

    source = source.slice(0, removeStart) + source.slice(removeEnd);
    removed += 1;
    regex.lastIndex = 0;
  }

  if (removed > 0) console.log(`Removed ${removed} ${label} block(s).`);
}

// Remove old inline DrugMonograph share popups, including variants changed to a no-op close handler.
removeBlocksMatching(/\{\s*shareOpen\s*&&\s*\(/g, 'legacy shareOpen popup');
removeBlocksMatching(/\{\s*\(\(\)\s*=>\s*\{\}\)\s*&&\s*\(/g, 'legacy no-op close popup');

// Remove stale props left over from the old inline modal.
source = source.replace(/\n\s*shareOpen,\n\s*friendsList,\n\s*onShare,\n\s*shareBusyId,/g, '');
source = source.replace(/\n\s*shareOpen,\n\s*friendsList,\n\s*onOpenShare,\n\s*onShare,\n\s*shareBusyId/g, '\n    onOpenShare');
source = source.replace(/\n\s*friendsList,\n\s*onShare,\n\s*shareBusyId,/g, '');

// If any old close handler reference somehow remains, remove only the reference rather than leaving a dead popup.
source = source.replace(/onCloseShare\?\.\(\);?/g, '');
source = source.replace(/onCloseShare/g, 'undefined');

if (source !== before) {
  fs.writeFileSync(filePath, source, 'utf8');
  console.log('Cleaned legacy Formulary share UI. The new MyDrugShareCollaborationModal should be the only share popup.');
} else {
  console.log('No legacy Formulary share UI found.');
}
