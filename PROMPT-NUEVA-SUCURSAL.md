# Prompt para replicar Cash Buddy EPA en otra sucursal / PC

## Léelo antes de usar el prompt

La única forma **garantizada** de que otra sucursal quede funcionando
*exactamente igual* que este sistema es **instalar este mismo código**
(este repositorio, tal cual), no pedirle a una IA que lo "reconstruya" desde
una descripción. Una reimplementación desde cero, por buena que sea la
descripción, puede diferir en detalles que aquí ya causaron problemas reales
(zona horaria, doble conteo de dinero, cierres de caja) — y con dinero de por
medio, esa diferencia es justo lo que puede terminar en un reclamo o una
demanda.

**Por eso, el primer paso siempre es instalar el sistema siguiendo
[`INSTALACION.md`](./INSTALACION.md)** (copiar la carpeta del proyecto,
crear la base de datos, `npm run db:deploy` para aplicar las migraciones,
compilar, abrir `CashBuddy.exe`). Eso deja la sucursal nueva con el **mismo
código, mismo esquema de base de datos y misma lógica**, sin intermediarios.

Usa el prompt de abajo solo para pedirle ayuda a Claude (u otro asistente)
**dentro de ese mismo repositorio ya instalado** — por ejemplo, para
configurar la sucursal en el sistema, conectar su API Key de Shipday, o pedir
que revise que todo quedó igual. No lo uses para pedirle que "arme el sistema
desde cero" en otro lado.

---

## El prompt

```
Estoy configurando Cash Buddy EPA para una sucursal nueva. Este es el mismo
repositorio/código que ya usamos en la sucursal principal — NO quiero que
reimplementes ni cambies la lógica de negocio existente, solo que me ayudes
a dejarla funcionando igual acá.

Antes de hacer cualquier cambio:
1. Lee CLAUDE.md completo (reglas de negocio y cosas frágiles) e
   INSTALACION.md (pasos de instalación).
2. Confirma que estoy en una copia real de este repositorio (mismo
   package.json, mismo prisma/schema.prisma) y no en un proyecto nuevo.
3. Si necesito una funcionalidad distinta a la de la sucursal principal,
   dime primero qué archivo(s) tocarías y qué riesgo tiene antes de tocar
   nada relacionado con: deudas de domiciliarios, saldos de caja/banco,
   cierres de turno, o fechas.
4. No toques la lógica de negocio de dinero (deudas, saldos, cierres,
   bank-linked notes, bankTransactionId) sin que yo confirme explícitamente
   que entendí el cambio.

Lo que necesito ahora es: [describe aquí la tarea puntual — ej. "configurar
la sucursal X con su API Key de Shipday", "revisar que el capital inicial
quedó bien cargado", "agregar un domiciliario nuevo", etc.]
```

---

## Qué NO hacer

- No le pidas a una IA que "recree" el sistema desde una descripción en
  texto para otra sucursal — usa `INSTALACION.md` con este mismo código.
- No dejes que se modifique la lógica de deudas/saldos/cierres "de paso"
  mientras se pide otra cosa — pide que se confirme primero.
- No borres la sección de `.gitignore` que versiona las migraciones de
  Prisma (`apps/api/prisma/migrations/**/*.sql`); sin eso, una sucursal
  nueva clonada desde git no tendría el esquema completo de la base de
  datos y el sistema fallaría.
