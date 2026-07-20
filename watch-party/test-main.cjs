const { app, BrowserWindow } = require('electron');

console.log("app:", typeof app, app ? "defined" : "undefined");
console.log("BrowserWindow:", typeof BrowserWindow);

app.whenReady().then(() => {
  console.log("App ready!");
  const win = new BrowserWindow({ width: 800, height: 600 });
  win.loadURL('about:blank');
  setTimeout(() => {
    app.quit();
  }, 1000);
});
