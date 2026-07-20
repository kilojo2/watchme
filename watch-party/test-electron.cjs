console.log("app global:", typeof globalThis.app);
console.log("process.type:", process.type);
console.log("versions.electron:", process.versions.electron);

const electronPath = require('electron');
console.log("require('electron') returns:", typeof electronPath, JSON.stringify(electronPath).substring(0,100));

// Try importing electron's built-in APIs via the 'electron' module used by electron runtime
try {
  const electronBuiltin = require('original-fs');
  console.log("original-fs exists:", typeof electronBuiltin);
} catch(e) {
  console.log("original-fs error:", e.message);
}

process.exit(0);
