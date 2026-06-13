const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'pages', 'AuthPage.jsx');
let source = fs.readFileSync(filePath, 'utf8');
const before = source;

const helper = `
const getAuthRedirectUrl = () => {
  const configuredRedirect = import.meta.env.VITE_AUTH_REDIRECT_URL?.trim();
  const redirectBase = configuredRedirect || window.location.origin;
  return redirectBase.endsWith("/") ? redirectBase : `${redirectBase}/`;
};
`;

if (!source.includes('const getAuthRedirectUrl = () =>')) {
  source = source.replace('const CONSENT_VERSION = "2026-06-07";\n', `const CONSENT_VERSION = "2026-06-07";\n${helper}`);
}

source = source.replace('redirectTo: `${window.location.origin}/`', 'redirectTo: getAuthRedirectUrl()');
source = source.replace('const redirectTo = `${window.location.origin}/`', 'const redirectTo = getAuthRedirectUrl()');

if (source !== before) {
  fs.writeFileSync(filePath, source, 'utf8');
  console.log('Updated AuthPage.jsx to use VITE_AUTH_REDIRECT_URL with a safe current-origin fallback.');
} else {
  console.log('AuthPage.jsx already uses the safe auth redirect helper.');
}
