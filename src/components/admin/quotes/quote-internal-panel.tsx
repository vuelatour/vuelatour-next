"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { UseFormRegister, UseFormSetValue } from "react-hook-form";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Field } from "@/components/admin/form-field";
import { FechaHoraCampo } from "@/components/admin/fecha-hora-campo";
import { AirportQuickCreateButton } from "@/components/admin/airports/airport-quick-create-button";
import { MonedaSelect } from "@/components/admin/quotes/moneda-select";
import { QuoteDesgloseCard } from "@/components/admin/quotes/quote-desglose-card";
import type { RutaSugerida } from "@/app/admin/quotes/actions";
import { textoCantidadUnitario } from "@/lib/admin/extras";
import { METODOS_PAGO, metodoPagoLabel } from "@/lib/admin/metodos-pago";
import { fmtDecimal, fmtMxn, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Airport } from "@/types/airports";
import type { EscalaInput, MetodoPago, QuoteBreakdown, TipoTarifa } from "@/types/quote";
import type { PersistedQuote } from "@/types/quotes-persisted";
import type {
  AircraftOption,
  AirportOption,
  ClientOption,
  OpsLegForm,
  QuoteFormValues,
  RouteOption,
} from "./quote-form-types";

/**
 * PANEL LATERAL «Interno · no se imprime» (ensamble form-as-document,
 * 8-sep-2026): todo lo que produce números o decide la operación SIN
 * imprimirse en la hoja vive aquí, a la DERECHA del papel y colapsable
 * (botón «Interno» en el borde; cerrado por defecto con memoria por usuario
 * `vt-cotizador-interno-v1`, que administra el cotizador). Nunca dentro del
 * papel: tarifa (tipo/manual), sobrevuelo, cobrable pactado, comisión del
 * vendedor, método de pago/IVA, BillPocket %, redondeo, cotización abierta,
 * pase de abordar, switch de TUAS, operador externo y costo, ruta operativa
 * (alta), plantilla de ruta, notas internas, toggles del PDF y el detalle
 * del cálculo.
 *
 * El panel NO calcula dinero: pinta `values` (RHF) y `breakdown` (motor) y
 * escribe con `setValue`/`register` del cotizador — el código es el del
 * antiguo bloque interno del cotizador, movido tal cual.
 */
export interface QuoteInternalPanelProps {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  lectura: boolean;
  isRevise: boolean;
  initialQuote?: PersistedQuote;
  values: QuoteFormValues;
  setValue: UseFormSetValue<QuoteFormValues>;
  register: UseFormRegister<QuoteFormValues>;
  breakdown: QuoteBreakdown | null;
  loading: boolean;
  error: string | null;
  /** Hay payload completo para el motor (aeronave, tramos con millas, pax). */
  hayPayload: boolean;
  selectedAircraft?: AircraftOption;
  clienteInterno: boolean;
  /** «PUBLICO» | «BROKER» | «CUSTOM» (segmento de tarifa). */
  tarifaSegment: string;
  overrideTarifaActivo: boolean;
  setTarifaCustom: (v: boolean) => void;
  costoExternoMxnSinTc: boolean;
  /** Lleva al T.C. del desglose de la hoja. */
  focusTc: () => void;
  /** «Cotizado en: Piper Seneca V» (modelo, nunca matrícula). */
  cotizadoEnTexto: string | null;
  /** Abre la confirmación «Poner todo en $0» (cliente interno). */
  onPonerTodoEnCero: () => void;
  airports: AirportOption[];
  onAeropuertoCreado: (a: Airport) => void;
  /** Avisos del cotizador (capacidad, ancla CUN, millas en 0…): nunca se esconden. */
  avisos: string[];
  /** Alta: clientes frecuentes + «Nuevo cliente». */
  captura?: {
    clientes: ClientOption[];
    frecuentes: string[];
    onNuevoCliente: () => void;
  };
  /** Edición: plantilla de ruta del catálogo («Suele pedir», ruta guardada, crear/guardar). */
  plantilla?: {
    rutas: RouteOption[];
    sugeridas: RutaSugerida[];
    onAplicarSugerencia: (s: RutaSugerida) => void;
    onSeleccionarRuta: (id: string) => void;
    onCrearRuta: () => void;
    onGuardarComoRuta: () => void;
    savingRoute: boolean;
  };
  rutaSeleccionada?: RouteOption;
  itinerarioAjustado: boolean;
  /** Revisión con itinerario operativo: «Cotizar con estos tramos». */
  operativa?: {
    opsComoEscalas: () => EscalaInput[];
    onAplicar: (legs: EscalaInput[]) => void;
    legsSignature: (legs: EscalaInput[]) => string;
  };
  /** Leyenda de los toggles de PDF por tramo (revisión). */
  notaTramos?: ReactNode;
  /** Revisión: se cambiaron los tramos y los toggles del PDF esperan al guardado. */
  avisoTramosCambiaron?: boolean;
  className?: string;
}

type SubId = "externo" | "operativa" | "detalle";

export function QuoteInternalPanel(props: QuoteInternalPanelProps) {
  const {
    abierto,
    onAbiertoChange,
    lectura,
    isRevise,
    initialQuote,
    values,
    setValue,
    register,
    breakdown,
    loading,
    error,
    hayPayload,
    selectedAircraft,
    clienteInterno,
    tarifaSegment,
    overrideTarifaActivo,
    setTarifaCustom,
    costoExternoMxnSinTc,
    focusTc,
    cotizadoEnTexto,
    onPonerTodoEnCero,
    airports,
    onAeropuertoCreado,
    avisos,
    captura,
    plantilla,
    rutaSeleccionada,
    itinerarioAjustado,
    operativa,
    notaTramos,
    avisoTramosCambiaron = false,
    className,
  } = props;

  // Sub-bloques plegables (externo, ruta operativa, detalle del cálculo):
  // estado de sesión (sin storage: la clave vt-cotizador-plegado-v2 se retiró
  // con las tarjetas del documento). En revisión el externo solo se pinta si
  // el vuelo es externo: abierto.
  const [subAbierto, setSubAbierto] = useState<Record<SubId, boolean>>({
    externo: isRevise,
    operativa: false,
    detalle: false,
  });
  const toggleSub = (id: SubId) => setSubAbierto((prev) => ({ ...prev, [id]: !prev[id] }));
  // Al prender «cubierto por externo» (switch o borrador ?d= restaurado) el
  // sub-bloque se auto-abre: sus campos requeridos no deben quedar
  // escondidos. Patrón "estado derivado durante el render" (react.dev), sin
  // efecto extra.
  const [externoPrev, setExternoPrev] = useState(values.es_externo);
  if (externoPrev !== values.es_externo) {
    setExternoPrev(values.es_externo);
    if (!isRevise && values.es_externo && !subAbierto.externo) {
      setSubAbierto((prev) => ({ ...prev, externo: true }));
    }
  }

  // Confirmación de "Cotizar con estos tramos" (pisa los tramos capturados).
  const [opsATramosOpen, setOpsATramosOpen] = useState(false);

  // Ruta operativa (solo alta) — mismos nombres de antes sobre RHF.
  const opsLegs = values.escalas_operacion ?? [];
  const setOpsLegs = (upd: OpsLegForm[] | ((prev: OpsLegForm[]) => OpsLegForm[])) =>
    setValue(
      "escalas_operacion",
      typeof upd === "function" ? upd(values.escalas_operacion ?? []) : upd,
      { shouldDirty: true },
    );

  const tipoTarifa = values.tipo_tarifa;
  // Texto para el operador (sin jerga): «manual» en vez de «override».
  const origenTarifaResumen = breakdown
    ? breakdown.tarifa.proviene_de_override
      ? "manual"
      : breakdown.tarifa.preferencial_cliente
        ? "pactada"
        : breakdown.tarifa.tipo === "BROKER"
          ? "broker"
          : "público"
    : null;

  // Margen informativo del vuelo externo. Costo MXN: se convierte con el TC
  // capturado; sin TC no hay margen que mostrar (el candado
  // costoExternoMxnSinTc ya bloquea guardar).
  const costoExtNativo = Number(values.costo_externo_monto) || 0;
  const costoExtEsMxn = values.costo_externo_moneda === "MXN";
  const costoExtTc = Number(values.tc_usd_mxn) || 0;
  const costoExtUsd = costoExtEsMxn
    ? costoExtTc > 0
      ? Math.round((costoExtNativo / costoExtTc) * 100) / 100
      : 0
    : costoExtNativo;
  // El total del preview YA incluye un pactado legado rehidratado (el motor
  // aterriza ahí): el precio al cliente es siempre el total calculado.
  const precioClienteUsd = Number(breakdown?.totales.total_usd) || 0;
  const margenExternoUsd =
    costoExtUsd > 0 && precioClienteUsd > 0
      ? Math.round((precioClienteUsd - costoExtUsd) * 100) / 100
      : null;

  // Etiqueta del método (fuente única `metodoPagoLabel`: OTRO → «Otro (x)»).
  const metodoPagoTexto = metodoPagoLabel(values.metodo_pago, values.metodo_pago_detalle);

  const resumenExterno = values.es_externo
    ? [
        `Cubierto por ${values.operador_externo.trim() || "(sin operador)"}`,
        costoExtNativo > 0
          ? `costo ${costoExtEsMxn ? fmtMxn(costoExtNativo) : fmtUsd(costoExtNativo)}`
          : "sin costo capturado",
        margenExternoUsd != null ? `margen ${fmtUsd(margenExternoUsd)}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Vuelo con avión propio — ábrela si lo cubre otro operador";

  const resumenOperativa =
    opsLegs.length === 0
      ? "Vacía = usa la ruta comercial"
      : [
          [opsLegs[0].origen, ...opsLegs.map((l) => l.destino)].filter(Boolean).join(" → "),
          `${opsLegs.length} ${opsLegs.length === 1 ? "tramo" : "tramos"}`,
        ].join(" · ");

  const resumenDetalle = breakdown
    ? [
        cotizadoEnTexto?.replace(/^Cotizado en: /, "") ?? null,
        `Subtotal ${fmtUsd(breakdown.totales.subtotal_vuelo_usd)}`,
        `IVA ${fmtUsd(breakdown.totales.iva_usd)}`,
        `${fmtDecimal(breakdown.tiempos.cobrable_hr)} hr`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Se llena al calcular";

  const avisoExterno = costoExternoMxnSinTc
    ? "Costo MXN sin TC"
    : margenExternoUsd != null && margenExternoUsd < 0
      ? "Margen negativo"
      : null;
  const avisoDetalle = error ? "Error al calcular" : null;
  const avisosTodos = [...avisos, avisoExterno, avisoDetalle].filter((a): a is string => !!a);

  // «Servicio aéreo» tal como se IMPRIME: el API absorbe ahí el redondeo
  // (> 0) y la comisión del vendedor (misma composición que
  // quotes-pdf.service: subtotal_vuelo + ajuste>0 + Σ COMISION_VENDEDOR).
  const comisionAbsorbidaUsd = breakdown
    ? (() => {
        const lineas = (breakdown.desglose ?? []).filter((d) => d.clave === "COMISION_VENDEDOR");
        if (lineas.length > 0) {
          return lineas.reduce((acc, d) => acc + (Number(d.monto_usd) || 0), 0);
        }
        return Number(breakdown.meta?.comision_vendedor_usd) || 0;
      })()
    : 0;
  const redondeoAbsorbidoUsd = Math.max(0, Number(breakdown?.totales.ajuste_final_usd) || 0);
  const servicioAereoImpresoUsd = breakdown
    ? Math.round(
        (Number(breakdown.totales.subtotal_vuelo_usd) + redondeoAbsorbidoUsd + comisionAbsorbidaUsd) *
          100,
      ) / 100
    : null;

  // ===== Nodos compartidos entre EDICIÓN y LECTURA =====
  const sobrevueloAporteNode =
    breakdown && Number(breakdown.tiempos.sobrevuelo_hr) > 0
      ? (() => {
          // Aporte REAL: la parte del sobrevuelo absorbida por la hora
          // mínima no suma (0.7 + 0.5 hr cobra 1.2 → solo 0.2 hr son del
          // sobrevuelo). min(sob, cobrable − 1).
          const sob = Number(breakdown.tiempos.sobrevuelo_hr);
          const deltaHr = Math.min(sob, Math.max(0, breakdown.tiempos.cobrable_hr - 1));
          if (deltaHr <= 0) {
            return (
              <p className="text-xs text-muted-foreground mt-1">
                Queda dentro de la hora mínima: no suma al total.
              </p>
            );
          }
          return (
            <AporteChip
              usd={deltaHr * breakdown.tarifa.usd_por_hora}
              nota={`${fmtDecimal(deltaHr, 2)} hr × ${fmtUsd(breakdown.tarifa.usd_por_hora)}/hr`}
            />
          );
        })()
      : null;

  const cierreResumenNode =
    breakdown &&
    ((breakdown.totales.ajuste_final_usd ?? 0) !== 0 || (Number(values.descuento_usd) || 0) > 0)
      ? (() => {
          const cotizado = breakdown.totales.total_usd - (breakdown.totales.ajuste_final_usd ?? 0);
          const descuento = Number(values.descuento_usd) || 0;
          // Con auto: el redondeo real lo reporta el motor; manual: lo del campo.
          const redondeo = values.redondeo_auto
            ? (breakdown.meta?.redondeo_auto_usd ?? 0)
            : Number(values.redondeo_usd) || 0;
          return (
            <div className="rounded-md border border-border bg-navy-800/50 px-3 py-2 text-sm space-y-0.5">
              <div className="flex justify-between text-muted-foreground">
                <span>Cotizado</span>
                <span className="font-mono text-foreground">{fmtUsd(cotizado)}</span>
              </div>
              {redondeo > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>+ Redondeo</span>
                  <span className="font-mono text-foreground">{fmtUsd(redondeo)}</span>
                </div>
              )}
              {descuento > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>− Descuento</span>
                  <span className="font-mono text-foreground">−{fmtUsd(descuento)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-1 font-semibold">
                <span>Total a cobrar</span>
                <span className="font-mono">{fmtUsd(breakdown.totales.total_usd)}</span>
              </div>
            </div>
          );
        })()
      : null;

  // Margen = lo que paga el cliente − lo que cobra el operador externo (solo
  // informativo; el API es la fuente).
  const margenExternoNode =
    margenExternoUsd != null ? (
      <p
        className={`text-xs ${margenExternoUsd < 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}
      >
        Margen VuelaTour: {fmtUsd(precioClienteUsd)} al cliente − {fmtUsd(costoExtUsd)} del
        operador externo
        {costoExtEsMxn && (
          <span className="font-mono">
            {" "}
            ({fmtMxn(costoExtNativo)} ÷ tc {fmtDecimal(costoExtTc, 4)})
          </span>
        )}{" "}
        = <span className="font-mono font-semibold">{fmtUsd(margenExternoUsd)}</span>
        {margenExternoUsd < 0 && " · el costo supera el precio al cliente"}
      </p>
    ) : null;

  // Ruta OPERATIVA en LECTURA (la card azul que vivía en el detalle): la
  // vuela el piloto y es distinta de la comercial cuando el vuelo salió de
  // otra base o lleva ferries. Los tramos operativos se editan en el vuelo.
  const escalasOperativas = initialQuote?.escalas ?? [];
  const rutaOperativaLectura =
    lectura &&
    initialQuote &&
    escalasOperativas.length > 0 &&
    (initialQuote.itinerario_operativo === true ||
      escalasOperativas.some((e) => e.solo_operativa || e.es_ferry)) ? (
      <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
          Ruta operativa (la vuela el piloto — no se cotiza)
        </p>
        <ol className="mt-1.5 space-y-1">
          {[...escalasOperativas]
            .sort((a, b) => a.orden - b.orden)
            .map((esc) => (
              <li key={esc.id} className="flex items-center gap-2 text-xs font-mono">
                <span className="text-muted-foreground">{esc.orden}.</span>
                {esc.origen_iata} → {esc.destino_iata}
                {esc.es_ferry && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    ferry
                  </Badge>
                )}
                {esc.solo_operativa && (
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 py-0 border-sky-500/40 text-sky-600 dark:text-sky-400"
                  >
                    operativo
                  </Badge>
                )}
                {esc.cancelada_at && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">
                    cancelado
                  </Badge>
                )}
              </li>
            ))}
        </ol>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          La hoja lleva la ruta COMERCIAL (lo que paga el cliente, abre y cierra en CUN). Los
          tramos operativos se editan en el detalle del vuelo.
        </p>
      </div>
    ) : null;

  // Comisión del vendedor en LECTURA: modalidad + monto/tarifa + quién
  // vendió; el efectivo POR_HORA lo manda el motor en meta (fuente única).
  const comisionVendedorTexto = (() => {
    const nombre = values.comision_vendedor_nombre?.trim() ?? "";
    const sufijo = nombre ? ` · ${nombre}` : "";
    if (values.comision_vendedor_modo === "POR_HORA") {
      if (!(Number(values.comision_vendedor_tarifa_hr) > 0)) return "—";
      const efectiva = breakdown?.meta?.comision_vendedor_usd;
      return `${fmtUsd(Number(values.comision_vendedor_tarifa_hr))}/hr × horas cobradas${
        efectiva ? ` = ${fmtUsd(efectiva)}` : ""
      }${sufijo}`;
    }
    if (!(Number(values.comision_vendedor_usd) > 0)) return "—";
    return `${fmtUsd(Number(values.comision_vendedor_usd))} (monto fijo)${sufijo}`;
  })();

  const titulo = "Interno · no se imprime";

  // ===== Cerrado: botón en el borde derecho (vertical en ≥xl; barra en menores) =====
  if (!abierto) {
    return (
      <aside className={cn("min-w-0 xl:w-10 xl:sticky xl:top-[4.5rem]", className)} aria-label={titulo}>
        <button
          type="button"
          onClick={() => onAbiertoChange(true)}
          data-guard-exempt
          aria-expanded={false}
          title="Abrir el panel interno (tarifa, cobro, externo, detalle del cálculo)"
          className={cn(
            "flex w-full items-center gap-2 rounded-lg border border-dashed border-muted-foreground/40 bg-muted/20 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground",
            "xl:h-56 xl:w-10 xl:flex-col xl:justify-center xl:px-0 xl:py-3",
          )}
        >
          <ChevronLeftIcon className="hidden h-4 w-4 xl:block" />
          <span className="xl:[writing-mode:vertical-rl] xl:rotate-180 xl:tracking-wider xl:uppercase">
            {titulo}
          </span>
          {avisosTodos.length > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 xl:px-1"
              title={avisosTodos.join(" · ")}
            >
              <ExclamationTriangleIcon className="h-3 w-3" />
              {avisosTodos.length}
            </span>
          )}
          <ChevronRightIcon className="ml-auto h-4 w-4 xl:hidden" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      id="panel-interno"
      className={cn(
        "min-w-0 rounded-xl border border-dashed border-muted-foreground/40 bg-muted/20 xl:w-[24rem] xl:sticky xl:top-[4.5rem] xl:max-h-[calc(100vh-5.5rem)] xl:overflow-y-auto",
        className,
      )}
      aria-label={titulo}
    >
      {/* Banda: marca todo el panel como NO impreso. */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-dashed border-muted-foreground/40 bg-muted/60 px-3 py-2 backdrop-blur">
        {lectura && <LockClosedIcon className="h-3.5 w-3.5 text-muted-foreground" aria-label="Bloqueada" />}
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">{titulo}</span>
        <button
          type="button"
          onClick={() => onAbiertoChange(false)}
          data-guard-exempt
          aria-expanded
          aria-controls="panel-interno"
          title="Cerrar el panel interno"
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 px-3 py-3">
        {/* Avisos ámbar: un warning JAMÁS se esconde. */}
        {avisosTodos.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {avisosTodos.map((a) => (
              <Badge
                key={a}
                variant="outline"
                className="border-amber-500/50 bg-amber-500/15 text-[10px] text-amber-600 dark:text-amber-400"
              >
                {a}
              </Badge>
            ))}
          </div>
        )}

        {/* --- CAPTURA RÁPIDA (alta): clientes frecuentes --- */}
        {captura && !lectura && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
              Cliente
            </p>
            {(() => {
              const sel = captura.clientes.find((c) => c.id === values.cliente_id);
              if (!sel) return null;
              return (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{sel.nombre}</span>
                  {" · "}
                  {[
                    sel.es_interno ? "Interno · operación propia" : null,
                    sel.es_broker ? "Broker · tarifa broker" : null,
                    sel.rfc,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Cliente directo"}
                </p>
              );
            })()}
            <div className="flex flex-wrap items-center gap-1.5">
              {captura.frecuentes.length > 0 && (
                <span className="text-[11px] uppercase tracking-wider text-foreground/70">Frecuentes:</span>
              )}
              {captura.frecuentes
                .map((id) => captura.clientes.find((c) => c.id === id))
                .filter((c): c is ClientOption => !!c)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={values.cliente_id === c.id}
                    onClick={() => {
                      setValue("cliente_id", c.id, { shouldDirty: true });
                      if (c.es_broker) setValue("tipo_tarifa", "BROKER");
                    }}
                    className={cn(
                      "max-w-[12rem] truncate rounded-full border px-2.5 py-1 text-xs transition-colors",
                      values.cliente_id === c.id
                        ? "border-brand-500 bg-brand-500/15 font-medium text-brand-600 dark:text-brand-400"
                        : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                    )}
                  >
                    {c.nombre}
                  </button>
                ))}
              <button
                type="button"
                onClick={captura.onNuevoCliente}
                className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand-500/60 hover:text-brand-600"
              >
                + Nuevo cliente
              </button>
            </div>
          </div>
        )}

        {/* --- CLIENTE INTERNO: todo en $0 --- */}
        {clienteInterno && !lectura && (
          <div className="rounded-md border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-xs text-sky-700 dark:text-sky-400 space-y-2">
            <p>Cliente interno — la cotización puede ir en $0 (vuelo de la empresa, sin cobro).</p>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onPonerTodoEnCero}>
              Poner todo en $0
            </Button>
          </div>
        )}
        {clienteInterno && lectura && (
          <p className="text-xs text-muted-foreground">Cliente interno (operación propia: puede ir en $0).</p>
        )}

        {/* --- PLANTILLA DE RUTA (catálogo) --- */}
        {lectura ? (
          <Dato
            label="Plantilla (ruta guardada)"
            value={rutaSeleccionada ? rutaPathTexto(rutaSeleccionada) : "Itinerario propio (sin ruta del catálogo)"}
            hint={
              rutaSeleccionada && itinerarioAjustado
                ? "El itinerario de esta cotización difiere de la ruta guardada."
                : undefined
            }
          />
        ) : (
          plantilla && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
                Plantilla de ruta
              </p>
              {plantilla.sugeridas.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] uppercase tracking-wider text-foreground/70">Suele pedir:</span>
                  {plantilla.sugeridas.map((s) => {
                    const activa =
                      values.escalas.length > 0 &&
                      s.clave === values.escalas.map((l) => `${l.origen_iata}-${l.destino_iata}`).join("|");
                    return (
                      <button
                        key={s.clave}
                        type="button"
                        aria-pressed={activa}
                        onClick={() => plantilla.onAplicarSugerencia(s)}
                        title={
                          s.ultima_fecha
                            ? `Última vez: ${new Date(s.ultima_fecha).toLocaleDateString("es-MX", { dateStyle: "medium" })}`
                            : undefined
                        }
                        className={cn(
                          "max-w-[16rem] truncate rounded-full border px-2.5 py-1 font-mono text-xs transition-colors",
                          activa
                            ? "border-brand-500 bg-brand-500/15 font-medium text-brand-600 dark:text-brand-400"
                            : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                        )}
                      >
                        {s.etiqueta}
                        {s.veces > 1 && <span className="ml-1 opacity-70">×{s.veces}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              <SearchableSelect
                options={plantilla.rutas.map((r) => ({
                  value: r.id,
                  label: rutaPathTexto(r),
                  description: `${r.millas_nauticas} NM · ${r.tramos.length} ${
                    r.tramos.length === 1 ? "tramo" : "tramos"
                  }`,
                }))}
                value={values.ruta_id}
                onChange={plantilla.onSeleccionarRuta}
                placeholder="Plantilla: ruta guardada del catálogo"
                emptyText="Sin rutas — créala aquí"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={plantilla.onCrearRuta}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-600/80 transition-colors"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Crear ruta
                </button>
                {itinerarioAjustado && values.escalas.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={plantilla.onGuardarComoRuta}
                    disabled={plantilla.savingRoute}
                    className="h-7 text-xs"
                    title="Este itinerario difiere de la ruta guardada: guárdalo en el catálogo (la original no se toca)."
                  >
                    {plantilla.savingRoute ? "Guardando…" : "Guardar como nueva ruta"}
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Los tramos se editan en la hoja (itinerario): la plantilla solo los carga como punto de
                partida.
              </p>
            </div>
          )
        )}

        {/* --- RUTA OPERATIVA del vuelo (revisión con itinerario operativo) --- */}
        {rutaOperativaLectura}
        {!lectura && operativa && initialQuote?.itinerario_operativo && (
          <div className="rounded-lg border border-sky-500/40 bg-sky-500/15 p-3 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">
                RUTA OPERATIVA (la vuela el piloto — aquí no se cotiza)
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={operativa.opsComoEscalas().length === 0}
                title="Copia origen→destino de los tramos operativos como punto de partida de la cotización. Los pax se capturan en la hoja, no se copian."
                onClick={() => {
                  const nuevos = operativa.opsComoEscalas();
                  if (
                    values.escalas.length > 0 &&
                    operativa.legsSignature(values.escalas) !== operativa.legsSignature(nuevos)
                  ) {
                    setOpsATramosOpen(true);
                  } else {
                    operativa.onAplicar(nuevos);
                  }
                }}
              >
                Cotizar con estos tramos
              </Button>
            </div>
            <p className="font-mono text-sm">
              {(() => {
                const ops = initialQuote.escalas ?? [];
                if (ops.length === 0) return "—";
                return [ops[0].origen_iata, ...ops.map((e) => e.destino_iata)].join(" → ");
              })()}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {(initialQuote.escalas ?? [])
                .map((e, i) => (e.es_ferry || e.solo_operativa ? `T${i + 1} ferry` : null))
                .filter(Boolean)
                .join(" · ") || "Todos los tramos con pasajeros"}
              {" · "}El itinerario de la hoja es la ruta COMERCIAL (lo que paga el cliente, abre y
              cierra en CUN); la operativa no se toca al cotizar.
            </p>
            <AlertDialog open={opsATramosOpen} onOpenChange={setOpsATramosOpen}>
              <AlertDialogContent data-guard-exempt>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Reemplazar los tramos capturados?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Los tramos de la cotización se sustituyen por los de la ruta operativa (sin
                    pasajeros: esos se capturan en la hoja). El total se recalcula en vivo.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      operativa.onAplicar(operativa.opsComoEscalas());
                      setOpsATramosOpen(false);
                    }}
                  >
                    Reemplazar tramos
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* --- TARIFA Y HORAS --- */}
        <div className="space-y-3 border-t border-border pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
            Tarifa y horas
          </p>
          {lectura ? (
            <>
              <Dato
                label="Tipo de tarifa"
                value={
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">
                      {tarifaSegment === "CUSTOM"
                        ? "Personalizada"
                        : tipoTarifa === "BROKER"
                          ? "Broker"
                          : "Público"}
                    </Badge>
                    {breakdown ? (
                      <span className="font-mono">{fmtUsd(breakdown.tarifa.usd_por_hora)}/hr</span>
                    ) : Number(initialQuote?.tarifa_hora_usd) > 0 ? (
                      <span className="font-mono">{fmtUsd(Number(initialQuote!.tarifa_hora_usd))}/hr</span>
                    ) : null}
                    {origenTarifaResumen && (
                      <span className="text-xs text-muted-foreground">· {origenTarifaResumen}</span>
                    )}
                  </span>
                }
                hint={
                  tarifaSegment === "CUSTOM"
                    ? "Tarifa ajustada SOLO para esta cotización (no cambia la tarifa del cliente)."
                    : breakdown?.tarifa.preferencial_cliente
                      ? "Tarifa pactada con este cliente para este avión."
                      : selectedAircraft
                        ? `Tarifa público ${fmtUsd(selectedAircraft.tarifa_hora_pub_usd)} / hr · broker ${fmtUsd(selectedAircraft.tarifa_hora_broker_usd)} / hr`
                        : undefined
                }
              />
              <HorasPorTramo breakdown={breakdown} lectura />
              <div className="grid grid-cols-2 gap-3">
                <Dato
                  label="Sobrevuelo (hr)"
                  value={
                    Number(values.sobrevuelo_hr) > 0 ? `${fmtDecimal(Number(values.sobrevuelo_hr))} hr` : "—"
                  }
                  hint={
                    <>
                      Tiempo extra sobre la zona; se suma al cobrable
                      {sobrevueloAporteNode}
                    </>
                  }
                />
                <Dato
                  label="Tiempo cobrable"
                  value={
                    breakdown
                      ? `${fmtDecimal(breakdown.tiempos.cobrable_hr, 4)} hr`
                      : Number(initialQuote?.tiempo_cobrable_hr) > 0
                        ? `${fmtDecimal(Number(initialQuote!.tiempo_cobrable_hr), 4)} hr`
                        : "—"
                  }
                  hint={
                    breakdown?.tiempos.cobrable_proviene_de_override
                      ? "Pactado a mano"
                      : breakdown?.tiempos.minimo_hora_aplicado
                        ? "Vuelo corto: se cobra la hora completa (mínimo 1 hr)"
                        : breakdown
                          ? `Vuelo ${fmtDecimal(breakdown.tiempos.vuelo_hr, 2)} + calzos ${fmtDecimal(breakdown.tiempos.calzos_hr, 2)} hr`
                          : undefined
                  }
                />
              </div>
              {values.es_externo && (
                <p className="text-xs text-muted-foreground">
                  Vuelo externo: el avión cotizado es solo la referencia de tarifa — el vuelo no lo opera la
                  flota.
                </p>
              )}
            </>
          ) : (
            <>
              <div id="tarifa-tipo-field" className="scroll-mt-24 space-y-2">
                <Label className="text-sm font-medium">Tipo de tarifa</Label>
                <Segmented
                  value={tarifaSegment}
                  onChange={(v) => {
                    if (v === "CUSTOM") {
                      setTarifaCustom(true);
                      return;
                    }
                    setTarifaCustom(false);
                    // Volver a la tarifa estándar LIMPIA el override: si no,
                    // seguiría mandando sobre Público/Broker en silencio.
                    setValue("tarifa_hora_override_usd", null);
                    setValue("tipo_tarifa", v as TipoTarifa);
                  }}
                  options={[
                    {
                      value: "PUBLICO",
                      label: "Pública",
                      sub: tarifaSub(selectedAircraft?.tarifa_hora_pub_usd),
                    },
                    {
                      value: "BROKER",
                      label: "Broker",
                      sub: tarifaSub(selectedAircraft?.tarifa_hora_broker_usd),
                    },
                    {
                      value: "CUSTOM",
                      label: "Personalizada",
                      sub: overrideTarifaActivo ? tarifaSub(values.tarifa_hora_override_usd) : undefined,
                    },
                  ]}
                />
                {breakdown && (
                  <p className="text-xs text-muted-foreground">
                    Aplica{" "}
                    <span className="font-mono font-semibold text-foreground">
                      {fmtUsd(breakdown.tarifa.usd_por_hora)}/hr
                    </span>{" "}
                    <span
                      className={
                        breakdown.tarifa.proviene_de_override
                          ? "text-amber-600 dark:text-amber-400"
                          : breakdown.tarifa.preferencial_cliente
                            ? "text-emerald-600 dark:text-emerald-400"
                            : undefined
                      }
                    >
                      {breakdown.tarifa.proviene_de_override
                        ? "· cambiada SOLO para esta cotización"
                        : breakdown.tarifa.preferencial_cliente
                          ? "· tarifa pactada con este cliente"
                          : `· tarifa ${breakdown.tarifa.tipo === "PUBLICO" ? "pública" : "broker"} del avión`}
                    </span>
                  </p>
                )}
                {selectedAircraft && (
                  <p className="text-[11px] text-muted-foreground">
                    {selectedAircraft.matricula} — {selectedAircraft.modelo} · pública{" "}
                    {fmtUsd(selectedAircraft.tarifa_hora_pub_usd)}/hr · broker{" "}
                    {fmtUsd(selectedAircraft.tarifa_hora_broker_usd)}/hr
                    {values.es_externo ? " · referencia de tarifa (vuelo externo)" : ""}
                  </p>
                )}
                {tarifaSegment === "CUSTOM" && (
                  <div id="tarifa-override-field" className="scroll-mt-24">
                    <Field
                      label="$/hr — SOLO esta cotización"
                      hint={
                        clienteInterno
                          ? "Cliente interno: puedes poner 0 para cotizar sin cobro. Vacío = la pactada del cliente o la del avión."
                          : "Vacío = la pactada del cliente o la del avión. No cambia la tarifa del cliente."
                      }
                    >
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        placeholder="Auto"
                        className="w-36 font-mono"
                        {...register("tarifa_hora_override_usd")}
                      />
                    </Field>
                  </div>
                )}
              </div>
              {/* Horas POR TRAMO (solo lectura) arriba de sobrevuelo/cobrable:
                  aquí se ve de dónde sale el total que se pacta abajo. */}
              <HorasPorTramo breakdown={breakdown} lectura={false} />
              <div className="grid grid-cols-2 gap-3">
                {/* Ancla `sobrevuelo-field` (atajo desde la hoja). */}
                <div id="sobrevuelo-field" className="scroll-mt-24">
                  <Field label="Sobrevuelo (hr)" hint="Tiempo extra sobre la zona; se suma al cobrable">
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      max={24}
                      placeholder="0"
                      className="font-mono"
                      {...register("sobrevuelo_hr")}
                    />
                    {sobrevueloAporteNode}
                  </Field>
                </div>
                {/* COBRABLE pactado: la suma final de horas (vacío = regla,
                    mínimo 1 hr). Ancla `cobrable-field`. */}
                <div id="cobrable-field" className="scroll-mt-24">
                  <Field
                    label="Cobrable pactado (hr)"
                    hint={
                      breakdown
                        ? breakdown.tiempos.cobrable_proviene_de_override
                          ? `Pactado a mano · la regla daría ${fmtDecimal(breakdown.tiempos.cobrable_hr_regla ?? 0, 4)} hr`
                          : `Vuelo ${fmtDecimal(breakdown.tiempos.vuelo_hr, 2)} · calzos ${fmtDecimal(breakdown.tiempos.calzos_hr, 2)}${
                              Number(breakdown.tiempos.sobrevuelo_hr) > 0
                                ? ` · sobrevuelo ${fmtDecimal(breakdown.tiempos.sobrevuelo_hr!, 2)}`
                                : ""
                            } · vacío = regla (mínimo 1 hr)`
                        : "Vacío = regla (vuelo + calzos + sobrevuelo, mínimo 1 hr)"
                    }
                  >
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      max={48}
                      placeholder={
                        breakdown
                          ? fmtDecimal(breakdown.tiempos.cobrable_hr_regla ?? breakdown.tiempos.cobrable_hr, 4)
                          : "Auto"
                      }
                      className="font-mono"
                      value={values.tiempo_cobrable_override_hr ?? ""}
                      onChange={(e) =>
                        setValue(
                          "tiempo_cobrable_override_hr",
                          e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                        )
                      }
                    />
                  </Field>
                </div>
              </div>
              {breakdown?.tiempos.cobrable_proviene_de_override &&
                Number(breakdown.tiempos.cobrable_hr) <
                  Number(breakdown.tiempos.vuelo_hr) +
                    Number(breakdown.tiempos.calzos_hr) +
                    Number(breakdown.tiempos.sobrevuelo_hr ?? 0) && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Ojo: el cobrable pactado es MENOR al tiempo real (vuelo + calzos): se cobraría de
                    menos.
                  </p>
                )}
              {breakdown?.tiempos.minimo_hora_aplicado && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Vuelo corto: se cobra la hora completa (mínimo 1 hr). Escribe otro valor en Cobrable
                  si quieres pactarlo distinto.
                </p>
              )}
            </>
          )}
        </div>

        {/* --- COMISIÓN DEL VENDEDOR --- */}
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
            Comisión del vendedor
          </p>
          {lectura ? (
            <Dato
              label="Comisión (interna)"
              value={comisionVendedorTexto}
              hint={
                <>
                  Se SUMA al precio del cliente · no aparece en el PDF.
                  {breakdown?.meta?.comision_vendedor_usd && breakdown.meta.neto_vuelatour_usd != null ? (
                    <span className="block font-mono">
                      Neto VuelaTour: {fmtUsd(breakdown.meta.neto_vuelatour_usd)}
                    </span>
                  ) : null}
                </>
              }
            />
          ) : (
            <div className="space-y-2">
              <div className="w-56">
                <Segmented
                  value={values.comision_vendedor_modo}
                  onChange={(v) => setValue("comision_vendedor_modo", v === "POR_HORA" ? "POR_HORA" : "FIJA")}
                  options={[
                    { value: "FIJA", label: "Fija" },
                    { value: "POR_HORA", label: "Por hora" },
                  ]}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {values.comision_vendedor_modo === "POR_HORA" ? (
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="$/hr · Ej. 50"
                    aria-label="Comisión del vendedor por hora (USD)"
                    className="w-32 font-mono"
                    value={values.comision_vendedor_tarifa_hr ?? ""}
                    onChange={(e) =>
                      setValue(
                        "comision_vendedor_tarifa_hr",
                        e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                      )
                    }
                  />
                ) : (
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="USD · Ej. 150"
                    aria-label="Comisión del vendedor (USD)"
                    className="w-32 font-mono"
                    value={values.comision_vendedor_usd ?? ""}
                    onChange={(e) =>
                      setValue(
                        "comision_vendedor_usd",
                        e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                      )
                    }
                  />
                )}
                <Input
                  placeholder="Quién vendió (Itzy, Pablo…)"
                  aria-label="Quién vendió"
                  className="w-44"
                  value={values.comision_vendedor_nombre}
                  onChange={(e) => setValue("comision_vendedor_nombre", e.target.value)}
                />
              </div>
              {values.comision_vendedor_modo === "POR_HORA" && Number(values.comision_vendedor_tarifa_hr) > 0 && (
                <p className="text-xs text-muted-foreground font-mono">
                  {breakdown && Number(breakdown.tiempos.cobrable_hr) > 0
                    ? `= ${fmtUsd(Number(values.comision_vendedor_tarifa_hr))} × ${fmtDecimal(
                        breakdown.tiempos.cobrable_hr,
                      )} hr = ${fmtUsd(breakdown.meta?.comision_vendedor_usd ?? 0)}`
                    : "= se calcula con las horas al cotizar"}
                </p>
              )}
              {/* Lo absorbido se explica con la cuenta visible (§2.7). */}
              {breakdown && comisionAbsorbidaUsd > 0 && servicioAereoImpresoUsd != null && (
                <p className="text-xs text-muted-foreground">
                  → impreso «Servicio aéreo»{" "}
                  <span className="font-mono text-foreground">{fmtUsd(servicioAereoImpresoUsd)}</span> ={" "}
                  {fmtUsd(breakdown.totales.subtotal_vuelo_usd)} + comisión {fmtUsd(comisionAbsorbidaUsd)}
                  {redondeoAbsorbidoUsd > 0 ? ` + redondeo ${fmtUsd(redondeoAbsorbidoUsd)}` : ""}
                  {breakdown.meta?.neto_vuelatour_usd != null && (
                    <>
                      {" "}
                      · Neto VuelaTour{" "}
                      <span className="font-mono">{fmtUsd(breakdown.meta.neto_vuelatour_usd)}</span>
                    </>
                  )}
                </p>
              )}
              {!(comisionAbsorbidaUsd > 0) && (
                <p className="text-[11px] text-muted-foreground">
                  Se SUMA al precio del cliente y se absorbe en «Servicio aéreo»: nunca sale como línea
                  en el PDF.
                </p>
              )}
            </div>
          )}
        </div>

        {/* --- COBRO --- */}
        <div className="space-y-3 border-t border-border pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">Cobro</p>
          {lectura ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Dato
                  label="Método de pago"
                  value={metodoPagoTexto}
                  hint={METODOS_PAGO.find((m) => m.value === values.metodo_pago)?.hint}
                />
                {values.metodo_pago === "BILLPOCKET" && (
                  <Dato
                    label="Comisión BillPocket"
                    value={Number(values.comision_billpocket_pct) > 0 ? `${values.comision_billpocket_pct}%` : "—"}
                    hint="Sin IVA · sale en el desglose como «Comisión BillPocket»"
                  />
                )}
                <Dato
                  label="Redondeo"
                  value={
                    values.redondeo_auto
                      ? "Automático (múltiplo de $10)"
                      : Number(values.redondeo_usd) > 0
                        ? `Manual ${fmtUsd(Number(values.redondeo_usd))}`
                        : "—"
                  }
                  hint="Hacia arriba; se absorbe en «Servicio aéreo»."
                />
                <Dato label="TUAS" value={values.cobrar_tuas ? "Se cobran" : "No se cobran"} />
                <Dato label="Cotización abierta" value={values.cotizacion_abierta ? "Sí" : "No"} />
                <Dato label="Pase de abordar" value={values.pase_abordar ? "Sí" : "No"} hint="Exenta TUAS (excepto CZM)" />
              </div>
              {cierreResumenNode}
            </>
          ) : (
            <>
              <div id="metodo-pago-field" className="scroll-mt-24">
                <Field label="Método de pago" required hint="Decide el IVA (16 % con factura)">
                  <SearchableSelect
                    options={METODOS_PAGO.map((m) => ({
                      value: m.value,
                      label: m.label,
                      description: m.hint,
                    }))}
                    value={values.metodo_pago}
                    onChange={(v) => setValue("metodo_pago", v as MetodoPago)}
                    placeholder="Selecciona método"
                  />
                </Field>
              </div>
              {values.metodo_pago === "OTRO" && (
                <Field
                  label="¿Cuál método?"
                  required
                  hint="Escríbelo tal como quieren verlo (ej. PayPal, depósito en ventanilla)"
                >
                  <Input
                    value={values.metodo_pago_detalle}
                    onChange={(e) => setValue("metodo_pago_detalle", e.target.value)}
                    placeholder="Nombre del método"
                    maxLength={80}
                  />
                </Field>
              )}
              {values.metodo_pago === "BILLPOCKET" && (
                <div id="billpocket-field" className="scroll-mt-24">
                  <Field
                    label="Comisión BillPocket (%)"
                    hint="Custom por operación · tope 20% · sin IVA · sale como línea «Comisión BillPocket»"
                  >
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      max={20}
                      placeholder="Ej. 9"
                      className="w-32 font-mono"
                      value={values.comision_billpocket_pct ?? ""}
                      onChange={(e) =>
                        setValue(
                          "comision_billpocket_pct",
                          e.target.value === "" ? null : Math.min(20, Math.max(0, Number(e.target.value))),
                        )
                      }
                    />
                  </Field>
                </div>
              )}
              <div id="redondeo-field" className="scroll-mt-24 space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm">Redondeo automático a número cerrado</p>
                    <p className="text-xs text-muted-foreground">
                      Hacia arriba al siguiente múltiplo de $10 (976→980). Se absorbe en «Servicio
                      aéreo».
                    </p>
                  </div>
                  <Switch checked={values.redondeo_auto} onCheckedChange={(c) => setValue("redondeo_auto", c)} />
                </div>
                {!values.redondeo_auto && (
                  <Field label="Redondeo manual (USD)" hint="Solo con el automático apagado.">
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="0.00"
                      className="w-28 font-mono"
                      value={values.redondeo_usd ?? ""}
                      onChange={(e) =>
                        setValue("redondeo_usd", e.target.value === "" ? null : Math.max(0, Number(e.target.value)))
                      }
                    />
                  </Field>
                )}
                {cierreResumenNode}
              </div>
              {/* Switch rápido de TUAS: apagado = no se cobra (override $0/pax);
                  la hoja lo marca en el margen del desglose. */}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-navy-800/50 p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Se cobran TUAS</Label>
                  <p className="text-xs text-muted-foreground">
                    Apagado: ninguna TUA entra al total. El monto por aeropuerto se edita en el desglose de
                    la hoja.
                    {breakdown && values.cobrar_tuas ? ` · Total ${fmtUsd(breakdown.tuas.total_usd)}` : ""}
                  </p>
                </div>
                <Switch checked={values.cobrar_tuas} onCheckedChange={(c) => setValue("cobrar_tuas", c)} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-navy-800/50 p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Cotización abierta</Label>
                  <p className="text-xs text-muted-foreground">
                    El itinerario/precio se cierra al final: permite re-cotizar con los tramos reales hasta
                    antes de cobrar/facturar.
                  </p>
                </div>
                <Switch
                  checked={values.cotizacion_abierta}
                  onCheckedChange={(c) => setValue("cotizacion_abierta", c)}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-navy-800/50 p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Pase de abordar</Label>
                  <p className="text-xs text-muted-foreground">Exenta TUAS (excepto CZM).</p>
                </div>
                <Switch checked={values.pase_abordar} onCheckedChange={(c) => setValue("pase_abordar", c)} />
              </div>
            </>
          )}
        </div>

        {/* --- OPERADOR EXTERNO (sub-bloque) --- */}
        {(!isRevise || initialQuote?.es_externo) && (
          <SubBloque
            id="externo"
            titulo="Operador externo"
            resumen={resumenExterno}
            aviso={avisoExterno}
            abierto={subAbierto.externo}
            onToggle={() => toggleSub("externo")}
          >
            {lectura && initialQuote ? (
              <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Otro operador vuela este servicio; VuelaTour cobra al cliente y paga al apoyo. Sin avión
                  propio ni tacómetros; los gastos sí se registran en el vuelo. El avión cotizado es solo la
                  referencia de tarifa.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Dato label="Operador externo" value={initialQuote.operador_externo ?? "—"} hint="Quién vuela el servicio" />
                  <Dato
                    label="Avión"
                    value={
                      [initialQuote.avion_externo_modelo, initialQuote.avion_externo_matricula]
                        .filter(Boolean)
                        .join(" · ") || "—"
                    }
                    hint="Sale en el PDF del cliente"
                  />
                  <Dato
                    label="Lo que cobra el operador externo (costo)"
                    value={
                      Number(initialQuote.costo_externo_usd) > 0 ? (
                        <>
                          {fmtUsd(Number(initialQuote.costo_externo_usd))}
                          {initialQuote.costo_externo_moneda === "MXN" &&
                            Number(initialQuote.costo_externo_monto) > 0 && (
                              <span className="ml-1.5 text-xs text-muted-foreground">
                                ({fmtMxn(Number(initialQuote.costo_externo_monto))}
                                {Number(initialQuote.costo_externo_tc) > 0
                                  ? ` · tc ${Number(initialQuote.costo_externo_tc)}`
                                  : ""}
                                )
                              </span>
                            )}
                        </>
                      ) : (
                        "Sin capturar"
                      )
                    }
                    hint="Interno, no lo ve el cliente"
                  />
                  {Number(initialQuote.calculo_snapshot?.meta?.total_pactado_usd) > 0 && (
                    <Dato
                      label="Precio pactado (folio legado)"
                      value={fmtUsd(Number(initialQuote.calculo_snapshot!.meta!.total_pactado_usd))}
                    />
                  )}
                </div>
                {margenExternoNode}
                <p className="text-[11px] text-muted-foreground">
                  El operador y su costo también se editan en{" "}
                  <Link
                    href={`/admin/flights/${initialQuote.id}`}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    el vuelo → Editar externo
                  </Link>{" "}
                  (ahí también se regresa a vuelo propio).
                </p>
              </div>
            ) : (
              <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                {isRevise && initialQuote?.es_externo ? (
                  <>
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                      Vuelo cubierto por <strong>{initialQuote.operador_externo}</strong>. El avión cotizado
                      es solo la referencia de tarifa. Aquí capturas lo que cobra el operador externo; lo que
                      se le cobra al cliente es la hoja.
                    </div>
                    <Field label="Operador externo" hint="Quién vuela el servicio (vacío = se conserva el actual)">
                      <Input
                        placeholder="Ej. Aerocharter del Caribe"
                        maxLength={120}
                        value={values.operador_externo}
                        onChange={(e) => setValue("operador_externo", e.target.value)}
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Cubierto por operador externo</Label>
                        <p className="text-xs text-muted-foreground">
                          Otro operador vuela el servicio (ej. venta broker de un jet ajeno). Sin tacómetros;
                          los gastos sí se registran en el vuelo.
                        </p>
                      </div>
                      <Switch checked={values.es_externo} onCheckedChange={(c) => setValue("es_externo", c)} />
                    </div>
                    {values.es_externo && (
                      <Field label="Operador externo" required hint="Quién vuela el servicio">
                        <Input
                          placeholder="Ej. Aerocharter del Caribe"
                          maxLength={120}
                          value={values.operador_externo}
                          onChange={(e) => setValue("operador_externo", e.target.value)}
                        />
                      </Field>
                    )}
                  </>
                )}
                {values.es_externo && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Modelo del avión" hint="Sale en el PDF del cliente">
                        <Input
                          placeholder="HAWKER 400 A"
                          maxLength={80}
                          value={values.avion_externo_modelo}
                          onChange={(e) => setValue("avion_externo_modelo", e.target.value)}
                        />
                      </Field>
                      <Field label="Matrícula (opcional)">
                        <Input
                          placeholder="XA-REG"
                          maxLength={20}
                          value={values.avion_externo_matricula}
                          onChange={(e) => setValue("avion_externo_matricula", e.target.value)}
                        />
                      </Field>
                    </div>
                    <Field
                      label="Lo que cobra el operador externo (costo)"
                      hint="En su moneda · interno, no lo ve el cliente"
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          placeholder="0.00"
                          className="font-mono"
                          value={values.costo_externo_monto ?? ""}
                          onChange={(e) =>
                            setValue(
                              "costo_externo_monto",
                              e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                            )
                          }
                        />
                        <MonedaSelect
                          value={values.costo_externo_moneda}
                          onChange={(m) => setValue("costo_externo_moneda", m)}
                        />
                      </div>
                      {costoExternoMxnSinTc && (
                        <button
                          type="button"
                          onClick={focusTc}
                          className="mt-1 text-left text-xs font-medium text-amber-600 dark:text-amber-400 underline underline-offset-2"
                        >
                          Costo en MXN: captura el T.C. en «Total MXN» del desglose — sin tipo de cambio no
                          se puede derivar el USD ni guardar.
                        </button>
                      )}
                    </Field>
                    {margenExternoNode}
                  </>
                )}
              </div>
            )}
          </SubBloque>
        )}

        {/* --- RUTA OPERATIVA (solo alta; sub-bloque) --- */}
        {!isRevise && (
          <SubBloque
            id="operativa"
            titulo="Ruta operativa"
            resumen={resumenOperativa}
            abierto={subAbierto.operativa}
            onToggle={() => toggleSub("operativa")}
          >
            <div className="space-y-2 rounded-lg border border-sky-500/40 bg-sky-500/15 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                  Ruta operativa (opcional · no se cotiza)
                </p>
                <div className="flex items-center gap-2">
                  <AirportQuickCreateButton onCreated={onAeropuertoCreado} />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() =>
                      setOpsLegs((prev) => [
                        ...prev,
                        {
                          origen: prev.length ? prev[prev.length - 1].destino : "",
                          destino: "",
                          ferry: prev.length === 0,
                          pax: "",
                          hora: "",
                          nota: "",
                          pernocta: false,
                          servicio: false,
                          servicioNotas: "",
                          nombres: "",
                          showNombres: false,
                        },
                      ])
                    }
                  >
                    + Tramo
                  </Button>
                </div>
              </div>
              {opsLegs.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  La ruta REAL del avión (puede salir de otra base, con ferries). Aquí se cargan los gastos y
                  tacómetros; el itinerario de la hoja es solo lo que paga el cliente. Si la dejas vacía, la
                  operación usa la ruta comercial.
                </p>
              ) : (
                opsLegs.map((l, i) => (
                  <div key={i} className="space-y-1.5 rounded-md border border-border p-2">
                    <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                      <SearchableSelect
                        options={airports.map((a) => ({
                          value: a.iata,
                          label: a.iata,
                          description: a.nombre,
                        }))}
                        value={l.origen}
                        onChange={(v) =>
                          setOpsLegs((prev) => prev.map((x, j) => (j === i ? { ...x, origen: v } : x)))
                        }
                        placeholder="Sale de"
                      />
                      <SearchableSelect
                        options={airports.map((a) => ({
                          value: a.iata,
                          label: a.iata,
                          description: a.nombre,
                        }))}
                        value={l.destino}
                        onChange={(v) =>
                          setOpsLegs((prev) => prev.map((x, j) => (j === i ? { ...x, destino: v } : x)))
                        }
                        placeholder="Destino"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-destructive"
                        onClick={() => setOpsLegs((prev) => prev.filter((_, j) => j !== i))}
                      >
                        Quitar
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <label className="flex items-center gap-2 text-xs">
                        <Switch
                          checked={l.ferry}
                          onCheckedChange={(c) =>
                            setOpsLegs((prev) =>
                              prev.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      ferry: c,
                                      pax: c ? "" : x.pax,
                                      ...(c ? { nombres: "", showNombres: false } : {}),
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                        Ferry (vacío)
                      </label>
                      <label
                        className="flex items-center gap-2 text-xs"
                        title="El piloto pernocta tras este tramo (viático en la cotización). SOLO se marca a mano."
                      >
                        <Switch
                          checked={l.pernocta}
                          onCheckedChange={(c) =>
                            setOpsLegs((prev) => prev.map((x, j) => (j === i ? { ...x, pernocta: c } : x)))
                          }
                        />
                        Pernocta
                      </label>
                      <label
                        className="flex items-center gap-2 text-xs"
                        title="Parada técnica / de servicio: cambiar llanta, revisión, carga de material."
                      >
                        <Switch
                          checked={l.servicio}
                          onCheckedChange={(c) =>
                            setOpsLegs((prev) => prev.map((x, j) => (j === i ? { ...x, servicio: c } : x)))
                          }
                        />
                        Servicio
                      </label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="Pax"
                        disabled={l.ferry}
                        className="w-20 h-8"
                        value={l.pax}
                        onChange={(e) =>
                          setOpsLegs((prev) => prev.map((x, j) => (j === i ? { ...x, pax: e.target.value } : x)))
                        }
                      />
                    </div>
                    {l.servicio && (
                      <Input
                        className="h-8"
                        placeholder="Detalle del servicio · ej. aterriza en Toledo a cambiar llanta"
                        value={l.servicioNotas}
                        onChange={(e) =>
                          setOpsLegs((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, servicioNotas: e.target.value } : x)),
                          )
                        }
                      />
                    )}
                    <div className="flex flex-wrap items-start gap-2">
                      <div
                        className="w-[264px] shrink-0"
                        title="Fecha y hora del tramo (opcional, hora Cancún). Vacía = tramo 1 sale a la fecha del vuelo. Es la salida programada del piloto; la fecha del PDF del cliente va en el itinerario de la hoja."
                      >
                        <FechaHoraCampo
                          className="[&_input]:h-8"
                          value={l.hora}
                          onChange={(v) =>
                            setOpsLegs((prev) => prev.map((x, j) => (j === i ? { ...x, hora: v } : x)))
                          }
                        />
                      </div>
                      <Input
                        className="h-8 min-w-[12rem] flex-1"
                        placeholder='Nota del tramo para el piloto · ej. "cargar gasolina aquí"'
                        value={l.nota}
                        onChange={(e) =>
                          setOpsLegs((prev) => prev.map((x, j) => (j === i ? { ...x, nota: e.target.value } : x)))
                        }
                      />
                    </div>
                    {!l.ferry &&
                      (l.showNombres ? (
                        <div className="space-y-1">
                          <Textarea
                            rows={3}
                            value={l.nombres}
                            onChange={(e) =>
                              setOpsLegs((prev) =>
                                prev.map((x, j) => (j === i ? { ...x, nombres: e.target.value } : x)),
                              )
                            }
                            placeholder={"Nombres de pasajeros, uno por línea\nJuan Pérez\nMaría López"}
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Específico de este tramo. Útil para permisos; puede ir vacío.
                          </p>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setOpsLegs((prev) => prev.map((x, j) => (j === i ? { ...x, showNombres: true } : x)))
                          }
                          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline transition-colors"
                        >
                          + nombres de pasajeros
                        </button>
                      ))}
                  </div>
                ))
              )}
            </div>
          </SubBloque>
        )}

        {/* --- NOTAS INTERNAS --- */}
        <div className="space-y-2 border-t border-border pt-3">
          {!isRevise ? (
            <Field label="Notas internas" hint="Solo para el equipo · no aparecen en el PDF">
              <Textarea rows={2} placeholder="Solo para el equipo" {...register("notas_internas")} />
            </Field>
          ) : (
            <Dato
              label="Notas internas"
              value={
                initialQuote?.notas_internas ? (
                  <span className="whitespace-pre-wrap font-normal">{initialQuote.notas_internas}</span>
                ) : (
                  "—"
                )
              }
              hint="Solo para el equipo. No aparecen en el PDF; se editan desde el detalle del vuelo (Editar datos)."
            />
          )}
        </div>

        {/* --- PDF (toggles de presentación) --- */}
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
            PDF del cliente
          </p>
          {lectura ? (
            <div className="space-y-0.5 text-sm">
              <p>
                Mostrar tarifa por hora:{" "}
                <span className="font-medium">{values.pdf_mostrar_tarifa ? "Sí" : "No"}</span>
              </p>
              <p>
                Mostrar itinerario de tramos:{" "}
                <span className="font-medium">{values.pdf_mostrar_itinerario ? "Sí" : "No"}</span>
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Mostrar tarifa por hora</Label>
                  <p className="text-xs text-muted-foreground">
                    «Servicio aéreo (1.6 h × $1,650/hr)». Apagado, solo el monto.
                  </p>
                </div>
                <Switch
                  checked={values.pdf_mostrar_tarifa}
                  onCheckedChange={(c) => setValue("pdf_mostrar_tarifa", c)}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Mostrar itinerario de tramos</Label>
                  <p className="text-xs text-muted-foreground">
                    La tabla de tramos de la hoja 1; apagado queda solo el mapa.
                  </p>
                </div>
                <Switch
                  checked={values.pdf_mostrar_itinerario}
                  onCheckedChange={(c) => setValue("pdf_mostrar_itinerario", c)}
                />
              </div>
              {isRevise && (
                <p className="text-[11px] text-muted-foreground">
                  Estos toggles y las notas del cliente se guardan sin versión nueva cuando son lo único que
                  cambia.
                </p>
              )}
              {avisoTramosCambiaron && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                  Cambiaste los tramos: la fecha y el ojito del PDF por tramo se habilitan al guardar la
                  versión.
                </p>
              )}
              {!isRevise && (
                <p className="text-[10px] text-muted-foreground">
                  La fecha y el ojito de cada tramo (en el detalle «⋯» de la fila) son SOLO para el PDF del
                  cliente: un tramo oculto no sale en la hoja pero se sigue cobrando.
                </p>
              )}
            </>
          )}
          {notaTramos}
        </div>

        {/* --- DETALLE DEL CÁLCULO (sub-bloque) --- */}
        <SubBloque
          id="detalle"
          titulo="Detalle del cálculo"
          resumen={resumenDetalle}
          aviso={avisoDetalle}
          abierto={subAbierto.detalle}
          onToggle={() => toggleSub("detalle")}
        >
          {lectura && initialQuote ? (
            <>
              {breakdown ? (
                <Preview
                  breakdown={breakdown}
                  loading={false}
                  avion={cotizadoEnTexto}
                  tcUsdMxn={Number(values.tc_usd_mxn) > 0 ? Number(values.tc_usd_mxn) : null}
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Esta versión no guardó el detalle del cálculo (cotización de un motor anterior): abajo va
                  el desglose reconstruido desde las columnas guardadas.
                </p>
              )}
              <QuoteDesgloseCard quote={initialQuote} />
            </>
          ) : error ? (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardHeader>
                <CardTitle className="text-base text-destructive">Error al calcular</CardTitle>
                <CardDescription className="text-destructive/80">{error}</CardDescription>
              </CardHeader>
            </Card>
          ) : !hayPayload ? (
            <Card className="border-t-2 border-t-brand-600/60">
              <CardHeader>
                <CardTitle className="text-base text-muted-foreground">Completa los parámetros</CardTitle>
                <CardDescription>Necesito aeronave, ruta y pasajeros para calcular.</CardDescription>
              </CardHeader>
            </Card>
          ) : breakdown ? (
            <>
              <Preview
                breakdown={breakdown}
                loading={loading}
                avion={cotizadoEnTexto}
                tcUsdMxn={Number(values.tc_usd_mxn) > 0 ? Number(values.tc_usd_mxn) : null}
              />
              {isRevise && initialQuote && (
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wider text-foreground/70">
                    Desglose de la versión guardada (v{initialQuote.cotizacion_version})
                  </p>
                  <QuoteDesgloseCard quote={initialQuote} />
                </div>
              )}
            </>
          ) : (
            <PreviewSkeleton />
          )}
        </SubBloque>
      </div>
    </aside>
  );
}

/**
 * Horas POR TRAMO (feedback 9-sep-2026: «¿dónde se ajusta la hora volada por
 * tramo?»): tabla compacta de SOLO lectura desde `breakdown.tramos` (millas
 * ÷ velocidad + calzos, ya resuelto por el motor) con la fila total de
 * `breakdown.tiempos`. El motor NO tiene override por tramo: las horas de un
 * tramo cambian con sus millas (⋯ en la hoja) y el total se pacta en
 * «Cobrable pactado». Aquí no se calcula nada — ni la suma.
 */
function HorasPorTramo({ breakdown, lectura }: { breakdown: QuoteBreakdown | null; lectura: boolean }) {
  const tramos = breakdown?.tramos ?? [];
  if (!breakdown || tramos.length === 0) return null;
  const t = breakdown.tiempos;
  const sobrevuelo = Number(t.sobrevuelo_hr) > 0 ? Number(t.sobrevuelo_hr) : 0;
  const h = (n: number | null | undefined) => (n == null ? "—" : `${fmtDecimal(n, 2)} h`);
  const nm = (n: number) => new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(Number(n) || 0);
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] uppercase tracking-wider text-foreground/70">Horas por tramo</p>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-1 text-left font-medium">#</th>
              <th className="px-2 py-1 text-left font-medium">Tramo</th>
              <th className="px-2 py-1 text-right font-medium">NM</th>
              <th className="px-2 py-1 text-right font-medium">h</th>
            </tr>
          </thead>
          <tbody>
            {tramos.map((tr) => (
              <tr key={tr.orden} className="border-t border-border/60">
                <td className="px-2 py-1 text-muted-foreground">{tr.orden}</td>
                <td className="px-2 py-1 font-mono">
                  {tr.origen} → {tr.destino}
                  {tr.es_ferry && <span className="ml-1 font-sans text-[10px] text-muted-foreground">ferry</span>}
                </td>
                <td className="px-2 py-1 text-right font-mono tabular-nums">{nm(tr.millas)}</td>
                <td className="px-2 py-1 text-right font-mono tabular-nums">{fmtDecimal(tr.tiempo_hr, 2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border">
              <td colSpan={4} className="px-2 py-1.5 text-[11px] text-muted-foreground">
                Vuelo {h(t.vuelo_hr)} + calzos {h(t.calzos_hr)}
                {sobrevuelo > 0 ? ` + sobrevuelo ${h(sobrevuelo)}` : ""} ={" "}
                {t.cobrable_proviene_de_override ? (
                  <>
                    regla {h(t.cobrable_hr_regla ?? null)} ·{" "}
                    <span className="font-medium text-foreground">pactado {h(t.cobrable_hr)}</span>
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">cobrable {h(t.cobrable_hr)}</span>
                    {t.minimo_hora_aplicado ? " (hora mínima)" : ""}
                  </>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {!lectura && (
        <p className="text-[11px] text-muted-foreground">
          Las horas por tramo se calculan; se ajustan cambiando las millas del tramo (⋯ en la hoja) o
          pactando el total aquí.
        </p>
      )}
    </div>
  );
}

/** "$750/hr" compacto (sin decimales) para el sub del selector de tarifa. */
function tarifaSub(n: number | string | null | undefined): string | undefined {
  if (n == null || `${n}`.trim() === "") return undefined;
  const v = Number(n);
  if (!Number.isFinite(v)) return undefined;
  return `$${Math.round(v).toLocaleString("en-US")}/hr`;
}

/** "CUN → HOL → CUN" de una ruta del catálogo (mismo texto del selector). */
export function rutaPathTexto(r: RouteOption): string {
  return r.tramos.length > 0
    ? [r.tramos[0]?.origen_iata, ...r.tramos.map((t) => t.destino_iata)].filter(Boolean).join(" → ")
    : `${r.origen_iata} → ${r.destino_iata}`;
}

/**
 * Mini-desglose EN VIVO (26-ago): bajo cada ajuste se ve cuánto suma/resta
 * ese apartado al total — para entender la cotización sin ir a buscar.
 */
function AporteChip({ usd, nota }: { usd: number | null | undefined; nota?: string }) {
  const v = Math.round((Number(usd) || 0) * 100) / 100;
  if (v === 0) return null;
  return (
    <p
      className={cn(
        "text-xs font-medium mt-1",
        v > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
      )}
    >
      {v > 0 ? "+" : "−"}
      {fmtUsd(Math.abs(v))} en el total
      {nota ? <span className="text-muted-foreground font-normal"> · {nota}</span> : null}
    </p>
  );
}

/**
 * Campo en LECTURA (página única 5-sep): etiqueta discreta + valor legible
 * como texto — nunca un input gris deshabilitado.
 */
function Dato({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <p className="text-[11px] uppercase tracking-wider text-foreground/70">{label}</p>
      <div className="text-sm font-medium break-words">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/**
 * Selector segmentado que NUNCA recorta (feedback 9-sep-2026: «Personalizada»
 * se salía): grid de N columnas iguales, texto envolvible y centrado, con el
 * nombre arriba y el dato (p. ej. "$1,050/hr") abajo en mono. Si alguna
 * opción lleva `sub`, las demás reservan esa línea para que los nombres
 * queden alineados.
 */
function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: {
    value: string;
    label: string;
    /** Dato sutil bajo el label (ej. "$750/hr" en el selector de tarifa). */
    sub?: string;
    disabled?: boolean;
  }[];
}) {
  const conSub = options.some((o) => !!o.sub);
  return (
    <div
      role="group"
      className="grid w-full gap-0.5 rounded-lg border border-border bg-navy-800/50 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            type="button"
            key={opt.value}
            disabled={opt.disabled}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex min-h-8 min-w-0 flex-col items-center justify-center whitespace-normal break-words rounded-md px-1.5 py-1 text-center text-xs font-medium leading-tight transition-colors",
              active ? "bg-navy-700 text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              opt.disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            <span className="block">{opt.label}</span>
            {conSub && (
              <span
                className={cn(
                  "block font-mono text-[11px] font-normal tabular-nums",
                  active ? "text-foreground/70" : "text-muted-foreground",
                )}
              >
                {opt.sub ?? "\u00a0"}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Sub-bloque plegable DENTRO del panel interno: externo, ruta operativa,
 * detalle del cálculo. Colapso con `hidden` (nunca desmonta: los ids ancla
 * y los `register()` de RHF siguen vivos).
 */
function SubBloque({
  id,
  titulo,
  resumen,
  aviso,
  abierto,
  onToggle,
  children,
}: {
  id: SubId;
  titulo: string;
  resumen?: ReactNode;
  aviso?: string | null;
  abierto: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={`seccion-${id}`}
        onClick={onToggle}
        data-guard-exempt
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {titulo}
            {aviso && (
              <Badge
                variant="outline"
                className="border-amber-500/50 bg-amber-500/15 text-[10px] text-amber-600 dark:text-amber-400"
              >
                {aviso}
              </Badge>
            )}
          </span>
          {!abierto && resumen && (
            <span className="block truncate text-xs text-muted-foreground">{resumen}</span>
          )}
        </span>
        <ChevronDownIcon
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", abierto && "rotate-180")}
        />
      </button>
      <div id={`seccion-${id}`} hidden={!abierto} className="px-3 pb-3">
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

/** Fila del desglose tipo recibo del «Detalle del cálculo». */
function FilaTotal({ label, hint, value }: { label: string; hint?: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">
        {label}
        {hint ? <span className="text-xs"> · {hint}</span> : null}
      </span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

/**
 * «Detalle del cálculo» (solo lectura): el breakdown canónico del motor tal
 * cual — total, recibo en el orden de la suma, extras, total por moneda,
 * tramos, tiempos, tarifa e IVA. Cero cálculos de dinero aquí.
 */
function Preview({
  breakdown,
  loading,
  avion,
  tcUsdMxn,
}: {
  breakdown: QuoteBreakdown;
  loading: boolean;
  /** «Cotizado en: Piper Seneca V» — modelo cotizado, nunca matrícula. */
  avion?: string | null;
  /** TC capturado; solo para el display del total por moneda. */
  tcUsdMxn: number | null;
}) {
  // Composición del total MXN (motor): componentes USD × tc + nativos MXN.
  const mxnNativos = Number(breakdown.totales.mxn_nativos) || 0;
  const usdDeMxn =
    Math.round(
      ((breakdown.tuas.filas ?? []).filter((f) => f.moneda === "MXN").reduce((acc, f) => acc + f.total_usd, 0) +
        (breakdown.extras ?? []).filter((e) => e.moneda === "MXN").reduce((acc, e) => acc + e.monto_usd, 0)) *
        100,
    ) / 100;
  const componentesUsd = Math.round((breakdown.totales.total_usd - usdDeMxn) * 100) / 100;
  const componentesUsdEnMxn =
    breakdown.totales.total_mxn != null
      ? Math.round((breakdown.totales.total_mxn - mxnNativos) * 100) / 100
      : null;

  return (
    <>
      {/* TOTAL */}
      <Card className={cn("border-t-2 border-t-brand-600/60 transition-opacity", loading && "opacity-60")}>
        <CardContent className="p-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total</p>
              <p className="text-3xl font-bold tracking-tight">{fmtUsd(breakdown.totales.total_usd)}</p>
              <p className="text-xs text-muted-foreground mt-1">USD</p>
              {avion && <p className="text-xs text-muted-foreground mt-1">{avion}</p>}
              {!!breakdown.meta?.comision_vendedor_usd && (
                <p className="text-xs text-muted-foreground mt-2">
                  Comisión vendedor
                  {breakdown.meta.comision_vendedor_nombre ? ` (${breakdown.meta.comision_vendedor_nombre})` : ""}:
                  +{fmtUsd(breakdown.meta.comision_vendedor_usd)} (la paga el cliente)
                  {breakdown.meta.neto_vuelatour_usd != null && (
                    <>
                      {" "}
                      ·{" "}
                      <span className="font-semibold text-foreground">
                        Neto VuelaTour: {fmtUsd(breakdown.meta.neto_vuelatour_usd)}
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>
            <Badge className="bg-brand-600/15 text-brand-600 dark:text-brand-400 border-brand-600/30">
              {breakdown.tarifa.tipo}
            </Badge>
          </div>
          {/* Desglose tipo RECIBO, en el MISMO orden de la suma canónica. */}
          <div className="mt-4 pt-3 border-t border-border space-y-1.5 text-sm">
            <FilaTotal label="Subtotal vuelo" value={fmtUsd(breakdown.totales.subtotal_vuelo_usd)} />
            <FilaTotal
              label="TUAS"
              hint={`${breakdown.tuas.pasajeros} pax${
                Number(breakdown.tuas.total_mxn_nativo) > 0 ? ", incluye MXN" : ""
              }`}
              value={fmtUsd(breakdown.totales.tuas_total_usd)}
            />
            {!!breakdown.totales.viaticos_pernocta_usd && (
              <FilaTotal
                label="Pernocta"
                hint="viáticos, sin IVA"
                value={fmtUsd(breakdown.totales.viaticos_pernocta_usd)}
              />
            )}
            {!!breakdown.totales.extras_total_usd && (
              <FilaTotal
                label="Extras"
                hint={`${breakdown.extras?.length ?? 0} ${
                  (breakdown.extras?.length ?? 0) === 1 ? "concepto" : "conceptos"
                }`}
                value={fmtUsd(breakdown.totales.extras_total_usd)}
              />
            )}
            {!!breakdown.totales.ajuste_final_usd && (
              <FilaTotal
                label={(breakdown.totales.ajuste_final_usd ?? 0) < 0 ? "Descuento" : "Redondeo"}
                hint="fuera de IVA"
                value={fmtUsd(breakdown.totales.ajuste_final_usd!)}
              />
            )}
            <FilaTotal
              label="IVA"
              hint={breakdown.iva.porcentaje > 0 ? `${(breakdown.iva.porcentaje * 100).toFixed(0)}%` : "0%"}
              value={fmtUsd(breakdown.totales.iva_usd)}
            />
          </div>
          {(breakdown.extras?.length ?? 0) > 0 && (
            <div className="mt-3 pt-3 border-t border-border space-y-1">
              {breakdown.extras!.map((e, i) => (
                <div key={`${e.concepto}-${i}`} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground min-w-0 break-words">
                    {e.concepto}
                    {e.unitario != null && (
                      <span className="ml-1 font-mono text-[10px]">
                        · {textoCantidadUnitario(e, e.cantidad ?? null)}
                      </span>
                    )}
                    {e.aplica_iva === false && <span className="ml-1 text-[10px]">(sin IVA)</span>}
                    {e.origen === "GRUPO" && (
                      <span className="ml-1 rounded bg-fuchsia-500/15 px-1 text-[10px] text-fuchsia-700 dark:text-fuchsia-300">
                        grupo
                      </span>
                    )}
                  </span>
                  <span className="font-mono shrink-0">
                    {e.moneda === "MXN" && e.monto_nativo != null && (
                      <span className="mr-1.5 text-muted-foreground">{fmtMxn(e.monto_nativo)} =</span>
                    )}
                    {fmtUsd(e.monto_usd)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {/* Total consolidado en MXN (motor ≥1.3.1): EXACTO por composición. */}
          {breakdown.totales.total_mxn != null && (
            <div className="mt-3 rounded-lg border border-border bg-navy-800/50 px-3 py-2 text-sm">
              {mxnNativos > 0 ? (
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wider text-foreground/70">Total por moneda</p>
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>
                      Componentes USD: {fmtUsd(componentesUsd)}
                      {tcUsdMxn ? ` × tc ${fmtDecimal(tcUsdMxn, 4)}` : ""}
                    </span>
                    <span className="font-mono shrink-0 text-foreground">
                      {componentesUsdEnMxn != null ? fmtMxn(componentesUsdEnMxn) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>Nativos MXN (TUAS/extras en pesos, tal cual)</span>
                    <span className="font-mono shrink-0 text-foreground">{fmtMxn(mxnNativos)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-border pt-1 font-semibold">
                    <span>Total MXN</span>
                    <span className="font-mono">{fmtMxn(breakdown.totales.total_mxn)}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    Total MXN{tcUsdMxn ? ` (tc ${fmtDecimal(tcUsdMxn, 4)})` : ""}
                  </span>
                  <span className="font-mono font-semibold">{fmtMxn(breakdown.totales.total_mxn)}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalle por tramo (MULTIESCALA) */}
      {breakdown.tramos && breakdown.tramos.length > 0 && (
        <Card className="border-t-2 border-t-brand-600/60">
          <CardHeader>
            <CardTitle className="text-sm">Detalle por tramo</CardTitle>
            <CardDescription className="text-xs">
              Pasajeros, TUAS, ferry, pernocta y paradas de servicio por tramo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {breakdown.tramos.map((t) => (
              <div key={t.orden} className="rounded-lg border border-border p-2.5 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-mono">
                    <span className="text-muted-foreground mr-1">{t.orden}.</span>
                    {t.origen} → {t.destino}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {t.es_ferry ? (
                      <Badge variant="outline" className="text-[10px]">
                        Ferry · vacío
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        {t.pasajeros} pax
                      </Badge>
                    )}
                    {t.requiere_pernocta && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                      >
                        Pernocta · {fmtUsd(t.pernocta_usd)}
                      </Badge>
                    )}
                    {t.tipo_parada === "SERVICIO" && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30"
                      >
                        Servicio
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>
                    {fmtDecimal(t.millas)} NM · {fmtDecimal(t.tiempo_hr, 4)} hr
                  </span>
                  <span>TUAS {fmtUsd(t.tuas_usd)}</span>
                </div>
                {t.tipo_parada === "SERVICIO" && t.servicio_notas && (
                  <p className="text-xs text-sky-700 dark:text-sky-300">{t.servicio_notas}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tiempos + Tarifa */}
      <div className="grid gap-4">
        <Card className="border-t-2 border-t-brand-600/60">
          <CardHeader>
            <CardTitle className="text-sm">Tiempos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label="Vuelo"
              value={`${fmtDecimal(breakdown.tiempos.vuelo_hr, 4)} hr`}
              hint={`${fmtDecimal(breakdown.ruta.millas_nauticas_totales)} NM ÷ ${breakdown.aeronave.velocidad_crucero_kts} kts`}
            />
            <Row
              label="Calzos"
              value={`${fmtDecimal(breakdown.tiempos.calzos_hr, 4)} hr`}
              hint={`${breakdown.ruta.num_aterrizajes} aterrizajes × 0.15 hr`}
            />
            {Number(breakdown.tiempos.sobrevuelo_hr) > 0 && (
              <Row
                label="Sobrevuelo"
                value={`${fmtDecimal(breakdown.tiempos.sobrevuelo_hr!, 4)} hr`}
                hint="Tiempo extra sobre la zona"
              />
            )}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
              <div>
                <p className="font-semibold">Cobrable</p>
                <p className="text-xs text-muted-foreground">
                  {breakdown.tiempos.cobrable_proviene_de_override
                    ? `pactado a mano · la regla daría ${fmtDecimal(breakdown.tiempos.cobrable_hr_regla ?? 0, 4)} hr`
                    : "regla (suma, mínimo 1 hr)"}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="font-mono font-semibold">{fmtDecimal(breakdown.tiempos.cobrable_hr, 4)}</span>
                <span className="text-xs text-muted-foreground">hr</span>
              </div>
            </div>
            {breakdown.tiempos.cobrable_proviene_de_override &&
              Number(breakdown.tiempos.cobrable_hr) <
                Number(breakdown.tiempos.vuelo_hr) +
                  Number(breakdown.tiempos.calzos_hr) +
                  Number(breakdown.tiempos.sobrevuelo_hr ?? 0) && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Ojo: el cobrable pactado es MENOR al tiempo real (vuelo + calzos): se cobraría de menos.
                </p>
              )}
            {breakdown.tiempos.minimo_hora_aplicado && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Vuelo corto: se cobra la hora completa (mínimo 1 hr).
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-t-2 border-t-brand-600/60">
          <CardHeader>
            <CardTitle className="text-sm">Tarifa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label="USD / hr"
              value={fmtUsd(breakdown.tarifa.usd_por_hora)}
              hint={
                breakdown.tarifa.proviene_de_override
                  ? "Ajustada a mano para esta cotización"
                  : breakdown.tarifa.preferencial_cliente
                    ? "Preferencial del cliente"
                    : "Del avión"
              }
            />
            {breakdown.tarifa.preferencial_cliente && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                Este cliente tiene tarifa preferencial pactada para este avión; manda sobre la tarifa{" "}
                {breakdown.tarifa.tipo === "PUBLICO" ? "público" : "broker"} default.
              </p>
            )}
            <Row
              label="Subtotal"
              value={fmtUsd(breakdown.totales.subtotal_vuelo_usd)}
              hint={`${fmtDecimal(breakdown.tiempos.cobrable_hr, 4)} hr × ${fmtUsd(breakdown.tarifa.usd_por_hora)}`}
              bold
            />
          </CardContent>
        </Card>
      </div>

      {/* IVA */}
      <Card className="border-t-2 border-t-brand-600/60">
        <CardHeader>
          <CardTitle className="text-sm">IVA</CardTitle>
          <CardDescription className="text-xs">{breakdown.iva.nota}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 text-sm">
          <Cell label="Porcentaje" value={`${(breakdown.iva.porcentaje * 100).toFixed(2)}%`} />
          <Cell label="Base" value={fmtUsd(breakdown.iva.base_usd)} />
          <Cell label="Monto" value={fmtUsd(breakdown.iva.monto_usd)} bold />
        </CardContent>
      </Card>
    </>
  );
}

function PreviewSkeleton() {
  return (
    <>
      <Card className="border-t-2 border-t-brand-600/60">
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-12 w-48" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        </CardContent>
      </Card>
      <Card className="border-t-2 border-t-brand-600/60">
        <CardContent className="p-6 space-y-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    </>
  );
}

function Cell({ label, value, hint, bold }: { label: string; value: string; hint?: string; bold?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("font-mono", bold ? "font-bold" : "font-medium")}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function Row({ label, value, hint, bold }: { label: string; value: string; hint?: string; bold?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className={cn(bold && "font-semibold")}>{label}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </div>
      <p className={cn("font-mono", bold && "font-bold")}>{value}</p>
    </div>
  );
}
