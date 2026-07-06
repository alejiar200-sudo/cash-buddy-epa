# Cash Buddy EPA — guía para asistentes de IA

Este sistema maneja **dinero real** de una empresa de domicilios (efectivo,
banco, deudas de domiciliarios y clientes). Un error de lógica aquí no es un
bug cosmético: puede hacer que la caja "descuadre", que a un domiciliario le
cobren de más o de menos, o que una sucursal quede con cifras que no cuadran
con la plata física — con consecuencias legales reales para el negocio.

**Antes de tocar cualquier lógica de dinero (deudas, saldos, cierres, banco),
lee esta guía completa.** Si vas a replicar este sistema en otra sucursal o
PC, la única forma confiable de garantizar el mismo comportamiento es
**desplegar este mismo repositorio** (ver `INSTALACION.md`), no
"reconstruirlo" a partir de una descripción. Esta guía documenta las reglas
no obvias para que un asistente de IA no las rompa al seguir extendiendo el
sistema.

## Arquitectura (ver también README.md)

- `apps/api`: Express + Prisma + PostgreSQL (única base de datos; el
  multi-sucursal se maneja con `branchId`, no con bases de datos separadas).
- `apps/web`: Next.js exportado como estático (`output: "export"` en
  producción) — el backend lo sirve desde `apps/web/out`.
- `CashBuddy.exe` (`scripts/launcher-build`): lanzador de escritorio en C#
  (WinForms + WebView2) que verifica PostgreSQL, arranca
  `node apps/api/dist/index.js`, espera `/api/health` y abre la ventana. Tiene
  un **watchdog**: si el backend muere, lo reinicia solo cada ~3s (máx. 5
  veces). Esto importa para el flujo de deploy (ver abajo).

## Zona horaria: SIEMPRE Bogotá, nunca UTC crudo

Bogotá es UTC-5 sin horario de verano. **Nunca** calcules "hoy" con
`new Date().toISOString().slice(0, 10)` — eso da la fecha en UTC, y cualquier
cosa registrada después de las 7pm hora Bogotá cae en el día calendario
siguiente (bug real, ya corregido dos veces: nómina en `trabajadores/page.tsx`
y el default de fecha en `BankTransactionWizard.tsx`).

- Backend: usa `todayBogota()` / `toBogotaDateStr()` / `bogotaDayRange()` /
  `bogotaOpenRange()` de `apps/api/src/lib/date-range.ts`.
- Frontend: usa `todayBogota()` de `apps/web/lib/format.ts` (NO `todayISO()`,
  que depende de la zona horaria del sistema operativo del navegador/PC).

## Modelo de dinero (quién es quién)

- `Movement` ("Caja"): registros manuales antiguos (categoría numérica,
  ingreso/egreso, cash/bank). Cuelgan de `Day` (PK = fecha `YYYY-MM-DD`), que
  guarda `initialCash`/`initialBank` (arrastre del día anterior vía
  `ensureDay`).
- `BankTransaction`: todo movimiento de banco/efectivo fuera del sistema
  "Caja" viejo (depósitos, retiros, pagos a/de domiciliarios).
  - `noCounterpart`: el movimiento es autosuficiente, no espera contraparte.
  - `pairId`: enlaza una salida y su retorno para que cuadren juntos.
  - `groupId`: una sola acción del usuario dividida en efectivo+banco.
  - `driverId`: si el movimiento se aplicó a la deuda de un domiciliario.
- `BaseTransaction` (`type: "entrega" | "pago"`): base (capital de trabajo)
  entregada o devuelta por un domiciliario.
- `DriverPayment`: pago de comisión cobrado a un domiciliario.
- `Driver.pendingDebt` / `creditAmount`: **un solo saldo neto** por
  domiciliario. Invariante: nunca deben ser positivos los dos a la vez —
  `applyDebtDelta()` en `driver.service.ts` los netea. No los actualices a
  mano sin pasar por ahí (o por la lógica equivalente ya existente).

### Pagos vía banco a la deuda de un domiciliario (el punto más frágil)

Cuando un `BankTransaction` se "aplica" a la deuda de un domiciliario
(`applyBankToDriver` o el flujo todo-en-uno `registerPayment`), el sistema
crea TAMBIÉN un `BaseTransaction` "pago" y/o `DriverPayment` como contabilidad
interna, marcados con notas especiales (`BANK_LINKED_PAYMENT_NOTE`,
`bankLinkedBaseNote()` en `lib/balance-markers.ts`).

- Esos registros marcados **deben excluirse** de cualquier cálculo de saldo
  esperado (`getExpectedBalances`, `unified-movements.service.ts`, el nuevo
  `getDaySummary`) — si no, el mismo dinero se cuenta dos veces.
- Están enlazados al `BankTransaction` que los originó por
  **`bankTransactionId`** (no por fecha aproximada — eso fue un bug real: un
  `BankTransaction` con fecha distinta a "ahora" hacía que la búsqueda por
  ventana de ±5s fallara y dejara "pagos" huérfanos que descuadraban el
  estado de cuenta del domiciliario).
- Al eliminar un `BankTransaction` (`bank-transaction.service.ts::remove()` o
  `edit-request.service.ts::deleteEntity("BankTransaction")`), el sistema
  DEBE: revertir `pendingDebt` por el monto, y borrar los registros
  vinculados por `bankTransactionId`. **Ambos lugares deben mantenerse
  sincronizados** — si agregas una tercera forma de borrar un
  `BankTransaction`, replica esta misma lógica.

## Cierre de caja: "día operativo" ≠ fecha calendario

El día que se puede cerrar **no avanza solo porque cambió la fecha**. Solo
avanza cuando se registra el Cierre (`ShiftClose` con `shift: "close"`) del
día actual — así un cierre hecho a las 00:30 (ya "mañana" en el calendario)
sigue encontrando el día de ayer disponible para cerrarlo.

- `getCurrentOperatingDate()` en `shift-close.service.ts` calcula esto: el
  día siguiente al último Cierre registrado, sin adelantarse más allá de
  hoy.
- La página de Caja (`apps/web/app/(app)/caja/page.tsx`) SIEMPRE debe pedir
  este valor a `/shifts/current-date` — nunca calcular "hoy" directo.
- `expectedAmount`/`bankExpected` de un cierre **siempre** los calcula el
  servidor (`getExpectedBalancesForDate`), nunca el cliente.
- Un `ShiftClose` ya registrado queda `locked`; corregirlo pasa por el flujo
  de `EditRequest` (aprobación de un admin), nunca por sobrescritura directa.

## Historial: el semáforo verde/rojo depende SOLO del Cierre

En `apps/web/app/(app)/historial/page.tsx`, un día se ve verde si y solo si
tiene un `ShiftClose(shift="close")` con `difference === 0` y
(`bankDifference == null` o `=== 0`). Ninguna otra cifra (comisión, deudas,
ganancia, etc.) debe afectar ese color — así lo pidió explícitamente el
dueño del sistema.

El detalle de un día (`getDaySummary` en `day.service.ts`) junta TODAS las
fuentes de dinero (Caja, Banco, domiciliarios, bases, deudas de clientes) —
si agregas una fuente nueva de ingreso/egreso, súmala ahí también o el
resumen del historial quedará incompleto.

## Flujo de deploy (Windows, app de escritorio empaquetada)

Esto **no es un entorno de desarrollo con recarga automática**. Después de
cualquier cambio en `apps/api/src` o `apps/web`:

```powershell
npm run build -w @cash-buddy/api   # tsup -> apps/api/dist/index.js
npm run build -w @cash-buddy/web   # next build -> apps/web/out (export estático)
```

Y luego reiniciar el proceso `node dist\index.js` (o cerrar y volver a abrir
`CashBuddy.exe`, que lo relanza solo). Si el cambio no se aplica, casi
siempre es porque faltó este paso.

Si cambias `prisma/schema.prisma`, corre `npx prisma migrate dev --name X`
**y luego** `npx prisma generate`. El watchdog de `CashBuddy.exe` reinicia el
backend cada ~3s y eso bloquea el archivo del motor de Prisma en Windows —
si `prisma generate` falla con `EPERM ... query_engine-windows.dll.node`,
**cierra `CashBuddy.exe` por completo** (no solo el proceso `node`) antes de
reintentar, y vuelve a abrirlo al terminar.

## Git

- Las migraciones de Prisma (`apps/api/prisma/migrations/**/*.sql`) SÍ deben
  versionarse. El `.gitignore` tiene una regla `*.sql` para respaldos de
  base de datos con una excepción explícita para las migraciones — no la
  borres, o una sucursal nueva que clone el repo se quedaría sin los cambios
  de esquema y el sistema fallaría de forma silenciosa.
- Para instalar/replicar el sistema en un PC o sucursal nueva, sigue
  `INSTALACION.md` al pie de la letra (incluye `npm run db:deploy`, que
  aplica todas las migraciones — la garantía real de que quede "igual" es
  que corra el mismo código y el mismo esquema, no una reimplementación).
