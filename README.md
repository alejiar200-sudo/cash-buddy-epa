# Cash Buddy EPA

Sistema de gestión de caja diaria para empresas de domicilios. Arquitectura
profesional y escalable, lista para uso local empresarial con acceso remoto
privado vía **Tailscale**.

## Arquitectura

Monorepo (npm workspaces):

```
cash-buddy-epa/
├── apps/
│   ├── web/        Frontend  → Next.js (App Router) + TailwindCSS v4 + shadcn/ui
│   ├── api/        Backend   → Express + Prisma + PostgreSQL + JWT
│   └── desktop/    Escritorio→ Electron (.exe vía electron-builder)
└── packages/
    └── shared/     Tipos + lógica de negocio compartida (TypeScript)
```

**Modelo host (un solo puerto):** el PC principal ejecuta la app de escritorio
(o `npm start`), que levanta el backend Express en `0.0.0.0`. Express sirve la
API en `/api` **y** el frontend estático. Los demás usuarios entran de forma
remota por la IP de Tailscale del PC principal. No requiere hosting ni dominio.

La lógica de negocio (saldos, arqueos, estado de domiciliarios, comisiones,
nómina) vive en el backend (`packages/shared` + servicios de `apps/api`) y el
frontend la consume vía API.

## Requisitos

- Node.js 20+
- PostgreSQL instalado en el PC principal
- (Para acceso remoto) Tailscale instalado en el PC principal y en los clientes

## Configuración inicial

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Crear la base de datos en PostgreSQL (una vez):

   ```sql
   CREATE DATABASE cashbuddy;
   ```

3. Copiar variables de entorno y ajustar `DATABASE_URL`:

   ```bash
   cp .env.example .env
   cp .env apps/api/.env
   ```

   Edita `DATABASE_URL`, `JWT_SECRET` y las credenciales del admin inicial.

4. Generar el cliente Prisma, aplicar migraciones y sembrar datos:

   ```bash
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   ```

   El seed crea el usuario admin (según `ADMIN_EMAIL`/`ADMIN_PASSWORD`), la
   configuración por defecto y los domiciliarios iniciales.

## Desarrollo

```bash
npm run dev
```

Levanta el backend (`http://localhost:4000`) y el frontend
(`http://localhost:3000`) en paralelo. En desarrollo el frontend llama al
backend en `:4000` (ver `apps/web/.env.local`).

## Producción local (un solo puerto)

```bash
npm run build      # construye shared, frontend (export estático) y backend (bundle)
npm start          # Express sirve API + frontend en http://0.0.0.0:4000
```

## App de escritorio (.exe)

```bash
npm run build           # primero genera apps/web/out y apps/api/dist
npm run build:desktop   # genera el instalador .exe en apps/desktop/release/
```

> Nota: el `.exe` no incluye PostgreSQL. El PC principal debe tener PostgreSQL
> corriendo y un `.env` válido. El instalador empaqueta el backend, el frontend
> y el cliente Prisma generado.

## Acceso remoto con Tailscale

1. Instala Tailscale en el PC principal e inicia sesión (`tailscale up`).
2. Anota su IP de Tailscale (`tailscale ip -4`), por ejemplo `100.x.y.z`.
3. Instala Tailscale en cada equipo cliente y únelo a la misma red (tailnet).
4. Desde un cliente, abre en el navegador: `http://100.x.y.z:4000`.

El backend ya escucha en `0.0.0.0`, por lo que es accesible dentro de la
tailnet. Asegúrate de que el firewall de Windows permita el puerto `4000`.

## Autenticación

- Login con JWT (`POST /api/auth/login`). El token se guarda en el cliente y se
  envía como `Authorization: Bearer <token>`.
- Todas las rutas de datos requieren autenticación.
- El primer usuario registrado (o el del seed) es administrador.

## Scripts útiles

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Backend + frontend en desarrollo |
| `npm run build` | Build completo (shared + web + api) |
| `npm start` | Servir todo desde el backend (un puerto) |
| `npm run db:migrate` | Aplicar migraciones Prisma |
| `npm run db:seed` | Sembrar admin + datos por defecto |
| `npm run build:desktop` | Generar instalador `.exe` |
