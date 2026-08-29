"use client";

import { useId, useState } from "react";
import Link from "next/link";
import {
  ChevronDownIcon,
  ExclamationTriangleIcon,
  ListBulletIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDate, fmtDateOnly } from "@/lib/datetime";
import { fmtDecimal, fmtUsd } from "@/lib/format";
import {
  fmtParticipacionPct,
  fuenteParticipacionLabel,
} from "@/components/admin/flights/participacion-aviones-nota";
import type {
  AvionRepartoDetalle,
  DetalleGastoGrupo,
  DetalleVuelo,
} from "@/types/profit-sharing";

/** Etiquetas es-MX legibles para las categorías de gasto del API. */
const CATEGORIA_LABEL: Record<string, string> = {
  GAS: "Combustible",
  ATERRIZAJE: "Aterrizajes",
  TUAS: "TUAs",
  FBO: "FBO",
  COMIDA: "Comidas",
  HOTEL: "Hotel",
  TAXI: "Taxis",
  REFACCION: "Refacciones",
  PERMISO: "Permisos",
  FIJO: "Fijos",
  OTRO: "Otros",
  OPERACIONES: "Operaciones",
  PILOTO_EXTERNO: "Piloto externo",
  INDIRECTO: "Indirectos",
};

function categoriaLabel(cat: string): string {
  if (CATEGORIA_LABEL[cat]) return CATEGORIA_LABEL[cat];
  // Fallback legible para categorías nuevas: "PISTA_VIP" → "Pista vip".
  const limpio = cat.replaceAll("_", " ").toLowerCase();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

const GRUPO_LABEL: Record<DetalleGastoGrupo, string> = {
  DIRECTO: "Directo",
  INDIRECTO: "Indirecto",
  PERMISO: "Permiso",
  EXCLUIDO: "Excluido",
  FIJO: "Fijo (manual)",
};

const GRUPO_BADGE: Record<DetalleGastoGrupo, string> = {
  DIRECTO: "bg-navy-500/15 text-navy-600 dark:text-navy-300 border-navy-500/30",
  INDIRECTO: "bg-muted text-muted-foreground border-border",
  PERMISO: "bg-brand-600/10 text-brand-600 dark:text-brand-400 border-brand-600/30",
  EXCLUIDO: "border-dashed text-muted-foreground",
  FIJO: "bg-muted text-muted-foreground border-border",
};

/** Estado de cobro derivado: cancelado > bandera cobrado > parcial > pendiente. */
function estadoCobro(v: DetalleVuelo): { label: string; className: string } {
  // Cancelado con dinero real (28-ago): lo cobrado NO se reembolsa y entra
  // al balance; no existe "pendiente" en un cancelado.
  if (v.cancelado) {
    // El API ya solo manda cancelados con dinero retenido; la etiqueta se
    // deriva igual por si llega uno sin cobros (API anterior).
    const retuvo = v.cobrado || v.cobrado_usd > 0 || v.cobros_sin_tc_mxn > 0;
    return {
      label: retuvo ? "Cancelado · cobro retenido" : "Cancelado · sin cobros",
      className: "bg-muted text-muted-foreground border-border",
    };
  }
  if (v.cobrado) {
    return {
      label: "Cobrado",
      className:
        "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    };
  }
  if (v.cobrado_usd > 0) {
    return {
      label: "Parcial",
      className:
        "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    };
  }
  return {
    label: "Pendiente",
    className: "bg-destructive/15 text-destructive border-destructive/30",
  };
}

/**
 * Cifras del vuelo que CUADRAN con la card (venta del avión, sin TUAs/extras/
 * pernocta/comisión/IVA). Tolerante al API previo al 28-ago, que solo manda
 * las cifras brutas del cliente: en ese caso se usan tal cual. En vuelos
 * MULTI-AVIÓN el API ya manda la PARTE de este avión (repartida por tramo).
 */
function cifrasAvion(v: DetalleVuelo) {
  return {
    venta: v.venta_avion_usd ?? v.total_usd,
    cobrado: v.cobrado_avion_usd ?? v.cobrado_usd,
    pendiente: v.pendiente_avion_usd ?? v.pendiente_usd,
  };
}

/** Chip "multi-avión · 50 %" (o "1 de 2 tramos · 50 %") solo en vuelos que
 *  volaron varios aviones: las cifras de la fila son la PARTE de este avión. */
function MultiAvionChip({ v }: { v: DetalleVuelo }) {
  if (!v.multi_avion) return null;
  const pct =
    v.participacion != null ? fmtParticipacionPct(v.participacion) : null;
  const fuente = fuenteParticipacionLabel(v.participacion_fuente);
  return (
    <Badge
      variant="outline"
      className="mt-0.5 h-4 px-1.5 text-[10px] text-muted-foreground"
      title={`Vuelo con varios aviones: la venta del avión, sus cobros y su pendiente se reparten por tramo${fuente ? ` (${fuente})` : ""}. Esta fila es la parte de este avión; los gastos van al avión de su tramo.`}
    >
      {v.tramos_avion?.trim() || "multi-avión"}
      {pct ? ` · ${pct}` : ""}
    </Badge>
  );
}

/** Fecha del vuelo: soporta date-only (sin corrimiento) o timestamptz (Cancún). */
function fmtFechaVuelo(fecha: string | null): string {
  if (!fecha) return "—";
  return fecha.length <= 10 ? fmtDateOnly(fecha) : fmtDate(fecha);
}

/**
 * "Ver desglose" expandible de la card por avión: vuelos del periodo y gastos
 * por categoría. Solo se pinta cuando el API manda `detalle`.
 */
export function DesgloseSection({ detalle }: { detalle: AvionRepartoDetalle }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  // Suma de la VENTA DEL AVIÓN (no del bruto del cliente): así el pie de la
  // tabla cuadra con "Venta del avión cobrada" de la cascada.
  const totalVuelos = detalle.vuelos.reduce(
    (acc, v) => {
      const c = cifrasAvion(v);
      return {
        total: acc.total + c.venta,
        cobrado: acc.cobrado + c.cobrado,
        // Un cancelado no tiene pendiente (lo cobrado es retenido).
        pendiente: acc.pendiente + (v.cancelado ? 0 : c.pendiente),
        otros: acc.otros + (v.otros_ingresos_vuelatour_usd ?? 0),
        otrosPendiente:
          acc.otrosPendiente + (v.otros_ingresos_vuelatour_pendiente_usd ?? 0),
      };
    },
    { total: 0, cobrado: 0, pendiente: 0, otros: 0, otrosPendiente: 0 },
  );
  // Columna "Otros VuelaTour" solo cuando el API ya manda la partición.
  const hayOtros = detalle.vuelos.some(
    (v) => v.otros_ingresos_vuelatour_usd != null,
  );
  const inconsistentes = detalle.vuelos.filter(
    (v) => v.particion_inconsistente,
  ).length;

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
      >
        <span className="inline-flex items-center gap-1.5">
          <ListBulletIcon className="h-4 w-4 text-muted-foreground" />
          Ver desglose del periodo
          <span className="text-muted-foreground font-normal">
            · {detalle.vuelos.length} vuelo(s) ·{" "}
            {detalle.gastos_por_categoria.length} categoría(s) de gasto
          </span>
        </span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <div
        id={panelId}
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-4 pt-3">
            {/* (a) Vuelos del periodo */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold">Vuelos del periodo</p>
              {detalle.vuelos.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Sin vuelos de esta aeronave en el periodo.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Folio</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Ruta</TableHead>
                        <TableHead className="text-right">Venta avión</TableHead>
                        <TableHead className="text-right">Cobrado avión</TableHead>
                        <TableHead className="text-right">Pendiente avión</TableHead>
                        {hayOtros && (
                          <TableHead
                            className="text-right text-muted-foreground"
                            title="Cobrado en el vuelo (TUAs/extras/pernocta/comisión del vendedor + IVA): ingresos de VuelaTour, no se reparten."
                          >
                            Otros VuelaTour
                            <span className="block text-[10px] font-normal">
                              cobrado en el vuelo
                            </span>
                          </TableHead>
                        )}
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalle.vuelos.map((v) => {
                        const estado = estadoCobro(v);
                        const c = cifrasAvion(v);
                        return (
                          <TableRow key={v.id}>
                            <TableCell className="font-mono text-xs">
                              <Link
                                href={`/admin/flights/${v.id}`}
                                className="underline underline-offset-2 hover:text-foreground"
                              >
                                {v.folio != null ? `#${v.folio}` : "s/folio"}
                              </Link>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs">
                              {fmtFechaVuelo(v.fecha)}
                            </TableCell>
                            <TableCell className="max-w-[160px]">
                              <span
                                className="block truncate font-mono text-xs"
                                title={v.ruta}
                              >
                                {v.ruta || "—"}
                              </span>
                              {v.es_externo && (
                                <Badge
                                  variant="outline"
                                  className="mt-0.5 h-4 px-1.5 text-[10px] text-muted-foreground"
                                >
                                  Externo
                                </Badge>
                              )}
                              <MultiAvionChip v={v} />
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              <span className="inline-flex items-center justify-end gap-1">
                                {v.particion_inconsistente && (
                                  <ExclamationTriangleIcon
                                    aria-label="Partición inconsistente"
                                    className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                                  />
                                )}
                                {fmtUsd(c.venta)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {fmtUsd(c.cobrado)}
                              {v.cobros_sin_tc_mxn > 0 && (
                                <span className="block text-[10px] text-amber-600 dark:text-amber-400">
                                  +{fmtDecimal(v.cobros_sin_tc_mxn)} MXN sin TC
                                </span>
                              )}
                              {v.tc_oficial && (
                                <span
                                  className="block text-[10px] font-normal text-sky-700 dark:text-sky-300"
                                  title={`La cotización no trae tipo de cambio: los cobros en MXN se convirtieron con el TC oficial de referencia del ${fmtDateOnly(v.tc_oficial.fecha_dato)} (${v.tc_oficial.fuente}). Capturar el TC en el vuelo o en el cobro lo sustituye.`}
                                >
                                  TC oficial {fmtDecimal(v.tc_oficial.tc, 4)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {v.cancelado ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                fmtUsd(c.pendiente)
                              )}
                            </TableCell>
                            {hayOtros && (
                              <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                {v.otros_ingresos_vuelatour_usd != null
                                  ? fmtUsd(v.otros_ingresos_vuelatour_usd)
                                  : "—"}
                                {(v.otros_ingresos_vuelatour_pendiente_usd ?? 0) > 0 && (
                                  <span className="block text-[10px] text-muted-foreground">
                                    · por cobrar{" "}
                                    {fmtUsd(v.otros_ingresos_vuelatour_pendiente_usd ?? 0)}
                                  </span>
                                )}
                              </TableCell>
                            )}
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`whitespace-nowrap ${estado.className}`}
                                title={
                                  v.cancelado
                                    ? v.cobrado || v.cobrado_usd > 0 || v.cobros_sin_tc_mxn > 0
                                      ? "Vuelo cancelado: lo cobrado no se reembolsa y entra al balance del avión (su parte, si el vuelo fue multi-avión)."
                                      : "Vuelo cancelado sin cobros: no aporta ingreso al reparto."
                                    : undefined
                                }
                              >
                                {estado.label}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={3} className="text-xs font-semibold">
                          Total · {detalle.vuelos.length} vuelo(s)
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold">
                          {fmtUsd(totalVuelos.total)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold">
                          {fmtUsd(totalVuelos.cobrado)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold">
                          {fmtUsd(totalVuelos.pendiente)}
                        </TableCell>
                        {hayOtros && (
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {fmtUsd(totalVuelos.otros)}
                            {totalVuelos.otrosPendiente > 0 && (
                              <span className="block text-[10px] font-normal">
                                · por cobrar {fmtUsd(totalVuelos.otrosPendiente)}
                              </span>
                            )}
                          </TableCell>
                        )}
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              )}
              {inconsistentes > 0 && (
                <p className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                  <ExclamationTriangleIcon className="h-3 w-3 shrink-0" />
                  {inconsistentes} vuelo(s) con partición venta/otros que no
                  cuadra con su total: revisa el desglose de la cotización.
                </p>
              )}
            </div>

            {/* (b) Gastos por categoría */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold">Gastos por categoría</p>
              {detalle.gastos_por_categoria.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Sin gastos de esta aeronave en el periodo.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Categoría</TableHead>
                        <TableHead>Grupo</TableHead>
                        <TableHead className="text-right">#</TableHead>
                        <TableHead className="text-right">USD</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalle.gastos_por_categoria.map((g) => (
                        <TableRow key={`${g.grupo}-${g.categoria}`}>
                          <TableCell className="text-xs">
                            {categoriaLabel(g.categoria)}
                            {g.sin_tc_count > 0 && (
                              <span className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                                <ExclamationTriangleIcon className="h-3 w-3 shrink-0" />
                                {g.sin_tc_count} sin TC ·{" "}
                                {fmtDecimal(g.sin_tc_mxn)} MXN excluidos
                              </span>
                            )}
                            {(g.tc_oficial_count ?? 0) > 0 && (
                              <span
                                className="mt-0.5 block text-[10px] text-sky-700 dark:text-sky-300"
                                title={`${g.tc_oficial_count} gasto(s) en MXN sin tipo de cambio capturado (${fmtDecimal(g.tc_oficial_mxn ?? 0)} MXN) se convirtieron con el TC oficial de referencia del día del gasto (open.er-api / BCE); ya están en el monto USD.`}
                              >
                                {g.tc_oficial_count} con TC oficial
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={GRUPO_BADGE[g.grupo]}
                              title={
                                g.grupo === "EXCLUIDO"
                                  ? "No entra al saldo del avión (fijo prorrateado aparte o sin conversión)"
                                  : undefined
                              }
                            >
                              {GRUPO_LABEL[g.grupo]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {g.count}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {fmtUsd(g.usd)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
