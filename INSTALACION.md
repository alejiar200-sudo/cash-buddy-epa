# 📦 Instalación de Cash Buddy EPA en otro PC

Esta guía deja el sistema funcionando en un PC nuevo **exactamente igual** que en el PC principal: backend + frontend servidos en un solo puerto (4000) y el lanzador de escritorio `CashBuddy.exe`.

> Pensado para **Windows 10/11**. Sigue los pasos en orden.

---

## 1. Requisitos previos (instalar una sola vez)

Descarga e instala en el PC nuevo:

| Programa | Versión recomendada | Enlace |
|----------|--------------------|--------|
| **Node.js** | 20 o superior (LTS) | https://nodejs.org |
| **PostgreSQL** | 16 o 17 | https://www.postgresql.org/download/windows/ |
| **Git** | última | https://git-scm.com/download/win |
| **WebView2 Runtime** | (ya viene en Windows 11) | https://developer.microsoft.com/microsoft-edge/webview2/ |

> Durante la instalación de **PostgreSQL** anota la **contraseña** del usuario `postgres` que elijas; la necesitarás en el paso 4.
> Acepta que se instale en el puerto **5432** (por defecto).

Verifica que Node quedó instalado abriendo **PowerShell** y ejecutando:

```powershell
node --version
npm --version
```

---

## 2. Descargar el proyecto

Para que el lanzador `CashBuddy.exe` funcione sin ajustes, clona el proyecto en la **misma ruta** que el PC principal:

```powershell
cd C:\
git clone https://github.com/alejiar200-sudo/cash-buddy-epa.git
cd C:\cash-buddy-epa
```

> La carpeta debe quedar en **`C:\cash-buddy-epa`**.

---

## 3. Crear la base de datos

Abre **PowerShell** y crea la base de datos `cashbuddy` (te pedirá la contraseña de `postgres`):

```powershell
& "C:\Program Files\PostgreSQL\17\bin\createdb.exe" -U postgres cashbuddy
```

> Si instalaste otra versión de PostgreSQL, cambia el `17` por la tuya (ej. `16`).
> Si la BD ya existe, este paso se puede omitir.

---

## 4. Configurar las variables de entorno (.env)

Copia la plantilla y edítala:

```powershell
cd C:\cash-buddy-epa
Copy-Item .env.example .env
notepad .env
```

En el archivo `.env` ajusta como mínimo:

- **`DATABASE_URL`** — pon la contraseña real de `postgres`:
  ```
  DATABASE_URL="postgresql://postgres:TU_CONTRASEÑA@localhost:5432/cashbuddy?schema=public"
  ```
- **`JWT_SECRET`** — cualquier cadena larga y aleatoria.
- **`ENCRYPTION_KEY`** — añade esta línea con una cadena larga y aleatoria (cifra las API Keys de Shipday):
  ```
  ENCRYPTION_KEY="pon-aqui-una-cadena-larga-y-aleatoria"
  ```

Guarda y cierra.

> ⚠️ El `.env` **no se sube a GitHub** (contiene contraseñas). Por eso hay que crearlo en cada PC.

---

## 5. Instalar dependencias

Desde la raíz del proyecto:

```powershell
cd C:\cash-buddy-epa
npm install
```

(Esto puede tardar varios minutos la primera vez.)

---

## 6. Preparar la base de datos (tablas + admin)

```powershell
cd C:\cash-buddy-epa\apps\api
npm run db:deploy      # crea todas las tablas (aplica las migraciones)
npm run db:generate    # genera el cliente de Prisma
npm run db:seed        # crea el usuario administrador inicial
```

> Usuario inicial: **admin@cashbuddy.local** / **admin123** (cámbialo luego desde el sistema).

---

## 7. Compilar el sistema (frontend + backend)

Desde la **raíz**:

```powershell
cd C:\cash-buddy-epa
$env:NODE_ENV="production"
npm run build
```

Esto genera:
- el **frontend** estático en `apps/web/out`
- el **backend** compilado en `apps/api/dist`

> El backend sirve el frontend y la API en el **mismo puerto 4000**.

---

## 8. Iniciar el sistema

Haz **doble clic** en:

```
C:\cash-buddy-epa\CashBuddy.exe
```

El lanzador:
1. Arranca el backend automáticamente.
2. Espera a que el sistema esté listo.
3. Abre la aplicación en una **ventana de escritorio propia** (con su ícono en la barra de tareas).

> Para tenerlo a mano: clic derecho en `CashBuddy.exe` → **Enviar a → Escritorio (crear acceso directo)**.
> El `.exe` debe permanecer dentro de `C:\cash-buddy-epa`.

---

## 9. Primer uso

Al entrar por primera vez:
1. Acepta los **Términos y Condiciones**.
2. Completa el asistente de **configuración inicial** (capital inicial, etc.).
3. En **Configuración** puedes cambiar el nombre del sistema y el logo.
4. Para la integración con **Shipday**, ve a **Sucursales** y registra la **API Key** de cada sucursal (se cifra y se guarda; la sincronización arranca sola).

---

## 🔄 Acceso desde otros dispositivos (misma red o remoto)

- **Misma red WiFi:** otros equipos abren `http://IP-DEL-PC:4000` (la IP aparece en el Dashboard).
- **Desde fuera (Tailscale):** instala **Tailscale** en este PC y en el dispositivo remoto, ambos con la misma cuenta. La URL de Tailscale aparece en el Dashboard (ej. `http://100.x.x.x:4000`).

---

## 🔁 Actualizar a una versión nueva (cuando haya cambios)

```powershell
cd C:\cash-buddy-epa
git pull
npm install
cd apps\api
npm run db:deploy
npm run db:generate
cd ..\..
$env:NODE_ENV="production"
npm run build
```

Luego vuelve a abrir `CashBuddy.exe`.

---

## ❓ Solución de problemas

| Problema | Solución |
|----------|----------|
| El `.exe` se queda en "Iniciando…" | Verifica que **PostgreSQL** esté encendido (servicio `postgresql-x64-17`). Revisa el archivo `cashbuddy-launcher.log` que genera el lanzador. |
| "No se encontró Node.js" | Reinstala Node.js y reinicia el PC. |
| La app no carga / pantalla en blanco | Asegúrate de haber hecho el paso 7 (`npm run build`) con `NODE_ENV=production`. |
| Error de base de datos | Revisa que `DATABASE_URL` en `.env` tenga la contraseña correcta de `postgres`. |
| La ventana muestra ícono del navegador | Asegúrate de tener el **WebView2 Runtime** instalado (viene con Windows 11). |

---

**Desarrollado por Alejandro Jiménez Arbeláez · ZENBYTE · 3234750914**
