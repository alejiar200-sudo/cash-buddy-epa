# Correcciones pendientes

Este archivo documenta lo que quedó identificado pero **no corregido automáticamente**
en la pasada de corrección de errores críticos (fechas, contabilidad, pedidos, deudas,
cierres, banco, orden alfabético — ver historial de commits de esta rama).

## 1. Desfase histórico en `DailyDriverStat` (12–15 jun 2026)

La auditoría (`apps/api/scripts/audit.ts`, `npm run audit` desde `apps/api`) detectó que
el contador denormalizado `DailyDriverStat` (orderCount/totalValue/companyTotal por
domiciliario y día) está por debajo del conteo real de `ShipdayOrder` entregados en
**67 combinaciones día+domiciliario**, entre el 12 y el 15 de junio de 2026.

**Importante:** esto NO afecta la deuda real de los domiciliarios — `Driver.pendingDebt`
sí cuadra exactamente contra la suma de comisiones, bases y pagos (confirmado por el
mismo script de auditoría). El desfase es solo en el contador usado para reportes
diarios por domiciliario (ej. resumen del día en `/domiciliarios`, `dailyStats` en el
detalle de un domiciliario).

Causa raíz probable: antes de esta corrección, el `dateStr` usado como llave de
`DailyDriverStat` se calculaba con `toISOString().slice(0, 10)` (día en UTC) en varios
lugares (`branch.service.ts`, `webhook.controller.ts`, `order.controller.ts`,
`edit-request.service.ts`), lo que desplazaba pedidos de la noche al día UTC siguiente.
Ya se corrigió hacia adelante (ver `apps/api/src/lib/date-range.ts:toBogotaDateStr`),
pero el historial ya escrito con la llave equivocada no se recalculó.

**Pendiente:** escribir y correr un script de un solo uso que, para cada combinación
día+domiciliario con desfase, recalcule `orderCount`, `totalValue` y `companyTotal`
directamente desde `ShipdayOrder` (agrupando por `toBogotaDateStr(deliveredAt)`) y
actualice (o reemplace) la fila de `DailyDriverStat` correspondiente. No debe tocar
`Driver.pendingDebt` (ya está correcto).

## 2. Reconciliación de Shipday no se ha ejecutado contra producción

Se agregó `POST /branches/:id/reconcile` (requiere admin) para recuperar pedidos que
nunca se sincronizaron por la limitación de paginación de `getAllOrders` (ver
`apps/api/src/services/shipday.service.ts`). No se ha corrido todavía contra las
sucursales reales — conviene ejecutarlo para el rango de fechas donde se sabe que
faltaron pedidos (ej. los "primeros 9 pedidos" reportados).

## 3. Cliente Prisma sin regenerar en esta máquina

Se aplicó la migración `20260616172306_bank_no_counterpart_close_locked` contra la BD
(`prisma migrate deploy` corrió bien), pero `prisma generate` falló por `EPERM` porque
`CashBuddy.exe` estaba corriendo y bloqueando el `.dll` del query engine. Hay que
reiniciar la app (o correr `npx prisma generate` con la app cerrada) para que el
cliente Prisma reconozca los campos nuevos (`BankTransaction.noCounterpart`,
`ShiftClose.locked`, `MonthlyClose.locked`) en tiempo de ejecución.
