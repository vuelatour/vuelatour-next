import Link from "next/link";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiServer } from "@/lib/api/server";
import { fmtDate } from "@/lib/datetime";
import { fmtUsd } from "@/lib/format";
import { folioTexto } from "@/lib/admin/grupos-ui";

interface PreCierreVuelo {
  id: string;
  folio: number;
  estado?: string;
  saldo_usd?: number;
  /** ADITIVO (grupos, 4-sep-2026): folio del grupo si el vuelo es hijo de
      una cotización de grupo (cobros_pendientes). */
  grupo_folio?: number | null;
}

/** Grupo con saldo por cobrar (clave grupo_con_saldo). Montos del API. */
interface PreCierreGrupo {
  grupo_id: string;
  grupo_folio: number;
  nombre: string | null;
  aviones: number;
  total_usd: number;
  cobrado_usd: number;
  saldo_usd: number;
}

/** Sobre de cobro de grupo descuadrado (clave sobres_descuadrados). */
interface PreCierreSobre {
  sobre_id: string;
  grupo_id: string;
  grupo_folio: number | null;
  /** timestamptz: formatear en hora Cancún. */
  fecha_cobro: string | null;
  monto: number;
  moneda: string;
  suma_partes: number;
  partes_en_cancelados: number;
}

interface PreCierreItem {
  clave: string;
  titulo: string;
  detalle: string;
  count: number;
  monto_usd?: number;
  monto_mxn?: number;
  monto?: number;
  vuelos?: PreCierreVuelo[];
  /** ADITIVOS (grupos): lista de grupos / sobres del aviso. */
  grupos?: PreCierreGrupo[];
  sobres?: PreCierreSobre[];
  /** ADITIVO: aviso informativo (el dinero YA cuenta; nada que resolver
      salvo confirmar). Se pinta en azul, sin "Resolver". */
  informativo?: boolean;
}

interface PreCierre {
  periodo: { desde: string; hasta: string };
  listo: boolean;
  items: PreCierreItem[];
}

/** A dónde ir a resolver cada pendiente del checklist. */
// Links "Resolver" en función del PERIODO del checklist: sin el rango, la
// lista destino mezclaba pendientes de todos los tiempos y el conteo no
// cuadraba con el "· N" del item.
const LINK_POR_CLAVE: Record<
  string,
  (p: { desde: string; hasta: string }) => string
> = {
  // Vuelos sin completar: la lista del periodo (externos incluidos — esos
  // se completan a mano en su detalle y NO aparecen en taco-live).
  vuelos_sin_completar: (p) =>
    `/admin/flights?desde=${p.desde}&hasta=${p.hasta}`,
  tacos_en_revision: () => "/admin/taco-live",
  cobros_pendientes: (p) =>
    `/admin/flights?cobro=POR_COBRAR&desde=${p.desde}&hasta=${p.hasta}`,
  gastos_sin_avion: () => "/admin/expenses",
  gastos_sin_tc: () => "/admin/expenses",
  // Cobros MXN sin TC que ni el TC oficial convierte: se captura el TC en
  // el vuelo (los folios del item llevan directo a cada uno).
  cobros_sin_tc: (p) => `/admin/flights?desde=${p.desde}&hasta=${p.hasta}`,
  // El comprobante trae otra matrícula: se corrige el avión en Gastos.
  matricula_recibo_distinta: () => "/admin/expenses",
  // Directo a Gastos filtrado a "sin facturar" (pendiente + solicitada) DEL
  // PERIODO: ahí está el semáforo para irlos resolviendo uno por uno.
  gastos_sin_comprobante: (p) =>
    `/admin/expenses?facturacion=NO_FACTURADA&desde=${p.desde}&hasta=${p.hasta}`,
  // Cuotas de aeródromo sin provisionar: Gastos → "Pistas por pagar".
  pistas_sin_gasto: () => "/admin/expenses",
  // El honorario del piloto externo se captura como gasto del vuelo (los
  // folios del item llevan directo a cada vuelo).
  externos_sin_honorario: () => "/admin/expenses",
  sin_conciliar: () => "/admin/conciliacion",
  repartos_incoherentes: () => "/admin/otros-gastos",
  // Cotizaciones de GRUPO: la lista de grupos del periodo (cada grupo del
  // item lleva además su link directo). El saldo se cobra desde "Cobros del
  // grupo" (sobre) o por avión.
  grupo_con_saldo: (p) => `/admin/quotes/grupo?desde=${p.desde}&hasta=${p.hasta}`,
  // Sobre descuadrado: se re-parte desde Cobros del grupo.
  sobres_descuadrados: (p) => `/admin/quotes/grupo?desde=${p.desde}&hasta=${p.hasta}`,
};

function fmtMonto(item: PreCierreItem): string | null {
  if (item.monto_usd != null && item.monto_usd > 0)
    return `$${item.monto_usd.toLocaleString("en-US")} USD`;
  if (item.monto_mxn != null && item.monto_mxn > 0)
    return `$${item.monto_mxn.toLocaleString("en-US")} MXN`;
  if (item.monto != null && item.monto > 0)
    return `$${item.monto.toLocaleString("en-US")}`;
  return null;
}

/**
 * Checklist de pre-cierre: el sistema caza los huecos del periodo (vuelos sin
 * completar, tacos amarillos, gastos sin TC…) para que el empleado solo
 * supervise. Verde = se puede cerrar con números completos.
 */
export async function PreCierreCard({
  desde,
  hasta,
}: {
  desde: string;
  hasta: string;
}) {
  let data: PreCierre | null = null;
  try {
    data = await apiServer<PreCierre>("/v1/profit-sharing/pre-cierre", {
      searchParams: { desde, hasta },
      cache: "no-store",
    });
  } catch {
    // data queda null: abajo se muestra la card de error.
  }
  // Si la verificación FALLA, el checklist no puede desaparecer en silencio:
  // el operador generaría el cierre creyendo que no había pendientes.
  if (!data) {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-destructive" />
            Pre-cierre del periodo
          </CardTitle>
          <CardDescription>
            No se pudo verificar el pre-cierre (falló la consulta al servidor).
            No generes el cierre hasta que este checklist cargue: sin él no hay
            garantía de que el periodo esté completo. Recarga la página para
            reintentar.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const pendientes = data.items.filter((i) => i.count > 0);

  return (
    <Card
      className={
        data.listo
          ? "border-emerald-500/40"
          : "border-amber-500/40"
      }
    >
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {data.listo ? (
            <CheckCircleIcon className="h-5 w-5 text-emerald-500" />
          ) : (
            <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" />
          )}
          Pre-cierre del periodo
        </CardTitle>
        <CardDescription>
          {data.listo
            ? "Todo en orden: los números del periodo están completos para generar el cierre."
            : "El sistema encontró pendientes que dejarían el cierre incompleto. Resuélvelos antes de generar los reportes."}
        </CardDescription>
      </CardHeader>
      {pendientes.length > 0 && (
        <CardContent className="space-y-3">
          {pendientes.map((item) => {
            const monto = fmtMonto(item);
            const href = LINK_POR_CLAVE[item.clave]?.({ desde, hasta });
            const info = item.informativo === true;
            return (
              <div
                key={item.clave}
                className={`flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3 ${
                  info ? "border-sky-500/30 bg-sky-500/[0.04]" : "border-border"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {info && (
                      <InformationCircleIcon
                        aria-label="Informativo"
                        className="mr-1 inline h-4 w-4 align-text-bottom text-sky-600 dark:text-sky-400"
                      />
                    )}
                    {item.titulo}{" "}
                    <span
                      className={`font-semibold ${
                        info ? "text-sky-700 dark:text-sky-300" : "text-amber-600"
                      }`}
                    >
                      · {item.count}
                    </span>
                    {monto && (
                      <span className="text-muted-foreground"> · {monto}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.detalle}
                  </p>
                  {item.vuelos && item.vuelos.length > 0 && (
                    <p className="text-xs mt-1 flex flex-wrap gap-1.5">
                      {item.vuelos.slice(0, 8).map((v) => (
                        <Link
                          key={v.id}
                          href={`/admin/flights/${v.id}`}
                          className="underline underline-offset-2 hover:text-foreground text-muted-foreground"
                        >
                          #{v.folio}
                          {v.saldo_usd != null
                            ? ` ($${v.saldo_usd.toLocaleString("en-US")})`
                            : v.estado
                              ? ` (${v.estado})`
                              : ""}
                          {/* Hijo de un grupo: "G-12" junto al folio. */}
                          {v.grupo_folio != null && (
                            <span
                              className="text-fuchsia-700 dark:text-fuchsia-300"
                              title="Vuelo de una cotización de grupo"
                            >
                              {" "}
                              · {folioTexto(v.grupo_folio)}
                            </span>
                          )}
                        </Link>
                      ))}
                      {item.vuelos.length > 8 && (
                        <span className="text-muted-foreground">
                          y {item.vuelos.length - 8} más…
                        </span>
                      )}
                    </p>
                  )}
                  {/* Grupos con saldo: total / cobrado / saldo por grupo
                      (montos del API) con link al detalle del grupo. */}
                  {item.grupos && item.grupos.length > 0 && (
                    <ul className="text-xs mt-1 space-y-0.5">
                      {item.grupos.slice(0, 8).map((g) => (
                        <li key={g.grupo_id}>
                          <Link
                            href={`/admin/quotes/grupo/${g.grupo_id}`}
                            className="underline underline-offset-2 hover:text-foreground text-muted-foreground"
                            title={g.nombre ?? undefined}
                          >
                            <span className="text-fuchsia-700 dark:text-fuchsia-300 font-medium">
                              {folioTexto(g.grupo_folio)}
                            </span>
                            {g.nombre ? ` ${g.nombre}` : ""} · {g.aviones}{" "}
                            {g.aviones === 1 ? "avión" : "aviones"} · total{" "}
                            <span className="font-mono">{fmtUsd(g.total_usd)}</span> ·
                            cobrado{" "}
                            <span className="font-mono">{fmtUsd(g.cobrado_usd)}</span> ·
                            saldo{" "}
                            <span className="font-mono text-amber-600 dark:text-amber-400">
                              {fmtUsd(g.saldo_usd)}
                            </span>
                          </Link>
                        </li>
                      ))}
                      {item.grupos.length > 8 && (
                        <li className="text-muted-foreground">
                          y {item.grupos.length - 8} más…
                        </li>
                      )}
                    </ul>
                  )}
                  {/* Sobres descuadrados: sobre vs Σ de sus partes (del API)
                      y partes en aviones cancelados, con link al grupo. */}
                  {item.sobres && item.sobres.length > 0 && (
                    <ul className="text-xs mt-1 space-y-0.5">
                      {item.sobres.slice(0, 8).map((sb) => (
                        <li key={sb.sobre_id}>
                          <Link
                            href={`/admin/quotes/grupo/${sb.grupo_id}`}
                            className="underline underline-offset-2 hover:text-foreground text-muted-foreground"
                            title="Re-partir el sobre desde Cobros del grupo"
                          >
                            <span className="text-fuchsia-700 dark:text-fuchsia-300 font-medium">
                              {folioTexto(sb.grupo_folio)}
                            </span>{" "}
                            · sobre{" "}
                            <span className="font-mono">
                              {fmtUsd(sb.monto)} {sb.moneda}
                            </span>
                            {sb.fecha_cobro ? ` del ${fmtDate(sb.fecha_cobro)}` : ""} ·
                            las partes suman{" "}
                            <span className="font-mono text-amber-600 dark:text-amber-400">
                              {fmtUsd(sb.suma_partes)} {sb.moneda}
                            </span>
                            {sb.partes_en_cancelados > 0 &&
                              ` · ${sb.partes_en_cancelados} parte${
                                sb.partes_en_cancelados === 1 ? "" : "s"
                              } en aviones cancelados`}
                          </Link>
                        </li>
                      ))}
                      {item.sobres.length > 8 && (
                        <li className="text-muted-foreground">
                          y {item.sobres.length - 8} más…
                        </li>
                      )}
                    </ul>
                  )}
                </div>
                {href && (
                  <Link
                    href={href}
                    className="text-xs font-medium underline underline-offset-2 shrink-0"
                  >
                    Resolver →
                  </Link>
                )}
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
