# vuelatour-next

Panel administrativo de **VuelaTour** (`/admin`, tema oscuro). Next.js App
Router (server components + server actions) + Tailwind. Desplegado en
**Vercel** (deploy automático al hacer push a `main`). Habla con
`vuelatour-api` vía `apiServer` (inyecta el JWT de la sesión Supabase).

> ⚠️ Esta versión de Next.js tiene breaking changes vs versiones anteriores:
> lee `AGENTS.md` y `node_modules/next/dist/docs/` antes de escribir código.
> Convenciones del proyecto: también en `AGENTS.md` (CLAUDE.md lo referencia).

## Secciones principales (`src/app/admin/`)

- **Operación**: dashboard con KPIs, vuelos (detalle con tramos, cobros con
  eliminación, tacómetros, permisos), cotizaciones (motor v1.3, "Nueva
  cotización" = paso 1 operación), calendario (colores por avión, descansos
  de pilotos), **Tacómetros en vivo** (`/admin/taco-live`: estados por
  escala, leyendas de origen PILOTO/IA/DEDUCIDO/OFICINA, Comprobar/Ajustar
  viendo la foto).
- **Tesorería**: gastos (bandeja de pendientes, verificación, Excel),
  conciliación (KPIs por cuenta, import de estados de cuenta, sugerencia IA,
  abonos↔cobros), facturas emitidas y recibidas (buzón XML), caja chica,
  **Reportes** (`/admin/reportes`: **pre-cierre con semáforo**, reparto PDF,
  Excel mensual, cierre .zip, reporte por vuelo, exports).
- **Flota**: aeronaves (expediente: motores/hélices con horas derivadas,
  reserva overhaul, seguros, squawks, semáforo apto), motores, hélices,
  vencimientos, mantenimientos, inventario (FIFO), multas.
- **Sistema**: usuarios/invitaciones, roles, alertas.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Verificación

```bash
npx tsc --noEmit
npx eslint src/...   # sobre los archivos tocados
```
