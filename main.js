// PixiChat — Electron Main Process
// Embeds the Express server so the desktop app works fully offline

const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { execFile, fork } = require("child_process");

// Handle Squirrel install/uninstall (Windows)
if (require("electron-squirrel-startup")) app.quit();

let mainWindow;
let serverProcess;

function startServer() {
  // Start the Express server in a child process
  serverProcess = fork(path.join(__dirname, "server.js"), [], {
    silent: true,
    env: { ...process.env, PORT: 3001 }
  });

  serverProcess.stdout.on("data", (d) => console.log("[SERVER]", d.toString()));
  serverProcess.stderr.on("data", (d) => console.error("[SERVER ERR]", d.toString()));
  serverProcess.on("error", (e) => console.error("Server process error:", e));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "PixiChat",
    backgroundColor: "#0e0e18",
    icon: path.join(__dirname, "public", "images", "logo.jpeg"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    frame: true,
    show: false // show after ready-to-show
  });

  // Load the app — uses the remote Render server by default
  // For full local mode, you can load from localhost:3001
  mainWindow.loadURL("https://nodemes-3.onrender.com/chat.html");
  // Uncomment below for fully local desktop mode:
  // mainWindow.loadFile(path.join(__dirname, "public", "chat.html"));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Open external links in browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) serverProcess.kill();
});
