import { BeakerIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import {
  FuelLoadsTable,
  type FuelLoadRow,
} from "@/components/admin/expenses/fuel-loads-table";
import { FuelFilterBar } from "@/components/admin/expenses/fuel-filter-bar";
import { listFuelLoads, signFuelPhotos } from "@/lib/api/expenses-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listCards } from "@/lib/api/cards-server";
import { EmptyState } from "@/components/admin/empty-state";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import { FuelBulkUploadDialog } from "@/components/admin/expenses/fuel-bulk-upload-dialog";
import { todayCancun } from "@/lib/datetime";

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

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtLitros = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 1 });

/** Acumulado del mes de un avión (monedas SIN mezclar). */
interface ResumenAvion {
  key: string;
  matricula: string;
  cargas: number;
  litros: number;
  mxn: number;
  usd: number;
  /** Solo cargas MXN con litros: base honesta del $/L promedio. */
  mxnConLitros: number;
  litrosMxn: number;
}

interface PageProps {
  searchParams: Promise<{ mes?: string; aeronave_id?: string }>;
}

export default async function CombustiblesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  // Mes elegido (default: mes corriente en hora Cancún — mismo eje que el
  // reparto a socios: fecha_gasto).
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "")
    ? (sp.mes as string)
    : todayCancun().slice(0, 7);
  const aeronaveId = sp.aeronave_id || "";
  const { desde, hasta } = rangoDeMes(mes);
  const mesLabel = labelDeMes(mes);

  const [{ data: loads }, aircraftRes, cardsRes] = await Promise.all([
    listFuelLoads({ desde, hasta, aeronave_id: aeronaveId || undefined }),
    listAircraft({ limit: 100 }),
    listCards({ limit: 50 }).catch(() => ({ data: [] })),
  ]);

  const matriculaById = new Map(aircraftRes.data.map((a) => [a.id, a.matricula]));
  const titularByTerminacion = new Map(
    cardsRes.data.map((c) => [c.terminacion, c.nombre_titular]),
  );
  // Todas para el filtro (meses históricos pueden traer aviones inactivos);
  // solo ACTIVAS para el diálogo "Asignar avión".
  const aircraftOpts = aircraftRes.data.map((a) => ({
    id: a.id,
    matricula: a.matricula,
    modelo: a.modelo,
  }));
  const aircraftActivas = aircraftRes.data
    .filter((a) => a.activa)
    .map((a) => ({ id: a.id, matricula: a.matricula, modelo: a.modelo }));

  // Si la firma falla, la tabla queda sin recibos: avisar en vez de pintar
  // guiones en silencio (bug histórico de recibos "rotos").
  const paths = loads.map((l) => l.foto_url).filter((p): p is string => !!p);
  let fotos: Record<string, string> = {};
  let fotosError = false;
  try {
    fotos = await signFuelPhotos(paths);
  } catch {
    fotosError = paths.length > 0;
  }

  // Filas planas serializables: lookups (matrícula, titular, foto firmada)
  // resueltos aquí en el server; el cliente solo pinta.
  const rows: FuelLoadRow[] = loads.map((l) => ({
    id: l.id,
    aeronave_id: l.aeronave_id,
    matricula: l.aeronave_id ? (matriculaById.get(l.aeronave_id) ?? null) : null,
    fecha_hora_carga: l.fecha_hora_carga,
    fecha_gasto: l.fecha_gasto,
    tipo_combustible: l.tipo_combustible,
    litros: l.litros != null ? Number(l.litros) : null,
    monto: Number(l.monto),
    moneda: l.moneda,
    lugar: l.lugar,
    medio_pago: l.medio_pago,
    tarjeta_terminacion: l.tarjeta_terminacion,
    titular: l.tarjeta_terminacion
      ? (titularByTerminacion.get(l.tarjeta_terminacion) ?? null)
      : null,
    fotoPath: l.foto_url,
    fotoUrl: l.foto_url ? (fotos[l.foto_url] ?? null) : null,
    vuelo_id: l.vuelo_id,
    vuelo_folio: l.vuelo?.folio ?? null,
  }));

  // Orden de la tabla (pedido del cliente 28-ago): por MATRÍCULA y luego
  // por fecha; las cargas SIN avión van primero (bloquean el cierre y hay
  // que asignarlas).
  rows.sort((a, b) => {
    if (!a.matricula !== !b.matricula) return a.matricula ? 1 : -1;
    const m = (a.matricula ?? "").localeCompare(b.matricula ?? "");
    if (m !== 0) return m;
    return String(a.fecha_hora_carga ?? a.fecha_gasto ?? "").localeCompare(
      String(b.fecha_hora_carga ?? b.fecha_gasto ?? ""),
    );
  });

  // ===== Resumen del mes por avión (el control real del combustible) =====
  const porAvion = new Map<string, ResumenAvion>();
  for (const r of rows) {
    const key = r.aeronave_id ?? "SIN_AVION";
    let acc = porAvion.get(key);
    if (!acc) {
      acc = {
        key,
        matricula: r.matricula ?? "Sin avión",
        cargas: 0,
        litros: 0,
        mxn: 0,
        usd: 0,
        mxnConLitros: 0,
        litrosMxn: 0,
      };
      porAvion.set(key, acc);
    }
    acc.cargas += 1;
    acc.litros += r.litros ?? 0;
    if (r.moneda === "USD") {
      acc.usd += r.monto;
    } else {
      acc.mxn += r.monto;
      if (r.litros && r.litros > 0) {
        acc.mxnConLitros += r.monto;
        acc.litrosMxn += r.litros;
      }
    }
  }
  const sinAvion = porAvion.get("SIN_AVION") ?? null;
  const aviones = [...porAvion.values()]
    .filter((a) => a.key !== "SIN_AVION")
    .sort((a, b) => a.matricula.localeCompare(b.matricula));
  const flota = rows.reduce(
    (t, r) => {
      t.cargas += 1;
      t.litros += r.litros ?? 0;
      if (r.moneda === "USD") t.usd += r.monto;
      else {
        t.mxn += r.monto;
        if (r.litros && r.litros > 0) {
          t.mxnConLitros += r.monto;
          t.litrosMxn += r.litros;
        }
      }
      return t;
    },
    { cargas: 0, litros: 0, mxn: 0, usd: 0, mxnConLitros: 0, litrosMxn: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="max-w-2xl">
          <p className="text-sm text-muted-foreground">Operación</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Combustibles</h1>
          <p className="text-sm text-muted-foreground mt-1">
            El combustible se controla por avión y por mes: se reparte como
            gasto de combustible del mes en el Balance (pestaña Combustible).
            La liga a vuelo es opcional.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExcelExportButton
            path="/v1/expenses/combustibles/plantilla.xlsx"
            filename="plantilla-combustibles.xlsx"
            label="Plantilla (Excel)"
          />
          <FuelBulkUploadDialog />
        </div>
      </div>

      <FuelFilterBar mes={mes} aeronaveId={aeronaveId} aircraft={aircraftOpts} />

      {fotosError && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-300">
          No se pudieron cargar los recibos — recarga la página.
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={BeakerIcon}
          title={`Sin cargas de combustible en ${mesLabel}`}
          description="Las cargas que registre el mecánico (o los pilotos) aparecerán aquí, acumuladas por avión en el mes. También puedes cargarlas en lote con la plantilla de Excel (botón Carga masiva)."
        />
      ) : (
        <>
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">
              Combustible del mes · {mesLabel}
            </h2>

            {sinAvion && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3">
                <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                <div>
                  <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                    {sinAvion.cargas}{" "}
                    {sinAvion.cargas === 1 ? "carga sin avión" : "cargas sin avión"} —{" "}
                    {sinAvion.mxn > 0 && `MXN ${fmtMoney(sinAvion.mxn)}`}
                    {sinAvion.mxn > 0 && sinAvion.usd > 0 && " · "}
                    {sinAvion.usd > 0 && `USD ${fmtMoney(sinAvion.usd)}`}
                    {" • bloquean el cierre"}
                  </p>
                  <p className="text-xs text-red-600/80 dark:text-red-400/80">
                    Asígnales avión en la tabla (badge rojo) para que entren al
                    Balance del mes.
                  </p>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {aviones.map((a) => (
                <Card key={a.key}>
                  <CardContent className="p-4 space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-sm font-semibold">
                        {a.matricula}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {a.cargas} {a.cargas === 1 ? "carga" : "cargas"}
                      </span>
                    </div>
                    <p className="font-mono text-lg font-semibold">
                      {fmtMoney(a.mxn)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">MXN</span>
                    </p>
                    {a.usd > 0 && (
                      <p className="font-mono text-sm">
                        {fmtMoney(a.usd)}{" "}
                        <span className="text-xs text-muted-foreground">USD</span>
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {fmtLitros(a.litros)} L
                      {a.litrosMxn > 0 &&
                        ` · $/L prom ${(a.mxnConLitros / a.litrosMxn).toFixed(2)}`}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Flota: {flota.cargas} {flota.cargas === 1 ? "carga" : "cargas"} ·{" "}
              {fmtLitros(flota.litros)} L · MXN {fmtMoney(flota.mxn)}
              {flota.usd > 0 && ` · USD ${fmtMoney(flota.usd)}`}
            </p>
          </div>

          <Card>
            <CardContent className="p-0">
              <FuelLoadsTable loads={rows} aircraft={aircraftActivas} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
