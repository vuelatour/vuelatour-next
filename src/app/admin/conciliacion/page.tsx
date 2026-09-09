import Link from "next/link";
import { fmtDateOnly, todayCancun } from "@/lib/datetime";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { EstadosCuentaTable } from "@/components/admin/conciliacion/estados-cuenta-table";
import { ImportButton } from "@/components/admin/conciliacion/import-button";
import { ReporteConciliacionButton } from "@/components/admin/conciliacion/reporte-conciliacion-button";
import { MovimientosTable } from "@/components/admin/conciliacion/movimientos-table";
import {
  GastosSinBancoTable,
  type GastoSinBancoRow,
} from "@/components/admin/conciliacion/gastos-sin-banco-table";
import { CobrosSinBancoTable } from "@/components/admin/conciliacion/cobros-sin-banco-table";
import { PaywiseAuditoriaPanel } from "@/components/admin/conciliacion/paywise-auditoria";
import {
  auditoriaPaywise,
  conciliacionCobrosSinBanco,
  conciliacionGastosSinBanco,
  conciliacionResumen,
  listEstadosCuenta,
  listMovimientosBancarios,
  type ListConciliacionQuery,
} from "@/lib/api/conciliacion-server";
import { listBankAccounts } from "@/lib/api/bank-accounts-server";
import { listGastos } from "@/lib/api/expenses-server";
import { getPaywiseComisionPct } from "@/lib/api/paywise-config-server";
import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import { medioPagoLabel } from "@/lib/admin/medios-pago";
import { isApiError } from "@/lib/api/errors";
import type { PaywiseAuditoria } from "@/types/conciliacion";

export const dynamic = "force-dynamic";
// Importar un PDF con cientos de movimientos tarda minutos (extracción IA):
// las server actions de este segmento heredan el límite — sin esto Vercel
// cortaba antes de que el API respondiera.
export const maxDuration = 300;

type Filtro =
  | "todos"
  | "pendientes"
  | "conciliados"
  | "sin_banco"
  | "cobros_sin_banco"
  | "paywise";

const FILTROS: Filtro[] = [
  "todos",
  "pendientes",
  "conciliados",
  "sin_banco",
  "cobros_sin_banco",
  "paywise",
];

/** Ventana ±días abono Paywise ↔ cobro (liquidación diferida; default del API). */
const PAYWISE_DIAS = 5;

const fmtMoney = (monto: string) =>
  Number(monto).toLocaleString("es-MX", { minimumFractionDigits: 2 });
const fmtDate = fmtDateOnly;

const esFecha = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function ConciliacionPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; desde?: string; hasta?: string; cuenta?: string }>;
}) {
  const sp = await searchParams;
  const filtro: Filtro = FILTROS.includes(sp.f as Filtro) ? (sp.f as Filtro) : "todos";

  const query: ListConciliacionQuery = { limit: 300 };
  if (filtro === "pendientes") query.conciliado = false;
  if (filtro === "conciliados") query.conciliado = true;

  // Periodo de la auditoría Paywise: mes corriente en hora Cancún por default.
  const hoy = todayCancun();
  const pwDesde = esFecha(sp.desde) ? sp.desde : `${hoy.slice(0, 7)}-01`;
  const pwHasta = esFecha(sp.hasta) ? sp.hasta : hoy;
  const pwCuenta = sp.cuenta && /^[0-9a-f-]{36}$/i.test(sp.cuenta) ? sp.cuenta : "";

  const [
    { data: movs },
    cuentasRes,
    gastosRes,
    resumen,
    estadosRes,
    sinBanco,
    cobrosSinBanco,
    paywiseComisionPct,
  ] = await Promise.all([
    listMovimientosBancarios(query),
    listBankAccounts({ limit: 100 }),
    listGastos({ limit: 200 }),
    conciliacionResumen().catch(() => []),
    // Best-effort: la página no se cae si el archivado aún no responde.
    listEstadosCuenta().catch(() => ({ data: [] })),
    // El INVERSO de la bandeja (28-ago): gastos bancarios del sistema que
    // no aparecen en ningún estado de cuenta. Best-effort (skew de deploy).
    conciliacionGastosSinBanco().catch(() => null),
    // Espejo para COBROS (9-sep): transferencia / HSBC link / cheque /
    // Paywise sin abono importado. Best-effort.
    conciliacionCobrosSinBanco().catch(() => null),
    getPaywiseComisionPct(),
  ]);
  const estadosCuenta = estadosRes.data;

  // Auditoría Paywise solo en su pestaña (cruce completo del periodo). El
  // 400 «sin cuenta PASARELA» se muestra como guía, no como error de página.
  let auditoria: PaywiseAuditoria | null = null;
  let auditoriaError: string | null = null;
  if (filtro === "paywise") {
    try {
      auditoria = await auditoriaPaywise({
        desde: pwDesde,
        hasta: pwHasta,
        dias: PAYWISE_DIAS,
        ...(pwCuenta ? { cuenta_bancaria_id: pwCuenta } : {}),
      });
    } catch (err) {
      auditoriaError = isApiError(err)
        ? err.message
        : err instanceof Error
          ? err.message
          : "No se pudo consultar la auditoría";
    }
  }

  const cuentas = cuentasRes.data.map((c) => ({
    id: c.id,
    label: `${c.alias} · ${c.banco} (${c.moneda})${c.tipo === "PASARELA" ? " · pasarela" : ""}`,
    tipo: c.tipo ?? null,
  }));
  const cuentasPasarela = cuentasRes.data
    .filter((c) => c.tipo === "PASARELA")
    .map((c) => ({ id: c.id, label: `${c.alias} (${c.moneda})`, moneda: c.moneda }));
  const gastosOpts = gastosRes.data
    // Los gastos BODEGA (salida de inventario) NO son egresos bancarios: la
    // conciliación los excluye por diseño (igual que el auto-cruce del API),
    // así que tampoco se ofrecen para vincular a mano un cargo del banco.
    .filter((g) => g.medio_pago !== "BODEGA")
    .map((g) => ({
      value: g.id,
      // La moneda VISIBLE: una compra en dólares (Aircraft Spruce) se vincula
      // contra su cargo en pesos — al ligarla, el sistema guarda el tipo de
      // cambio real del banco en el gasto.
      label: `${categoriaGastoLabel(g.categoria)} · $${fmtMoney(g.monto)} ${g.moneda ?? "MXN"} · ${fmtDate(g.fecha_gasto)}${
        g.proveedor?.nombre ? ` · ${g.proveedor.nombre}` : ""
      }`,
    }));

  // PostgREST puede devolver los joins como arreglo: tomar el primero.
  const uno = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
  const sinBancoRows: GastoSinBancoRow[] = (sinBanco?.data ?? []).map((g) => ({
    id: g.id,
    fecha: g.fecha_gasto,
    descripcion: `${categoriaGastoLabel(g.categoria)}${
      uno(g.proveedor)?.nombre
        ? ` · ${uno(g.proveedor)!.nombre}`
        : g.lugar
          ? ` · ${g.lugar}`
          : ""
    }`,
    // Etiqueta del medio: fuente única (antes PAYWISE se pintaba como
    // "Transferencia").
    medio:
      g.medio_pago === "TARJETA_CORP"
        ? `Tarjeta${g.tarjeta_terminacion ? ` **** ${g.tarjeta_terminacion}` : ""}`
        : medioPagoLabel(g.medio_pago),
    capturo: uno(g.captura)?.nombre ?? "—",
    vuelo: uno(g.vuelo)?.folio != null ? `#${uno(g.vuelo)!.folio}` : "—",
    monto: `$${fmtMoney(g.monto)} ${g.moneda ?? "MXN"}`,
  }));

  const tabs: { key: Filtro; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "pendientes", label: "Pendientes" },
    { key: "conciliados", label: "Conciliados" },
    {
      key: "sin_banco",
      label: `Gastos sin banco${sinBanco ? ` (${sinBanco.total})` : ""}`,
    },
    {
      key: "cobros_sin_banco",
      label: `Cobros sin banco${cobrosSinBanco ? ` (${cobrosSinBanco.total})` : ""}`,
    },
    { key: "paywise", label: "Auditoría Paywise" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Tesorería</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Conciliación</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sube el estado de cuenta: los cargos se cruzan automáticamente con los gastos y los
            abonos con los cobros de vuelos, por monto y fecha. Los ambiguos se vinculan a mano.
            El de Paywise se sube en su cuenta (pasarela) y se audita en «Auditoría Paywise».
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ReporteConciliacionButton
            cuentas={cuentas}
            filtroActivo={
              filtro === "cobros_sin_banco" || filtro === "paywise" ? "todos" : filtro
            }
          />
          <ImportButton cuentas={cuentas} />
        </div>
      </div>

      {resumen.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {resumen.map((c) => (
            <Card key={c.cuenta_bancaria_id}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground truncate">
                  {c.alias ?? "Cuenta"} · {c.banco ?? ""} ({c.moneda ?? ""})
                </p>
                <p className="text-lg font-semibold mt-1">
                  {c.conciliados}/{c.total}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    conciliados
                  </span>
                </p>
                {c.pendientes > 0 ? (
                  <p className="text-xs text-amber-600 mt-0.5">
                    Faltan {c.pendientes} · $
                    {c.monto_pendiente.toLocaleString("es-MX", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                ) : (
                  <p className="text-xs text-emerald-600 mt-0.5">Al corriente</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "todos" ? "/admin/conciliacion" : `/admin/conciliacion?f=${t.key}`}
            className={cn(
              "inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              filtro === t.key
                ? "bg-brand-600 text-white"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {filtro === "paywise" ? (
        <PaywiseAuditoriaPanel
          auditoria={auditoria}
          error={auditoriaError}
          desde={pwDesde}
          hasta={pwHasta}
          dias={auditoria?.dias ?? PAYWISE_DIAS}
          cuentaId={pwCuenta}
          cuentasPasarela={cuentasPasarela}
          paywiseComisionPct={paywiseComisionPct}
        />
      ) : filtro === "cobros_sin_banco" ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Cobros que no aparecen en ningún estado de cuenta
            </CardTitle>
            <CardDescription>
              Transferencia, HSBC link, cheque o Paywise (cobros de vuelo y sobres de grupo)
              sin cruzar con ningún abono importado (últimos 90 días). Puede faltar el periodo
              por importar, no coincidir fecha/monto, o el dinero nunca llegó.
              {cobrosSinBanco && cobrosSinBanco.por_moneda.length > 0 && (
                <>
                  {" "}
                  Sin cruzar:{" "}
                  {cobrosSinBanco.por_moneda
                    .map((m) => `$${fmtMoney(String(m.monto))} ${m.moneda}`)
                    .join(" · ")}
                  .
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {cobrosSinBanco ? (
              <CobrosSinBancoTable rows={cobrosSinBanco.data} />
            ) : (
              <p className="px-4 pb-4 text-sm text-muted-foreground">
                No se pudo consultar la lista (el API no respondió). Recarga la página.
              </p>
            )}
          </CardContent>
        </Card>
      ) : filtro === "sin_banco" ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Gastos que no aparecen en el estado de cuenta
            </CardTitle>
            <CardDescription>
              Pagados con tarjeta corporativa, transferencia o Paywise y aún sin
              cruzar con ninguna línea del banco (últimos 90 días). Puede faltar
              el periodo por importar, no coincidir fecha/monto, o el cargo nunca
              llegó al banco.
              {sinBanco && sinBanco.por_moneda.length > 0 && (
                <>
                  {" "}
                  Faltan:{" "}
                  {sinBanco.por_moneda
                    .map((m) => `$${fmtMoney(String(m.monto))} ${m.moneda}`)
                    .join(" · ")}
                  .
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <GastosSinBancoTable rows={sinBancoRows} />
          </CardContent>
        </Card>
      ) : movs.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <ArrowsRightLeftIcon className="h-12 w-12 text-muted-foreground" />
            </div>
            <CardTitle>Sin movimientos</CardTitle>
            <CardDescription>
              Importa un estado de cuenta para cruzar los movimientos con los gastos capturados.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <MovimientosTable movimientos={movs} gastos={gastosOpts} />
          </CardContent>
        </Card>
      )}

      {/* Archivo histórico: cada importación guarda el archivo original del
          banco para volver a consultarlo. Sin importaciones archivadas la
          sección no aparece (no hay nada que mostrar). */}
      {estadosCuenta.length > 0 && filtro !== "paywise" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Estados de cuenta importados</CardTitle>
            <CardDescription>
              El archivo original de cada importación queda guardado; descárgalo cuando
              necesites revisarlo.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <EstadosCuentaTable estados={estadosCuenta} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
