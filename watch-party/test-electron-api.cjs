// Minimal test to check what require('electron') returns inside a file
console.log('=== Electron API Test ===');
console.log('process.type:', process.type);
console.log('process.versions.electron:', process.versions.electron);
console.log('moduleLoadList:', (process.moduleLoadList || []).filter(x => x.includes('electron')));

try {
  const electron = require('electron');
  console.log('typeof require("electron"):', typeof electron);
  console.log('is string?:', typeof electron === 'string');
  if (typeof electron === 'string') {
    console.log('string value:', electron);
  } else if (typeof electron === 'object') {
    console.log('keys:', Object.keys(electron).slice(0, 30));
    console.log('has app:', 'app' in electron);
    console.log('has BrowserWindow:', 'BrowserWindow' in electron);
  }
} catch (e) {
  console.log('require("electron") ERROR:', e.message);
}

try {
  const electronMain = require('electron/main');
  console.log('\nrequire("electron/main") succeeded, keys:', Object.keys(electronMain).slice(0, 20));
} catch (e) {
  console.log('\nrequire("electron/main") ERROR:', e.message);
}

// Check what module._resolveFilename does for 'electron'
try {
  const Module = require('module');
  const resolved = Module._resolveFilename('electron', { 
    filename: __filename, 
    paths: Module._nodeModulePaths(__dirname) 
  });
  console.log('\nResolved electron module path:', resolved);
} catch (e) {
  console.log('\n_resolveFilename ERROR:', e.message);
}

console.log('\nDone.');
