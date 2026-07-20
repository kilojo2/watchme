const { app, BrowserWindow } = require("electron");
console.log("app:", typeof app, "bw:", typeof BrowserWindow);
if (app && typeof app.on === 'function') {
  app.on("ready", () => { console.log("READY"); app.quit(); });
} else {
  console.log("app is not available");
  process.exit(1);
}
