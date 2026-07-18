import Link from "next/link";
import { fmtDateOnly } from "@/lib/datetime";
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
import { MovimientosTable } from "@/components/admin/conciliacion/movimientos-table";
import {
  conciliacionResumen,
  listEstadosCuenta,
  listMovimientosBancarios,
  type ListConciliacionQuery,
} from "@/lib/api/conciliacion-server";
import { listBankAccounts } from "@/lib/api/bank-accounts-server";
import { listGastos } from "@/lib/api/expenses-server";

export const dynamic = "force-dynamic";
// Importar un PDF con cientos de movimientos tarda minutos (extracción IA):
// las server actions de este segmento heredan el límite — sin esto Vercel
// cortaba antes de que el API respondiera.
export const maxDuration = 300;

type Filtro = "todos" | "pendientes" | "conciliados";

const fmtMoney = (monto: string) =>
  Number(monto).toLocaleString("es-MX", { minimumFractionDigits: 2 });
const fmtDate = fmtDateOnly;

export default async function ConciliacionPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const sp = await searchParams;
  const filtro: Filtro = sp.f === "pendientes" || sp.f === "conciliados" ? sp.f : "todos";

  const query: ListConciliacionQuery = { limit: 300 };
  if (filtro === "pendientes") query.conciliado = false;
  if (filtro === "conciliados") query.conciliado = true;

  const [{ data: movs }, cuentasRes, gastosRes, resumen, estadosRes] = await Promise.all([
    listMovimientosBancarios(query),
    listBankAccounts({ limit: 100 }),
    listGastos({ limit: 200 }),
    conciliacionResumen().catch(() => []),
    // Best-effort: la página no se cae si el archivado aún no responde.
    listEstadosCuenta().catch(() => ({ data: [] })),
  ]);
  const estadosCuenta = estadosRes.data;

  const cuentas = cuentasRes.data.map((c) => ({
    id: c.id,
    label: `${c.alias} · ${c.banco} (${c.moneda})`,
  }));
  const gastosOpts = gastosRes.data
    // Los gastos BODEGA (salida de inventario) NO son egresos bancarios: la
    // conciliación los excluye por diseño (igual que el auto-cruce del API),
    // así que tampoco se ofrecen para vincular a mano un cargo del banco.
    .filter((g) => g.medio_pago !== "BODEGA")
    .map((g) => ({
      value: g.id,
      label: `${g.categoria} · $${fmtMoney(g.monto)} · ${fmtDate(g.fecha_gasto)}${
        g.proveedor?.nombre ? ` · ${g.proveedor.nombre}` : ""
      }`,
    }));

  const tabs: { key: Filtro; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "pendientes", label: "Pendientes" },
    { key: "conciliados", label: "Conciliados" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Tesorería</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Conciliación</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sube el estado de cuenta: los cargos se cruzan automáticamente con los gastos por monto
            y fecha. Los ambiguos se vinculan a mano.
          </p>
        </div>
        <ImportButton cuentas={cuentas} />
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

      {movs.length === 0 ? (
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
      {estadosCuenta.length > 0 && (
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
