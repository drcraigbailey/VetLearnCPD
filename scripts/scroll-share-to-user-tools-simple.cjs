const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'pages', 'Formulary.jsx');
let s = fs.readFileSync(file, 'utf8');
const before = s;

const anchor = '  const summaryItems = [...(summary?.clinicalPearls || []), ...(summary?.drugInformation || [])];\n';
const add = '\n  const userToolsRef = React.useRef(null);\n\n  const handleShareFromHeader = () => {\n    onOpenShare?.();\n  };\n\n  useEffect(() => {\n    if (!shareOpen) return;\n    const timer = window.setTimeout(() => {\n      userToolsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });\n    }, 120);\n    return () => window.clearTimeout(timer);\n  }, [shareOpen]);\n';
if (!s.includes('const userToolsRef = React.useRef(null);')) {
  s = s.replace(anchor, anchor + add);
}

s = s.replace(
  '{canShareCustom && <ActionButton onClick={onOpenShare} icon={<Share2 size={14} />}>Share</ActionButton>}',
  '{canShareCustom && <ActionButton onClick={handleShareFromHeader} icon={<Share2 size={14} />}>Share</ActionButton>}'
);

const open = '              <MonographSection title="User Tools" icon={<FileText size={18} />} darkMode={darkMode}>\n';
if (!s.includes('<div ref={userToolsRef} className="scroll-mt-28">')) {
  s = s.replace(open, '              <div ref={userToolsRef} className="scroll-mt-28">\n' + open);
  const start = s.indexOf('<div ref={userToolsRef} className="scroll-mt-28">');
  const marker = '              </MonographSection>\n            </>\n';
  const closeIndex = s.indexOf(marker, start);
  if (closeIndex !== -1) {
    s = s.slice(0, closeIndex + '              </MonographSection>\n'.length) + '              </div>\n' + s.slice(closeIndex + '              </MonographSection>\n'.length);
  }
}

if (s !== before) {
  fs.writeFileSync(file, s, 'utf8');
  console.log('Added Share button scroll to User Tools.');
} else {
  console.log('No changes made.');
}
