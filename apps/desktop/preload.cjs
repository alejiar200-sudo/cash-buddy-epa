// Preload mínimo. Expone metadatos básicos de la app al frontend si se necesita.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isElectron: true,
  platform: process.platform,
});
