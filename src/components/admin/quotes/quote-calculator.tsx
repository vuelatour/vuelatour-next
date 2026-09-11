"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useForm, type PathValue } from "react-hook-form";
import { toast } from "sonner";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  BanknotesIcon,
  BookmarkSquareIcon,
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { EstadoCobroSemaforo } from "@/lib/admin/cobros";
import { RouteFormSheet } from "@/components/admin/routes/route-form-sheet";
import { updateClientAction } from "@/app/admin/clients/actions";
import { QuickClientDialog } from "@/components/admin/clients/quick-client-dialog";
import type { Client } from "@/types/clients";
import type { Route } from "@/types/routes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toastAvisos } from "@/lib/admin/avisos";
import { SquawkAltaDialog } from "@/components/admin/flights/squawk-alta-dialog";
import { decidirErrorRevise } from "@/lib/admin/quote-revise-errores";
import { extrasAPayload, montoExtraActivo, normalizarExtrasEditor } from "@/lib/admin/extras";
import { grupoDeVuelo } from "@/lib/admin/grupos-ui";
import { tuasLineasAPayload } from "@/lib/admin/tuas";
import { modelosCotizadosTexto } from "@/lib/admin/avion-cotizado";
import { extraerMapaSvgDeHtml } from "@/lib/admin/quote-sheet";
import type { VueloConGrupo } from "@/types/grupos";
import type { Airport } from "@/types/airports";
import { cn } from "@/lib/utils";
import { abrirPdfCotizacion, calculateQuote } from "@/lib/api/quotes-browser";
import { isApiError } from "@/lib/api/errors";
import { fmtMxn, fmtUsd } from "@/lib/format";
import { cancunInputToIso, isoToCancunInput } from "@/lib/datetime";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useCambiosSinGuardar } from "@/hooks/use-cambios-sin-guardar";
import {
  useQuotePreviewHtml,
  type EscalaPdfPreview,
  type QuotePreviewPayload,
} from "@/hooks/use-quote-preview-html";
import {
  armarMotivoRevision,
  cambiosTocanTripulacion,
  MOTIVOS_REVISION,
  resumirCambios,
  textoResumenCambios,
  type MotivoRevisionChip,
} from "@/lib/admin/quote-revision";
import {
  createQuoteAction,
  getRutasSugeridasAction,
  reviseQuoteAction,
  setQuotePdfPresentacionAction,
  type PdfPresentacionPayload,
  type RutaSugerida,
} from "@/app/admin/quotes/actions";
import { createRouteAction } from "@/app/admin/routes/actions";
import type {
  CalculateQuoteRequest,
  EscalaInput,
  MetodoPago,
  QuoteBreakdown,
  TipoVuelo,
} from "@/types/quote";
import type { PersistedQuote } from "@/types/quotes-persisted";
import { QuoteSheet } from "@/components/admin/quotes/quote-sheet";
import { QuoteInternalPanel } from "@/components/admin/quotes/quote-internal-panel";
import type {
  DestinoInterno,
  DocumentoHoja,
  OnCambioHoja,
  TramoPdfAccesores,
} from "@/components/admin/quotes/quote-sheet-types";
import type {
  AircraftOption,
  AirportOption,
  ClientOption,
  QuoteFormValues,
  RouteOption,
} from "./quote-form-types";

// Tipos del form y catálogos: `quote-form-types.ts` (compartidos con la hoja
// y el panel interno). Se re-exportan para los consumidores existentes.
export type {
  AircraftOption,
  AirportOption,
  ClientOption,
  QuoteFormValues,
  RouteOption,
} from "./quote-form-types";

/**
 * Estado de edición que el cotizador reporta al padre (página única, F0):
 * badge «v2 → v3 ●», botones Descartar / Guardar en la barra de acciones y
 * el atajo «Ajuste rápido» (scroll+focus a pasajeros del documento).
 */
export interface EstadoEdicionCotizador {
  /** Hay cambios REALES vs lo guardado (diff semántico, no isDirty). */
  sucio: boolean;
  /**
   * D5 (F2): lo ÚNICO que cambió es presentación del PDF (notas del
   * cliente, tarifa/hr, itinerario) → se guarda por PATCH pdf-visibilidad
   * SIN versión nueva (badge «v2 · PDF ●», botón «Guardar PDF»).
   */
  soloPresentacion: boolean;
  /** «Pasajeros 4→6 · +Extra Handler $1,500 · +2 más». */
  resumen: string;
  cambios: string[];
  canSave: boolean;
  saving: boolean;
  versionSiguiente: number;
  /** Abre el diálogo «Guardar vN» (mismos candados que la barra del total). */
  guardar: () => void;
  /** Descarta con confirmación si hay cambios. */
  descartar: () => void;
  /** Scroll+focus al campo de pasajeros del documento. */
  enfocarPasajeros: () => void;
}

type QuoteCalculatorProps = {
  aircraft: AircraftOption[];
  routes: RouteOption[];
  airports: AirportOption[];
} & (
  | {
      mode?: "create";
      clients: ClientOption[];
      /** Clientes más recurrentes (ids), para mostrarlos como accesos de un tap. */
      frequentClientIds?: string[];
      initialQuote?: undefined;
      clientName?: undefined;
      clientEsInterno?: undefined;
      bloqueadoRazon?: undefined;
      requiereConfirmacionEdicion?: undefined;
      onEstadoEdicion?: undefined;
      onGuardado?: undefined;
      tramoExtra?: undefined;
      notaTramos?: undefined;
      escalasPdf?: undefined;
      cobro?: undefined;
    }
  | {
      mode: "revise";
      clients?: undefined;
      frequentClientIds?: undefined;
      initialQuote: PersistedQuote;
      clientName: string;
      /** El cliente de la cotización es interno (operación propia): puede ir en $0. */
      clientEsInterno?: boolean;
      /**
       * EDICIÓN DIRECTA (F0, 8-sep-2026): el documento se abre EDITABLE
       * desde el primer render — sin «Revisar» ni motivo de entrada. Solo
       * con `bloqueadoRazon` (cobrado, facturado, mes cerrado, servicio —
       * fuente única `candadoRevision`) se pinta en LECTURA: valores como
       * texto, 🔒 por sección, la razón en la barra del total y «Copiar como
       * nueva cotización». Sin cambios reales (diff semántico) el desglose
       * es el `calculo_snapshot` y NO se llama al motor; al primer cambio se
       * recalcula en vivo y aparecen «v2 → v3 ●», Descartar y Guardar.
       */
      bloqueadoRazon?: string | null;
      /**
       * CONFIRMADO/RESERVA con tripulación asignada: el PRIMER cambio pide una
       * confirmación única («¿editar?») — reemplaza la barrera consciente
       * que era «Revisar».
       */
      requiereConfirmacionEdicion?: boolean;
      /** Estado de edición para la cabecera / barra de acciones del padre. */
      onEstadoEdicion?: (estado: EstadoEdicionCotizador) => void;
      /**
       * Versión guardada. El cotizador NO navega (`router.push`) — solo hace
       * `router.refresh()`; la página se rehidrata con la versión nueva.
       */
      onGuardado?: (quote: PersistedQuote) => void;
      /**
       * Contenido extra por tramo del itinerario cotizado (índice 0..N-1 en
       * el MISMO orden que los tramos rehidratados): los toggles de PDF
       * (ocultar tramo / fecha). En edición solo se pintan en los tramos que
       * siguen coincidiendo con lo guardado (mismo par y misma cantidad).
       */
      tramoExtra?: (idx: number, leg: EscalaInput) => ReactNode;
      /** Nota al pie de la lista de tramos (leyenda de los toggles). */
      notaTramos?: ReactNode;
      /**
       * Visibilidad/fecha de PDF por tramo GUARDADO (F1): `orden` = índice+1
       * en el MISMO orden que los tramos rehidratados. Viaja a la vista
       * previa (`escalas_pdf`) solo en tramos que siguen coincidiendo con lo
       * guardado (misma regla que los toggles).
       */
      escalasPdf?: EscalaPdfPreview[];
      /**
       * COBROS junto al total (pedido del cliente 9-sep-2026): «Cobrado $X ·
       * Saldo $Y» con el semáforo (fuente única `estadoCobroSemaforo`) y el
       * botón «Registrar cobro» en la barra de estado. Solo en revisión: en
       * el alta aún no hay vuelo que cobrar. El dinero viene del padre
       * (snapshot del vuelo), nunca se calcula aquí.
       */
      cobro?: CobroTotalBar;
    }
);

/** Estado de cobro que pinta la barra de estado (ver `cobro` en props). */
export interface CobroTotalBar {
  totalCobradoUsd: number;
  /** Pendiente REAL (`pendienteCobro`, tolerancia 1 USD); 0 en cancelados. */
  pendienteUsd: number;
  semaforo: EstadoCobroSemaforo;
  /** Abre el formulario de cobro; undefined = sin permiso (no se pinta). */
  onRegistrar?: () => void;
  registrarTitle?: string;
}

/** Fecha de PDF por tramo ('YYYY-MM-DD' de pared) completa y con año razonable. */
function fechaPdfValida(v: string | null | undefined): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const anio = Number(v.slice(0, 4));
  return anio >= 2000 && anio <= 2100;
}

/** Claves del diff que son SOLO presentación del PDF (D5). */
const CLAVES_PRESENTACION: ReadonlySet<string> = new Set([
  "notas",
  "pdf_tarifa",
  "pdf_itinerario",
]);

/**
 * Lleva al operador al campo de TC (se monta siempre que hay renglones MXN,
 * aunque el método sea DÓLARES). Fuente única del scroll+focus.
 */
function focusTcField() {
  const el = document.getElementById("tc-usd-mxn-field");
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
  // En la hoja el id vive en el propio input invisible; en otros contextos,
  // en su contenedor.
  const ctl = el instanceof HTMLInputElement ? el : el?.querySelector("input");
  ctl?.focus();
}

// METODOS_PAGO: fuente única `lib/admin/metodos-pago.ts` (la copia local se
// retiró en F2, 8-sep-2026).

/** Mapea una Route del API a la opción local del dropdown (con detalle por tramo). */
function routeToOption(route: Route): RouteOption {
  return {
    id: route.id,
    tipo: route.tipo,
    origen_iata: route.origen_iata,
    destino_iata: route.destino_iata,
    millas_nauticas: Number(route.millas_nauticas),
    es_redondo_auto: route.es_redondo_auto,
    num_aterrizajes: route.num_aterrizajes,
    tramos: route.tramos.map((t) => ({
      origen_iata: t.origen_iata,
      destino_iata: t.destino_iata,
      millas_nauticas: Number(t.millas_nauticas),
      pasajeros: t.pasajeros,
      es_ferry: t.es_ferry,
      requiere_pernocta: t.requiere_pernocta,
      pernocta_costo_usd:
        t.pernocta_costo_usd != null ? Number(t.pernocta_costo_usd) : null,
      tipo_parada: t.tipo_parada,
      servicio_notas: t.servicio_notas,
    })),
  };
}


/**
 * Firma comparable de un itinerario (sin fechas, que son propias de cada
 * cotización): sirve para detectar si los tramos difieren de la plantilla.
 */
function legsSignature(
  legs: Array<{
    origen_iata: string;
    destino_iata: string;
    millas_nauticas: number | string | null;
    pasajeros?: number | null;
    es_ferry?: boolean | null;
    requiere_pernocta?: boolean | null;
    pernocta_costo_usd?: number | string | null;
    tipo_parada?: "NORMAL" | "SERVICIO" | null;
    servicio_notas?: string | null;
  }>,
): string {
  return JSON.stringify(
    legs.map((l) => [
      l.origen_iata?.toUpperCase() ?? "",
      l.destino_iata?.toUpperCase() ?? "",
      Number(l.millas_nauticas) || 0,
      l.pasajeros ?? null,
      l.es_ferry === true,
      l.requiere_pernocta === true,
      l.pernocta_costo_usd != null ? Number(l.pernocta_costo_usd) : null,
      l.tipo_parada === "SERVICIO" ? "SERVICIO" : "NORMAL",
      l.servicio_notas ?? null,
    ]),
  );
}

/** Convierte un tramo de ruta (o escala persistida) a EscalaInput con su detalle. */
/**
 * Sugerencia de ruta COMERCIAL para un vuelo con itinerario operativo: abre en
 * CUN y va al último destino comercial (tramos con pasajeros, excluye CUN),
 * ida y vuelta. Es solo un punto de partida editable.
 */
function comercialSugerida(q: PersistedQuote): EscalaInput[] {
  const comerciales = (q.escalas ?? []).filter(
    (e) => !e.solo_operativa && !e.es_ferry,
  );
  const destino =
    [...comerciales].reverse().find((e) => e.destino_iata !== "CUN")
      ?.destino_iata ??
    comerciales[comerciales.length - 1]?.destino_iata ??
    q.destino_iata;
  if (!destino || destino === "CUN") return [];
  const pax = q.pasajeros || 1;
  return [
    tramoToEscala({ origen_iata: "CUN", destino_iata: destino, millas_nauticas: 0, pasajeros: pax }),
    tramoToEscala({ origen_iata: destino, destino_iata: "CUN", millas_nauticas: 0, pasajeros: pax }),
  ];
}

function tramoToEscala(t: {
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: number | string | null;
  pasajeros?: number | null;
  pasajeros_nombres?: string[] | null;
  es_ferry?: boolean | null;
  requiere_pernocta?: boolean | null;
  pernocta_costo_usd?: number | string | null;
  tipo_parada?: "NORMAL" | "SERVICIO" | null;
  servicio_notas?: string | null;
  notas?: string | null;
  fecha_salida_plan?: string | null;
}): EscalaInput {
  return {
    origen_iata: t.origen_iata,
    destino_iata: t.destino_iata,
    millas_nauticas: Number(t.millas_nauticas) || 0,
    pasajeros: t.pasajeros ?? null,
    pasajeros_nombres: t.pasajeros_nombres ?? [],
    es_ferry: t.es_ferry ?? false,
    requiere_pernocta: t.requiere_pernocta ?? false,
    pernocta_costo_usd:
      t.pernocta_costo_usd != null ? Number(t.pernocta_costo_usd) : null,
    tipo_parada: t.tipo_parada ?? "NORMAL",
    servicio_notas: t.servicio_notas ?? null,
    notas: t.notas ?? null,
    // pdf_oculto YA NO se hidrata ni se manda (1-sep): la visibilidad en PDF
    // vive en la escala VIVA (toggle en el detalle) y el API la conserva
    // cuando el cotizador guarda sin la bandera.
    // datetime-local (sin segundos) para el input del editor de tramos.
    fecha_salida_plan: t.fecha_salida_plan ? isoToCancunInput(t.fecha_salida_plan) : null,
  };
}

/**
 * Payload de `/calculate` a partir del form (PURO, F0.5): lo usa el preview
 * en vivo (form debounced) y la detección de deriva del motor (form base).
 * Devuelve null si faltan aeronave, tramos completos o pasajeros.
 */
function armarCalcPayload(
  debounced: QuoteFormValues,
  {
    clienteInterno,
    teniaModeloPersistido,
    teniaMatriculaPersistida,
  }: {
    clienteInterno: boolean;
    teniaModeloPersistido: boolean;
    teniaMatriculaPersistida: boolean;
  },
): CalculateQuoteRequest | null {
  if (!debounced.aeronave_id) return null;
  // Borradores viejos en la URL podían traer el centinela del modo
  // sin-avión (retirado 29-ago): se trata como "sin aeronave" — el estado
  // vacío pide elegir un avión real en lugar de un 400 críptico del motor.
  if (debounced.aeronave_id === "SIN_AVION") return null;
  const modeloTrim = debounced.avion_externo_modelo?.trim() ?? "";
  const matriculaTrim = debounced.avion_externo_matricula?.trim() ?? "";
  const modoPorHoraDeb = debounced.comision_vendedor_modo === "POR_HORA";
  const base: CalculateQuoteRequest = {
    aeronave_id: debounced.aeronave_id,
    ...(debounced.es_externo
      ? {
          es_externo: true,
          // El DTO exige 2-80 / 2-20 SOLO en valores no vacíos: '' explícito
          // = BORRAR la ficha (viaja cuando el campo TENÍA valor persistido
          // y se vació); a medio teclear (1 char) la clave se omite —
          // conserva — para no tirar el preview con un 400 en cada tecla.
          ...(modeloTrim.length >= 2
            ? { avion_externo_modelo: modeloTrim }
            : modeloTrim === "" && teniaModeloPersistido
              ? { avion_externo_modelo: "" }
              : {}),
          ...(matriculaTrim.length >= 2
            ? { avion_externo_matricula: matriculaTrim }
            : matriculaTrim === "" && teniaMatriculaPersistida
              ? { avion_externo_matricula: "" }
              : {}),
        }
      : {}),
    // Con cliente, el motor aplica su tarifa preferencial si la tiene pactada.
    cliente_id: debounced.cliente_id || undefined,
    tipo: "MULTIESCALA",
    tipo_tarifa: debounced.tipo_tarifa,
    pasajeros: Number(debounced.pasajeros) || 0,
    pase_abordar: debounced.pase_abordar,
    sobrevuelo_hr:
      Number(debounced.sobrevuelo_hr) > 0
        ? Number(debounced.sobrevuelo_hr)
        : undefined,
    tiempo_cobrable_override_hr:
      Number(debounced.tiempo_cobrable_override_hr) > 0
        ? Number(debounced.tiempo_cobrable_override_hr)
        : undefined,
    cotizacion_abierta: debounced.cotizacion_abierta,
    pdf_mostrar_tarifa: debounced.pdf_mostrar_tarifa,
    pdf_mostrar_itinerario: debounced.pdf_mostrar_itinerario,
    // Un extra MXN sin TC no puede convertirse (el motor lo rechaza con
    // 400 y tiraría el preview): se retiene fuera del cálculo — el editor
    // avisa en ámbar y guardar queda bloqueado (mxnSinTc). Con cantidad ×
    // unitario el monto NO se calcula aquí: lo deriva el motor.
    extras: extrasAPayload(debounced.extras, {
      tcCapturado: Number(debounced.tc_usd_mxn) > 0,
    }),
    // Con redondeo automático solo viaja el descuento; el motor resuelve el
    // redondeo exacto al siguiente múltiplo de $10.
    ajuste_final_usd: debounced.redondeo_auto
      ? -(Number(debounced.descuento_usd) || 0)
      : (Number(debounced.redondeo_usd) || 0) - (Number(debounced.descuento_usd) || 0),
    redondeo_automatico: debounced.redondeo_auto || undefined,
    // Externos LEGADO (2-sep-2026): sin input ya no viaja captura nueva —
    // aquí solo pasa el pactado REHIDRATADO de folios que ya lo tenían,
    // para que el preview y la revisión sigan aterrizando su total exacto.
    total_pactado_usd:
      debounced.es_externo && Number(debounced.total_pactado_usd) > 0
        ? Number(debounced.total_pactado_usd)
        : undefined,
    metodo_pago: debounced.metodo_pago,
    metodo_pago_detalle:
      debounced.metodo_pago === "OTRO" && debounced.metodo_pago_detalle.trim()
        ? debounced.metodo_pago_detalle.trim()
        : undefined,
    tc_usd_mxn:
      Number(debounced.tc_usd_mxn) > 0 ? Number(debounced.tc_usd_mxn) : undefined,
    comision_billpocket_pct:
      debounced.metodo_pago === "BILLPOCKET" &&
      Number(debounced.comision_billpocket_pct) > 0
        ? Math.min(Number(debounced.comision_billpocket_pct), 20)
        : undefined,
    // Comisión del vendedor: SOLO viaja lo que aplica a la modalidad activa
    // (sin ceros falsos). POR_HORA ⇒ modo + tarifa (el motor resuelve
    // tarifa × horas cobradas); FIJA (default del API) ⇒ solo el monto.
    comision_vendedor_modo:
      modoPorHoraDeb && Number(debounced.comision_vendedor_tarifa_hr) > 0
        ? "POR_HORA"
        : undefined,
    comision_vendedor_tarifa_hr:
      modoPorHoraDeb && Number(debounced.comision_vendedor_tarifa_hr) > 0
        ? Number(debounced.comision_vendedor_tarifa_hr)
        : undefined,
    comision_vendedor_usd:
      !modoPorHoraDeb && Number(debounced.comision_vendedor_usd) > 0
        ? Number(debounced.comision_vendedor_usd)
        : undefined,
    comision_vendedor_nombre:
      ((modoPorHoraDeb &&
        Number(debounced.comision_vendedor_tarifa_hr) > 0) ||
        (!modoPorHoraDeb &&
          Number(debounced.comision_vendedor_usd) > 0)) &&
      debounced.comision_vendedor_nombre.trim()
        ? debounced.comision_vendedor_nombre.trim()
        : undefined,
  };
  const legs = debounced.escalas ?? [];
  if (legs.length >= 1) {
    // Itinerario propio de la cotización (plantilla hidratada y ajustable).
    const incomplete = legs.some(
      (l) =>
        !l.origen_iata ||
        !l.destino_iata ||
        !(Number(l.millas_nauticas) > 0),
    );
    if (incomplete) return null;
    base.escalas = legs.map((l) => ({
      origen_iata: l.origen_iata,
      destino_iata: l.destino_iata,
      millas_nauticas: Number(l.millas_nauticas),
      pasajeros: l.es_ferry ? 0 : (l.pasajeros ?? null),
      pasajeros_nombres: l.es_ferry
        ? []
        : (l.pasajeros_nombres ?? []).map((n) => n.trim()).filter(Boolean),
      es_ferry: l.es_ferry ?? false,
      requiere_pernocta: l.requiere_pernocta ?? false,
      pernocta_costo_usd: l.pernocta_costo_usd ?? null,
      tipo_parada: l.tipo_parada ?? "NORMAL",
      servicio_notas: l.servicio_notas ?? null,
      notas: l.notas?.trim() ? l.notas.trim() : null,
      fecha_salida_plan: l.fecha_salida_plan ? cancunInputToIso(l.fecha_salida_plan) : null,
    }));
    // La ruta guardada queda solo como referencia de la plantilla usada.
    if (debounced.ruta_id) base.ruta_id = debounced.ruta_id;
  } else if (debounced.ruta_id) {
    // Sin tramos locales: el backend hidrata los de la ruta guardada.
    base.ruta_id = debounced.ruta_id;
  } else {
    return null;
  }
  // Con pax POR TRAMO completo, el "global" que viaja (y que la lista y
  // el PDF muestran) es el MÁXIMO de los tramos — el capturado queda
  // congelado sin efecto en el precio (cada tramo manda su propio pax).
  const tramosPaxDeb = (debounced.escalas ?? []).filter((l) => !l.es_ferry);
  const paxPorTramoDebounced =
    tramosPaxDeb.length > 0 &&
    tramosPaxDeb.every((l) => l.pasajeros != null && `${l.pasajeros}` !== "");
  const maxPaxTramosDebounced = paxPorTramoDebounced
    ? Math.max(...tramosPaxDeb.map((l) => Number(l.pasajeros) || 0))
    : 0;
  if (paxPorTramoDebounced) {
    base.pasajeros = Math.max(1, maxPaxTramosDebounced);
  }
  if (base.pasajeros < 1) return null;
  // Campo vacío = sin override (el input devuelve "" y Number("") es 0: no
  // se puede confiar en la verdad/falsedad del valor crudo).
  const tarifaRaw = `${debounced.tarifa_hora_override_usd ?? ""}`.trim();
  if (tarifaRaw !== "" && Number(tarifaRaw) > 0) {
    base.tarifa_hora_override_usd = Number(tarifaRaw);
  } else if (clienteInterno && tarifaRaw !== "" && Number(tarifaRaw) === 0) {
    // Cliente INTERNO: el 0 tecleado es intencional (vuelo de la empresa sin
    // cobro) y debe ganarle a la tarifa preferencial pactada del cliente.
    // En clientes normales el 0 se sigue ignorando: el motor respondería 400
    // "sin tarifa configurada" y tiraría el preview en cada tecla.
    base.tarifa_hora_override_usd = 0;
  }
  if (!debounced.cobrar_tuas) {
    // Switch rápido apagado: la TUAS no se cobra en esta cotización.
    base.tuas_override_usd_pax = 0;
  } else {
    if (debounced.tuas_override_usd_pax !== null && debounced.tuas_override_usd_pax !== undefined) {
      base.tuas_override_usd_pax = Number(debounced.tuas_override_usd_pax);
    }
    // TUAS capturadas por aeropuerto (mandan sobre catálogo y override).
    // Regla compartida con la cotización de GRUPO (`tuasLineasAPayload`):
    // $0 capturado viaja (pass-through cero); una línea MXN > 0 sin TC se
    // retiene fuera del cálculo — la card lo avisa y guardar se bloquea.
    const lineas = tuasLineasAPayload(debounced.tuas_lineas, {
      tcCapturado: Number(debounced.tc_usd_mxn) > 0,
    });
    if (lineas.length > 0) base.tuas_lineas = lineas;
  }
  if (debounced.iva_pct_override !== null && debounced.iva_pct_override !== undefined) {
    base.iva_pct_override = Number(debounced.iva_pct_override);
  }
  return base;
}

/** uuid v4 para `client_request_id` (con fallback si no hay crypto.randomUUID). */
function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function QuoteCalculator(props: QuoteCalculatorProps) {
  const { aircraft, routes, airports: airportsCatalogo } = props;
  const mode = props.mode ?? "create";
  const isRevise = mode === "revise";
  // Edición directa (F0): LECTURA solo cuando el candado lo exige.
  const bloqueadoRazon = isRevise ? (props.bloqueadoRazon ?? null) : null;
  const lectura = isRevise && !!bloqueadoRazon;
  const requiereConfirmacionEdicion = isRevise
    ? !!props.requiereConfirmacionEdicion
    : false;
  const onEstadoEdicion = isRevise ? props.onEstadoEdicion : undefined;
  const onGuardado = isRevise ? props.onGuardado : undefined;
  const tramoExtra = isRevise ? props.tramoExtra : undefined;
  const notaTramos = isRevise ? props.notaTramos : undefined;
  const escalasPdfProp = isRevise ? props.escalasPdf : undefined;
  const cobroBarra = isRevise ? props.cobro : undefined;

  const initialQuote = isRevise ? props.initialQuote : undefined;
  // Hijo de una cotización de GRUPO (4-sep): los renglones de extras con
  // origen GRUPO se pintan bloqueados con la liga al grupo.
  const grupoDelHijo = grupoDeVuelo(initialQuote as (typeof initialQuote & VueloConGrupo) | undefined);
  const clientName = isRevise ? props.clientName : undefined;
  const reviseClienteInterno = isRevise ? (props.clientEsInterno ?? false) : false;
  // Catálogo de clientes solo en el alta (en revisión el cliente es fijo).
  const clientsProp = isRevise ? undefined : props.clients;
  const frequentClientIds = isRevise ? [] : (props.frequentClientIds ?? []);

  const router = useRouter();

  // Aeropuertos creados SIN salir del cotizador (28-ago): se suman al
  // catálogo que llegó por props y quedan seleccionables al instante en la
  // ruta rápida, los tramos comerciales y la ruta operativa; el
  // router.refresh() de fondo trae el catálogo ya actualizado del servidor
  // (mismo patrón que extraClients / extraRoutes).
  const [extraAirports, setExtraAirports] = useState<AirportOption[]>([]);
  const airports = useMemo<AirportOption[]>(
    () =>
      [
        ...airportsCatalogo.filter(
          (a) => !extraAirports.some((e) => e.iata === a.iata),
        ),
        ...extraAirports,
      ].sort((a, b) => a.iata.localeCompare(b.iata)),
    [airportsCatalogo, extraAirports],
  );
  const onAeropuertoCreado = (a: Airport) => {
    setExtraAirports((prev) => [
      ...prev.filter((x) => x.iata !== a.iata),
      { iata: a.iata, nombre: a.nombre, latitud: a.latitud, longitud: a.longitud },
    ]);
    router.refresh();
  };
  // (26-ago) La TotalBar fija de arriba sustituyó al observer de
  // visibilidad + barra flotante inferior del layout de 2 columnas.

  // Editar el nombre del cliente AHÍ MISMO (26-ago): al crear uno nuevo en
  // el cotizador y equivocarse en el nombre, no había forma de corregirlo
  // sin salir a Catálogos.
  const [editClienteOpen, setEditClienteOpen] = useState(false);
  const [editClienteNombre, setEditClienteNombre] = useState("");
  const [editClienteSaving, startEditCliente] = useTransition();
  // Confirmación de "poner todo en $0" (borra extras y overrides capturados).
  const [ceroOpen, setCeroOpen] = useState(false);
  const [saving, startSaving] = useTransition();

  // Clientes creados inline desde el cotizador (sin ir a "Clientes").
  const [extraClients, setExtraClients] = useState<ClientOption[]>([]);
  const [clientDialogOpen, setClientDialogOpen] = useState(false);

  // Rutas que el cliente suele pedir (historial agrupado): se cargan al
  // seleccionar cliente, para no perderse entre todas las rutas del catálogo.
  const [rutasSugeridas, setRutasSugeridas] = useState<RutaSugerida[]>([]);

  // Rutas creadas inline desde el sheet. Se agregan al dropdown sin esperar
  // a un revalidate del servidor para que el flujo del cotizador sea continuo.
  const [extraRoutes, setExtraRoutes] = useState<RouteOption[]>([]);
  const [routeSheetOpen, setRouteSheetOpen] = useState(false);

  // Dedupe por id: tras crear una ruta inline, router.refresh() la trae también
  // del servidor y sin esto aparecería duplicada en el dropdown.
  const allClients = useMemo(() => {
    const base = clientsProp ?? [];
    const seen = new Set(base.map((c) => c.id));
    return [...base, ...extraClients.filter((c) => !seen.has(c.id))];
  }, [clientsProp, extraClients]);

  const allRoutes = useMemo(() => {
    const seen = new Set(routes.map((r) => r.id));
    return [...routes, ...extraRoutes.filter((r) => !seen.has(r.id))];
  }, [routes, extraRoutes]);

  // Default a la primera aeronave con tarifa configurada. Las aeronaves "sin
  // tarifa" siguen en el dropdown (marcadas como tal) pero no se pre-seleccionan
  // porque el motor de cálculo las rechaza con 400.
  const defaultAircraftId = useMemo(
    () =>
      aircraft.find((a) => a.tarifa_hora_pub_usd || a.tarifa_hora_broker_usd)?.id ??
      aircraft[0]?.id ??
      "",
    [aircraft],
  );

  // Default ruta: la primera SIMPLE, porque arrancamos en tipo REDONDO.
  const defaultRutaId = useMemo(
    () => routes.find((r) => r.tipo === "SIMPLE")?.id ?? "",
    [routes],
  );

  const formDefaults = useMemo<QuoteFormValues>(() => {
    if (initialQuote) {
      const q = initialQuote;
      // Para revise arrancamos en modo manual con las escalas del snapshot del
      // vuelo (no del catalogo, que pudo haber cambiado). Una cotización legacy
      // REDONDO sin escalas se traduce a sus 2 tramos equivalentes (ida+regreso).
      const nmOneWay = q.millas_nauticas_one_way
        ? Number(q.millas_nauticas_one_way)
        : 0;
      const legacyLegs: EscalaInput[] = [
        tramoToEscala({
          origen_iata: q.origen_iata,
          destino_iata: q.destino_iata,
          millas_nauticas: nmOneWay,
          pasajeros: q.pasajeros,
        }),
        ...(q.es_redondo_auto
          ? [
              tramoToEscala({
                origen_iata: q.destino_iata,
                destino_iata: q.origen_iata,
                millas_nauticas: nmOneWay,
                pasajeros: q.pasajeros,
              }),
            ]
          : []),
      ];
      return {
        cliente_id: q.cliente_id,
        tipo: "MULTIESCALA" as TipoVuelo,
        // ISO (UTC) -> input datetime-local en hora de Cancún. slice(0,16)
        // mostraba la hora UTC (5h adelantada) y al guardar se corría doble.
        fecha_vuelo: isoToCancunInput(q.fecha_vuelo),
        fecha_traslado_final: q.fecha_traslado_final
          ? isoToCancunInput(q.fecha_traslado_final)
          : "",
        // Externo: el vuelo no tiene avión propio; la referencia de tarifa con
        // la que se cotizó vive en el snapshot. El revise SIEMPRE manda una
        // referencia (el modo sin-avión se retiró 29-ago; snapshots legados
        // con aeronave.id null — 0 en prod — caen al avión default para no
        // tirar el cálculo con un 400 críptico).
        aeronave_id:
          q.aeronave_id ?? q.calculo_snapshot?.aeronave?.id ?? defaultAircraftId,
        // El vínculo a la ruta del catálogo se conserva (antes se perdía al
        // revisar y salía el aviso falso "difiere de la ruta guardada").
        ruta_id: q.ruta_id ?? "",
        escalas: q.itinerario_operativo
          ? // Itinerario operativo: las escalas del vuelo son la ruta REAL del
            // piloto, no la comercial. La comercial COTIZADA vive en el
            // snapshot del cálculo — si ya se cotizó, se prefill con ESOS
            // tramos (revisar debe partir de lo pactado); la convención
            // CUN→destino→CUN solo aplica la primera vez (sin snapshot).
            (q.calculo_snapshot?.tramos?.length ?? 0) > 0
            ? q.calculo_snapshot!.tramos!.map((t) =>
                tramoToEscala({
                  origen_iata: t.origen,
                  destino_iata: t.destino,
                  millas_nauticas: t.millas,
                  pasajeros: t.pasajeros,
                  es_ferry: t.es_ferry,
                  requiere_pernocta: t.requiere_pernocta,
                  pernocta_costo_usd: t.pernocta_usd,
                  tipo_parada: t.tipo_parada,
                  servicio_notas: t.servicio_notas,
                }),
              )
            : comercialSugerida(q)
          : q.escalas && q.escalas.filter((e) => !e.solo_operativa).length > 0
            ? q.escalas
                .filter((e) => !e.solo_operativa)
                .map((e) => tramoToEscala(e))
            : legacyLegs,
        tipo_tarifa: q.tarifa_tipo,
        pasajeros: q.pasajeros,
        pase_abordar: q.pase_abordar,
        sobrevuelo_hr:
          Number(q.calculo_snapshot?.tiempos?.sobrevuelo_hr) > 0
            ? Number(q.calculo_snapshot!.tiempos.sobrevuelo_hr)
            : null,
        tiempo_cobrable_override_hr:
          q.calculo_snapshot?.tiempos?.cobrable_proviene_de_override === true &&
          Number(q.calculo_snapshot?.tiempos?.cobrable_hr) > 0
            ? Number(q.calculo_snapshot!.tiempos.cobrable_hr)
            : null,
        // El switch de TUAS apagado se guardó como override $0/pax; un override
        // distinto de 0 se re-hidrata en el campo avanzado para no perderlo.
        cobrar_tuas: q.calculo_snapshot?.tuas?.usd_pax_default !== 0,
        // TUAS capturadas por aeropuerto: el snapshot guarda las líneas tal
        // cual (lineas_capturadas, motor ≥1.3.1); fallback para snapshots que
        // solo traen filas (las capturadas llevan "monto capturado" en razon).
        // Las de monto 0 se CONSERVAN: significan "TUA en $0" (pass-through
        // cero), no "volver al catálogo".
        tuas_lineas:
          (q.calculo_snapshot?.tuas?.lineas_capturadas?.length ?? 0) > 0
            ? q.calculo_snapshot!.tuas!.lineas_capturadas!.map((l) => ({
                iata: l.iata,
                monto_pax: Number(l.monto_pax) || 0,
                moneda: l.moneda === "MXN" ? ("MXN" as const) : ("USD" as const),
              }))
            : (q.calculo_snapshot?.tuas?.filas ?? [])
                .filter(
                  (f) => f.monto_pax > 0 && f.razon?.includes("monto capturado"),
                )
                .map((f) => ({
                  iata: f.iata,
                  monto_pax: f.monto_pax,
                  moneda: f.moneda === "MXN" ? ("MXN" as const) : ("USD" as const),
                })),
        cotizacion_abierta: q.cotizacion_abierta ?? false,
        pdf_mostrar_tarifa: q.pdf_mostrar_tarifa ?? false,
        pdf_mostrar_itinerario: q.pdf_mostrar_itinerario ?? true,
        es_externo: q.es_externo ?? false,
        operador_externo: q.operador_externo ?? "",
        // Ficha del avión ajeno: la persiste el vuelo; fallback al snapshot
        // cuando la cotización nació sin avión (aeronave.id null).
        avion_externo_modelo:
          q.avion_externo_modelo ??
          (q.calculo_snapshot?.aeronave?.id == null
            ? (q.calculo_snapshot?.aeronave?.modelo ?? "")
            : ""),
        avion_externo_matricula:
          q.avion_externo_matricula ??
          (q.calculo_snapshot?.aeronave?.id == null
            ? (q.calculo_snapshot?.aeronave?.matricula ?? "")
            : ""),
        // Costo NATIVO del operador (29-ago: puede ser MXN). Respuestas del
        // API previo solo traen el USD derivado: se cae a él con moneda USD.
        costo_externo_monto:
          q.costo_externo_monto != null
            ? Number(q.costo_externo_monto)
            : q.costo_externo_usd != null
              ? Number(q.costo_externo_usd)
              : null,
        costo_externo_moneda:
          q.costo_externo_monto != null && q.costo_externo_moneda === "MXN"
            ? "MXN"
            : "USD",
        // LEGADO (2-sep-2026): el input del pactado se eliminó del cotizador,
        // pero el valor persistido (calculo_snapshot.meta) se SIGUE
        // rehidratando para que revisar un folio vivo (24/69/148) no
        // recalcule ni pise su total acordado. El API además lo ancla a lo
        // persistido en revise() y lo descarta al crear.
        total_pactado_usd:
          Number(q.calculo_snapshot?.meta?.total_pactado_usd) > 0
            ? Number(q.calculo_snapshot?.meta?.total_pactado_usd)
            : null,
        // La comisión BillPocket la sintetiza el motor: no se edita como extra.
        // El editor trabaja con el monto NATIVO del renglón (monto_usd es
        // nombre legado): un extra MXN persistido trae el canon convertido en
        // monto_usd y los pesos reales en monto_nativo — rehidratar el canon
        // como nativo re-interpretaría dólares como pesos.
        // 4-sep: cantidad × unitario, por_persona y la liga de GRUPO
        // (origen/grupo_extra_id) se conservan tal cual (fuente única
        // normalizarExtrasEditor) — un renglón de grupo viaja intacto.
        extras: normalizarExtrasEditor(
          (q.extras ?? []).filter(
            (e) => !e.concepto?.startsWith("Comisión BillPocket"),
          ),
        ),
        // Con redondeo automático activo, el ajuste guardado es
        // redondeo_auto − descuento: se re-hidrata el descuento BASE desde
        // meta y el redondeo se vuelve a resolver en el motor. (27-ago: el
        // auto ya NO es default — sin bandera en meta se rehidrata APAGADO.)
        redondeo_auto: q.calculo_snapshot?.meta?.redondeo_automatico ?? false,
        redondeo_usd:
          q.calculo_snapshot?.meta?.redondeo_automatico ?? false
            ? null
            : Number(q.ajuste_final_usd) > 0
              ? Number(q.ajuste_final_usd)
              : null,
        descuento_usd:
          q.calculo_snapshot?.meta?.descuento_usd ??
          (Number(q.ajuste_final_usd) < 0 ? Math.abs(Number(q.ajuste_final_usd)) : null),
        metodo_pago: (q.metodo_cobro ?? "TRANSFERENCIA") as MetodoPago,
        metodo_pago_detalle: q.metodo_cobro_detalle ?? "",
        tc_usd_mxn: Number(q.tc_usd_mxn) > 0 ? Number(q.tc_usd_mxn) : null,
        comision_billpocket_pct:
          q.calculo_snapshot?.meta?.comision_billpocket_pct ?? null,
        comision_vendedor_modo:
          q.calculo_snapshot?.meta?.comision_vendedor_modo === "POR_HORA"
            ? "POR_HORA"
            : "FIJA",
        // En POR_HORA el meta trae la comisión EFECTIVA (tarifa × horas): no
        // rehidratarla como monto fijo — se rehidrata la tarifa capturada.
        comision_vendedor_usd:
          q.calculo_snapshot?.meta?.comision_vendedor_modo === "POR_HORA"
            ? null
            : (q.calculo_snapshot?.meta?.comision_vendedor_usd ?? null),
        comision_vendedor_tarifa_hr:
          Number(q.calculo_snapshot?.meta?.comision_vendedor_tarifa_hr) > 0
            ? Number(q.calculo_snapshot?.meta?.comision_vendedor_tarifa_hr)
            : null,
        comision_vendedor_nombre:
          q.calculo_snapshot?.meta?.comision_vendedor_nombre ?? "",
        // La tarifa AJUSTADA a mano se rehidrata como override (bug 17-ago:
        // #105 v4 pactada a $989.58/hr salía a Revisar con la default del
        // avión a $1,050 y la v5 perdía lo pactado en silencio). SOLO cuando
        // fue override manual (proviene_de_override): una tarifa que venía
        // del avión o de la preferencial del cliente debe RE-resolverse
        // (cambiar PUBLICO↔BROKER o el avión debe recalcular).
        tarifa_hora_override_usd:
          q.calculo_snapshot?.tarifa?.proviene_de_override === true &&
          Number(q.tarifa_hora_usd) > 0
            ? Number(q.tarifa_hora_usd)
            : null,
        tuas_override_usd_pax:
          Number(q.calculo_snapshot?.tuas?.usd_pax_default) > 0
            ? Number(q.calculo_snapshot!.tuas.usd_pax_default)
            : null,
        // IVA manual DETECTABLE: se cobró IVA aunque el método de pago no lo
        // pide → era override y se rehidrata. (Un % custom sobre un método
        // CON IVA no es distinguible del estándar: ese caso se re-resuelve.)
        iva_pct_override:
          q.calculo_snapshot?.iva?.aplica_por_metodo_pago === false &&
          Number(q.iva_pct) > 0
            ? Number(q.iva_pct)
            : null,
        notas: q.notas ?? "",
        notas_internas: q.notas_internas ?? "",
        motivo: "",
        // Con override manual el segmento arranca en «Personalizada».
        tarifa_personalizada:
          q.calculo_snapshot?.tarifa?.proviene_de_override === true &&
          Number(q.tarifa_hora_usd) > 0,
        escalas_operacion: [],
      };
    }
    return {
      cliente_id: "",
      tipo: "MULTIESCALA",
      fecha_vuelo: "",
      fecha_traslado_final: "",
      aeronave_id: defaultAircraftId,
      ruta_id: defaultRutaId,
      escalas: [],
      tipo_tarifa: "PUBLICO",
      pasajeros: 2,
      pase_abordar: false,
      sobrevuelo_hr: null,
      tiempo_cobrable_override_hr: null,
      cobrar_tuas: true,
      tuas_lineas: [],
      cotizacion_abierta: false,
      // PDF (27-ago): tarifa/hr oculta e itinerario visible por defecto.
      pdf_mostrar_tarifa: false,
      pdf_mostrar_itinerario: true,
      es_externo: false,
      operador_externo: "",
      avion_externo_modelo: "",
      avion_externo_matricula: "",
      costo_externo_monto: null,
      costo_externo_moneda: "USD",
      total_pactado_usd: null,
      extras: [],
      // Redondeo automático APAGADO por default (27-ago): se prende a propósito.
      redondeo_auto: false,
      redondeo_usd: null,
      descuento_usd: null,
      metodo_pago: "TRANSFERENCIA",
      metodo_pago_detalle: "",
      tc_usd_mxn: null,
      comision_billpocket_pct: null,
      comision_vendedor_modo: "FIJA",
      comision_vendedor_usd: null,
      comision_vendedor_tarifa_hr: null,
      comision_vendedor_nombre: "",
      tarifa_hora_override_usd: null,
      tuas_override_usd_pax: null,
      iva_pct_override: null,
      notas: "",
      notas_internas: "",
      motivo: "",
      tarifa_personalizada: false,
      escalas_operacion: [],
    };
  }, [initialQuote, defaultAircraftId, defaultRutaId]);

  const {
    register,
    watch,
    setValue,
    reset,
    getValues,
  } = useForm<QuoteFormValues>({
    mode: "onChange",
    defaultValues: formDefaults,
  });

  // «Personalizada» del segmento de tarifa (F0.5: vive en RHF).
  const setTarifaCustom = useCallback(
    (v: boolean) => setValue("tarifa_personalizada", v),
    [setValue],
  );

  // BASE de comparación del diff (F0): los defaults con los que se hizo el
  // último reset + la versión que representan (candado optimista). No es
  // `formDefaults` a secas: tras un router.refresh() con el form SUCIO los
  // defaults nuevos NO se aplican (el borrador es del operador) y la base
  // sigue siendo la versión que él abrió.
  const [base, setBase] = useState<{ defaults: QuoteFormValues; version: number }>(
    () => ({ defaults: formDefaults, version: initialQuote?.cotizacion_version ?? 0 }),
  );
  // Tras guardar con éxito: el siguiente refresh SÍ resetea (trae la vN+1).
  const esperandoRefreshRef = useRef(false);
  // Otra persona guardó una versión mientras había borrador (409 / refresh).
  const [conflictoVersion, setConflictoVersion] = useState<number | null>(null);

  // Restaura el borrador de la URL UNA vez al montar. Alta: tal cual (?d= se
  // va escribiendo con el mismo debounce). Revisión (F0): el borrador que
  // dejó «Recargar conservando borrador» se REAPLICA sobre la versión actual
  // (nunca el cliente ni la versión) y el parámetro se quita para que un F5
  // no lo reaplique dos veces.
  const draftRestaurado = useRef(false);
  useEffect(() => {
    if (draftRestaurado.current) return;
    draftRestaurado.current = true;
    const url = new URL(window.location.href);
    const raw = url.searchParams.get(DRAFT_PARAM);
    if (!raw) return;
    const f = decodeDraft(raw);
    if (!f) return;
    if (isRevise) {
      if (lectura) return;
      const resto: Partial<QuoteFormValues> = { ...f };
      delete resto.cliente_id;
      delete resto.motivo;
      delete resto.escalas_operacion;
      reset({ ...formDefaults, ...resto });
      url.searchParams.delete(DRAFT_PARAM);
      window.history.replaceState(null, "", url.toString());
      toast.info(
        `Se reaplicó tu borrador sobre la v${initialQuote?.cotizacion_version ?? ""}. Revísalo antes de guardar.`,
      );
      return;
    }
    reset({ ...formDefaults, ...f });
    toast.info("Se restauró tu avance desde la URL.");
    // Solo al montar; formDefaults es estable en el alta nueva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El server rehidrató la cotización (router.refresh tras guardar, toggles
  // del PDF, acciones de la barra, alta inline de rutas/aeropuertos):
  // - form LIMPIO, lectura o recién guardado → se resetea a lo persistido;
  // - form SUCIO → el borrador NO se pisa; si además cambió la versión, se
  //   avisa (banner) y la base sigue siendo la versión que se abrió.
  //
  // Reacciona SOLO a un `formDefaults` nuevo del servidor (ref de "ya
  // procesado"), nunca a un cambio de `base`: tras guardar, `setBase(
  // getValues())` cambia la base y, si este efecto dependiera de ella,
  // resetearía el form a los defaults VIEJOS (la vN) antes de que llegue el
  // refresh con la vN+1 — parpadeo de valores/total anteriores y el
  // `esperandoRefreshRef` consumido a destiempo (revisión 8-sep).
  const baseRef = useRef(base);
  baseRef.current = base;
  const defaultsProcesadosRef = useRef(formDefaults);
  useEffect(() => {
    // Solo revisión: en el alta los defaults no representan nada guardado.
    if (!isRevise || formDefaults === defaultsProcesadosRef.current) return;
    defaultsProcesadosRef.current = formDefaults;
    const b = baseRef.current;
    const versionNueva = initialQuote?.cotizacion_version ?? 0;
    const sucioAhora = resumirCambios(b.defaults, getValues()).length > 0;
    if (lectura || !sucioAhora || esperandoRefreshRef.current) {
      esperandoRefreshRef.current = false;
      reset(formDefaults);
      setBase({ defaults: formDefaults, version: versionNueva });
      setConflictoVersion(null);
      return;
    }
    if (versionNueva !== b.version) setConflictoVersion(versionNueva);
  }, [formDefaults, lectura, isRevise, initialQuote, reset, getValues]);

  const values = watch();
  // Ruta operativa (solo alta): vive en RHF; el panel interno la edita.
  const opsLegs = values.escalas_operacion ?? [];
  const tarifaCustom = values.tarifa_personalizada === true;
  // IMPORTANTE: serializamos el form a JSON antes de pasarlo al debounce.
  // watch() devuelve un objeto NUEVO en cada render (referencia distinta aunque
  // los valores sean iguales), lo que provocaría un bucle infinito de debounce
  // → useEffect → setState → re-render → watch() nuevo objeto → debounce otra vez.
  // Con string, la comparación es por valor: solo cambia cuando los datos cambian.
  // `motivo` (texto libre del diálogo «Guardar vN») queda FUERA: no es un
  // dato de la cotización (el diff lo ignora) y, si entrara, cada tecla del
  // motivo reabriría la ventana del debounce y apagaría el botón Guardar del
  // diálogo (previewFresco) sin motivo.
  const valuesJson = JSON.stringify({ ...values, motivo: undefined });
  const debouncedJson = useDebouncedValue(valuesJson, 350);
  const debounced = useMemo<QuoteFormValues>(
    () => JSON.parse(debouncedJson),
    [debouncedJson],
  );

  // DIFF SEMÁNTICO vs la base (F0): decide «hay algo que guardar», el badge
  // «v2 → v3 ●», el resumen del diálogo y el prefijo del motivo. Ignora
  // normalizaciones ("4" vs 4, espacios) y campos que no son datos (motivo,
  // modo de tarifa). Solo en revisión: el alta no compara contra nada.
  const cambios = useMemo(
    () =>
      isRevise
        ? resumirCambios(base.defaults, JSON.parse(valuesJson) as QuoteFormValues, {
            aviones: aircraft,
          })
        : [],
    [isRevise, base.defaults, valuesJson, aircraft],
  );
  const sucio = isRevise && !lectura && cambios.length > 0;
  // D5 (F2): solo notas del cliente / toggles del PDF → sin versión.
  const soloPresentacion =
    sucio && cambios.every((c) => CLAVES_PRESENTACION.has(c.clave));
  const resumenCambios = textoResumenCambios(cambios, 4);
  const versionSiguiente = (initialQuote?.cotizacion_version ?? 0) + 1;
  // Teclas en curso: el debounce aún no asienta (el motor espera).
  const enEsperaDebounce = debouncedJson !== valuesJson;

  // Escribe el borrador en la URL con el MISMO debounce del cálculo.
  // Pristino (igual a los defaults) = sin parámetro, para no ensuciar URLs.
  useEffect(() => {
    if (isRevise || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    // Misma serialización que valuesJson (sin `motivo`): pristino = igual a
    // los defaults.
    if (debouncedJson === JSON.stringify({ ...formDefaults, motivo: undefined })) {
      if (!url.searchParams.has(DRAFT_PARAM)) return;
      url.searchParams.delete(DRAFT_PARAM);
    } else {
      url.searchParams.set(DRAFT_PARAM, encodeDraft(debounced));
    }
    window.history.replaceState(null, "", url.toString());
    // formDefaults estable; debouncedJson representa a debounced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedJson, isRevise]);

  // Cliente INTERNO (operación propia): el motor permite cotizar en $0 (sin
  // hora mínima, tarifa 0, sin cobro esperado) — la UI no debe estorbar.
  // La validación real vive en el server; para clientes normales nada cambia.
  const clienteInterno = isRevise
    ? reviseClienteInterno
    : !!allClients.find((c) => c.id === values.cliente_id)?.es_interno;

  // Ficha persistida al abrir (solo revise): distingue "vaciar el campo" =
  // '' explícito al API (BORRAR la ficha) de "nunca hubo" = omitir la clave.
  const teniaModeloPersistido =
    isRevise && formDefaults.avion_externo_modelo !== "";
  const teniaMatriculaPersistida =
    isRevise && formDefaults.avion_externo_matricula !== "";

  // Costo del operador externo capturado en MXN: exige TC para derivar su
  // USD. Sin TC no puede derivarse (invariante de dinero: un MXN jamás se
  // suma crudo como USD ni se persiste a medias) — guardar se bloquea hasta
  // capturar el TC.
  const costoExternoEnMxn =
    values.es_externo &&
    values.costo_externo_moneda === "MXN" &&
    Number(values.costo_externo_monto) > 0;
  const costoExternoMxnSinTc =
    costoExternoEnMxn && !(Number(values.tc_usd_mxn) > 0);

  // "Todo en $0" para vuelos de la empresa: el motor ya pone la TARIFA en 0
  // para internos, pero TUAS, pernoctas, extras, comisión del vendedor y
  // descuentos siguen sumando. Esto apaga de un golpe todo lo que le cobraría
  // al cliente, sin tocar lo OPERATIVO (tramos, tiempos, sobrevuelo, costo del
  // operador externo): el vuelo sigue pesando en el balance del avión.
  const ponerTodoEnCero = () => {
    const opts = { shouldDirty: true } as const;
    setValue("tarifa_hora_override_usd", 0, opts);
    setValue("cobrar_tuas", false, opts);
    setValue("tuas_override_usd_pax", 0, opts);
    setValue("tuas_lineas", [], opts);
    setValue("extras", [], opts);
    // Un descuento sobre $0 dejaría el total en negativo.
    setValue("descuento_usd", null, opts);
    setValue("redondeo_auto", false, opts);
    setValue("redondeo_usd", null, opts);
    setValue("comision_vendedor_usd", null, opts);
    setValue("comision_vendedor_tarifa_hr", null, opts);
    // La pernocta la sigue marcando el tramo (el piloto sí pernoctó y se le
    // paga como gasto); lo que se pone en 0 es el cargo al cliente.
    setValue(
      "escalas",
      values.escalas.map((e) => ({ ...e, pernocta_costo_usd: 0 })),
      opts,
    );
    // Externo LEGADO (2-sep-2026: la captura del pactado ya no existe): un
    // pactado rehidratado de folios viejos también va a 0 — esta es la ÚNICA
    // vía que queda para soltarlo; sin este reset, el total se quedaría
    // clavado en lo pactado y el "$0" no cerraría en cero. El costo del
    // operador externo NO se toca, es un gasto real.
    if (values.es_externo) setValue("total_pactado_usd", 0, opts);
    setCeroOpen(false);
    toast.success("Cotización en $0 — revisa y guarda");
  };

  // Identidad ESTABLE por contenido: el payload se compara como JSON, así un
  // cambio del form que NO toca el motor (notas del cliente, notas internas,
  // fechas de traslado, modo de tarifa, ruta operativa del alta) no vuelve a
  // llamar a /calculate con el mismo cuerpo ni apaga «Guardar» mientras se
  // teclea (revisión 8-sep: antes cada tecla en Notas re-disparaba el motor).
  const calcPayloadJson = useMemo<string | null>(() => {
    const p = armarCalcPayload(debounced, {
      clienteInterno,
      teniaModeloPersistido,
      teniaMatriculaPersistida,
    });
    return p ? JSON.stringify(p) : null;
  }, [debounced, clienteInterno, teniaModeloPersistido, teniaMatriculaPersistida]);
  const calcPayload = useMemo<CalculateQuoteRequest | null>(
    () => (calcPayloadJson ? (JSON.parse(calcPayloadJson) as CalculateQuoteRequest) : null),
    [calcPayloadJson],
  );

  // En LECTURA el breakdown es el snapshot PERSISTIDO (lo que se guardó, sin
  // recalcular): arranca con él para que el primer render ya pinte el total.
  const snapshotPersistido = initialQuote?.calculo_snapshot ?? null;
  // Revisión (editable o bloqueada): el primer render ya pinta el snapshot —
  // al montar nunca hay cambios, así que arrancar en null solo producía un
  // parpadeo (TUAS «se llenan al calcular», total de respaldo) hasta que el
  // efecto de abajo lo asentara (revisión 8-sep).
  const [breakdown, setBreakdown] = useState<QuoteBreakdown | null>(
    isRevise ? snapshotPersistido : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Revisión SIN cambios reales: cero llamadas al motor — se pinta el
  // snapshot guardado (regla del rediseño: sin cambios, cero llamadas).
  // D5 (F2): si SOLO cambió presentación (notas/toggles del PDF) el dinero
  // no se mueve — se sigue pintando el snapshot sin llamar al motor.
  const pintaSnapshot = lectura || (isRevise && (!sucio || soloPresentacion));
  useEffect(() => {
    if (pintaSnapshot) {
      // Recién guardado (esperando el refresh con la vN+1): se conserva el
      // breakdown fresco — el snapshot viejo parpadearía un total anterior.
      if (!esperandoRefreshRef.current) setBreakdown(snapshotPersistido);
      setError(null);
      setLoading(false);
      return;
    }
    if (!calcPayload) {
      setBreakdown(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (enEsperaDebounce) {
      // Teclas en curso: la petición se dispara cuando el debounce asiente
      // (evita el disparo con el payload viejo al primer cambio).
      setLoading(true);
      return;
    }
    // AbortController (F0.5): la petición anterior se CANCELA al cambiar el
    // payload — la respuesta vieja ni siquiera llega (última petición gana).
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    calculateQuote(calcPayload, ctrl.signal)
      .then((data) => {
        if (ctrl.signal.aborted) return;
        setBreakdown(data);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        if (isApiError(err)) {
          setError(err.message);
        } else {
          setError(err instanceof Error ? err.message : "Error desconocido");
        }
        setBreakdown(null);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => {
      ctrl.abort();
    };
  }, [calcPayload, pintaSnapshot, snapshotPersistido, enEsperaDebounce]);

  // DERIVA DEL MOTOR (F0): al PRIMER cambio se calcula UNA vez el payload
  // limpio (la base) y se compara con el snapshot. Si el total ya no coincide
  // sin que el operador tocara nada (tarifa preferencial, catálogo, TC), el
  // diálogo de guardar lo dice aparte: «La tarifa cambió desde v2». Con el
  // form limpio jamás se llama al motor.
  const [derivaMotor, setDerivaMotor] = useState<{
    snapshot: number;
    fresco: number;
  } | null>(null);
  const derivaRevisadaRef = useRef(false);
  useEffect(() => {
    if (!isRevise || lectura || !sucio || soloPresentacion || derivaRevisadaRef.current) return;
    if (!snapshotPersistido) return;
    derivaRevisadaRef.current = true;
    const payloadBase = armarCalcPayload(base.defaults, {
      clienteInterno,
      teniaModeloPersistido,
      teniaMatriculaPersistida,
    });
    if (!payloadBase) return;
    calculateQuote(payloadBase)
      .then((b) => {
        const guardado = Number(snapshotPersistido.totales.total_usd) || 0;
        const fresco = Number(b.totales.total_usd) || 0;
        if (Math.abs(guardado - fresco) >= 0.01) {
          setDerivaMotor({ snapshot: guardado, fresco });
        }
      })
      .catch(() => {
        // Solo informativo: sin baseline no hay aviso.
      });
  }, [
    isRevise,
    lectura,
    sucio,
    soloPresentacion,
    snapshotPersistido,
    base.defaults,
    clienteInterno,
    teniaModeloPersistido,
    teniaMatriculaPersistida,
  ]);

  // ===== VISTA PREVIA REAL de la hoja 1 (F1, 8-sep-2026) =====
  // El payload es el MISMO de /calculate + presentación (fechas de
  // traslado, notas, toggles, ojito/fecha por tramo, externo). Con el form
  // LIMPIO (revisión sin cambios o bloqueada) viaja el payload BASE con
  // `quote_id` y `sucio:false`: el API devuelve la hoja del PDF guardado sin
  // recalcular; se pide UNA vez (caché por hash) hasta que cambie la versión.
  // Sucio: viaja el payload debounced y `listo` solo cuando el breakdown ya
  // corresponde a ese payload (encadenado al cálculo, nunca antes).
  // Con solo presentación (D5) la hoja SÍ debe reflejar el borrador (notas,
  // toggles): viaja el payload vivo con sucio:true aunque el dinero sea el
  // snapshot.
  const previewLimpio = isRevise && (lectura || !sucio);
  const previewPayload = useMemo<QuotePreviewPayload | null>(() => {
    const src = previewLimpio ? base.defaults : debounced;
    const calc = previewLimpio
      ? (armarCalcPayload(base.defaults, {
          clienteInterno,
          teniaModeloPersistido,
          teniaMatriculaPersistida,
        }) ??
        // Limpia con datos que el motor rechazaría (folio legado: millas en
        // 0, sin avión): con `quote_id` + `sucio:false` el API arma la hoja
        // desde lo persistido SIN correr el motor y relaja los obligatorios
        // (PreviewQuoteDto), así que basta la identidad de la cotización.
        (initialQuote
          ? ({
              aeronave_id: base.defaults.aeronave_id,
              tipo_tarifa: base.defaults.tipo_tarifa,
              pasajeros: Number(base.defaults.pasajeros) || 0,
              metodo_pago: base.defaults.metodo_pago,
            } satisfies CalculateQuoteRequest)
          : null))
      : calcPayload;
    if (!calc) return null;
    // Ojito/fecha por tramo: solo tramos que coinciden con lo guardado
    // (mismo par y misma cantidad) — regla de los toggles en edición.
    let escalas_pdf: EscalaPdfPreview[] | undefined;
    const escalasSrc = src.escalas ?? [];
    if (
      escalasPdfProp &&
      escalasPdfProp.length > 0 &&
      escalasSrc.length === base.defaults.escalas.length
    ) {
      const coinciden = escalasPdfProp.filter((e) => {
        const b = base.defaults.escalas[e.orden - 1];
        const l = escalasSrc[e.orden - 1];
        return (
          !!b &&
          !!l &&
          b.origen_iata === l.origen_iata &&
          b.destino_iata === l.destino_iata
        );
      });
      if (coinciden.length > 0) escalas_pdf = coinciden;
    }
    // Alta (D4): el ojito/fecha viven en el form y viajan igual que al crear.
    if (!initialQuote) {
      const locales = escalasSrc
        .map((l, i) => ({
          orden: i + 1,
          ...(l.pdf_oculto === true ? { pdf_oculto: true } : {}),
          ...(fechaPdfValida(l.pdf_fecha) ? { pdf_fecha: l.pdf_fecha } : {}),
        }))
        .filter((e) => e.pdf_oculto || e.pdf_fecha);
      if (locales.length > 0) escalas_pdf = locales;
    }
    const notasTrim = (src.notas ?? "").trim();
    const operadorTrim = (src.operador_externo ?? "").trim();
    return {
      ...calc,
      ...(initialQuote ? { quote_id: initialQuote.id } : {}),
      cliente_id: src.cliente_id || undefined,
      ...(src.fecha_vuelo
        ? { fecha_traslado_inicial: cancunInputToIso(src.fecha_vuelo) }
        : {}),
      ...(src.fecha_traslado_final
        ? { fecha_traslado_final: cancunInputToIso(src.fecha_traslado_final) }
        : {}),
      ...(notasTrim ? { notas: src.notas } : {}),
      ...(escalas_pdf ? { escalas_pdf } : {}),
      ...(src.es_externo && operadorTrim.length >= 2
        ? { operador_externo: operadorTrim }
        : {}),
      sucio: !previewLimpio,
    };
  }, [
    previewLimpio,
    base.defaults,
    debounced,
    calcPayload,
    clienteInterno,
    teniaModeloPersistido,
    teniaMatriculaPersistida,
    escalasPdfProp,
    initialQuote,
  ]);
  // Listo = el breakdown en pantalla corresponde a ESTE payload (limpio:
  // no hay cálculo que esperar; el API arma la hoja del snapshot).
  const previewListo =
    previewLimpio || (!loading && !enEsperaDebounce && !!breakdown && !error);

  // Hoja del PDF GUARDADO (ensamble 8-sep): con el form limpio (revisión sin
  // cambios o bloqueada) se pide UNA vez por versión (caché por hash) y de
  // ahí sale el MAPA de la hoja editable (`extraerMapaSvgDeHtml`) — en
  // lectura es su única fuente. Con cambios, la hoja pide el mapa en vivo a
  // `/api/quotes/mapa-svg` (la misma función de dibujo de pyservices). La
  // vista previa anclada/diálogo desapareció: la hoja ES la vista previa.
  const preview = useQuotePreviewHtml({
    payload: error ? null : previewPayload,
    listo: previewListo,
    activo: previewLimpio,
  });
  const mapaSvgGuardado =
    previewLimpio && preview.html ? extraerMapaSvgDeHtml(preview.html) : undefined;
  // «Ver PDF real» (revisión): con cambios sin guardar se guarda primero
  // (diálogo «Guardar vN») y el PDF de la versión nueva se abre al terminar.
  const [pdfRealLoading, setPdfRealLoading] = useState(false);
  const verPdfTrasGuardarRef = useRef(false);
  const verPdfReal = async () => {
    if (!initialQuote) return;
    setPdfRealLoading(true);
    try {
      await abrirPdfCotizacion(initialQuote.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo abrir el PDF");
    } finally {
      setPdfRealLoading(false);
    }
  };

  const selectedAircraft = aircraft.find((a) => a.id === values.aeronave_id);
  // Un tramo posterior puede subir más pax: valida contra el máximo del itinerario.
  // ¿TODOS los tramos (no-ferry) traen su propio pax? Entonces el global NO
  // se edita ni cuenta (26-ago): el TUAS usa el pax de cada tramo y mezclar
  // el global solo confundía (y disparaba avisos de capacidad falsos).
  const tramosConPax = values.escalas.filter((l) => !l.es_ferry);
  const paxPorTramo =
    tramosConPax.length > 0 &&
    tramosConPax.every((l) => l.pasajeros != null && `${l.pasajeros}` !== "");
  const maxPaxTramos = paxPorTramo
    ? Math.max(...tramosConPax.map((l) => Number(l.pasajeros) || 0))
    : 0;
  const maxPasajeros = paxPorTramo
    ? maxPaxTramos
    : values.escalas.length > 0
      ? Math.max(
          Number(values.pasajeros) || 0,
          ...values.escalas
            .filter((l) => !l.es_ferry)
            .map((l) => Number(l.pasajeros) || 0),
        )
      : Number(values.pasajeros) || 0;
  const capacidadExcedida =
    !!selectedAircraft &&
    !!selectedAircraft.asientos &&
    maxPasajeros > selectedAircraft.asientos;
  const tipoTarifa = values.tipo_tarifa;
  // Con override capturado (o modo elegido), el segmento muestra Personalizada.
  const overrideTarifaActivo =
    `${values.tarifa_hora_override_usd ?? ""}`.trim() !== "";
  // El modo se queda PEGADO una vez activo (revise con override, "todo en
  // $0" o valor tecleado): si no, borrar el input a media edición
  // desmontaría el campo al caer el derivado. Solo el segmento lo apaga.
  useEffect(() => {
    if (overrideTarifaActivo && !tarifaCustom) setTarifaCustom(true);
  }, [overrideTarifaActivo, tarifaCustom, setTarifaCustom]);
  const tarifaSegment =
    tarifaCustom || overrideTarifaActivo ? "CUSTOM" : tipoTarifa;

  // ¿El itinerario de esta cotización difiere de la plantilla seleccionada?
  // (Las fechas por tramo no cuentan: son propias de cada cotización.)
  const selectedRouteOpt = allRoutes.find((r) => r.id === values.ruta_id);
  const itinerarioAjustado =
    values.escalas.length > 0 &&
    (!selectedRouteOpt ||
      selectedRouteOpt.tramos.length === 0 ||
      legsSignature(values.escalas) !== legsSignature(selectedRouteOpt.tramos));

  const [savingRoute, startSavingRoute] = useTransition();
  // Guarda el itinerario ajustado como NUEVA ruta del catálogo (la original no
  // se toca: otras cotizaciones que la usan no se ven afectadas) y la vincula
  // a esta cotización.
  const handleSaveAsRoute = () => {
    startSavingRoute(async () => {
      const res = await createRouteAction({
        tramos: values.escalas.map((l) => ({
          origen_iata: l.origen_iata,
          destino_iata: l.destino_iata,
          millas_nauticas: Number(l.millas_nauticas) || 0,
          pasajeros: l.es_ferry ? 0 : (l.pasajeros ?? null),
          es_ferry: l.es_ferry ?? false,
          requiere_pernocta: l.requiere_pernocta ?? false,
          pernocta_costo_usd: l.pernocta_costo_usd ?? null,
          tipo_parada: l.tipo_parada ?? "NORMAL",
          servicio_notas: l.servicio_notas ?? null,
        })),
        fuente: "MANUAL",
        notas: "",
      });
      if (res.ok && res.data) {
        setExtraRoutes((prev) => [...prev, routeToOption(res.data!)]);
        setValue("ruta_id", res.data.id);
        toast.success("Itinerario guardado como nueva ruta del catálogo");
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo guardar la ruta");
      }
    });
  };

  // Hidrata los tramos de la ruta preseleccionada (default) al cargar; el
  // onChange del selector cubre los cambios posteriores.
  //
  // Lee el form VIVO (`getValues`), no el cierre del render: en el mismo
  // commit de montaje el efecto del borrador (?d= / «Copiar como nueva
  // cotización») ya hizo `reset()` con sus tramos, y con `values` del
  // primer render (escalas vacías + ruta default) este efecto los pisaba con
  // la plantilla default en silencio (revisión 8-sep).
  useEffect(() => {
    const rutaId = getValues("ruta_id");
    const escalasVivas = getValues("escalas") ?? [];
    if (!rutaId || escalasVivas.length > 0) return;
    const ruta = allRoutes.find((r) => r.id === rutaId);
    if (ruta && ruta.tramos.length > 0) {
      setValue("escalas", ruta.tramos.map(tramoToEscala));
    }
    // setValue/getValues son estables en RHF; values.* solo re-dispara.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.ruta_id, values.escalas.length, allRoutes]);

  // Carga las sugerencias de ruta al cambiar de cliente (solo al crear).
  useEffect(() => {
    if (isRevise || !values.cliente_id) {
      setRutasSugeridas([]);
      return;
    }
    let alive = true;
    getRutasSugeridasAction(values.cliente_id).then((r) => {
      if (alive) setRutasSugeridas(r.ok && r.data ? r.data : []);
    });
    return () => {
      alive = false;
    };
  }, [values.cliente_id, isRevise]);

  /** Aplica una ruta sugerida: tramos del historial + plantilla si aún existe. */
  const aplicarSugerencia = (s: RutaSugerida) => {
    // Cinturón (regla 27-ago): los pax son de ESTA cotización, jamás
    // copiados del historial — aunque el API mandara pasajeros en un tramo.
    setValue(
      "escalas",
      s.tramos.map((t) => ({ ...tramoToEscala(t), pasajeros: null })),
    );
    setValue(
      "ruta_id",
      s.ruta_id && allRoutes.some((r) => r.id === s.ruta_id) ? s.ruta_id : "",
    );
  };

  // Tramos de la RUTA OPERATIVA como punto de partida COMERCIAL (solo revise
  // con itinerario operativo): fuera cancelados y solo-operativos/ferry, y
  // SIN pasajeros — regla 27-ago: los pax son de la cotización, jamás
  // copiados de la operación.
  const opsComoEscalas = (): EscalaInput[] => {
    // Las escalas operativas se guardan SIN millas: se conservan las del
    // form actual por par origen-destino (si coincide) para no dejar el
    // cálculo en cero con los mismos extremos (verificación 27-ago); los
    // pares nuevos los completa el autollenado del editor.
    const prevPorPar = new Map(
      (getValues("escalas") ?? [])
        .filter((e) => Number(e.millas_nauticas) > 0)
        .map((e) => [
          `${e.origen_iata}-${e.destino_iata}`,
          Number(e.millas_nauticas),
        ]),
    );
    // TODOS los tramos vivos viajan (27-ago): el ferry también se cotiza
    // (cobra tiempo y calzos) — antes se descartaba y la ruta importada
    // quedaba incompleta (caso CUN→HOL ferry + HOL→CUN).
    return (initialQuote?.escalas ?? [])
      .filter((e) => !e.cancelada_at)
      .map((e) => {
        // Solo la SECUENCIA viaja de la operación a la cotización: pax,
        // manifiesto y fechas son de cada lado (regla 27-ago).
        const base = tramoToEscala({
          ...e,
          pasajeros: null,
          pasajeros_nombres: [],
          fecha_salida_plan: null,
        });
        return Number(base.millas_nauticas) > 0
          ? base
          : {
              ...base,
              millas_nauticas:
                prevPorPar.get(`${e.origen_iata}-${e.destino_iata}`) ?? 0,
            };
      });
  };

  const aplicarOpsComoEscalas = (legs: EscalaInput[]) => {
    setValue("escalas", legs, { shouldDirty: true });
    // El autollenado de millas de la hoja completa las que vengan en 0.
    toast.success("Tramos de la operación cargados — captura los pasajeros");
  };


  // ¿La TUA de este aeropuerto APLICA según el motor? Un aeropuerto exento
  // (aplica=false, p.ej. pase de abordar) no cobra la línea aunque esté
  // capturada — no debe atorar el candado ni forzar el campo de TC. Fuera del
  // itinerario el motor la ignora por completo. Sin breakdown se asume que
  // aplica (conservador; guardar ya está bloqueado sin breakdown).
  const tuaAplicaEnBreakdown = (iata: string): boolean => {
    if (!breakdown) return true;
    const aps =
      breakdown.tuas.aeropuertos ??
      [
        breakdown.tuas.origen,
        ...(breakdown.tuas.intermedios ?? []),
        breakdown.tuas.destino,
      ].filter(Boolean);
    const a = aps.find((x) => x?.iata === iata);
    if (!a) return false;
    return a.aplica;
  };
  // Líneas MXN que realmente cobrarían: monto > 0 y aeropuerto que aplica.
  const hayTuasMxnActivas = (values.tuas_lineas ?? []).some(
    (l) =>
      l.moneda === "MXN" &&
      Number(l.monto_pax) > 0 &&
      tuaAplicaEnBreakdown(l.iata),
  );
  const hayExtrasMxn = (values.extras ?? []).some(
    (e) => e.moneda === "MXN" && montoExtraActivo(e) > 0,
  );
  // Renglones MXN sin TC (TUAS o extras): se retienen fuera del cálculo (el
  // preview sigue vivo) y se bloquea guardar — el total aún no los incluye.
  const mxnSinTc =
    !(Number(values.tc_usd_mxn) > 0) &&
    ((values.cobrar_tuas && hayTuasMxnActivas) || hayExtrasMxn);

  // El cliente ahora AFECTA el precio (tarifa preferencial): no se puede
  // guardar mientras el preview corresponda a otro cliente o siga recalculando
  // — lo persistido debe ser exactamente lo que el operador vio.
  const previewFresco =
    !loading &&
    !enEsperaDebounce &&
    calcPayload?.cliente_id === (values.cliente_id || undefined);
  // Revisión: el motivo ya no gatea aquí (se elige en el diálogo «Guardar
  // vN»); lo que gatea es que haya cambios REALES y un breakdown fresco.
  const canSave =
    !capacidadExcedida &&
    !mxnSinTc &&
    !costoExternoMxnSinTc &&
    previewFresco &&
    (isRevise
      ? sucio && !!calcPayload && !!breakdown && !error
      : !!values.cliente_id && !!calcPayload && !!breakdown && !error);

  // Alta: por qué «Crear v1» está apagado, en palabras del operador (antes
  // el botón se deshabilitaba sin explicación). Solo texto; el candado real
  // sigue siendo `canSave`.
  const razonNoGuardarAlta: string | undefined = isRevise
    ? undefined
    : !values.cliente_id
      ? "Falta elegir el cliente."
      : capacidadExcedida
        ? "Los pasajeros exceden la capacidad del avión."
        : mxnSinTc
          ? "Hay TUAS o extras en MXN sin tipo de cambio: captúralo en «Total MXN»."
          : costoExternoMxnSinTc
            ? "El costo del operador externo va en MXN: captura el tipo de cambio."
            : !calcPayload
              ? "Faltan aeronave, tramos con millas o pasajeros."
              : error
                ? "Corrige el error del cálculo."
                : !breakdown || !previewFresco
                  ? "Espera a que termine el cálculo…"
                  : undefined;

  // Diálogo «Guardar vN» (F0): chip de motivo obligatorio + texto opcional;
  // el resumen automático del diff viaja como prefijo del motivo.
  const [guardarOpen, setGuardarOpen] = useState(false);
  const [motivoChip, setMotivoChip] = useState<MotivoRevisionChip | null>(null);
  // Idempotencia (contrato 8-sep): un uuid por INTENTO de guardado, reusado
  // en los reintentos del mismo intento (doble clic / red caída). Se
  // renueva solo tras éxito o al cerrar el diálogo sin guardar.
  const saveRequestIdRef = useRef<string | null>(null);
  const nuevoIntentoGuardado = () => {
    if (!saveRequestIdRef.current) saveRequestIdRef.current = uuid();
    return saveRequestIdRef.current;
  };
  // Error de candado del API al guardar (409 COTIZACION_COBRADA): banner con
  // liga a los cobros de la página.
  const [errorCobrada, setErrorCobrada] = useState<string | null>(null);
  // 409 AERONAVE_EN_TALLER al cambiar el avión desde el cotizador (API 0.0.6,
  // invariante 14): NO hay confirmación posible — banner rojo con el mensaje
  // del API y «elige otro avión».
  const [errorTaller, setErrorTaller] = useState<{
    mensaje: string;
    matricula: string | null;
  } | null>(null);
  // 409 SQUAWK_ALTA_SIN_RESOLVER: MISMO diálogo que assign; al confirmar se
  // reintenta el revise con la bandera y el motivo de ESTE intento.
  const [squawkRevise, setSquawkRevise] = useState<{
    lista: string[];
    motivo: string;
  } | null>(null);

  /**
   * Guarda la versión (`POST /v1/quotes/:id/revise`). `aceptarSquawk` = el
   * REINTENTO tras confirmar el diálogo de discrepancia ALTA: viaja
   * `aceptar_discrepancia_alta` y se CONSERVA el `client_request_id` del
   * intento (idempotencia: si el primero alcanzó a escribir, el reintento no
   * crea una segunda versión).
   */
  const ejecutarRevision = (motivo: string, aceptarSquawk: boolean) => {
    if (!initialQuote || !calcPayload) {
      toast.error("Faltan datos para guardar");
      return;
    }
    const client_request_id = nuevoIntentoGuardado();
    setErrorTaller(null);
    startSaving(async () => {
      const res = await reviseQuoteAction(initialQuote.id, {
        ...calcPayload,
        motivo,
        client_request_id,
        // Solo en el reintento confirmado (el API lo ignora si el avión no
        // cambió): asigna a sabiendas y avisa al mecánico.
        ...(aceptarSquawk ? { aceptar_discrepancia_alta: true } : {}),
        // Siempre viaja (también ''): el API hace `dto.notas ?? current.notas`,
        // así que omitirla al vaciarla CONSERVABA la nota anterior en
        // silencio aunque el diff dijera «Notas del PDF» (revisión 8-sep).
        notas: values.notas.trim(),
        // Externo (28-ago): operador y lo que cobra el operador externo se
        // editan también al revisar; el costo vacío se limpia (monto null).
        // 29-ago: viaja NATIVO (monto + moneda); con MXN el API deriva el
        // USD con el tc_usd_mxn del calcPayload.
        ...(initialQuote.es_externo
          ? {
              ...(values.operador_externo.trim().length >= 2
                ? { operador_externo: values.operador_externo.trim() }
                : {}),
              ...(Number(values.costo_externo_monto) > 0
                ? {
                    costo_externo_monto: Number(values.costo_externo_monto),
                    costo_externo_moneda: values.costo_externo_moneda,
                  }
                : { costo_externo_monto: null }),
            }
          : {}),
        // Las fechas del vuelo también se actualizan al revisar (antes no
        // viajaban y la cotización no aparecía en el calendario).
        fecha_vuelo: values.fecha_vuelo ? cancunInputToIso(values.fecha_vuelo) : undefined,
        fecha_traslado_final: values.fecha_traslado_final
          ? cancunInputToIso(values.fecha_traslado_final)
          : undefined,
      });
      if (res.ok && res.data) {
        toast.success(
          `Cotización #${res.data.folio} guardada como v${res.data.cotizacion_version}`,
        );
        // Avisos NO bloqueantes del API (0.0.6): la versión YA se guardó —
        // p. ej. «los tramos con tacómetro no se movieron al avión nuevo».
        // Mismo `toastAvisos` que la reserva y assign (fuente única).
        toastAvisos(res.data.avisos);
        saveRequestIdRef.current = null;
        setGuardarOpen(false);
        setMotivoChip(null);
        setValue("motivo", "");
        setErrorCobrada(null);
        setErrorTaller(null);
        setSquawkRevise(null);
        setConflictoVersion(null);
        setDerivaMotor(null);
        derivaRevisadaRef.current = false;
        // «Guardar y ver PDF» (F1): el PDF real de la versión recién creada.
        if (verPdfTrasGuardarRef.current) {
          verPdfTrasGuardarRef.current = false;
          void abrirPdfCotizacion(res.data.id).catch(() =>
            toast.error("La versión se guardó, pero no se pudo generar el PDF"),
          );
        }
        // Limpio de inmediato (el badge se apaga) y el refresh que viene
        // SÍ resetea el form con la vN+1 recién guardada.
        esperandoRefreshRef.current = true;
        setBase({
          defaults: getValues(),
          version: res.data.cotizacion_version,
        });
        if (onGuardado) {
          // Página única: sin navegar — el refresh trae la versión nueva
          // al mismo lugar.
          onGuardado(res.data);
          router.refresh();
        } else {
          router.push(`/admin/quotes/${res.data.id}`);
          router.refresh();
        }
        return;
      }
      // Rechazos del API (contrato 8-sep + invariante 14 del 11-sep): la
      // decisión es PURA (`decidirErrorRevise`, probada en vitest) porque
      // taller y squawk también son 409 y no deben caer en «otra versión».
      const decision = decidirErrorRevise(res, { yaAceptoSquawk: aceptarSquawk });
      if (decision.tipo === "squawk") {
        // Se confirma en el diálogo compartido con assign y se reintenta con
        // la bandera: el intento sigue vivo (misma llave, misma intención de
        // ver el PDF).
        setGuardarOpen(false);
        setSquawkRevise({ lista: decision.discrepancias, motivo });
        return;
      }
      setSquawkRevise(null);
      if (decision.tipo === "cobrada") {
        // El intento terminó (rechazado): llave nueva la próxima vez y sin
        // arrastrar la intención «…y ver PDF» a un guardado posterior.
        setGuardarOpen(false);
        saveRequestIdRef.current = null;
        verPdfTrasGuardarRef.current = false;
        setErrorCobrada(decision.mensaje);
        toast.error("El vuelo ya tiene cobros: no se puede guardar", {
          action: {
            label: "Ir a los cobros",
            onClick: () => irACobros(),
          },
        });
        return;
      }
      if (decision.tipo === "taller") {
        // Sin reintento posible: el avión está en mantenimiento.
        setGuardarOpen(false);
        saveRequestIdRef.current = null;
        verPdfTrasGuardarRef.current = false;
        setErrorTaller({ mensaje: decision.mensaje, matricula: decision.matricula });
        toast.error(decision.mensaje);
        return;
      }
      if (decision.tipo === "version") {
        setGuardarOpen(false);
        setConflictoVersion(-1);
        saveRequestIdRef.current = null;
        verPdfTrasGuardarRef.current = false;
        toast.error(decision.mensaje);
        return;
      }
      toast.error(decision.mensaje);
    });
  };

  const handleSave = (motivoFinal?: string) => {
    // Invariante de dinero: un costo MXN sin TC no puede derivar su USD — se
    // rechaza en captura (el API respondería 400), nunca se persiste a medias.
    if (costoExternoMxnSinTc) {
      toast.error(
        "El costo del operador externo va en MXN: captura el tipo de cambio.",
      );
      // focusTc (no focusTcField): abre primero la sección de Cobro plegada.
      focusTc();
      return;
    }
    if (
      !isRevise &&
      values.es_externo &&
      values.operador_externo.trim().length < 2
    ) {
      toast.error("Indica el operador externo que cubre el vuelo.");
      return;
    }
    if (!calcPayload) {
      toast.error("Faltan datos para guardar");
      return;
    }

    if (isRevise) {
      const motivo = (motivoFinal ?? "").trim();
      if (motivo.length < 3) {
        toast.error("Elige el motivo de la versión");
        focusMotivo();
        return;
      }
      if (!sucio) {
        toast.info("No hay cambios que guardar");
        return;
      }
      // Primer intento: SIN la bandera de squawk (el diálogo la agrega).
      ejecutarRevision(motivo, false);
      return;
    }

    if (!values.cliente_id) {
      toast.error("Selecciona un cliente");
      return;
    }
    const client_request_id = nuevoIntentoGuardado();
    startSaving(async () => {
      const opsValidos = opsLegs.filter((l) => l.origen && l.destino);
      // D4 (F2): ojito/fecha del PDF por tramo capturados en el ALTA viajan
      // en el DTO de create (nunca a /calculate). Mismo índice que las
      // escalas del payload (el debounce ya asentó: previewFresco).
      const escalasCreate = calcPayload.escalas?.map((e, i) => {
        const l = debounced.escalas[i];
        return {
          ...e,
          ...(l?.pdf_oculto === true ? { pdf_oculto: true } : {}),
          ...(fechaPdfValida(l?.pdf_fecha) ? { pdf_fecha: l.pdf_fecha } : {}),
        };
      });
      const res = await createQuoteAction({
        ...calcPayload,
        ...(escalasCreate ? { escalas: escalasCreate } : {}),
        client_request_id,
        cliente_id: values.cliente_id,
        escalas_operacion:
          opsValidos.length > 0
            ? opsValidos.map((l) => {
                // Un ferry vuela vacío: sin manifiesto de nombres.
                const nombres = l.ferry
                  ? []
                  : l.nombres
                      .split("\n")
                      .map((n) => n.trim())
                      .filter((n) => n.length > 0);
                return {
                  origen_iata: l.origen,
                  destino_iata: l.destino,
                  es_ferry: l.ferry,
                  pasajeros:
                    !l.ferry && l.pax !== ""
                      ? Math.max(0, Number(l.pax))
                      : undefined,
                  pasajeros_nombres: nombres.length > 0 ? nombres : undefined,
                  hora_salida: l.hora ? cancunInputToIso(l.hora) : undefined,
                  requiere_pernocta: l.pernocta || undefined,
                  tipo_parada: l.servicio ? ("SERVICIO" as const) : undefined,
                  servicio_notas: l.servicio
                    ? l.servicioNotas.trim() || undefined
                    : undefined,
                  notas: l.nota.trim() || undefined,
                };
              })
            : undefined,
        tipo: values.tipo,
        fecha_vuelo: values.fecha_vuelo ? cancunInputToIso(values.fecha_vuelo) : undefined,
        fecha_traslado_final: values.fecha_traslado_final
          ? cancunInputToIso(values.fecha_traslado_final)
          : undefined,
        notas: values.notas || undefined,
        notas_internas: values.notas_internas || undefined,
        ...(values.es_externo
          ? {
              // es_externo y la ficha del avión ajeno ya viajan en calcPayload;
              // aquí va lo que /calculate no conoce (operador y costo).
              es_externo: true,
              operador_externo: values.operador_externo.trim(),
              // Solo si se capturó: un 0 "fingía utilidad" en el reparto —
              // sin costo el API guarda null y sin_costo_count lo delata.
              // 29-ago: viaja NATIVO (monto + moneda); con MXN el API deriva
              // el USD con el tc_usd_mxn del calcPayload.
              ...(Number(values.costo_externo_monto) > 0
                ? {
                    costo_externo_monto: Number(values.costo_externo_monto),
                    costo_externo_moneda: values.costo_externo_moneda,
                  }
                : {}),
            }
          : {}),
      });
      if (res.ok && res.data) {
        saveRequestIdRef.current = null;
        toast.success(`Cotización #${res.data.folio} creada`);
        router.push(`/admin/quotes/${res.data.id}`);
      } else {
        toast.error(res.error ?? "Error al guardar");
      }
    });
  };

  /** Scroll a los cobros de la página (card `#cobros-vuelo`). */
  const irACobros = () => {
    const el = document.getElementById("cobros-vuelo");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /**
   * D5 (F2): notas del cliente y toggles tarifa/itinerario, cuando son lo
   * ÚNICO que cambió, se guardan por PATCH pdf-visibilidad SIN versión.
   * Solo viaja lo que cambió. 404 (backend aún sin el contrato) → se cae al
   * guardado con versión (diálogo «Guardar vN»), avisando.
   */
  const guardarPresentacion = () => {
    if (!initialQuote || !soloPresentacion) return;
    const claves = new Set(cambios.map((c) => c.clave));
    const payload: PdfPresentacionPayload = {
      ...(claves.has("notas") ? { notas: values.notas.trim() } : {}),
      ...(claves.has("pdf_tarifa")
        ? { pdf_mostrar_tarifa: values.pdf_mostrar_tarifa === true }
        : {}),
      ...(claves.has("pdf_itinerario")
        ? { pdf_mostrar_itinerario: values.pdf_mostrar_itinerario !== false }
        : {}),
    };
    startSaving(async () => {
      const res = await setQuotePdfPresentacionAction(initialQuote.id, payload);
      if (res.ok) {
        toast.success("Presentación del PDF guardada (sin versión nueva)");
        setErrorCobrada(null);
        setConflictoVersion(null);
        if (verPdfTrasGuardarRef.current) {
          verPdfTrasGuardarRef.current = false;
          void abrirPdfCotizacion(initialQuote.id).catch(() =>
            toast.error("Se guardó, pero no se pudo generar el PDF"),
          );
        }
        // Limpio de inmediato (la base es el form actual, misma versión) y
        // el refresh trae notas/toggles ya persistidos.
        esperandoRefreshRef.current = true;
        setBase({ defaults: getValues(), version: base.version });
        router.refresh();
        return;
      }
      verPdfTrasGuardarRef.current = false;
      if (res.status === 404) {
        toast.info(
          "El servidor aún no guarda la presentación sin versión: se guarda como versión nueva.",
        );
        nuevoIntentoGuardado();
        setGuardarOpen(true);
        return;
      }
      toast.error(res.error ?? "No se pudo guardar la presentación del PDF");
    });
  };

  /**
   * Botón primario en revisión: mismos candados que handleSave, pero en vez
   * de guardar abre el diálogo «Guardar vN» (motivo + resumen + avisos).
   * Con SOLO presentación (D5) guarda directo sin versión.
   */
  const abrirGuardar = (): boolean => {
    if (!sucio) return false;
    if (soloPresentacion) {
      guardarPresentacion();
      return true;
    }
    if (costoExternoMxnSinTc) {
      toast.error("El costo del operador externo va en MXN: captura el tipo de cambio.");
      focusTc();
      return false;
    }
    if (mxnSinTc) {
      toast.error("Hay TUAS o extras en MXN sin tipo de cambio: captúralo para guardar.");
      focusTc();
      return false;
    }
    if (capacidadExcedida) {
      toast.error("Los pasajeros exceden la capacidad del avión.");
      return false;
    }
    if (!calcPayload || !breakdown || error) {
      toast.error("Faltan datos o el cálculo tiene error: revisa los avisos.");
      return false;
    }
    if (!previewFresco) {
      toast.info("Espera a que termine el cálculo…");
      return false;
    }
    nuevoIntentoGuardado();
    setGuardarOpen(true);
    return true;
  };


  // Bloque «INTERNO · NO SE IMPRIME» (F2, D6): CERRADO por defecto para
  // todos, con memoria por usuario (localStorage) en alta y revisión. Nunca
  // se abre solo — salvo por un atajo explícito (tarifa, cobrable, TC…) o
  // porque un campo requerido vive ahí (externo).
  const [internoAbierto, setInternoAbierto] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(INTERNO_LS_KEY);
      if (!raw) return;
      const g = JSON.parse(raw) as { abierto?: unknown };
      if (g && typeof g.abierto === "boolean") setInternoAbierto(g.abierto);
    } catch {
      // Sin storage: queda cerrado.
    }
  }, []);
  const setInternoAbiertoPersistente = (v: boolean) => {
    setInternoAbierto(v);
    try {
      localStorage.setItem(INTERNO_LS_KEY, JSON.stringify({ abierto: v }));
    } catch {
      // Sin storage, vive solo en la sesión.
    }
  };
  // Al prender «cubierto por externo» (switch o borrador ?d= restaurado) el
  // panel interno se abre: sus campos requeridos no deben quedar escondidos.
  useEffect(() => {
    if (!isRevise && values.es_externo) setInternoAbierto(true);
  }, [isRevise, values.es_externo]);

  // Atajos de scroll+focus (ensamble 8-sep): los ids ancla de la hoja viven
  // en el propio input invisible (`pasajeros-field`, `tc-usd-mxn-field`);
  // los del panel interno en su contenedor. Un tick de espera por si el
  // panel/sub-bloque acaba de abrirse (mismo patrón setTimeout(60)).
  const scrollFocus = (id: string, selector = "input") =>
    setTimeout(() => {
      const el = document.getElementById(id);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      const ctl = el && el.matches(selector) ? el : el?.querySelector<HTMLElement>(selector);
      if (ctl && !(ctl as HTMLInputElement).disabled) ctl.focus();
    }, 60);
  /** El TC vive en «Total MXN (T.C.)» del desglose de la hoja. */
  const focusTc = () => setTimeout(focusTcField, 60);
  /**
   * La hoja señala dónde se ajustan tarifa y horas (feedback 9-sep-2026:
   * «¿dónde se ajusta la hora volada por tramo y la tarifa por hora?»): abre
   * el panel interno si está cerrado (misma memoria `vt-cotizador-interno-v1`)
   * y lleva al ancla de «Tarifa y horas». Esa sección no es sub-bloque
   * plegable (nada que desplegar). Sin override activo `tarifa-override-field`
   * no existe: cae al segmento `tarifa-tipo-field`. El panel cerrado NO monta
   * sus campos: el destino queda PENDIENTE y el scroll+focus corre en un
   * efecto cuando el panel ya está pintado (sin adivinar milisegundos).
   */
  const [destinoInternoPendiente, setDestinoInternoPendiente] = useState<DestinoInterno | null>(null);
  const abrirInterno = (destino: DestinoInterno) => {
    if (!internoAbierto) setInternoAbiertoPersistente(true);
    setDestinoInternoPendiente(destino);
  };
  useEffect(() => {
    if (!destinoInternoPendiente || !internoAbierto) return;
    const anclas: Record<DestinoInterno, string[]> = {
      tarifa: ["tarifa-override-field", "tarifa-tipo-field"],
      cobrable: ["cobrable-field"],
      sobrevuelo: ["sobrevuelo-field"],
    };
    const el =
      anclas[destinoInternoPendiente].map((id) => document.getElementById(id)).find((x) => !!x) ?? null;
    setDestinoInternoPendiente(null);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // Prioridad del foco: el input del campo (override / sobrevuelo /
    // cobrable) → el segmento ACTIVO de Pública/Broker/Personalizada →
    // cualquier control. `preventScroll`: no pisar el scroll suave.
    const ctl =
      el.querySelector<HTMLElement>("input:not([disabled])") ??
      el.querySelector<HTMLElement>('button[aria-pressed="true"]:not([disabled])') ??
      el.querySelector<HTMLElement>("button:not([disabled])");
    ctl?.focus({ preventScroll: true });
  }, [destinoInternoPendiente, internoAbierto]);
  /** Ancla `motivo-revision-field`: vive en el diálogo «Guardar vN». */
  const focusMotivo = () => {
    setGuardarOpen(true);
    setTimeout(() => {
      const el = document.getElementById("motivo-revision-field");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.querySelector("textarea")?.focus();
    }, 120);
  };
  /**
   * «Ajuste rápido» de la barra (D2): scroll+focus a pasajeros de la hoja.
   * Con pax definido POR TRAMO el global se imprime derivado (sin input): se
   * lleva al itinerario, donde el detalle «⋯» de cada fila sí lo edita.
   */
  const enfocarPasajeros = () => {
    if (paxPorTramo) {
      toast.info(
        "Los pasajeros están definidos por tramo: edítalos en el detalle (⋯) de cada fila del itinerario.",
      );
      document
        .querySelector(".cot-hoja table.grid")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    scrollFocus("pasajeros-field");
  };
  /** «Guardar y ver PDF» (F1): abre el diálogo de guardar y marca la intención. */
  const guardarYVerPdf = () => {
    // La intención se marca ANTES: con solo presentación (D5) el guardado
    // arranca dentro de abrirGuardar y lee la bandera al terminar.
    verPdfTrasGuardarRef.current = true;
    if (!abrirGuardar()) verPdfTrasGuardarRef.current = false;
  };
  const previewVerPdf =
    isRevise && initialQuote
      ? sucio
        ? {
            label: "Guardar y ver PDF",
            onClick: guardarYVerPdf,
            disabled: saving,
            title: "Guarda la versión nueva (pide el motivo) y abre el PDF real.",
          }
        : {
            label: "Ver PDF real",
            onClick: verPdfReal,
            loading: pdfRealLoading,
            title: "PDF completo para el cliente (con fichas de aeronave).",
          }
      : undefined;

  // «Descartar» (F0): con cambios se confirma antes de tirar el borrador —
  // regla del cliente: toda acción que tira trabajo pide confirmación. El
  // form vuelve a la BASE (lo guardado); no se genera versión.
  const [confirmDescartar, setConfirmDescartar] = useState(false);
  const descartarCambios = () => {
    // Si el servidor ya rehidrató una versión MÁS NUEVA mientras había
    // borrador (banner «Alguien guardó la vN»), descartar adopta ESA versión:
    // si volviera a la base vieja, la página diría vN+1 y el documento
    // mostraría los valores de la vN (revisión 8-sep).
    const adoptaNuevos = formDefaults !== base.defaults;
    reset(adoptaNuevos ? formDefaults : base.defaults);
    if (adoptaNuevos) {
      defaultsProcesadosRef.current = formDefaults;
      setBase({
        defaults: formDefaults,
        version: initialQuote?.cotizacion_version ?? 0,
      });
      setDerivaMotor(null);
      derivaRevisadaRef.current = false;
    }
    setConflictoVersion(null);
    setMotivoChip(null);
    setErrorCobrada(null);
    saveRequestIdRef.current = null;
    verPdfTrasGuardarRef.current = false;
    setConfirmDescartar(false);
    toast.success("Cambios descartados");
  };
  const pedirDescartar = () => {
    if (!sucio) return;
    setConfirmDescartar(true);
  };

  // «No perder cambios»: aviso al cerrar/recargar y confirmación propia al
  // navegar dentro del panel con el form sucio.
  const guardCambios = useCambiosSinGuardar(sucio);

  // «Recargar conservando borrador» (concurrencia sin lock, D6): el borrador
  // vivo viaja en ?d= y se reaplica sobre la versión nueva al montar.
  const recargarConservandoBorrador = () => {
    const url = new URL(window.location.href);
    url.searchParams.set(DRAFT_PARAM, encodeDraft(getValues()));
    guardCambios.saltar();
    window.location.assign(url.toString());
  };

  // «Copiar como nueva cotización» (candado): prellena /new con el
  // documento actual como borrador (?d=). Lo que no aplica al alta se vacía.
  const copiarComoNueva = () => {
    const f: QuoteFormValues = {
      ...getValues(),
      motivo: "",
      escalas_operacion: [],
    };
    router.push(`/admin/quotes/new?${DRAFT_PARAM}=${encodeDraft(f)}`);
  };

  // CONFIRMADO/RESERVA con tripulación (F0-d): confirmación ÚNICA al primer
  // intento de editar. Se intercepta la interacción en fase de captura
  // (click / teclado sobre un control del documento — no pointerdown: el
  // diálogo que se abre entre pointerdown y click contaría como "clic
  // fuera" y se cerraría solo); tras confirmar se edita normal. Los
  // encabezados de sección (plegar), la barra del total y los diálogos
  // quedan exentos (`data-guard-exempt`).
  const [confirmEdicionOpen, setConfirmEdicionOpen] = useState(false);
  const [edicionConfirmada, setEdicionConfirmada] = useState(false);
  const interceptarPrimerCambio = (e: SyntheticEvent) => {
    if (!requiereConfirmacionEdicion || edicionConfirmada || lectura || sucio) return;
    const t = e.target as HTMLElement | null;
    if (!t || typeof t.closest !== "function") return;
    if (t.closest("[data-guard-exempt]")) return;
    if (
      !t.closest(
        // `[contenteditable]` sin valor fijo: las notas de la hoja usan
        // `contenteditable="plaintext-only"` (no "true").
        'input, textarea, select, button, [role="switch"], [role="combobox"], [role="option"], [contenteditable]:not([contenteditable="false"])',
      )
    ) {
      return;
    }
    if (e.type === "keydown") {
      const k = (e as unknown as React.KeyboardEvent).key;
      const edita = k.length === 1 || k === "Backspace" || k === "Delete" || k === "Enter" || k === " ";
      if (!edita) return;
    }
    e.preventDefault();
    e.stopPropagation();
    setConfirmEdicionOpen(true);
  };

  // Estado de edición hacia el padre (cabecera + barra de acciones). Las
  // acciones van por ref para no re-disparar el efecto en cada render.
  const accionesRef = useRef({
    guardar: () => {},
    descartar: () => {},
    enfocarPasajeros: () => {},
    guardarAtajo: () => {},
  });
  accionesRef.current = {
    guardar: () => {
      abrirGuardar();
    },
    descartar: pedirDescartar,
    enfocarPasajeros,
    // Ctrl/⌘+S (F2): mismo camino que el botón primario de cada modo.
    guardarAtajo: () => {
      if (lectura || saving) return;
      if (isRevise) {
        if (sucio) abrirGuardar();
        else toast.info("No hay cambios que guardar");
        return;
      }
      if (canSave) handleSave();
      else toast.info("Completa cliente, aeronave, tramos y pasajeros para guardar");
    },
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      accionesRef.current.guardarAtajo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const cambiosTexto = cambios.map((c) => c.texto).join("\u0001");
  useEffect(() => {
    if (!onEstadoEdicion) return;
    onEstadoEdicion({
      sucio,
      soloPresentacion,
      resumen: resumenCambios,
      cambios: cambiosTexto ? cambiosTexto.split("\u0001") : [],
      canSave,
      saving,
      versionSiguiente,
      guardar: () => accionesRef.current.guardar(),
      descartar: () => accionesRef.current.descartar(),
      enfocarPasajeros: () => accionesRef.current.enfocarPasajeros(),
    });
  }, [
    onEstadoEdicion,
    sucio,
    soloPresentacion,
    resumenCambios,
    cambiosTexto,
    canSave,
    saving,
    versionSiguiente,
  ]);

  // Avisos del diálogo «Guardar vN».
  const avisaTripulacion =
    isRevise &&
    !!initialQuote &&
    (initialQuote.estado === "CONFIRMADO" || initialQuote.estado === "RESERVA") &&
    !!initialQuote.piloto_id &&
    cambiosTocanTripulacion(cambios);
  const motivoPreview = armarMotivoRevision({
    chip: motivoChip,
    texto: values.motivo,
    resumen: resumenCambios,
  });

  // Avisos del itinerario (mismos criterios que el editor de tramos).
  const anclaCunPendiente =
    values.escalas.length > 0 &&
    !!values.escalas[0].origen_iata &&
    !!values.escalas[values.escalas.length - 1].destino_iata &&
    (values.escalas[0].origen_iata !== "CUN" ||
      values.escalas[values.escalas.length - 1].destino_iata !== "CUN");
  const hayMillasEnCero =
    values.escalas.length > 0 &&
    values.escalas.some((l) => !(Number(l.millas_nauticas) > 0));

  // MODELO cotizado (feedback 4-sep): el cliente ve el TIPO de avión con el
  // que se cotizó, nunca la matrícula. En revisión SIN cambio de avión manda
  // la lista del API (modelos distintos de los tramos vivos, si son ≥2); al
  // cambiar de avión, el del breakdown. Externo → solo el modelo ajeno.
  const modeloCotizadoTexto = breakdown
    ? modelosCotizadosTexto({
        esExterno: values.es_externo,
        externoModelo: values.avion_externo_modelo,
        modelos:
          isRevise &&
          initialQuote &&
          initialQuote.calculo_snapshot?.aeronave?.id === values.aeronave_id
            ? initialQuote.modelos_cotizados
            : null,
        modelo: breakdown.aeronave.modelo,
      })
    : null;
  const cotizadoEnTexto = modeloCotizadoTexto ? `Cotizado en: ${modeloCotizadoTexto}` : null;

  // Tramo OCULTO del PDF (atenúa la fila y sale de la ruta grande). Alta:
  // bandera del form (D4). Revisión: escala viva (prop) solo si los tramos
  // siguen coincidiendo con lo guardado — misma regla que los toggles.
  const escalasCoincidenConBase =
    isRevise &&
    !!escalasPdfProp &&
    values.escalas.length === base.defaults.escalas.length;
  const tramoOculto = (idx: number): boolean => {
    const l = values.escalas[idx];
    if (!l) return false;
    if (!isRevise) return l.pdf_oculto === true;
    if (!escalasCoincidenConBase) return false;
    const b = base.defaults.escalas[idx];
    if (!b || b.origen_iata !== l.origen_iata || b.destino_iata !== l.destino_iata) {
      return false;
    }
    return escalasPdfProp!.find((e) => e.orden === idx + 1)?.pdf_oculto === true;
  };

  // Cabecera de la hoja: tipo y fecha de cotización (derivados, texto).
  const tipoTexto = initialQuote?.tipo ?? values.tipo;

  // Ojito/fecha PDF por fila. Revisión: toggles del padre (escala viva) solo
  // en tramos que coinciden con lo guardado. Alta (D4): bandera y fecha en
  // el form, viajan en el DTO de create.
  const legExtraFila = isRevise
    ? tramoExtra
      ? (idx: number, leg: EscalaInput) => {
          const b = base.defaults.escalas[idx];
          if (
            !b ||
            values.escalas.length !== base.defaults.escalas.length ||
            b.origen_iata !== leg.origen_iata ||
            b.destino_iata !== leg.destino_iata
          ) {
            return null;
          }
          // Los toggles ojito/fecha son PATCH directos (sin versión, sin
          // aviso a tripulación): exentos de la confirmación única de
          // CONFIRMADO/RESERVA — antes de F0 ya se usaban sin confirmar.
          return (
            <span data-guard-exempt className="contents">
              {tramoExtra(idx, leg)}
            </span>
          );
        }
      : undefined
    : undefined;

  // Avisos de captura FUERA del papel (barra de estado + panel interno):
  // nunca se esconden. TUAS/extras en MXN sin T.C. los avisa la propia hoja
  // (banda con «Capturar T.C.»).
  const avisosCaptura = [
    capacidadExcedida && selectedAircraft
      ? `Capacidad excedida: ${maxPasajeros} pax vs máx. ${selectedAircraft.asientos} (${selectedAircraft.modelo})`
      : null,
    anclaCunPendiente ? "La ruta no ancla en CUN" : null,
    hayMillasEnCero ? "Tramos con millas en 0" : null,
    costoExternoMxnSinTc ? "Costo del operador externo en MXN sin T.C." : null,
  ].filter((a): a is string => !!a);

  // ===== La HOJA 1 como formulario (ensamble 8-sep-2026) =====
  // `QuoteSheet` edita el subconjunto del form que se IMPRIME, en su lugar;
  // el dinero que pinta es SIEMPRE el breakdown de /calculate (o el snapshot).
  /** Cambios de la hoja → RHF (mismos nombres). Cliente broker fuerza tarifa BROKER. */
  const onCambioHoja: OnCambioHoja = (campo, valor) => {
    setValue(campo, valor as unknown as PathValue<QuoteFormValues, typeof campo>, {
      shouldDirty: true,
    });
    if (campo === "cliente_id") {
      const cli = allClients.find((c) => c.id === valor);
      if (cli?.es_broker) setValue("tipo_tarifa", "BROKER");
    }
  };
  const documentoHoja: DocumentoHoja = {
    folio: initialQuote?.folio ?? null,
    fechaCotizacion: initialQuote
      ? (initialQuote.fecha_confirmacion ?? initialQuote.fecha_solicitud)
      : null,
    tipo: tipoTexto,
    clienteNombre: isRevise ? (clientName ?? initialQuote?.cliente_id ?? null) : undefined,
    // MODELO cotizado (feedback 4-sep): en revisión SIN cambio de avión manda
    // la lista del API; al cambiar de avión, el del breakdown (lo deriva la hoja).
    modelosCotizados:
      isRevise &&
      initialQuote &&
      initialQuote.calculo_snapshot?.aeronave?.id === values.aeronave_id
        ? (initialQuote.modelos_cotizados ?? null)
        : null,
    matricula: breakdown?.aeronave.matricula ?? selectedAircraft?.matricula ?? null,
    quoteId: initialQuote?.id,
  };
  const catalogosHoja = useMemo(
    () => ({
      clientes: isRevise
        ? undefined
        : allClients.map((c) => ({
            id: c.id,
            nombre: c.nombre,
            descripcion:
              [c.rfc, c.es_broker ? "Broker" : null, c.es_interno ? "Interno" : null]
                .filter(Boolean)
                .join(" · ") || undefined,
          })),
      // Las aeronaves "sin tarifa" siguen en el selector (marcadas) pero no
      // se pueden elegir: el motor las rechaza con 400 (salvo cliente interno).
      aeronaves: aircraft.map((a) => {
        const sinTarifa = !a.tarifa_hora_pub_usd && !a.tarifa_hora_broker_usd;
        return {
          id: a.id,
          matricula: a.matricula,
          modelo: a.modelo,
          asientos: a.asientos,
          velocidad_crucero_kts: a.velocidad_crucero_kts,
          descripcion: `${a.velocidad_crucero_kts} kts · ${a.asientos} asientos${
            sinTarifa
              ? clienteInterno
                ? " · sin tarifa · interno cotiza $0"
                : " · sin tarifa configurada"
              : ""
          }`,
          disabled: sinTarifa && !clienteInterno,
        };
      }),
      aeropuertos: airports,
      rutas: allRoutes,
    }),
    [isRevise, allClients, aircraft, clienteInterno, airports, allRoutes],
  );
  // Fecha del PDF por tramo GUARDADA (revisión): misma regla de coincidencia
  // que el ojito y los toggles del workspace.
  const tramoFechaPdf = (idx: number): string | null => {
    if (!escalasCoincidenConBase) return null;
    const l = values.escalas[idx];
    const b = base.defaults.escalas[idx];
    if (!l || !b || b.origen_iata !== l.origen_iata || b.destino_iata !== l.destino_iata) {
      return null;
    }
    return escalasPdfProp!.find((e) => e.orden === idx + 1)?.pdf_fecha ?? null;
  };
  const tramosPdfHoja: TramoPdfAccesores = isRevise
    ? { oculto: (idx) => tramoOculto(idx), fechaPdf: (idx) => tramoFechaPdf(idx), margen: legExtraFila }
    : {
        // D4: en el ALTA el ojito/fecha viven en el form y viajan solo en el DTO de create.
        onOcultoChange: (idx, oculto) =>
          setValue(
            "escalas",
            getValues("escalas").map((l, i) => (i === idx ? { ...l, pdf_oculto: oculto } : l)),
            { shouldDirty: true },
          ),
        onFechaPdfChange: (idx, fecha) =>
          setValue(
            "escalas",
            getValues("escalas").map((l, i) => (i === idx ? { ...l, pdf_fecha: fecha } : l)),
            { shouldDirty: true },
          ),
      };
  // Croma junto al cliente (alta, en la línea del campo de la hoja):
  // «+ nuevo cliente» · «corregir nombre».
  const clienteExtraNode = !isRevise ? (
    <>
      <button type="button" className="cot-liga" onClick={() => setClientDialogOpen(true)}>
        + nuevo cliente
      </button>
      {values.cliente_id && (
        <>
          {" "}
          <span className="cot-sep">·</span>
          <button
            type="button"
            className="cot-liga"
            title="Corregir el nombre del cliente (aplica en todo el catálogo)"
            onClick={() => {
              const sel = allClients.find((c) => c.id === values.cliente_id);
              if (!sel) return;
              setEditClienteNombre(sel.nombre);
              setEditClienteOpen(true);
            }}
          >
            corregir nombre
          </button>
        </>
      )}
    </>
  ) : undefined;
  /** Plantilla del catálogo → tramos editables de ESTA cotización (la ruta guardada no se modifica). */
  const seleccionarRutaPlantilla = (v: string) => {
    setValue("ruta_id", v);
    const ruta = allRoutes.find((r) => r.id === v);
    if (ruta && ruta.tramos.length > 0) {
      setValue("escalas", ruta.tramos.map(tramoToEscala));
    }
  };

  return (
    // La hoja ES el formulario (form-as-document, 8-sep-2026): barra de
    // estado fija arriba, la hoja al centro sobre el fondo del shell y el
    // panel «Interno · no se imprime» colapsable a la derecha.
    <div className="space-y-5">
      <TotalBar
        breakdown={breakdown}
        loading={loading || enEsperaDebounce}
        error={error}
        sinDatos={pintaSnapshot ? false : !calcPayload}
        // Snapshot sin detalle (cotización de un motor anterior) — en lectura
        // o en revisión sin cambios (no se llama al motor): el total
        // persistido se pinta tal cual — nunca "Calculando…".
        totalFallback={
          pintaSnapshot && initialQuote
            ? {
                usd: Number(initialQuote.monto_total_usd) || 0,
                mxn:
                  initialQuote.monto_total_mxn != null
                    ? Number(initialQuote.monto_total_mxn)
                    : null,
                tarifaTipo: initialQuote.tarifa_tipo,
              }
            : null
        }
        titulo={
          isRevise
            ? (clientName ?? null)
            : (allClients.find((c) => c.id === values.cliente_id)?.nombre ?? null)
        }
        subtitulo={
          isRevise && initialQuote
            ? sucio
              ? soloPresentacion
                ? `#${initialQuote.folio} · v${initialQuote.cotizacion_version} · PDF ●`
                : `#${initialQuote.folio} · v${initialQuote.cotizacion_version} → v${versionSiguiente} ●`
              : `#${initialQuote.folio} · v${initialQuote.cotizacion_version}`
            : "Nueva cotización"
        }
        // BLOQUEADA: 🔒 + razón + «Copiar como nueva cotización».
        // REVISIÓN: sin cambios no hay botones; con cambios «Descartar» y
        // «Guardar → vN» (o «Guardar PDF» si solo cambió presentación, D5).
        // Alta: «Crear v1».
        bloqueoRazon={lectura ? (bloqueadoRazon ?? undefined) : undefined}
        onCopiar={lectura ? copiarComoNueva : undefined}
        saveLabel={
          saving
            ? "Guardando…"
            : isRevise
              ? soloPresentacion
                ? "Guardar PDF (sin versión)"
                : `Guardar → v${versionSiguiente}`
              : "Crear v1"
        }
        saveDisabled={saving || (isRevise ? !sucio : !canSave)}
        saveTitle={!isRevise && !canSave ? razonNoGuardarAlta : undefined}
        onSave={
          lectura
            ? undefined
            : isRevise
              ? sucio
                ? abrirGuardar
                : undefined
              : () => handleSave()
        }
        onCancel={isRevise && !lectura && sucio ? pedirDescartar : undefined}
        cancelLabel="Descartar"
        cancelDisabled={saving}
        verPdf={previewVerPdf}
        avisos={avisosCaptura}
        cobro={cobroBarra}
      />

      {/* Avisos de edición directa (F0). */}
      {conflictoVersion != null && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              {conflictoVersion > 0
                ? `Alguien guardó la v${conflictoVersion} mientras editabas.`
                : "La cotización cambió mientras editabas (otra versión o facturación)."}
            </p>
            <p className="text-xs text-muted-foreground">
              Tu borrador sigue aquí y no se ha perdido, pero se basa en la v
              {base.version}. Recarga para partir de la versión actual: el
              borrador se reaplica encima y lo revisas antes de guardar.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={recargarConservandoBorrador} className="gap-1.5">
                <ArrowPathIcon className="h-4 w-4" />
                Recargar conservando borrador
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={pedirDescartar}>
                Descartar mi borrador
              </Button>
            </div>
          </div>
        </div>
      )}
      {errorCobrada && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm">
          <LockClosedIcon className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-destructive">{errorCobrada}</p>
            <p className="text-xs text-muted-foreground">
              Para ajustarla elimina primero el cobro (abajo, en «Cobros
              registrados en el vuelo»), guarda la versión y vuelve a
              registrarlo con el monto correcto.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="#cobros-vuelo"
                onClick={(e) => {
                  e.preventDefault();
                  irACobros();
                }}
                className="text-xs font-medium underline underline-offset-2"
              >
                Ir a los cobros
              </a>
              {/* Lo capturado no se pierde: puede seguir como cotización nueva. */}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={copiarComoNueva}
                className="gap-1.5"
                title="Crea una cotización nueva con estos mismos datos (esta no se toca)."
              >
                <DocumentDuplicateIcon className="h-4 w-4" />
                Copiar como nueva cotización
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* 409 AERONAVE_EN_TALLER (API 0.0.6): el cotizador cambió el avión y
          el nuevo está en mantenimiento. NO hay «de todas formas»: se elige
          otro avión (o se deshace el cambio) y se vuelve a guardar. */}
      {errorTaller && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm">
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-destructive">{errorTaller.mensaje}</p>
            <p className="text-xs text-muted-foreground">
              La versión NO se guardó: elige otro avión
              {errorTaller.matricula
                ? ` (el ${errorTaller.matricula} está en taller)`
                : ""}{" "}
              en «Aeronave» —o deja el que tenía la cotización— y vuelve a
              guardar.
            </p>
          </div>
        </div>
      )}

      {/* Centro: la hoja (papel claro con sombra sobre el fondo del shell) y
          la save bar; derecha: panel «Interno · no se imprime» colapsable.
          CONFIRMADO/RESERVA con tripulación: el primer cambio se confirma
          (captura); la barra y los diálogos están exentos (data-guard-exempt). */}
      <div
        className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_auto]"
        onClickCapture={interceptarPrimerCambio}
        onKeyDownCapture={interceptarPrimerCambio}
      >
        <div className="min-w-0 space-y-5">
          <QuoteSheet
            valores={values}
            onCambio={onCambioHoja}
            breakdown={breakdown}
            calculando={loading || enEsperaDebounce}
            errorMotor={error}
            lectura={lectura}
            documento={documentoHoja}
            catalogos={catalogosHoja}
            tramosPdf={tramosPdfHoja}
            pasajerosPorTramo={paxPorTramo ? { max: maxPaxTramos } : null}
            mapaSvg={mapaSvgGuardado}
            totalRespaldo={
              pintaSnapshot && initialQuote
                ? {
                    total_usd: Number(initialQuote.monto_total_usd) || 0,
                    total_mxn:
                      initialQuote.monto_total_mxn != null
                        ? Number(initialQuote.monto_total_mxn)
                        : null,
                  }
                : undefined
            }
            grupo={grupoDelHijo}
            clienteExtra={clienteExtraNode}
            onAbrirInterno={lectura ? undefined : abrirInterno}
          />

        {/* Save bar (oculta en LECTURA bloqueada; en revisión solo con cambios). */}
        {!lectura && (!isRevise || sucio) && (
        <Card className="border-t-2 border-t-brand-600/60">
          <CardContent className="p-4 space-y-3">
            {mxnSinTc && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                Hay TUAS o extras capturados en MXN sin tipo de cambio: el total mostrado aún NO
                los incluye. Captura el T.C. en «Total MXN» del desglose para aplicarlos y poder
                guardar.
              </p>
            )}
            {isRevise && initialQuote ? (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm">
                  <p className="font-medium">
                    {soloPresentacion ? "Guardar presentación del PDF" : `Guardar → v${versionSiguiente}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {resumenCambios || "Sin cambios"}.{" "}
                    {soloPresentacion
                      ? "Solo cambia cómo se ve el PDF: no se genera versión nueva."
                      : `La v${initialQuote.cotizacion_version} queda en el historial; al guardar se pide el motivo.`}{" "}
                    Atajo: Ctrl/⌘+S.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={pedirDescartar} disabled={saving}>
                    Descartar
                  </Button>
                  <Button type="button" onClick={abrirGuardar} disabled={saving || !sucio} className="gap-2">
                    <BookmarkSquareIcon className="h-4 w-4" />
                    {saving
                      ? "Guardando…"
                      : soloPresentacion
                        ? "Guardar PDF (sin versión)"
                        : `Guardar → v${versionSiguiente}`}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm">
                  <p className="font-medium">Crear v1</p>
                  <p className="text-xs text-muted-foreground">
                    Se crea como v1 en estado COTIZADO. Podrás editar o confirmar después. Atajo:
                    Ctrl/⌘+S.
                  </p>
                  {razonNoGuardarAlta && (
                    <p className="mt-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                      {razonNoGuardarAlta}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  onClick={() => handleSave()}
                  disabled={!canSave || saving}
                  title={razonNoGuardarAlta}
                  className="gap-2"
                >
                  <BookmarkSquareIcon className="h-4 w-4" />
                  {saving ? "Guardando…" : "Crear v1"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        )}
        </div>

        <QuoteInternalPanel
          abierto={internoAbierto}
          onAbiertoChange={setInternoAbiertoPersistente}
          lectura={lectura}
          isRevise={isRevise}
          initialQuote={initialQuote}
          values={values}
          setValue={setValue}
          register={register}
          breakdown={breakdown}
          loading={loading}
          error={error}
          hayPayload={pintaSnapshot || !!calcPayload}
          selectedAircraft={selectedAircraft}
          clienteInterno={clienteInterno}
          tarifaSegment={tarifaSegment}
          overrideTarifaActivo={overrideTarifaActivo}
          setTarifaCustom={setTarifaCustom}
          costoExternoMxnSinTc={costoExternoMxnSinTc}
          focusTc={focusTc}
          cotizadoEnTexto={cotizadoEnTexto}
          onPonerTodoEnCero={() => setCeroOpen(true)}
          airports={airports}
          onAeropuertoCreado={onAeropuertoCreado}
          avisos={avisosCaptura}
          captura={
            isRevise
              ? undefined
              : {
                  clientes: allClients,
                  frecuentes: frequentClientIds,
                  onNuevoCliente: () => setClientDialogOpen(true),
                }
          }
          plantilla={
            lectura
              ? undefined
              : {
                  rutas: allRoutes,
                  sugeridas: rutasSugeridas,
                  onAplicarSugerencia: aplicarSugerencia,
                  onSeleccionarRuta: seleccionarRutaPlantilla,
                  onCrearRuta: () => setRouteSheetOpen(true),
                  onGuardarComoRuta: handleSaveAsRoute,
                  savingRoute,
                }
          }
          rutaSeleccionada={selectedRouteOpt}
          itinerarioAjustado={itinerarioAjustado}
          operativa={
            isRevise && !lectura && initialQuote?.itinerario_operativo
              ? { opsComoEscalas, onAplicar: aplicarOpsComoEscalas, legsSignature }
              : undefined
          }
          notaTramos={isRevise && tramoExtra ? notaTramos : undefined}
          avisoTramosCambiaron={isRevise && !!tramoExtra && !escalasCoincidenConBase && sucio}
        />
      </div>

      {/* Descartar con cambios capturados: se confirma (lo escrito se
          pierde; la cotización queda tal como está guardada). */}
      {isRevise && initialQuote && (
        <AlertDialog open={confirmDescartar} onOpenChange={setConfirmDescartar}>
          <AlertDialogContent data-guard-exempt>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Descartar los cambios?</AlertDialogTitle>
              <AlertDialogDescription>
                {resumenCambios ? `${resumenCambios}. ` : ""}Lo capturado se
                pierde y la cotización #{initialQuote.folio} queda tal como
                está guardada (v{initialQuote.cotizacion_version}). No se
                genera ninguna versión nueva.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Seguir editando</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  descartarCambios();
                }}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Descartar cambios
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Diálogo «Guardar vN» (F0/D1): chip de motivo obligatorio + texto
          opcional; el resumen automático del diff se muestra y viaja como
          prefijo del motivo. Avisos: tripulación (fechas/avión/pernocta en
          CONFIRMADO/RESERVA con piloto) y deriva del motor. Esc lo cierra. */}
      {isRevise && initialQuote && (
        <Dialog
          open={guardarOpen}
          onOpenChange={(o) => {
            setGuardarOpen(o);
            // Cerrar sin guardar = fin del intento: la próxima vez es otro.
            if (!o && !saving) {
              saveRequestIdRef.current = null;
              verPdfTrasGuardarRef.current = false;
            }
          }}
        >
          <DialogContent className="sm:max-w-lg" data-guard-exempt>
            <DialogHeader>
              <DialogTitle>Guardar v{versionSiguiente}</DialogTitle>
              <DialogDescription>
                La v{initialQuote.cotizacion_version} queda en el historial.
                Elige por qué se guarda esta versión.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-navy-800/50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wider text-foreground/70">
                  Qué cambia ({cambios.length})
                </p>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {cambios.slice(0, 12).map((c) => (
                    <li key={c.clave}>
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {c.texto}
                      </Badge>
                    </li>
                  ))}
                  {cambios.length > 12 && (
                    <li className="text-xs text-muted-foreground">
                      +{cambios.length - 12} más
                    </li>
                  )}
                </ul>
                {breakdown && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Total con IVA:{" "}
                    <span className="font-mono text-foreground">
                      {fmtUsd(breakdown.totales.total_usd)}
                    </span>
                    {Number(initialQuote.monto_total_usd) !==
                      Number(breakdown.totales.total_usd) && (
                      <>
                        {" "}
                        (antes {fmtUsd(Number(initialQuote.monto_total_usd))})
                      </>
                    )}
                  </p>
                )}
              </div>
              {avisaTripulacion && (
                <p className="rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs text-violet-700 dark:text-violet-300">
                  Se notificará a la tripulación: el cambio toca fechas, avión o
                  pernocta de un vuelo con piloto asignado.
                </p>
              )}
              {derivaMotor && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  La tarifa cambió desde la v{initialQuote.cotizacion_version}:
                  sin tocar nada, hoy el motor daría{" "}
                  <span className="font-mono">{fmtUsd(derivaMotor.fresco)}</span>{" "}
                  en vez de{" "}
                  <span className="font-mono">{fmtUsd(derivaMotor.snapshot)}</span>{" "}
                  (tarifa preferencial, catálogo o TC). Al guardar se aplica lo
                  vigente.
                </p>
              )}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Motivo <span className="text-destructive">*</span>
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {MOTIVOS_REVISION.map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={motivoChip === m}
                      onClick={() => setMotivoChip(m)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        motivoChip === m
                          ? "border-brand-500 bg-brand-500/15 font-medium text-brand-600 dark:text-brand-400"
                          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <div id="motivo-revision-field" className="scroll-mt-24">
                  <Textarea
                    rows={2}
                    placeholder="Detalle opcional · ej. el cliente llamó y subió a 6 pasajeros"
                    {...register("motivo")}
                  />
                </div>
                {motivoPreview && (
                  <p className="text-[11px] text-muted-foreground">
                    Queda en el historial como:{" "}
                    <span className="font-mono text-foreground">{motivoPreview}</span>
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setGuardarOpen(false)}
                disabled={saving}
              >
                Seguir editando
              </Button>
              <Button
                type="button"
                onClick={() => handleSave(motivoPreview)}
                disabled={saving || !motivoChip || !canSave}
                className="gap-2"
              >
                <BookmarkSquareIcon className="h-4 w-4" />
                {saving ? "Guardando…" : `Guardar v${versionSiguiente}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 409 SQUAWK_ALTA_SIN_RESOLVER al cambiar el avión desde el cotizador:
          el MISMO diálogo que assign (no una copia). Confirmar reintenta el
          revise con `aceptar_discrepancia_alta` y el MISMO client_request_id;
          «Volver» cierra el intento (llave nueva la próxima vez). */}
      <SquawkAltaDialog
        lista={squawkRevise?.lista ?? null}
        pending={saving}
        pregunta="¿Guardar la versión con este avión de todas formas? Se notificará al mecánico para que valide que el avión puede volar."
        confirmLabel="Guardar de todas formas"
        pendingLabel="Guardando…"
        onCancel={() => {
          setSquawkRevise(null);
          saveRequestIdRef.current = null;
          verPdfTrasGuardarRef.current = false;
        }}
        onConfirm={() => {
          if (squawkRevise) ejecutarRevision(squawkRevise.motivo, true);
        }}
      />

      {/* Confirmación ÚNICA del primer cambio en CONFIRMADO/RESERVA con
          tripulación (F0-d). */}
      {isRevise && initialQuote && (
        <AlertDialog open={confirmEdicionOpen} onOpenChange={setConfirmEdicionOpen}>
          <AlertDialogContent data-guard-exempt>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Esta cotización tiene tripulación asignada. ¿Editar?
              </AlertDialogTitle>
              <AlertDialogDescription>
                El vuelo #{initialQuote.folio} está{" "}
                {initialQuote.estado === "RESERVA" ? "reservado" : "confirmado"} con
                piloto. Puedes editar normal; al guardar, si cambian fechas, avión
                o pernocta, la tripulación recibe aviso (el precio no notifica).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>No, solo ver</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  setEdicionConfirmada(true);
                  setConfirmEdicionOpen(false);
                }}
              >
                Sí, editar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Navegar con cambios sin guardar (F0-e). */}
      <AlertDialog
        open={guardCambios.navPendiente != null}
        onOpenChange={(o) => {
          if (!o) guardCambios.cancelarNav();
        }}
      >
        <AlertDialogContent data-guard-exempt>
          <AlertDialogHeader>
            <AlertDialogTitle>Tienes cambios sin guardar</AlertDialogTitle>
            <AlertDialogDescription>
              {resumenCambios ? `${resumenCambios}. ` : ""}Si sales ahora se
              pierden. Guarda primero (Guardar → v{versionSiguiente}) o
              descártalos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                const destino = guardCambios.navPendiente;
                guardCambios.limpiarNav();
                guardCambios.saltar();
                if (destino) router.push(destino);
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Salir sin guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {!isRevise && (
        <QuickClientDialog
          open={clientDialogOpen}
          onOpenChange={setClientDialogOpen}
          onCreated={(client: Client) => {
            const opt: ClientOption = {
              id: client.id,
              nombre: client.nombre,
              es_broker: client.es_broker,
              es_interno: client.es_interno,
              rfc: client.rfc,
            };
            setExtraClients((prev) => [...prev.filter((c) => c.id !== opt.id), opt]);
            // Auto-selecciona al cliente recién creado.
            setValue("cliente_id", opt.id);
            if (opt.es_broker) setValue("tipo_tarifa", "BROKER");
            router.refresh();
          }}
        />
      )}

      <RouteFormSheet
        open={routeSheetOpen}
        onOpenChange={setRouteSheetOpen}
        airports={airports}
        onSaved={(route: Route) => {
          const opt = routeToOption(route);
          setExtraRoutes((prev) => [...prev, opt]);
          // Auto-selecciona la ruta recién creada y carga sus tramos.
          setValue("ruta_id", opt.id);
          if (opt.tramos.length > 0) {
            setValue("escalas", opt.tramos.map(tramoToEscala));
          }
          // Refresh server data en background para que la próxima carga ya
          // tenga la ruta nueva sin depender del estado local.
          router.refresh();
        }}
      />

      {/* Corregir el nombre del cliente sin salir del cotizador (26-ago). */}
      <Dialog open={editClienteOpen} onOpenChange={setEditClienteOpen}>
        <DialogContent className="sm:max-w-sm" data-guard-exempt>
          <DialogHeader>
            <DialogTitle>Corregir nombre del cliente</DialogTitle>
            <DialogDescription>
              Cambia el nombre en el catálogo (aplica en todos lados, no solo
              en esta cotización).
            </DialogDescription>
          </DialogHeader>
          <Input
            value={editClienteNombre}
            onChange={(e) => setEditClienteNombre(e.target.value)}
            placeholder="Nombre del cliente"
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditClienteOpen(false)}
              disabled={editClienteSaving}
            >
              Cancelar
            </Button>
            <Button
              disabled={editClienteSaving || !editClienteNombre.trim()}
              onClick={() => {
                const id = values.cliente_id;
                const nombre = editClienteNombre.trim();
                if (!id || !nombre) return;
                startEditCliente(async () => {
                  const res = await updateClientAction(id, { nombre });
                  if (res.ok) {
                    // Upsert local: el recién creado vive en extraClients y
                    // se corrige al instante; los del catálogo llegan con el
                    // refresh del server.
                    setExtraClients((prev) => {
                      const resto = prev.filter((c) => c.id !== id);
                      const base =
                        prev.find((c) => c.id === id) ??
                        allClients.find((c) => c.id === id);
                      return base ? [...resto, { ...base, nombre }] : resto;
                    });
                    toast.success("Nombre corregido");
                    setEditClienteOpen(false);
                    router.refresh();
                  } else {
                    toast.error(res.error ?? "No se pudo corregir el nombre");
                  }
                });
              }}
            >
              {editClienteSaving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de "todo en $0": borra extras y overrides ya capturados. */}
      <Dialog open={ceroOpen} onOpenChange={setCeroOpen}>
        <DialogContent className="sm:max-w-md" data-guard-exempt>
          <DialogHeader>
            <DialogTitle>Poner la cotización en $0</DialogTitle>
            <DialogDescription>
              Vuelo de la empresa: se apaga todo lo que se le cobraría al
              cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm space-y-2">
            <p className="text-muted-foreground">Se pone en cero:</p>
            <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
              <li>Tarifa por hora</li>
              <li>TUAS (se apaga el cobro)</li>
              <li>Pernoctas cobradas al cliente</li>
              <li>Conceptos extra (se borran)</li>
              <li>Comisión del vendedor, descuento y redondeo</li>
              {/* Solo folios viejos con pactado persistido (la captura se
                  eliminó el 2-sep-2026): el reset es la única vía de soltarlo. */}
              {values.es_externo && Number(values.total_pactado_usd) > 0 && (
                <li>Precio pactado del vuelo externo (folio viejo)</li>
              )}
            </ul>
            <p className="text-xs text-muted-foreground pt-1">
              No se toca la operación: tramos, tiempos, pasajeros ni el costo
              del operador externo. El vuelo sigue pesando en el balance del
              avión con sus gastos reales.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCeroOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={ponerTodoEnCero}>Poner todo en $0</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===== Borrador del cotizador EN LA URL (26-ago) =====
// Recargar no pierde el avance: el form viaja comprimido en un query param
// (?d=) que se actualiza con replaceState (sin ensuciar historial) y se
// restaura al montar. De paso la URL es compartible con el avance a medias.
const DRAFT_PARAM = "d";

function encodeDraft(v: QuoteFormValues): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, f: v }))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeDraft(raw: string): Partial<QuoteFormValues> | null {
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const parsed = JSON.parse(decodeURIComponent(escape(atob(b64)))) as {
      v?: number;
      f?: Partial<QuoteFormValues>;
    };
    return parsed?.v === 1 && parsed.f && typeof parsed.f === "object"
      ? parsed.f
      : null;
  } catch {
    return null; // parámetro corrupto/viejo: se ignora, jamás rompe el alta
  }
}

/** «Interno · no se imprime» abierto/cerrado, por usuario (alta y revisión). */
const INTERNO_LS_KEY = "vt-cotizador-interno-v1";


/**
 * Barra de ESTADO fija (ensamble 8-sep-2026): fuera del papel, siempre a la
 * vista al hacer scroll — total con IVA (del breakdown), cliente · folio ·
 * versión, «Ver PDF real», Descartar/Guardar y los avisos de captura. Sin
 * celdas del desglose: ese vive en la hoja (y el detalle en el panel interno).
 */
function TotalBar({
  breakdown,
  loading,
  error,
  sinDatos,
  titulo,
  subtitulo,
  saveLabel,
  saveDisabled,
  saveTitle,
  onSave,
  onCancel,
  cancelLabel = "Cancelar",
  cancelDisabled,
  totalFallback,
  bloqueoRazon,
  onCopiar,
  verPdf,
  avisos = [],
  cobro,
}: {
  breakdown: QuoteBreakdown | null;
  loading: boolean;
  error: string | null;
  sinDatos: boolean;
  /** Cliente de la cotización (lado derecho de la barra). */
  titulo?: string | null;
  /** Folio · versión (o "Nueva cotización"). */
  subtitulo?: string | null;
  /** Botón primario (guardar/crear) — el guardado real vive en el padre. */
  saveLabel?: string;
  saveDisabled?: boolean;
  /** Tooltip del primario (razón del candado cuando está deshabilitado). */
  saveTitle?: string;
  onSave?: () => void;
  /** Botón secundario «Descartar» (revisión con cambios). */
  onCancel?: () => void;
  cancelLabel?: string;
  cancelDisabled?: boolean;
  /** Lectura sin snapshot: el total PERSISTIDO a pintar (nunca "Calculando…"). */
  totalFallback?: {
    usd: number;
    mxn: number | null;
    tarifaTipo?: string | null;
  } | null;
  /** Cotización BLOQUEADA (F0): 🔒 + razón legible en vez del botón primario. */
  bloqueoRazon?: string;
  /** «Copiar como nueva cotización» (prellena /new con el documento). */
  onCopiar?: () => void;
  /** «Ver PDF real» / «Guardar y ver PDF» (revisión). */
  verPdf?: { label: string; onClick: () => void; disabled?: boolean; loading?: boolean; title?: string };
  /** Avisos de captura (capacidad, ancla CUN…): chips, nunca se esconden. */
  avisos?: string[];
  /** «Cobrado · Saldo» + «Registrar cobro» a la derecha del total (revisión). */
  cobro?: CobroTotalBar;
}) {
  return (
    <div className="sticky top-0 z-30 -mx-1 px-1 pt-1" data-guard-exempt>
      {/* Rojo VuelaTour sólido (pedido 28-ago): al hacer scroll la barra
          fija debe RESALTAR como el módulo activo del sidebar. */}
      <div className="rounded-xl border border-brand-500 bg-brand-600 text-white shadow-md px-4 py-2.5">
        <div
          className={cn(
            "flex flex-wrap items-baseline gap-2 transition-opacity",
            loading && "opacity-60",
          )}
        >
          {/* total_usd YA incluye IVA: la etiqueta lo dice explícito. */}
          <span className="text-[11px] uppercase tracking-wider text-white/80">
            Total con IVA
          </span>
          {error ? (
            <span className="text-sm font-semibold text-white">Error al calcular</span>
          ) : sinDatos ? (
            <span className="text-sm text-white/85">Completa aeronave, ruta y pasajeros</span>
          ) : !breakdown ? (
            totalFallback ? (
              <>
                <span className="text-2xl font-bold tracking-tight font-mono tabular-nums">
                  {fmtUsd(totalFallback.usd)}
                </span>
                <span className="text-xs text-white/80">USD</span>
                {totalFallback.mxn != null && (
                  <span className="text-xs text-white/80 font-mono">{fmtMxn(totalFallback.mxn)}</span>
                )}
                {totalFallback.tarifaTipo && (
                  <Badge variant="outline" className="text-[10px] border-white/50 text-white">
                    {totalFallback.tarifaTipo}
                  </Badge>
                )}
              </>
            ) : (
              <span className="text-sm text-white/85">Calculando…</span>
            )
          ) : (
            <>
              <span className="text-2xl font-bold tracking-tight font-mono tabular-nums">
                {fmtUsd(breakdown.totales.total_usd)}
              </span>
              <span className="text-xs text-white/80">USD</span>
              {breakdown.totales.total_mxn != null && (
                <span className="text-xs text-white/80 font-mono">
                  {fmtMxn(breakdown.totales.total_mxn)}
                </span>
              )}
              <Badge variant="outline" className="text-[10px] border-white/50 text-white">
                {breakdown.tarifa.tipo}
              </Badge>
            </>
          )}
          {cobro && <CobroChipBarra cobro={cobro} />}
          <div className="ml-auto flex min-w-0 items-center gap-3">
            {(titulo || subtitulo) && (
              <div className="min-w-0 text-right">
                {titulo && (
                  <p className="truncate text-sm font-semibold leading-tight max-w-[280px]">{titulo}</p>
                )}
                {subtitulo && (
                  <p className="font-mono text-[11px] leading-tight text-white/80">{subtitulo}</p>
                )}
              </div>
            )}
            {verPdf && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={verPdf.onClick}
                disabled={verPdf.disabled || verPdf.loading}
                title={verPdf.title}
                className="shrink-0 gap-1.5 border-white/60 bg-transparent text-white hover:bg-white/15 hover:text-white disabled:opacity-60"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                {verPdf.loading ? "Generando…" : verPdf.label}
              </Button>
            )}
            {onCancel && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onCancel}
                disabled={cancelDisabled}
                className="shrink-0 gap-1.5 border-white/60 bg-transparent text-white hover:bg-white/15 hover:text-white disabled:opacity-60"
              >
                <XMarkIcon className="h-4 w-4" />
                {cancelLabel}
              </Button>
            )}
            {/* Bloqueada (candado): la razón se LEE (no solo tooltip) y se
                ofrece copiar el documento como cotización nueva. */}
            {bloqueoRazon && (
              <span className="flex max-w-[300px] items-start gap-1.5 text-right text-[11px] leading-tight text-white/90">
                <LockClosedIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{bloqueoRazon}</span>
              </span>
            )}
            {bloqueoRazon && onCopiar && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onCopiar}
                title="Crea una cotización nueva con estos mismos datos (esta no se toca)."
                className="shrink-0 gap-1.5 border-white/60 bg-transparent text-white hover:bg-white/15 hover:text-white"
              >
                <DocumentDuplicateIcon className="h-4 w-4" />
                Copiar como nueva cotización
              </Button>
            )}
            {onSave && (
              <Button
                type="button"
                size="sm"
                onClick={onSave}
                disabled={saveDisabled}
                title={saveTitle}
                className="shrink-0 gap-1.5 bg-white text-brand-700 hover:bg-white/90 disabled:opacity-60"
              >
                <BookmarkSquareIcon className="h-4 w-4" />
                {saveLabel}
              </Button>
            )}
          </div>
        </div>
        {avisos.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5 border-t border-white/25 pt-1.5">
            {avisos.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/15 px-2 py-0.5 text-[11px] font-medium"
              >
                <ExclamationTriangleIcon className="h-3 w-3" />
                {a}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Punto del semáforo sobre el rojo de la barra (misma taxonomía que
 *  `CobroEstadoBadge`, colores para fondo oscuro). */
const DOT_BARRA: Record<EstadoCobroSemaforo["key"], string> = {
  COBRADO: "bg-emerald-300",
  PARCIAL: "bg-amber-300",
  SIN_COBROS: "bg-white",
  NO_APLICA: "bg-white/50",
};

/**
 * «Cobrado $X · Saldo $Y» + «Registrar cobro» junto al total (9-sep-2026):
 * el cliente pidió ver y registrar cobros desde la cotización sin bajar al
 * detalle del vuelo. Solo pinta lo que le pasa el workspace (semáforo de
 * `estadoCobroSemaforo`, saldo de `pendienteCobro`).
 */
function CobroChipBarra({ cobro }: { cobro: CobroTotalBar }) {
  const { semaforo } = cobro;
  const sinDinero = semaforo.key === "NO_APLICA" && cobro.totalCobradoUsd <= 0;
  return (
    <span className="ml-2 inline-flex flex-wrap items-center gap-1.5 self-center" data-guard-exempt>
      <span
        title={semaforo.title ?? semaforo.label}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/15 px-2 py-0.5 text-[11px] font-medium"
      >
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_BARRA[semaforo.key])} />
        {sinDinero ? (
          <span>{semaforo.label}</span>
        ) : (
          <>
            <span className="text-white/85">Cobrado</span>
            <span className="font-mono tabular-nums">{fmtUsd(cobro.totalCobradoUsd)}</span>
            <span className="text-white/60">·</span>
            <span className="text-white/85">Saldo</span>
            <span className="font-mono tabular-nums">{fmtUsd(cobro.pendienteUsd)}</span>
            {semaforo.key !== "SIN_COBROS" && semaforo.key !== "PARCIAL" && (
              <span className="text-white/85">· {semaforo.label}</span>
            )}
          </>
        )}
      </span>
      {cobro.onRegistrar && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={cobro.onRegistrar}
          title={cobro.registrarTitle}
          className="h-7 shrink-0 gap-1.5 border-white/60 bg-transparent px-2 text-white hover:bg-white/15 hover:text-white"
        >
          <BanknotesIcon className="h-4 w-4" />
          Registrar cobro
        </Button>
      )}
    </span>
  );
}
