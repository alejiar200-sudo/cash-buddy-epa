import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Clave de cifrado ESTABLE y persistente.
 *
 * Causa raíz del fallo de sincronización tras reiniciar: la API Key de Shipday se
 * guarda cifrada (AES-256) en la BD. Si la clave de cifrado cambia entre arranques
 * (porque venía de una variable de entorno que no siempre se pasa igual), el
 * descifrado falla con "bad decrypt" y la sincronización se cae en silencio.
 *
 * Solución definitiva: la clave se persiste UNA sola vez en un archivo local
 * (`.encryption-key`) y se reutiliza en todos los arranques, sin depender de cómo
 * se lance el servidor. Si existe `ENCRYPTION_KEY` en el entorno, tiene prioridad
 * (para despliegues gestionados), pero ya no es obligatoria.
 */

let cachedKey: Buffer | null = null;

function resolveKeyFile(): string {
  // Junto al working dir del proceso del API (apps/api) — persiste entre reinicios.
  return path.resolve(process.cwd(), ".encryption-key");
}

function loadOrCreateSecret(): string {
  // 1) Prioridad: variable de entorno explícita (despliegues gestionados).
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.trim()) {
    return process.env.ENCRYPTION_KEY.trim();
  }
  // 2) Archivo persistente generado una vez.
  const file = resolveKeyFile();
  try {
    if (fs.existsSync(file)) {
      const v = fs.readFileSync(file, "utf8").trim();
      if (v) return v;
    }
    const generated = randomBytes(32).toString("hex");
    fs.writeFileSync(file, generated, { encoding: "utf8", mode: 0o600 });
    console.log(`[crypto] Clave de cifrado generada y persistida en ${file}`);
    return generated;
  } catch (err) {
    // 3) Último recurso: clave por defecto fija (estable, aunque menos segura).
    console.warn("[crypto] No se pudo persistir la clave, usando default estable:", err);
    return "cash-buddy-default-key-change-me";
  }
}

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  cachedKey = createHash("sha256").update(loadOrCreateSecret()).digest();
  return cachedKey;
}

export function encryptApiKey(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export class DecryptError extends Error {
  constructor() {
    super("No se pudo descifrar la API Key. Vuelve a guardar la API Key de Shipday en la sucursal para reconfigurarla.");
    this.name = "DecryptError";
  }
}

export function decryptApiKey(ciphertext: string): string {
  if (!ciphertext.includes(":")) return ciphertext; // legacy plano
  try {
    const [ivHex, encHex] = ciphertext.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(encHex, "hex");
    const decipher = createDecipheriv("aes-256-cbc", getKey(), iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    // Error claro y accionable en vez de "bad decrypt" silencioso.
    throw new DecryptError();
  }
}
