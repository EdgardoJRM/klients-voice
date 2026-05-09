const { app, BrowserWindow } = require("electron");
const path = require("path");

function loadConfig() {
  const apiUrl = (process.env.PRINT_BRIDGE_API_URL ?? "").replace(/\/$/, "");
  const token = process.env.PRINT_BRIDGE_TOKEN ?? "";
  const eventId = process.env.PRINT_BRIDGE_EVENT_ID ?? "";
  const stationId = process.env.PRINT_BRIDGE_STATION_ID ?? "";
  return { apiUrl, token, eventId, stationId };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 720,
    height: 640,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    title: "Klients Print Bridge",
  });
  win.loadFile(path.join(__dirname, "ui.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
