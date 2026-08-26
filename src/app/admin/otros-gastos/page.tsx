import { BanknotesIcon } from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/admin/empty-state";
import {
  OtrosGastosTable,
  type OtroGastoRow,
} from "@/components/admin/expenses/otros-gastos-table";
import { OtrosGastosFilterBar } from "@/components/admin/expenses/otros-gastos-filter-bar";
import { listOtrosGastos } from "@/lib/api/expenses-server";
import { todayCancun, fmtDateOnly } from "@/lib/datetime";
import { fmtMxn, fmtUsd } from "@/lib/format";
import type { OtrosGastosResumen } from "@/types/expenses";

export const dynamic = "force-dynamic";

/** Rango completo del mes YYYY-MM (fecha_gasto es DATE: sin zonas horarias). */
function rangoDeMes(mes: string): { desde: string; hasta: string } {
  const [anio, mesN] = mes.split("-").map(Number);
  const ultimo = new Date(anio, mesN, 0).getDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

function labelDeMes(mes: string): string {
  const [anio, mesN] = mes.split("-").map(Number);
  return new Date(anio, mesN - 1, 1).toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
  });
}

const fmtMonto = (v: number, moneda: string) =>
  moneda === "USD" ? fmtUsd(v) : fmtMxn(v);

const num = (v: string | number | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** MXN primero, luego USD; cualquier otra moneda al final. */
const ordenMoneda = (m: string) => (m === "MXN" ? 0 : m === "USD" ? 1 : 2);

interface PageProps {
  searchParams: Promise<{ mes?: string }>;
}

export default async function OtrosGastosPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  // Mes elegido (default: mes corriente en hora Cancún — mismo eje que el
  // Balance por avión: fecha_gasto).
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "")
    ? (sp.mes as string)
    : todayCancun().slice(0, 7);
  const { desde, hasta } = rangoDeMes(mes);
  const mesLabel = labelDeMes(mes);

  const { data: gastos, resumen } = await listOtrosGastos({ desde, hasta });

  // Filas planas serializables: el cliente solo pinta.
  const rows: OtroGastoRow[] = gastos.map((g) => {
    const repartos = (g.repartos ?? []).map((r) => ({
      aeronave_id: r.aeronave_id,
      matricula: r.aeronave?.matricula ?? null,
      monto: num(r.monto),
    }));
    const monto = num(g.monto);
    const asignado = repartos.reduce((acc, r) => acc + r.monto, 0);
    const remanente =
      repartos.length > 0 ? Math.round((monto - asignado) * 100) / 100 : 0;
    const linea = (g.notas ?? "").split("\n")[0].trim();
    const descripcion =
      [linea || null, g.proveedor?.nombre ?? null].filter(Boolean).join(" · ") ||
      null;
    return {
      id: g.id,
      fecha_gasto: g.fecha_gasto,
      categoria: g.categoria,
      descripcion,
      notas: g.notas,
      monto,
      moneda: g.moneda,
      medio_pago: g.medio_pago,
      matricula: g.aeronave?.matricula ?? null,
      repartos,
      remanente,
    };
  });

  // Detalle de la parte de VuelaTour (pedido explícito del cliente: "cuánto
  // tuvo en Otros gastos VuelaTour en ese mes y sus detalles"): remanente del
  // reparto, o el monto completo si no tiene reparto NI avión clásico.
  const detalleEmpresa = rows
    .map((r) => ({
      ...r,
      parteEmpresa:
        r.repartos.length > 0 ? r.remanente : r.matricula ? 0 : r.monto,
    }))
    .filter((r) => r.parteEmpresa > 0.004);

  const resumenOrdenado = [...resumen].sort(
    (a, b) => ordenMoneda(a.moneda) - ordenMoneda(b.moneda),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="max-w-2xl">
          <p className="text-sm text-muted-foreground">Operación</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Otros gastos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Asigna o divide los gastos generales entre aviones. Lo que no
            asignes queda como gasto de la empresa VuelaTour (no resta a
            ningún avión).
          </p>
        </div>
      </div>

      <OtrosGastosFilterBar mes={mes} />

      {rows.length === 0 ? (
        <EmptyState
          icon={BanknotesIcon}
          title={`Sin otros gastos en ${mesLabel}`}
          description="Aquí aparecen los gastos generales del mes (categorías OTRO, FIJO e INDIRECTO sin vuelo) para asignarlos o dividirlos entre aviones."
        />
      ) : (
        <>
          <ResumenMes resumen={resumenOrdenado} detalle={detalleEmpresa} />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Gastos generales del mes · {mesLabel}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({rows.length})
                </span>
              </CardTitle>
              <CardDescription>
                Usa &quot;Repartir&quot; para asignar o dividir un gasto entre
                aviones con montos editables.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <OtrosGastosTable gastos={rows} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * Cards del mes POR MONEDA (nunca se mezclan MXN y USD): total, asignado a
 * aviones y — prominente — la parte de VuelaTour (empresa), expandible con
 * el detalle gasto por gasto.
 */
function ResumenMes({
  resumen,
  detalle,
}: {
  resumen: OtrosGastosResumen[];
  detalle: Array<OtroGastoRow & { parteEmpresa: number }>;
}) {
  if (resumen.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Card>
        <CardContent className="p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Total de otros gastos</p>
          {resumen.map((r) => (
            <p key={r.moneda} className="font-mono text-lg font-semibold">
              {fmtMonto(num(r.total), r.moneda)}
            </p>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Asignado a aviones</p>
          {resumen.map((r) => (
            <p key={r.moneda} className="font-mono text-lg font-semibold">
              {fmtMonto(num(r.asignado_aviones), r.moneda)}
            </p>
          ))}
        </CardContent>
      </Card>

      <Card className="border-brand-600/40 bg-brand-600/5">
        <CardContent className="p-4 space-y-1">
          <p className="text-xs font-medium text-brand-600">
            VuelaTour (empresa)
          </p>
          {resumen.map((r) => (
            <p key={r.moneda} className="font-mono text-xl font-semibold">
              {fmtMonto(num(r.empresa), r.moneda)}
            </p>
          ))}
          <p className="text-xs text-muted-foreground">
            Lo no asignado a aviones: no resta a ningún avión.
          </p>
          {detalle.length > 0 && (
            <details className="pt-1">
              <summary className="cursor-pointer text-xs font-medium text-brand-600 hover:underline">
                Ver detalle ({detalle.length}{" "}
                {detalle.length === 1 ? "gasto" : "gastos"})
              </summary>
              <div className="mt-2 space-y-1.5">
                {detalle.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="shrink-0 text-muted-foreground">
                        {fmtDateOnly(d.fecha_gasto)}
                      </span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {d.categoria}
                      </Badge>
                      <span className="truncate" title={d.descripcion ?? undefined}>
                        {d.descripcion ?? "Sin descripción"}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono font-medium">
                      {fmtMonto(d.parteEmpresa, d.moneda)}
                      {d.repartos.length > 0 && (
                        <span className="ml-1 font-sans text-[10px] text-muted-foreground">
                          (remanente)
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
