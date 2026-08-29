import Link from "next/link";
import {
  BanknotesIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ExpensesTable } from "@/components/admin/expenses/expenses-table";
import {
  listGastos,
  listGastosAll,
  signFuelPhotos,
  type ListGastosQuery,
} from "@/lib/api/expenses-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listProviders } from "@/lib/api/providers-server";
import { listPilots } from "@/lib/api/pilots-server";
import { listUsers } from "@/lib/api/users-server";
import { ExpensesFilterBar } from "@/components/admin/expenses/expenses-filter-bar";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import { SuggestAssignmentsButton } from "@/components/admin/expenses/suggest-assignments-button";
import { ExpenseCreateDialog } from "@/components/admin/expenses/expense-create-dialog";
import { PistasDialog } from "@/components/admin/expenses/pistas-dialog";
import { ExpensesSeleccionProvider } from "@/components/admin/expenses/expenses-seleccion";
import { esCategoriaCompra } from "@/types/compras";
import { todayCancun } from "@/lib/datetime";

export const dynamic = "force-dynamic";

type Filtro = "todos" | "pendientes" | "duplicados";

// Vista general en dos columnas (pedido del cliente): gastos OPERATIVOS
// (ligados a operar el vuelo: combustible, pistas, TUAS, FBO, permisos) vs
// GENERALES (viáticos, refacciones, fijos...). El desglose completo de cada
// vuelo vive en su detalle (/admin/flights/{id}).
const CATEGORIAS_OPERATIVAS = new Set([
  "GAS",
  "OPERACIONES",
  "ATERRIZAJE",
  "TUAS",
  "FBO",
  "PERMISO",
  // Honorario del piloto externo: es costo de operar el vuelo.
  "PILOTO_EXTERNO",
]);

/**
 * Los pagos de una COMPRA de refacciones (aunque uno sea OPERACIONES, p. ej.
 * la aduana) se quedan juntos en "generales": la tabla los muestra como una
 * sola fila-grupo y partirlos entre dos cards la rompería.
 */
const esOperativo = (g: { categoria: string; compra_id?: string | null }) =>
  CATEGORIAS_OPERATIVAS.has(g.categoria) && !g.compra_id;

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{
    f?: string;
    aeronave_id?: string;
    medio?: string;
    piloto?: string;
    desde?: string;
    hasta?: string;
    facturacion?: string;
    /** "7d" = solo lo CAPTURADO en los últimos 7 días (aunque el ticket
     *  traiga otra fecha): lo que se subió desde la app esta semana. */
    cap?: string;
  }>;
}) {
  const sp = await searchParams;
  const capturadoSemana = sp.cap === "7d";
  const capturadoDesde = capturadoSemana
    ? (() => {
        const d = new Date(`${todayCancun()}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 7);
        return d.toISOString().slice(0, 10);
      })()
    : undefined;
  const filtro: Filtro =
    sp.f === "pendientes" || sp.f === "duplicados" ? sp.f : "todos";
  // Filtro por avión (link desde el expediente del avión). El API lo soporta
  // nativo en /v1/expenses; los contadores de las pestañas lo respetan.
  const aeronaveId = sp.aeronave_id || undefined;
  // Filtros de oficina (ago 2026): tipo de pago, quién capturó y fechas de
  // corte — los mismos que hereda "Exportar Excel" (reporte de efectivos por
  // piloto con dos clics).
  const filtrosExtra = {
    medio_pago: sp.medio || undefined,
    usuario_captura_id: sp.piloto || undefined,
    desde: sp.desde || undefined,
    hasta: sp.hasta || undefined,
    // Semáforo de facturación (PENDIENTE/SOLICITADA/FACTURADA/NO_FACTURADA).
    estatus_facturacion: sp.facturacion || undefined,
    // Fecha de CAPTURA (28-ago): "¿por qué no veo lo que subí desde la app?"
    // — el ticket puede traer otra fecha (la IA leyó 2025) y quedar al fondo.
    capturado_desde: capturadoDesde,
  };

  const query: Omit<ListGastosQuery, "limit" | "offset"> = {
    aeronave_id: aeronaveId,
    ...filtrosExtra,
  };
  if (filtro === "pendientes") query.pendientes = true;
  if (filtro === "duplicados") query.duplicados = true;

  const [
    { data: gastos, count: gastosCount },
    pendientesRes,
    duplicadosRes,
    aircraftRes,
    providersRes,
    pilotsRes,
  ] =
    await Promise.all([
      // SIN cap (anti-cap-200): prod ya rebasó los 500 gastos y el corte
      // silencioso hacía parecer "no guardado" un gasto que sí existía.
      listGastosAll(query),
      listGastos({ pendientes: true, limit: 1, aeronave_id: aeronaveId, ...filtrosExtra }),
      listGastos({ duplicados: true, limit: 1, aeronave_id: aeronaveId, ...filtrosExtra }),
      listAircraft({ limit: 100 }),
      listProviders({ limit: 200 }),
      // Filtro "Capturó": TODO el personal activo — la oficina (Jimmy, Mary,
      // Itzi…) también captura gastos y con /pilots no aparecía (queja del
      // cliente, 24-ago). /users es solo ADMIN: si el rol no alcanza (403),
      // se cae a la lista de pilotos — mejor una lista corta que ninguna.
      listUsers({ estado: "ACTIVO", limit: 200 })
        .then((r) =>
          r.data
            .filter((u) => !u.es_piloto_externo) // externos jamás capturan (sin app)
            .map((u) => ({ id: u.id, nombre: u.nombre })),
        )
        .catch(() =>
          listPilots({ estado: "ACTIVO", limit: 200 })
            .then((r) => r.data.map((u) => ({ id: u.id, nombre: u.nombre })))
            .catch(() => [] as { id: string; nombre: string }[]),
        ),
    ]);
  const personas = [...pilotsRes].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es"),
  );

  const aircraft = aircraftRes.data.map((a) => ({ id: a.id, matricula: a.matricula }));
  const providers = providersRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));
  const aeronaveFiltro = aeronaveId
    ? (aircraft.find((a) => a.id === aeronaveId)?.matricula ?? "desconocido")
    : null;

  const hrefTab = (key: Filtro) => {
    const params = new URLSearchParams();
    if (key !== "todos") params.set("f", key);
    if (aeronaveId) params.set("aeronave_id", aeronaveId);
    // Las pestañas conservan los filtros de oficina activos.
    if (sp.medio) params.set("medio", sp.medio);
    if (sp.piloto) params.set("piloto", sp.piloto);
    if (sp.desde) params.set("desde", sp.desde);
    if (sp.hasta) params.set("hasta", sp.hasta);
    if (sp.facturacion) params.set("facturacion", sp.facturacion);
    if (sp.cap) params.set("cap", sp.cap);
    const qs = params.toString();
    return qs ? `/admin/expenses?${qs}` : "/admin/expenses";
  };
  // Mismo href que la pestaña activa, con/sin el chip "Subidos esta semana".
  const hrefCapturado = (activar: boolean) => {
    const url = new URL(hrefTab(filtro), "https://x");
    if (activar) url.searchParams.set("cap", "7d");
    else url.searchParams.delete("cap");
    const qs = url.searchParams.toString();
    return qs ? `/admin/expenses?${qs}` : "/admin/expenses";
  };

  // Corte defensivo del anti-cap (count cambió a media carga): avisar en vez
  // de dejar que un gasto "desaparezca" en silencio (auditoría 29-ago).
  const huboCorte = gastos.length < gastosCount;

  // Firma las fotos de los comprobantes (bucket privado) para verlas en el admin.
  const fotoPaths = gastos.map((g) => g.foto_url).filter((p): p is string => !!p);
  let fotoUrls: Record<string, string> = {};
  if (fotoPaths.length > 0) {
    try {
      fotoUrls = await signFuelPhotos(fotoPaths);
    } catch {
      fotoUrls = {};
    }
  }

  // Gastos que pueden marcarse para "Unir en compra" en ESTA vista (sueltos y
  // de categoría de compra: misma regla que la casilla). El provider poda la
  // selección a estos ids al cambiar de filtro/pestaña o tras borrar/ligar.
  const idsSeleccionables = gastos
    .filter((g) => !g.compra_id && esCategoriaCompra(g.categoria))
    .map((g) => g.id);

  const tabs: { key: Filtro; label: string; count?: number }[] = [
    { key: "todos", label: "Todos" },
    { key: "pendientes", label: "Pendientes", count: pendientesRes.count },
    { key: "duplicados", label: "Duplicados", count: duplicadosRes.count },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Operación</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Gastos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verifica los gastos capturados: asigna avión, confirma comprobante y descarta
            duplicados. La bandeja de pendientes debe quedar siempre vacía.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExpenseCreateDialog aircraft={aircraft} providers={providers} />
          <PistasDialog />
          <SuggestAssignmentsButton pendientes={pendientesRes.count} />
          <ExcelExportButton
            path="/v1/expenses/export"
            filename="gastos.xlsx"
            label="Exportar Excel"
            // El Excel sale con LOS MISMOS filtros que se ven en pantalla
            // (incluye el resumen de efectivos por persona y su facturado).
            query={{ aeronave_id: aeronaveId, ...filtrosExtra }}
          />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={hrefTab(t.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              filtro === t.key
                ? "bg-brand-600 text-white"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs",
                  filtro === t.key ? "bg-white/20" : "bg-amber-500/20 text-amber-600",
                )}
              >
                {t.count}
              </span>
            )}
          </Link>
        ))}
        <Link
          href={hrefCapturado(!capturadoSemana)}
          title="Solo lo capturado en los últimos 7 días (aunque el ticket traiga otra fecha): lo que subieron desde la app esta semana"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            capturadoSemana
              ? "bg-brand-600 text-white"
              : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          Subidos esta semana
          {capturadoSemana && <XMarkIcon className="h-3.5 w-3.5" />}
        </Link>
        <ExpensesFilterBar personas={personas} />
        {aeronaveFiltro && (
          <Link
            // Quitar SOLO el avión: los demás filtros activos (pestaña,
            // medio, capturó, fechas, facturación) se conservan.
            href={(() => {
              const params = new URLSearchParams();
              if (filtro !== "todos") params.set("f", filtro);
              if (sp.medio) params.set("medio", sp.medio);
              if (sp.piloto) params.set("piloto", sp.piloto);
              if (sp.desde) params.set("desde", sp.desde);
              if (sp.hasta) params.set("hasta", sp.hasta);
              if (sp.facturacion) params.set("facturacion", sp.facturacion);
              if (sp.cap) params.set("cap", sp.cap);
              const qs = params.toString();
              return qs ? `/admin/expenses?${qs}` : "/admin/expenses";
            })()}
            title="Quitar el filtro de avión"
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-600/40 bg-brand-600/10 px-3 py-1.5 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-600/20"
          >
            Avión: <span className="font-mono">{aeronaveFiltro}</span>
            <XMarkIcon className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {huboCorte && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
          <span>
            Mostrando {gastos.length} de {gastosCount} gastos — usa los
            filtros para acotar la lista.
          </span>
        </div>
      )}

      {gastos.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <BanknotesIcon className="h-12 w-12 text-muted-foreground" />
            </div>
            <CardTitle>
              {filtro === "pendientes"
                ? "Sin gastos pendientes"
                : filtro === "duplicados"
                  ? "Sin duplicados sospechosos"
                  : "Sin gastos capturados"}
            </CardTitle>
            <CardDescription>
              {filtro === "pendientes"
                ? "Todos los gastos tienen avión asignado. Bandeja limpia."
                : "Aquí verás los gastos que capturen pilotos y oficina."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        // Cards APILADAS a lo ancho (pedido de oficina 14-ago): lado a lado
        // las columnas no cabían y las tablas se cortaban. El desglose por
        // vuelo está en el detalle del vuelo (link en la columna Vuelo).
        // El provider comparte la selección múltiple entre ambas tablas
        // ("Unir en compra": la factura de refacciones y su envío/impuestos
        // pueden caer en cards distintas).
        <ExpensesSeleccionProvider idsVisibles={idsSeleccionables}>
          <div className="space-y-6">
            <GastosCard
              titulo="Gastos generales"
              descripcion="Viáticos, refacciones, compras de refacciones, fijos y otros."
              gastos={gastos.filter((g) => !esOperativo(g))}
              aircraft={aircraft}
              providers={providers}
              fotoUrls={fotoUrls}
              huboCorte={huboCorte}
            />
            <GastosCard
              titulo="Gastos operativos"
              descripcion="Combustible, pistas/aterrizajes, TUAS, FBO, permisos y piloto externo."
              gastos={gastos.filter(esOperativo)}
              aircraft={aircraft}
              providers={providers}
              fotoUrls={fotoUrls}
              huboCorte={huboCorte}
            />
          </div>
        </ExpensesSeleccionProvider>
      )}
    </div>
  );
}

function GastosCard({
  titulo,
  descripcion,
  gastos,
  aircraft,
  providers,
  fotoUrls,
  huboCorte = false,
}: {
  titulo: string;
  descripcion: string;
  gastos: Awaited<ReturnType<typeof listGastos>>["data"];
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
  fotoUrls: Record<string, string>;
  /** true = no se cargaron TODOS los gastos (corte defensivo del anti-cap). */
  huboCorte?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {titulo}{" "}
          <span className="text-sm font-normal text-muted-foreground">({gastos.length})</span>
        </CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {gastos.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Sin gastos en esta vista.</p>
        ) : (
          <ExpensesTable
            gastos={gastos}
            aircraft={aircraft}
            providers={providers}
            fotoUrls={fotoUrls}
            huboCorte={huboCorte}
          />
        )}
      </CardContent>
    </Card>
  );
}
