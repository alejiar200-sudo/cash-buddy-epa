// Proceso principal de Electron: arranca el backend Express (que sirve la API
// y el frontend estático) y abre una ventana apuntando a él.
// Modelo host: el PC principal ejecuta esta app; los demás entran por Tailscale.

const { app, BrowserWindow, dialog, shell } = require("electron");
const { fork } = require("node:child_process");
const path = require("node:path");
const http = require("node:http");

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0";
const isDev = !app.isPackaged;

let serverProcess = null;
let mainWindow = null;

function serverUrl() {
  return `http://localhost:${PORT}`;
}

function waitForServer(timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`${serverUrl()}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on("error", retry);
      req.setTimeout(2000, () => req.destroy());
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) return reject(new Error("El servidor no respondió a tiempo"));
      setTimeout(tick, 500);
    };
    tick();
  });
}

function startServer() {
  // En desarrollo asumimos que `npm run dev` ya levantó la API y el frontend.
  if (isDev) return Promise.resolve();

  const resources = process.resourcesPath;
  const apiEntry = path.join(resources, "api", "index.js");
  const webDir = path.join(resources, "web");

  serverProcess = fork(apiEntry, [], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(PORT),
      HOST,
      WEB_DIR: webDir,
    },
    cwd: path.join(resources, "api"),
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });

  serverProcess.stdout?.on("data", (d) => console.log("[api]", d.toString().trim()));
  serverProcess.stderr?.on("data", (d) => console.error("[api]", d.toString().trim()));
  serverProcess.on("exit", (code) => {
    console.error(`[api] terminó con código ${code}`);
  });

  return waitForServer();
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0F172A",
    autoHideMenuBar: true,
    title: "Cash Buddy EPA",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Abrir enlaces externos en el navegador del sistema.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const target = isDev ? `http://localhost:${PORT}` : serverUrl();
  await mainWindow.loadURL(target);
}

app.whenReady().then(async () => {
  try {
    await startServer();
  } catch (err) {
    dialog.showErrorBox(
      "Error al iniciar el servidor",
      `No se pudo iniciar el backend.\n\nVerifica que PostgreSQL esté corriendo y que el archivo .env tenga DATABASE_URL correcto.\n\nDetalle: ${err.message}`,
    );
  }
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("quit", () => {
  if (serverProcess) serverProcess.kill();
});
