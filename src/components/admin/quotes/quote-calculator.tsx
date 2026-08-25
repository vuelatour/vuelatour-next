"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  CalculatorIcon,
  CheckCircleIcon,
  XCircleIcon,
  BookmarkSquareIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { RouteFormSheet } from "@/components/admin/routes/route-form-sheet";
import { QuickClientDialog } from "@/components/admin/clients/quick-client-dialog";
import type { Client } from "@/types/clients";
import type { Route } from "@/types/routes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { MonedaSelect } from "@/components/admin/quotes/moneda-select";
import { QuoteLegsEditor } from "@/components/admin/quotes/quote-legs-editor";
import { RutaRapidaInput } from "@/components/admin/ruta-rapida-input";
import { RoutePreviewMap } from "@/components/admin/route-preview-map";
import { cn } from "@/lib/utils";
import { calculateQuote } from "@/lib/api/quotes-browser";
import { isApiError } from "@/lib/api/errors";
import { fmtDecimal, fmtMxn, fmtUsd } from "@/lib/format";
import { cancunInputToIso, isoToCancunInput } from "@/lib/datetime";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  createQuoteAction,
  getRutasSugeridasAction,
  reviseQuoteAction,
  type RutaSugerida,
} from "@/app/admin/quotes/actions";
import { createRouteAction } from "@/app/admin/routes/actions";
import type {
  CalculateQuoteRequest,
  ComisionVendedorModo,
  EscalaInput,
  ExtraConcepto,
  MetodoPago,
  QuoteBreakdown,
  TipoTarifa,
  TipoVuelo,
  TuaLinea,
  TuasAeropuerto,
  TuasFila,
} from "@/types/quote";
import type { PersistedQuote } from "@/types/quotes-persisted";
import { Field } from "@/components/admin/form-field";
import { FechaHoraCampo } from "@/components/admin/fecha-hora-campo";

interface AircraftOption {
  id: string;
  matricula: string;
  modelo: string;
  pais_registro: "MX" | "USA";
  velocidad_crucero_kts: number;
  asientos: number;
  tarifa_hora_pub_usd: number | null;
  tarifa_hora_broker_usd: number | null;
}

interface RouteOptionTramo {
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: number;
  pasajeros?: number | null;
  es_ferry?: boolean;
  requiere_pernocta?: boolean;
  pernocta_costo_usd?: number | null;
  tipo_parada?: "NORMAL" | "SERVICIO";
  servicio_notas?: string | null;
}

interface RouteOption {
  id: string;
  tipo: "SIMPLE" | "MULTIESCALA";
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: number;
  es_redondo_auto: boolean;
  num_aterrizajes: number;
  tramos: RouteOptionTramo[];
}

interface ClientOption {
  id: string;
  nombre: string;
  es_broker: boolean;
  /** Cliente interno (operación propia): la cotización puede ir en $0. */
  es_interno?: boolean;
  rfc: string | null;
}

interface AirportOption {
  iata: string;
  nombre: string;
  latitud: number | null;
  longitud: number | null;
}

interface QuoteFormValues {
  cliente_id: string;
  tipo: TipoVuelo;
  fecha_vuelo: string;
  fecha_traslado_final: string;
  aeronave_id: string;
  ruta_id: string;
  escalas: EscalaInput[];
  tipo_tarifa: TipoTarifa;
  pasajeros: number;
  pase_abordar: boolean;
  /** Horas de sobrevuelo (reconocimiento/foto): se suman al tiempo cobrable. */
  sobrevuelo_hr: number | null;
  /** Tiempo de VUELO pactado (hr): sustituye al calculado NM ÷ kts. */
  tiempo_vuelo_override_hr: number | null;
  /** Switch rápido de TUAS: apagado = no se cobra (override $0/pax). */
  cobrar_tuas: boolean;
  /** TUAS capturadas POR AEROPUERTO (pass-through): mandan sobre el catálogo. */
  tuas_lineas: TuaLinea[];
  cotizacion_abierta: boolean;
  /** Vuelo CUBIERTO por operador externo (sin avión propio ni tacómetros). */
  es_externo: boolean;
  operador_externo: string;
  /** Lo que cobra el apoyo externo (costo para VuelaTour). */
  costo_externo_usd: number | null;
  /** Precio TOTAL pactado con el cliente (externos: se acuerda a mano). */
  total_pactado_usd: number | null;
  /** Conceptos extra (handler, comisariato, extensión…). */
  extras: ExtraConcepto[];
  /** Redondeo AUTOMÁTICO al siguiente múltiplo de $10 (regla del cliente). */
  redondeo_auto: boolean;
  /** Redondeo manual (solo con el automático apagado). */
  redondeo_usd: number | null;
  /** Descuento negociado ("ciérramelo en 750"). Se captura en positivo. */
  descuento_usd: number | null;
  metodo_pago: MetodoPago;
  /** Nombre MANUAL del método cuando metodo_pago = OTRO. */
  metodo_pago_detalle: string;
  /** TC MXN por USD con el que entrará el pago (BillPocket/transferencia en pesos). */
  tc_usd_mxn: number | null;
  /** Comisión BillPocket % (custom por operación, tope 20). */
  comision_billpocket_pct: number | null;
  /** Modalidad de la comisión del VENDEDOR: monto fijo o $/hr × horas cobradas. */
  comision_vendedor_modo: ComisionVendedorModo;
  /** Comisión del VENDEDOR en USD (modo FIJA): se SUMA al precio del cliente. */
  comision_vendedor_usd: number | null;
  /** Tarifa $/hr del vendedor (modo POR_HORA): el motor la multiplica por las horas cobradas. */
  comision_vendedor_tarifa_hr: number | null;
  comision_vendedor_nombre: string;
  tarifa_hora_override_usd: number | null;
  tuas_override_usd_pax: number | null;
  iva_pct_override: number | null;
  notas: string;
  notas_internas: string;
  // Solo en mode='revise': razon de la revision (requerida).
  motivo: string;
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
    }
  | {
      mode: "revise";
      clients?: undefined;
      frequentClientIds?: undefined;
      initialQuote: PersistedQuote;
      clientName: string;
      /** El cliente de la cotización es interno (operación propia): puede ir en $0. */
      clientEsInterno?: boolean;
    }
);

/**
 * Lleva al operador al campo de TC (se monta siempre que hay renglones MXN,
 * aunque el método sea DÓLARES). Fuente única del scroll+focus.
 */
function focusTcField() {
  const el = document.getElementById("tc-usd-mxn-field");
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
  el?.querySelector("input")?.focus();
}

const METODOS_PAGO: { value: MetodoPago; label: string; hint: string }[] = [
  { value: "TRANSFERENCIA", label: "Transferencia", hint: "Con factura · IVA 16%" },
  { value: "HSBC_LINK", label: "HSBC link", hint: "Con factura · IVA 16%" },
  { value: "CHEQUE", label: "Cheque", hint: "Con factura · IVA 16%" },
  { value: "BILLPOCKET", label: "BillPocket", hint: "Sin factura" },
  { value: "EFECTIVO", label: "Efectivo", hint: "Sin IVA" },
  { value: "DOLARES", label: "Dólares directo", hint: "Sin IVA" },
  // Método MANUAL: la oficina escribe cuál es. Sin IVA por defecto (el
  // override de IVA de "Overrides avanzados" es la válvula si sí factura);
  // el piloto NO puede cobrarlo en campo (candado del API).
  { value: "OTRO", label: "Otro (escríbelo)", hint: "Manual · sin IVA por defecto" },
];

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
    // datetime-local (sin segundos) para el input del editor de tramos.
    fecha_salida_plan: t.fecha_salida_plan ? isoToCancunInput(t.fecha_salida_plan) : null,
  };
}

export function QuoteCalculator(props: QuoteCalculatorProps) {
  const { aircraft, routes, airports } = props;
  const mode = props.mode ?? "create";
  const isRevise = mode === "revise";

  // Ruta OPERATIVA opcional al crear: SIEMPRE existe una ruta real del avión
  // (gastos/avión); la comercial de abajo es la que se cobra. Se persiste con
  // itinerario_operativo=true y el cotizador nunca la pisa. Cada tramo captura
  // el mismo detalle que el cotizador (pernocta, servicio, nota, nombres…):
  // estos tramos son los que ve el piloto en su app.
  const [opsLegs, setOpsLegs] = useState<
    Array<{
      origen: string;
      destino: string;
      ferry: boolean;
      pax: string;
      hora: string; // datetime-local (hora Cancún)
      nota: string;
      pernocta: boolean;
      servicio: boolean;
      servicioNotas: string;
      /** Manifiesto: un nombre por línea (colapsado tras "+ nombres de pasajeros"). */
      nombres: string;
      showNombres: boolean;
    }>
  >([]);
  const initialQuote = isRevise ? props.initialQuote : undefined;
  const clientName = isRevise ? props.clientName : undefined;
  const reviseClienteInterno = isRevise ? (props.clientEsInterno ?? false) : false;
  const clients = isRevise ? [] : props.clients;
  const frequentClientIds = isRevise ? [] : (props.frequentClientIds ?? []);

  const router = useRouter();
  // Al revisar una versión con tarifa AJUSTADA a mano, la sección de
  // "Personalizada" en Tipo de tarifa (25-ago): modo elegido a mano; el
  // derivado overrideTarifaActivo cubre revises y "todo en $0".
  const [tarifaCustom, setTarifaCustom] = useState(false);
  // (26-ago) La TotalBar fija de arriba sustituyó al observer de
  // visibilidad + barra flotante inferior del layout de 2 columnas.

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
    const base = clients ?? [];
    const seen = new Set(base.map((c) => c.id));
    return [...base, ...extraClients.filter((c) => !seen.has(c.id))];
  }, [clients, extraClients]);

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
        // la que se cotizó vive en el snapshot.
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
            ? q.escalas.filter((e) => !e.solo_operativa).map(tramoToEscala)
            : legacyLegs,
        tipo_tarifa: q.tarifa_tipo,
        pasajeros: q.pasajeros,
        pase_abordar: q.pase_abordar,
        sobrevuelo_hr:
          Number(q.calculo_snapshot?.tiempos?.sobrevuelo_hr) > 0
            ? Number(q.calculo_snapshot!.tiempos.sobrevuelo_hr)
            : null,
        tiempo_vuelo_override_hr:
          q.calculo_snapshot?.tiempos?.vuelo_proviene_de_override === true &&
          Number(q.calculo_snapshot?.tiempos?.vuelo_hr) > 0
            ? Number(q.calculo_snapshot!.tiempos.vuelo_hr)
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
        es_externo: q.es_externo ?? false,
        operador_externo: q.operador_externo ?? "",
        costo_externo_usd:
          q.costo_externo_usd != null ? Number(q.costo_externo_usd) : null,
        // El pactado SÍ se persiste (calculo_snapshot.meta): rehidratarlo
        // evita que una revisión recalcule y pise el precio acordado.
        total_pactado_usd:
          Number(q.calculo_snapshot?.meta?.total_pactado_usd) > 0
            ? Number(q.calculo_snapshot?.meta?.total_pactado_usd)
            : null,
        // La comisión BillPocket la sintetiza el motor: no se edita como extra.
        // El editor trabaja con el monto NATIVO del renglón (monto_usd es
        // nombre legado): un extra MXN persistido trae el canon convertido en
        // monto_usd y los pesos reales en monto_nativo — rehidratar el canon
        // como nativo re-interpretaría dólares como pesos.
        extras: (q.extras ?? [])
          .filter((e) => !e.concepto?.startsWith("Comisión BillPocket"))
          .map((e) => ({
            concepto: e.concepto,
            monto_usd: Number(e.monto_nativo ?? e.monto_usd) || 0,
            moneda: e.moneda === "MXN" ? ("MXN" as const) : ("USD" as const),
            aplica_iva: e.aplica_iva ?? true,
          })),
        // Con redondeo automático activo (default), el ajuste guardado es
        // redondeo_auto − descuento: se re-hidrata el descuento BASE desde
        // meta y el redondeo se vuelve a resolver en el motor.
        redondeo_auto: q.calculo_snapshot?.meta?.redondeo_automatico ?? true,
        redondeo_usd:
          q.calculo_snapshot?.meta?.redondeo_automatico ?? true
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
      tiempo_vuelo_override_hr: null,
      cobrar_tuas: true,
      tuas_lineas: [],
      cotizacion_abierta: false,
      es_externo: false,
      operador_externo: "",
      costo_externo_usd: null,
      total_pactado_usd: null,
      extras: [],
      redondeo_auto: true,
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
    };
  }, [initialQuote, defaultAircraftId, defaultRutaId]);

  const {
    register,
    watch,
    setValue,
  } = useForm<QuoteFormValues>({
    mode: "onChange",
    defaultValues: formDefaults,
  });

  const values = watch();
  // IMPORTANTE: serializamos el form a JSON antes de pasarlo al debounce.
  // watch() devuelve un objeto NUEVO en cada render (referencia distinta aunque
  // los valores sean iguales), lo que provocaría un bucle infinito de debounce
  // → useEffect → setState → re-render → watch() nuevo objeto → debounce otra vez.
  // Con string, la comparación es por valor: solo cambia cuando los datos cambian.
  const valuesJson = JSON.stringify(values);
  const debouncedJson = useDebouncedValue(valuesJson, 350);
  const debounced = useMemo<QuoteFormValues>(
    () => JSON.parse(debouncedJson),
    [debouncedJson],
  );

  // Cliente INTERNO (operación propia): el motor permite cotizar en $0 (sin
  // hora mínima, tarifa 0, sin cobro esperado) — la UI no debe estorbar.
  // La validación real vive en el server; para clientes normales nada cambia.
  const clienteInterno = isRevise
    ? reviseClienteInterno
    : !!allClients.find((c) => c.id === values.cliente_id)?.es_interno;

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
    // Externo: el precio pactado con el cliente también va a 0; el costo del
    // operador (costo_externo_usd) NO se toca, es un gasto real.
    if (values.es_externo) setValue("total_pactado_usd", 0, opts);
    setCeroOpen(false);
    toast.success("Cotización en $0 — revisa y guarda");
  };

  const calcPayload = useMemo<CalculateQuoteRequest | null>(() => {
    if (!debounced.aeronave_id) return null;
    const base: CalculateQuoteRequest = {
      aeronave_id: debounced.aeronave_id,
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
      tiempo_vuelo_override_hr:
        Number(debounced.tiempo_vuelo_override_hr) > 0
          ? Number(debounced.tiempo_vuelo_override_hr)
          : undefined,
      cotizacion_abierta: debounced.cotizacion_abierta,
      extras: (debounced.extras ?? [])
        .filter(
          (e) =>
            e.concepto.trim() &&
            Number(e.monto_usd) > 0 &&
            // Un extra MXN sin TC no puede convertirse (el motor lo rechaza
            // con 400 y tiraría el preview): se retiene fuera del cálculo —
            // el editor avisa en ámbar y guardar queda bloqueado (mxnSinTc).
            (e.moneda !== "MXN" || Number(debounced.tc_usd_mxn) > 0),
        )
        .map((e) => ({
          concepto: e.concepto.trim(),
          // Monto NATIVO en la moneda del renglón (nombre legado monto_usd).
          monto_usd: Number(e.monto_usd),
          moneda: e.moneda === "MXN" ? ("MXN" as const) : ("USD" as const),
          aplica_iva: e.aplica_iva ?? true,
        })),
      // Con redondeo automático solo viaja el descuento; el motor resuelve el
      // redondeo exacto al siguiente múltiplo de $10.
      ajuste_final_usd: debounced.redondeo_auto
        ? -(Number(debounced.descuento_usd) || 0)
        : (Number(debounced.redondeo_usd) || 0) - (Number(debounced.descuento_usd) || 0),
      redondeo_automatico: debounced.redondeo_auto || undefined,
      // Externos: total acordado a mano — el motor genera el ajuste exacto.
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
        debounced.comision_vendedor_modo === "POR_HORA" &&
        Number(debounced.comision_vendedor_tarifa_hr) > 0
          ? "POR_HORA"
          : undefined,
      comision_vendedor_tarifa_hr:
        debounced.comision_vendedor_modo === "POR_HORA" &&
        Number(debounced.comision_vendedor_tarifa_hr) > 0
          ? Number(debounced.comision_vendedor_tarifa_hr)
          : undefined,
      comision_vendedor_usd:
        debounced.comision_vendedor_modo !== "POR_HORA" &&
        Number(debounced.comision_vendedor_usd) > 0
          ? Number(debounced.comision_vendedor_usd)
          : undefined,
      comision_vendedor_nombre:
        ((debounced.comision_vendedor_modo === "POR_HORA" &&
          Number(debounced.comision_vendedor_tarifa_hr) > 0) ||
          (debounced.comision_vendedor_modo !== "POR_HORA" &&
            Number(debounced.comision_vendedor_usd) > 0)) &&
        debounced.comision_vendedor_nombre.trim()
          ? debounced.comision_vendedor_nombre.trim()
          : undefined,
    };
    const legs = debounced.escalas ?? [];
    if (legs.length >= 1) {
      // Itinerario propio de la cotización (plantilla hidratada y ajustable).
      const incomplete = legs.some(
        (l) => !l.origen_iata || !l.destino_iata || !(Number(l.millas_nauticas) > 0),
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
      // Monto 0 CAPTURADO = pass-through cero (el aeropuerto no cobra):
      // viaja al motor, que lo trata como TUA $0 — no es "volver al catálogo"
      // (eso es dejar el campo vacío = sin línea). Una línea MXN >0 sin TC
      // no puede convertirse (el motor la rechaza con 400): se retiene fuera
      // del cálculo — la card lo avisa en ámbar y guardar se bloquea.
      const lineas = (debounced.tuas_lineas ?? []).filter(
        (l) =>
          l.iata &&
          Number(l.monto_pax) >= 0 &&
          (Number(l.monto_pax) === 0 ||
            l.moneda !== "MXN" ||
            Number(debounced.tc_usd_mxn) > 0),
      );
      if (lineas.length > 0) {
        base.tuas_lineas = lineas.map((l) => {
          // El DTO rechaza 3+ decimales: redondear a centavos antes de enviar.
          const monto = Math.round(Number(l.monto_pax) * 100) / 100;
          return {
            iata: l.iata.toUpperCase(),
            monto_pax: monto,
            // $0 no necesita conversión: viaja como USD para que el motor no
            // exija TC por una línea que de todos modos vale cero.
            moneda: monto > 0 && l.moneda === "MXN" ? "MXN" : "USD",
          };
        });
      }
    }
    if (debounced.iva_pct_override !== null && debounced.iva_pct_override !== undefined) {
      base.iva_pct_override = Number(debounced.iva_pct_override);
    }
    return base;
  }, [debounced, clienteInterno]);

  const [breakdown, setBreakdown] = useState<QuoteBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!calcPayload) {
      setBreakdown(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    calculateQuote(calcPayload)
      .then((data) => {
        if (cancelled) return;
        setBreakdown(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (isApiError(err)) {
          setError(err.message);
        } else {
          setError(err instanceof Error ? err.message : "Error desconocido");
        }
        setBreakdown(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [calcPayload]);

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
  }, [overrideTarifaActivo, tarifaCustom]);
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
  useEffect(() => {
    if (!values.ruta_id || values.escalas.length > 0) return;
    const ruta = allRoutes.find((r) => r.id === values.ruta_id);
    if (ruta && ruta.tramos.length > 0) {
      setValue("escalas", ruta.tramos.map(tramoToEscala));
    }
    // setValue es estable en RHF.
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
    setValue("escalas", s.tramos.map(tramoToEscala));
    setValue(
      "ruta_id",
      s.ruta_id && allRoutes.some((r) => r.id === s.ruta_id) ? s.ruta_id : "",
    );
  };

  // Upsert de una línea de TUA por aeropuerto; monto null = quitar la línea
  // (vuelve al monto del catálogo).
  const setTuaLinea = (
    iata: string,
    monto: number | null,
    moneda: "USD" | "MXN",
  ) => {
    const rest = (values.tuas_lineas ?? []).filter((l) => l.iata !== iata);
    setValue(
      "tuas_lineas",
      monto == null ? rest : [...rest, { iata, monto_pax: monto, moneda }],
    );
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
    return a ? a.aplica : false;
  };
  // Líneas MXN que realmente cobrarían: monto > 0 y aeropuerto que aplica.
  const hayTuasMxnActivas = (values.tuas_lineas ?? []).some(
    (l) =>
      l.moneda === "MXN" &&
      Number(l.monto_pax) > 0 &&
      tuaAplicaEnBreakdown(l.iata),
  );
  const hayExtrasMxn = (values.extras ?? []).some(
    (e) => e.moneda === "MXN" && Number(e.monto_usd) > 0,
  );
  // ¿Hay renglones nativos en MXN (TUAS o extras)? Fuerza a mostrar el campo
  // de TC aunque el método sea DOLARES: sin TC el motor no puede convertirlos.
  const hayLineasMxn = hayTuasMxnActivas || hayExtrasMxn;
  // Renglones MXN sin TC (TUAS o extras): se retienen fuera del cálculo (el
  // preview sigue vivo) y se bloquea guardar — el total aún no los incluye.
  const mxnSinTc =
    !(Number(values.tc_usd_mxn) > 0) &&
    ((values.cobrar_tuas && hayTuasMxnActivas) || hayExtrasMxn);

  const motivoTrim = values.motivo?.trim() ?? "";
  // El cliente ahora AFECTA el precio (tarifa preferencial): no se puede
  // guardar mientras el preview corresponda a otro cliente o siga recalculando
  // — lo persistido debe ser exactamente lo que el operador vio.
  const previewFresco =
    !loading && calcPayload?.cliente_id === (values.cliente_id || undefined);
  const canSave =
    !capacidadExcedida &&
    !mxnSinTc &&
    previewFresco &&
    (isRevise
      ? motivoTrim.length >= 3 && !!calcPayload && !!breakdown && !error
      : !!values.cliente_id && !!calcPayload && !!breakdown && !error);

  const handleSave = () => {
    if (!calcPayload) {
      toast.error("Faltan datos para guardar");
      return;
    }

    if (isRevise) {
      if (motivoTrim.length < 3) {
        toast.error("Indica un motivo (mínimo 3 caracteres)");
        return;
      }
      startSaving(async () => {
        const res = await reviseQuoteAction(initialQuote!.id, {
          ...calcPayload,
          motivo: motivoTrim,
          notas: values.notas || undefined,
          // Las fechas del vuelo también se actualizan al revisar (antes no
          // viajaban y la cotización no aparecía en el calendario).
          fecha_vuelo: values.fecha_vuelo ? cancunInputToIso(values.fecha_vuelo) : undefined,
          fecha_traslado_final: values.fecha_traslado_final
            ? cancunInputToIso(values.fecha_traslado_final)
            : undefined,
        });
        if (res.ok && res.data) {
          toast.success(
            `Cotización #${res.data.folio} revisada (v${res.data.cotizacion_version})`,
          );
          router.push(`/admin/quotes/${res.data.id}`);
          router.refresh();
        } else {
          toast.error(res.error ?? "Error al revisar");
        }
      });
      return;
    }

    if (!values.cliente_id) {
      toast.error("Selecciona un cliente");
      return;
    }
    startSaving(async () => {
      const opsValidos = opsLegs.filter((l) => l.origen && l.destino);
      const res = await createQuoteAction({
        ...calcPayload,
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
              es_externo: true,
              operador_externo: values.operador_externo.trim(),
              costo_externo_usd:
                Number(values.costo_externo_usd) > 0
                  ? Number(values.costo_externo_usd)
                  : 0,
            }
          : {}),
      });
      if (res.ok && res.data) {
        toast.success(`Cotización #${res.data.folio} creada`);
        router.push(`/admin/quotes/${res.data.id}`);
      } else {
        toast.error(res.error ?? "Error al guardar");
      }
    });
  };

  return (
    // UNA columna (26-ago): el flujo va de arriba a abajo — formulario y
    // luego las cards del cálculo — con la barra del TOTAL fija arriba.
    // El split izquierda/derecha obligaba a scrollear en dos lados.
    <div className="mx-auto max-w-4xl space-y-6">
      <TotalBar
        breakdown={breakdown}
        loading={loading}
        error={error}
        sinDatos={!calcPayload}
      />
      {/* FORM */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalculatorIcon className="h-4 w-4 text-muted-foreground" />
            Parámetros
          </CardTitle>
          <CardDescription>El total se recalcula en vivo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Cliente */}
          {isRevise && initialQuote ? (
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 space-y-0.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Cliente · folio
              </p>
              <p className="text-sm font-medium">{clientName ?? initialQuote.cliente_id}</p>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono">#{initialQuote.folio}</span> ·{" "}
                <span className="font-mono">v{initialQuote.cotizacion_version}</span>{" "}
                · revisar genera v{initialQuote.cotizacion_version + 1}
              </p>
              {clienteInterno && (
                <div className="mt-1 rounded-md border border-sky-500/40 bg-sky-500/10 px-2.5 py-1.5 text-xs text-sky-700 dark:text-sky-400 space-y-1.5">
                  <p>
                    Cliente interno — la cotización puede ir en $0 (vuelo de la
                    empresa, sin cobro).
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setCeroOpen(true)}
                  >
                    Poner todo en $0
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Field label="Cliente" required>
              <div className="space-y-2">
                {/* Nombre destacado: Itzel identifica el tipo de vuelo por el
                    nombre del cliente (ej. "Punta Pájaros"). */}
                {(() => {
                  const sel = allClients.find((c) => c.id === values.cliente_id);
                  if (!sel) return null;
                  return (
                    <div className="rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-2">
                      <p className="text-lg font-bold leading-tight">{sel.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {[
                          sel.es_interno ? "Interno · operación propia" : null,
                          sel.es_broker ? "Broker · tarifa broker" : null,
                          sel.rfc,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Cliente directo"}
                      </p>
                      {/* Lo que se le cobra por hora A ESTE cliente (resuelto
                          por el motor: preferencial pactada > default del
                          avión > override), visible al momento de elegirlo. */}
                      {breakdown && (
                        <p className="mt-1 text-xs">
                          <span className="font-mono font-semibold">
                            {fmtUsd(breakdown.tarifa.usd_por_hora)}/hr
                          </span>{" "}
                          <span
                            className={
                              breakdown.tarifa.proviene_de_override
                                ? "text-amber-600 dark:text-amber-400"
                                : breakdown.tarifa.preferencial_cliente
                                  ? "text-emerald-600"
                                  : "text-muted-foreground"
                            }
                          >
                            {breakdown.tarifa.proviene_de_override
                              ? "· cambiada SOLO para esta cotización"
                              : breakdown.tarifa.preferencial_cliente
                                ? "· tarifa pactada con este cliente"
                                : `· tarifa ${breakdown.tarifa.tipo === "PUBLICO" ? "público" : "broker"} del avión`}
                          </span>{" "}
                          <button
                            type="button"
                            onClick={() => {
                              // Activa "Personalizada" y espera el render
                              // para que el input exista antes del scroll.
                              setTarifaCustom(true);
                              setTimeout(() => {
                                const el = document.getElementById(
                                  "tarifa-override-field",
                                );
                                el?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "center",
                                });
                                el?.querySelector("input")?.focus();
                              }, 60);
                            }}
                            className="underline underline-offset-2 text-muted-foreground hover:text-foreground"
                          >
                            ¿cobrar diferente en esta cotización?
                          </button>
                        </p>
                      )}
                    </div>
                  );
                })()}
                {clienteInterno && (
                  <div className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-700 dark:text-sky-400 space-y-2">
                    <p>
                      Cliente interno — la cotización puede ir en $0 (vuelo de la
                      empresa, sin cobro).
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setCeroOpen(true)}
                    >
                      Poner todo en $0
                    </Button>
                  </div>
                )}
                <SearchableSelect
                  options={allClients.map((c) => ({
                    value: c.id,
                    label: c.nombre,
                    description: [
                      c.rfc,
                      c.es_broker ? "Broker" : null,
                      c.es_interno ? "Interno" : null,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                  }))}
                  value={values.cliente_id}
                  onChange={(v) => {
                    setValue("cliente_id", v);
                    // Si el cliente es broker, sugiere tarifa broker.
                    const cli = allClients.find((c) => c.id === v);
                    if (cli?.es_broker) setValue("tipo_tarifa", "BROKER");
                  }}
                  placeholder="Selecciona cliente"
                  emptyText="Sin clientes activos"
                />
                {/* Frecuentes de un tap + alta inline (la mayoría son recurrentes). */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {frequentClientIds
                    .map((id) => allClients.find((c) => c.id === id))
                    .filter((c): c is ClientOption => !!c)
                    .map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setValue("cliente_id", c.id);
                          if (c.es_broker) setValue("tipo_tarifa", "BROKER");
                        }}
                        className={cn(
                          "max-w-[12rem] truncate rounded-full border px-2.5 py-1 text-xs transition-colors",
                          values.cliente_id === c.id
                            ? "border-brand-500 bg-brand-500/10 font-medium text-brand-600"
                            : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                        )}
                      >
                        {c.nombre}
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={() => setClientDialogOpen(true)}
                    className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand-500/60 hover:text-brand-600"
                  >
                    + Nuevo cliente
                  </button>
                </div>
              </div>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* Calendario nativo para la FECHA + hora en TEXTO LIBRE
                ("8pm", "20:00", "0830"): el popup nativo de la hora era un
                fastidio para la oficina (26-ago). */}
            <Field label="Fecha de traslado inicial" hint="Opcional · salida (fecha y hora)">
              <FechaHoraCampo
                value={values.fecha_vuelo ?? ""}
                onChange={(v) => setValue("fecha_vuelo", v)}
              />
            </Field>
            <Field label="Fecha de traslado final" hint="Opcional · regreso (fecha y hora)">
              <FechaHoraCampo
                value={values.fecha_traslado_final ?? ""}
                onChange={(v) => setValue("fecha_traslado_final", v)}
              />
            </Field>
          </div>

          {/* Aeronave */}
          <Field label="Aeronave" required>
            <SearchableSelect
              options={aircraft.map((a) => {
                const sinTarifa = !a.tarifa_hora_pub_usd && !a.tarifa_hora_broker_usd;
                return {
                  value: a.id,
                  label: `${a.matricula} — ${a.modelo}`,
                  description: `${a.velocidad_crucero_kts} kts${
                    sinTarifa
                      ? clienteInterno
                        ? " · sin tarifa · interno cotiza $0"
                        : " · sin tarifa configurada"
                      : ""
                  }`,
                  // Cliente interno: el motor acepta tarifa $0, así que un
                  // avión sin tarifa configurada SÍ se puede cotizar.
                  disabled: sinTarifa && !clienteInterno,
                };
              })}
              value={values.aeronave_id}
              onChange={(v) => setValue("aeronave_id", v)}
              placeholder="Selecciona aeronave"
            />
            {selectedAircraft && (
              <p className="text-xs text-muted-foreground mt-1">
                Tarifa público {fmtUsd(selectedAircraft.tarifa_hora_pub_usd)} / hr · broker{" "}
                {fmtUsd(selectedAircraft.tarifa_hora_broker_usd)} / hr
              </p>
            )}
          </Field>

          {/* Ruta */}
          <Field label="Ruta guardada" required>
            {/* Sugeridas por historial: lo que este cliente suele pedir. */}
            {rutasSugeridas.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Suele pedir:
                </span>
                {rutasSugeridas.map((s) => {
                  const activa =
                    values.escalas.length > 0 &&
                    s.clave ===
                      values.escalas
                        .map((l) => `${l.origen_iata}-${l.destino_iata}`)
                        .join("|");
                  return (
                    <button
                      key={s.clave}
                      type="button"
                      onClick={() => aplicarSugerencia(s)}
                      title={
                        s.ultima_fecha
                          ? `Última vez: ${new Date(s.ultima_fecha).toLocaleDateString("es-MX", { dateStyle: "medium" })}`
                          : undefined
                      }
                      className={cn(
                        "max-w-[16rem] truncate rounded-full border px-2.5 py-1 font-mono text-xs transition-colors",
                        activa
                          ? "border-brand-500 bg-brand-500/10 font-medium text-brand-600"
                          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                      )}
                    >
                      {s.etiqueta}
                      {s.veces > 1 && (
                        <span className="ml-1 opacity-70">×{s.veces}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            <SearchableSelect
              options={allRoutes.map((r) => {
                const path =
                  r.tramos.length > 0
                    ? [
                        r.tramos[0]?.origen_iata,
                        ...r.tramos.map((t) => t.destino_iata),
                      ]
                        .filter(Boolean)
                        .join(" → ")
                    : `${r.origen_iata} → ${r.destino_iata}`;
                return {
                  value: r.id,
                  label: path,
                  description: `${r.millas_nauticas} NM · ${r.tramos.length} ${
                    r.tramos.length === 1 ? "tramo" : "tramos"
                  }`,
                };
              })}
              value={values.ruta_id}
              onChange={(v) => {
                setValue("ruta_id", v);
                const ruta = allRoutes.find((r) => r.id === v);
                if (ruta && ruta.tramos.length > 0) {
                  // Carga los tramos de la plantilla como itinerario editable
                  // de ESTA cotización (la ruta guardada no se modifica).
                  setValue("escalas", ruta.tramos.map(tramoToEscala));
                }
              }}
              placeholder="Selecciona ruta"
              emptyText="Sin rutas — crea una abajo"
            />
            <button
              type="button"
              onClick={() => setRouteSheetOpen(true)}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-600/80 transition-colors"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Crear nueva ruta
            </button>
          </Field>

          {initialQuote?.itinerario_operativo && (
            <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 space-y-1">
              <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">
                RUTA OPERATIVA (la vuela el piloto — aquí no se cotiza)
              </p>
              <p className="font-mono text-sm">
                {(() => {
                  const ops = initialQuote.escalas ?? [];
                  if (ops.length === 0) return "—";
                  return [ops[0].origen_iata, ...ops.map((e) => e.destino_iata)].join(" → ");
                })()}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {(initialQuote.escalas ?? [])
                  .map((e, i) =>
                    e.es_ferry || e.solo_operativa ? `T${i + 1} ferry` : null,
                  )
                  .filter(Boolean)
                  .join(" · ") || "Todos los tramos con pasajeros"}
                {" · "}Los tramos de abajo son la ruta COMERCIAL (lo que paga el
                cliente, abre y cierra en CUN); la operativa no se toca al cotizar.
              </p>
            </div>
          )}

          {values.escalas.length > 0 ? (
            <>
              <Field
                label="Tramos de esta cotización"
                hint="Los ajustes (pax, ferry, pernocta, fechas) aplican solo a esta cotización; la ruta guardada no se modifica."
              >
                <QuoteLegsEditor
                  value={values.escalas}
                  onChange={(legs) => setValue("escalas", legs)}
                  routes={allRoutes}
                  airports={airports}
                  avisoAnclaCun
                />
                {breakdown && (
                  <AporteChip
                    usd={breakdown.totales.viaticos_pernocta_usd}
                    nota="pernoctas cobradas al cliente"
                  />
                )}
              </Field>
              {itinerarioAjustado && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/20 p-2.5">
                  <p className="text-xs text-muted-foreground">
                    Este itinerario difiere de la ruta guardada. Si se va a
                    repetir, guárdalo en el catálogo (la ruta original no se
                    toca).
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleSaveAsRoute}
                    disabled={savingRoute}
                    className="shrink-0"
                  >
                    {savingRoute ? "Guardando…" : "Guardar como nueva ruta"}
                  </Button>
                </div>
              )}
              <div className="hidden lg:block">
                <RoutePreviewMap
                  airports={airports}
                  legs={values.escalas.map((l) => ({
                    origen_iata: l.origen_iata,
                    destino_iata: l.destino_iata,
                    es_ferry: l.es_ferry,
                    requiere_pernocta: l.requiere_pernocta,
                    tipo_parada: l.tipo_parada,
                  }))}
                />
              </div>
            </>
          ) : (
            <Field
              label="Tramos de esta cotización"
              hint="Selecciona una ruta guardada para cargar su itinerario, o escribe la ruta aquí."
            >
              <RutaRapidaInput
                airports={airports}
                hayDatos={false}
                onAplicar={(codigos) =>
                  setValue(
                    "escalas",
                    codigos.slice(0, -1).map((c, i) => ({
                      origen_iata: c,
                      destino_iata: codigos[i + 1],
                      // El autollenado del editor las completa al montar.
                      millas_nauticas: 0,
                    })),
                  )
                }
              />
            </Field>
          )}

          {/* Tarifa tipo — "Personalizada" = override de USD/hr SOLO de esta
              cotización (antes vivía escondido en Overrides; pedido 25-ago). */}
          <div className="space-y-2">
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
                { value: "PUBLICO", label: "Público" },
                { value: "BROKER", label: "Broker" },
                { value: "CUSTOM", label: "Personalizada" },
              ]}
            />
            {tarifaSegment === "CUSTOM" && (
              <div id="tarifa-override-field" className="scroll-mt-24">
                <Field
                  label="Tarifa USD/hr — SOLO esta cotización"
                  hint={
                    clienteInterno
                      ? "Cliente interno: puedes poner 0 para cotizar sin cobro. Vacío = la pactada del cliente o la del avión."
                      : "Por tiempos u otro acuerdo se cobra más o menos. Vacío = la pactada del cliente o la del avión. No cambia la tarifa del cliente."
                  }
                >
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="Auto"
                    {...register("tarifa_hora_override_usd")}
                  />
                </Field>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Pasajeros" required>
              {paxPorTramo ? (
                <>
                  <Input
                    type="number"
                    disabled
                    value={maxPaxTramos}
                    readOnly
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Definido POR TRAMO: cada tramo usa su propio número (máx.{" "}
                    {maxPaxTramos}); este global no se toma en cuenta.
                  </p>
                </>
              ) : (
                <Input
                  type="number"
                  min={1}
                  max={selectedAircraft?.asientos || undefined}
                  {...register("pasajeros")}
                />
              )}
              {selectedAircraft && selectedAircraft.asientos > 0 && (
                <p
                  className={cn(
                    "text-xs mt-1",
                    capacidadExcedida ? "text-destructive font-medium" : "text-muted-foreground",
                  )}
                >
                  {capacidadExcedida
                    ? `Excede la capacidad: ${maxPasajeros} pax en un tramo vs máx. ${selectedAircraft.asientos} (${selectedAircraft.modelo}).`
                    : `Máx. ${selectedAircraft.asientos} pasajeros (${selectedAircraft.modelo}).`}
                </p>
              )}
              {/* Cuánto pagan de TUAS estos pasajeros, aeropuerto por
                  aeropuerto (26-ago): "4 × $25.00 = $100.00 USD". */}
              {values.cobrar_tuas &&
                breakdown &&
                (breakdown.tuas.filas ?? []).length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {(breakdown.tuas.filas ?? []).map((f) => (
                      <p key={f.iata} className="text-xs text-muted-foreground">
                        TUA <span className="font-mono">{f.iata}</span>:{" "}
                        <span className="font-mono">
                          {f.pax} ×{" "}
                          {f.moneda === "MXN"
                            ? fmtMxn(f.monto_pax)
                            : fmtUsd(f.monto_pax)}{" "}
                          = {fmtUsd(f.total_usd)} USD
                        </span>
                      </p>
                    ))}
                  </div>
                )}
            </Field>
            <div className="flex flex-col gap-1">
              <Label className="text-sm font-medium">Pase de abordar</Label>
              <div className="flex items-center h-9">
                <Switch
                  checked={values.pase_abordar}
                  onCheckedChange={(c) => setValue("pase_abordar", c)}
                />
                <span className="text-xs text-muted-foreground ml-3">
                  Exenta TUAS (excepto CZM)
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Sobrevuelo (hr)"
              hint="Tiempo extra sobre la zona; se suma al cobrable"
            >
              <Input
                type="number"
                step="0.1"
                min={0}
                max={24}
                placeholder="0"
                {...register("sobrevuelo_hr")}
              />
              {breakdown &&
                Number(breakdown.tiempos.sobrevuelo_hr) > 0 &&
                (() => {
                  // Aporte REAL: la parte del sobrevuelo absorbida por la
                  // hora mínima no suma (0.7 + 0.5 hr cobra 1.2 → solo 0.2
                  // hr son del sobrevuelo). min(sob, cobrable − 1).
                  const sob = Number(breakdown.tiempos.sobrevuelo_hr);
                  const deltaHr = Math.min(
                    sob,
                    Math.max(0, breakdown.tiempos.cobrable_hr - 1),
                  );
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
                })()}
            </Field>
            {/* El switch de Cobrar TUAS vive en la card "TUAS por
                aeropuerto" del panel derecho (26-ago): junto a donde se
                editan los montos, que es donde tiene sentido. */}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Cotización abierta</Label>
              <p className="text-xs text-muted-foreground">
                El itinerario/precio se cierra al final: permite re-cotizar con
                los tramos reales hasta antes de cobrar/facturar.
              </p>
            </div>
            <Switch
              checked={values.cotizacion_abierta}
              onCheckedChange={(c) => setValue("cotizacion_abierta", c)}
            />
          </div>

          {/* Vuelo cubierto por operador externo: TODOS los vuelos nacen
              igual (cotización normal); cubrirlo se decide después desde el
              detalle del vuelo («Cubrir con externo»). Aquí solo se muestra
              el estado y se edita el precio pactado al revisar. */}
          {isRevise ? (
            initialQuote?.es_externo && (
              <div className="space-y-3">
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  Vuelo cubierto por <strong>{initialQuote.operador_externo}</strong>.
                  El avión de arriba es solo la referencia de tarifa; el operador y
                  el costo del apoyo se editan desde el detalle del vuelo.
                </div>
                <Field
                  label="Precio pactado con el cliente (total, USD)"
                  hint="Se conserva entre revisiones: el total aterriza exacto en lo pactado. Vacío = usar el cálculo normal."
                >
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="Ej. 800.00"
                    value={values.total_pactado_usd ?? ""}
                    onChange={(e) =>
                      setValue(
                        "total_pactado_usd",
                        e.target.value === ""
                          ? null
                          : Math.max(0, Number(e.target.value)),
                      )
                    }
                  />
                </Field>
              </div>
            )
          ) : null}

          {/* Conceptos extra */}
          <ExtrasEditor
            value={values.extras}
            onChange={(extras) => setValue("extras", extras)}
            tcCapturado={Number(values.tc_usd_mxn) > 0}
          />
          {breakdown && (
            <AporteChip
              usd={breakdown.totales.extras_total_usd}
              nota="conceptos extra"
            />
          )}

          {/* Cierre del total: el redondeo es AUTOMÁTICO (regla del cliente:
              siempre arriba al siguiente múltiplo de $10; 976→980, 991→1000)
              — lo resuelve el motor con el IVA considerado. El descuento se
              aplica antes. Hacia el motor viaja UNA línea de ajuste para que
              el desglose siga cuadrando. */}
          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">Cierre del total</p>
            {breakdown && (
              <AporteChip
                usd={breakdown.totales.ajuste_final_usd}
                nota="ajuste neto (redondeo − descuento)"
              />
            )}
            {values.es_externo && Number(values.total_pactado_usd) > 0 && (
              <div className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-700 dark:text-sky-400">
                El <strong>precio pactado</strong> manda: el total aterriza en{" "}
                {fmtUsd(Number(values.total_pactado_usd))} y el redondeo
                automático no aplica.
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm">Redondeo automático a número cerrado</p>
                <p className="text-xs text-muted-foreground">
                  Siempre hacia arriba al siguiente múltiplo de $10 (976→980, 991→1000).
                </p>
              </div>
              <Switch
                checked={values.redondeo_auto}
                onCheckedChange={(c) => setValue("redondeo_auto", c)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {!values.redondeo_auto && (
                <Field label="Redondeo manual" hint="Solo con el automático apagado.">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="0.00"
                      className="w-24"
                      value={values.redondeo_usd ?? ""}
                      onChange={(e) =>
                        setValue(
                          "redondeo_usd",
                          e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                        )
                      }
                    />
                  </div>
                </Field>
              )}
              <Field label="Descuento" hint="Negociado: “ciérramelo en 750”.">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="0.00"
                  className="w-28"
                  value={values.descuento_usd ?? ""}
                  onChange={(e) =>
                    setValue(
                      "descuento_usd",
                      e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                    )
                  }
                />
              </Field>
            </div>
            {breakdown &&
              ((breakdown.totales.ajuste_final_usd ?? 0) !== 0 ||
                (Number(values.descuento_usd) || 0) > 0) && (
                (() => {
                  const cotizado =
                    breakdown.totales.total_usd -
                    (breakdown.totales.ajuste_final_usd ?? 0);
                  const descuento = Number(values.descuento_usd) || 0;
                  // Con auto: el redondeo real lo reporta el motor; manual: lo del campo.
                  const redondeo = values.redondeo_auto
                    ? (breakdown.meta?.redondeo_auto_usd ?? 0)
                    : Number(values.redondeo_usd) || 0;
                  return (
                    <div className="rounded-md bg-muted/40 px-3 py-2 text-sm space-y-0.5">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Cotizado</span>
                        <span className="font-mono">{fmtUsd(cotizado)}</span>
                      </div>
                      {redondeo > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>+ Redondeo</span>
                          <span className="font-mono">{fmtUsd(redondeo)}</span>
                        </div>
                      )}
                      {descuento > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>− Descuento</span>
                          <span className="font-mono">−{fmtUsd(descuento)}</span>
                        </div>
                      )}
                      {values.es_externo &&
                        Number(values.total_pactado_usd) > 0 &&
                        (() => {
                          // Delta del pactado = total − cotizado − redondeo + descuento
                          const delta =
                            Math.round(
                              (breakdown.totales.total_usd -
                                cotizado -
                                redondeo +
                                descuento) *
                                100,
                            ) / 100;
                          return delta !== 0 ? (
                            <div className="flex justify-between text-muted-foreground">
                              <span>Ajuste al precio pactado</span>
                              <span className="font-mono">
                                {delta > 0 ? "+" : "−"}
                                {fmtUsd(Math.abs(delta))}
                              </span>
                            </div>
                          ) : null;
                        })()}
                      <div className="flex justify-between border-t border-border pt-1 font-semibold">
                        <span>Total a cobrar</span>
                        <span className="font-mono">
                          {fmtUsd(breakdown.totales.total_usd)}
                        </span>
                      </div>
                    </div>
                  );
                })()
              )}
          </div>

          {/* Ruta OPERATIVA opcional (solo al crear): la ruta real del avión
              para gastos/tacómetros; puede salir de otra base y llevar ferries.
              Es independiente de los tramos comerciales de arriba (el dinero). */}
          {!isRevise && (
            <div className="space-y-2 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                  Ruta operativa (opcional · no se cotiza)
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() =>
                    setOpsLegs((prev) => [
                      ...prev,
                      {
                        origen: prev.length
                          ? prev[prev.length - 1].destino
                          : "",
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
              {opsLegs.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  La ruta REAL del avión (puede salir de otra base, con
                  ferries). Aquí se cargan los gastos y tacómetros; los tramos
                  de arriba son solo lo que paga el cliente. Si la dejas
                  vacía, la operación usa la ruta comercial.
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
                          setOpsLegs((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, origen: v } : x)),
                          )
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
                          setOpsLegs((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, destino: v } : x)),
                          )
                        }
                        placeholder="Destino"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-destructive"
                        onClick={() =>
                          setOpsLegs((prev) => prev.filter((_, j) => j !== i))
                        }
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
                                      // Ferry vuela vacío: sin nombres.
                                      ...(c
                                        ? { nombres: "", showNombres: false }
                                        : {}),
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
                        title="El piloto pernocta tras este tramo. Si el siguiente tramo sale otro día, se marca sola."
                      >
                        <Switch
                          checked={l.pernocta}
                          onCheckedChange={(c) =>
                            setOpsLegs((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, pernocta: c } : x,
                              ),
                            )
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
                            setOpsLegs((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, servicio: c } : x,
                              ),
                            )
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
                          setOpsLegs((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, pax: e.target.value } : x,
                            ),
                          )
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
                            prev.map((x, j) =>
                              j === i ? { ...x, servicioNotas: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    )}
                    <div className="grid grid-cols-[auto_1fr] items-center gap-2">
                      <Input
                        type="datetime-local"
                        className="h-8 w-auto"
                        title="Fecha y hora del tramo (opcional, hora Cancún). Vacía = tramo 1 sale a la fecha del vuelo."
                        value={l.hora}
                        onChange={(e) =>
                          setOpsLegs((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, hora: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <Input
                        className="h-8"
                        placeholder='Nota del tramo para el piloto · ej. "cargar gasolina aquí"'
                        value={l.nota}
                        onChange={(e) =>
                          setOpsLegs((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, nota: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </div>
                    {/* Manifiesto colapsado: en el caso común va vacío y no
                        alarga la card; un ferry vuela sin nombres. */}
                    {!l.ferry &&
                      (l.showNombres ? (
                        <div className="space-y-1">
                          <Textarea
                            rows={3}
                            value={l.nombres}
                            onChange={(e) =>
                              setOpsLegs((prev) =>
                                prev.map((x, j) =>
                                  j === i ? { ...x, nombres: e.target.value } : x,
                                ),
                              )
                            }
                            placeholder={"Nombres de pasajeros, uno por línea\nJuan Pérez\nMaría López"}
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Específico de este tramo. Útil para permisos; puede
                            ir vacío.
                          </p>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setOpsLegs((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, showNombres: true } : x,
                              ),
                            )
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
          )}

          <Field label="Método de pago" required>
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

          {/* BillPocket no factura (sin IVA) pero cobra comisión CUSTOM por
              operación (5%, 9%… tope 20%): entra al total como línea sin IVA. */}
          {values.metodo_pago === "BILLPOCKET" && (
            <Field
              label="Comisión BillPocket (%)"
              hint="Custom por operación · tope 20% · sin IVA"
            >
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={20}
                  placeholder="Ej. 9"
                  className="w-32"
                  value={values.comision_billpocket_pct ?? ""}
                  onChange={(e) =>
                    setValue(
                      "comision_billpocket_pct",
                      e.target.value === ""
                        ? null
                        : Math.min(20, Math.max(0, Number(e.target.value))),
                    )
                  }
                />
                {Number(values.comision_billpocket_pct) > 0 && breakdown && (
                  <span className="text-xs text-muted-foreground font-mono">
                    la línea aparece en el desglose como “Comisión BillPocket”
                  </span>
                )}
              </div>
            </Field>
          )}

          {/* El pago puede entrar en pesos (BillPocket/transferencia): el TC
              pactado fija el total MXN y convierte los cobros MXN sin TC.
              Con renglones nativos en MXN (TUAS/extras) el campo también
              aparece con método DOLARES: sin TC no pueden convertirse. */}
          {(values.metodo_pago !== "DOLARES" || hayLineasMxn) && (
            <div id="tc-usd-mxn-field" className="scroll-mt-24">
            <Field
              label="Tipo de cambio (MXN por USD)"
              hint={
                hayLineasMxn
                  ? "Requerido: hay TUAS/extras capturados en pesos"
                  : "Opcional · si el pago entrará en pesos"
              }
            >
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  step="0.0001"
                  min={0}
                  placeholder="Ej. 18.50"
                  className="w-32"
                  value={values.tc_usd_mxn ?? ""}
                  onChange={(e) =>
                    setValue(
                      "tc_usd_mxn",
                      e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                    )
                  }
                />
                {Number(values.tc_usd_mxn) > 0 && breakdown && (
                  <span className="text-xs text-muted-foreground font-mono">
                    {/* total_mxn del motor = EXACTO por composición (USD×tc +
                        nativos MXN tal cual); el producto local es respaldo. */}
                    {breakdown.totales.total_mxn != null
                      ? `= ${fmtMxn(breakdown.totales.total_mxn)}`
                      : `≈ ${fmtMxn(
                          Number(breakdown.totales.total_usd) *
                            Number(values.tc_usd_mxn),
                        )}`}
                  </span>
                )}
              </div>
            </Field>
            </div>
          )}

          {/* IVA (override): junto al método de pago/TC — la válvula cuando
              el trato SÍ factura distinto (antes escondida hasta abajo en
              "Overrides avanzados"; pedido 25-ago). */}
          <Field label="IVA % (override)" hint="0.16 = 16%. Vacío = automático">
            <Input
              type="number"
              step="0.01"
              min={0}
              max={1}
              placeholder="Auto"
              className="w-32"
              {...register("iva_pct_override")}
            />
          </Field>

          {/* Comisión del VENDEDOR (Itzy/Pablo/broker): se SUMA al precio del
              cliente — el neto VuelaTour queda en el precio base y lo manda el
              motor en meta (no calcularlo aquí). Modalidades: monto fijo o
              $/hr × horas cobradas (la resuelve el motor). INTERNA: jamás
              aparece en el PDF del cliente. */}
          <Field
            label="Comisión del vendedor (interna)"
            hint="Se SUMA al precio del cliente · interna, no aparece en el PDF"
          >
            <div className="space-y-2">
              {breakdown && (
                <AporteChip
                  usd={breakdown.meta?.comision_vendedor_usd}
                  nota="la paga el cliente"
                />
              )}
              <div className="w-56">
                <Segmented
                  value={values.comision_vendedor_modo}
                  onChange={(v) =>
                    setValue(
                      "comision_vendedor_modo",
                      v === "POR_HORA" ? "POR_HORA" : "FIJA",
                    )
                  }
                  options={[
                    { value: "FIJA", label: "Monto fijo" },
                    { value: "POR_HORA", label: "Por hora" },
                  ]}
                />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {values.comision_vendedor_modo === "POR_HORA" ? (
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="$/hr · Ej. 50"
                    className="w-32"
                    value={values.comision_vendedor_tarifa_hr ?? ""}
                    onChange={(e) =>
                      setValue(
                        "comision_vendedor_tarifa_hr",
                        e.target.value === ""
                          ? null
                          : Math.max(0, Number(e.target.value)),
                      )
                    }
                  />
                ) : (
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="USD · Ej. 50"
                    className="w-32"
                    value={values.comision_vendedor_usd ?? ""}
                    onChange={(e) =>
                      setValue(
                        "comision_vendedor_usd",
                        e.target.value === ""
                          ? null
                          : Math.max(0, Number(e.target.value)),
                      )
                    }
                  />
                )}
                <Input
                  placeholder="Quién vendió (Itzy, Pablo…)"
                  className="w-48"
                  value={values.comision_vendedor_nombre}
                  onChange={(e) => setValue("comision_vendedor_nombre", e.target.value)}
                />
              </div>
              {/* Vista en vivo POR_HORA: tarifa × horas cobradas del cálculo. */}
              {values.comision_vendedor_modo === "POR_HORA" &&
                Number(values.comision_vendedor_tarifa_hr) > 0 && (
                  <p className="text-xs text-muted-foreground font-mono">
                    {breakdown && Number(breakdown.tiempos.cobrable_hr) > 0
                      ? `= ${fmtUsd(Number(values.comision_vendedor_tarifa_hr))} × ${fmtDecimal(
                          breakdown.tiempos.cobrable_hr,
                        )} hr = ${fmtUsd(
                          Math.round(
                            Number(values.comision_vendedor_tarifa_hr) *
                              Number(breakdown.tiempos.cobrable_hr) *
                              100,
                          ) / 100,
                        )}`
                      : "= se calcula con las horas al cotizar"}
                  </p>
                )}
              {/* Neto VuelaTour: viene del motor (total − comisión), fuente única. */}
              {values.comision_vendedor_modo !== "POR_HORA" &&
                Number(values.comision_vendedor_usd) > 0 &&
                breakdown?.meta?.neto_vuelatour_usd != null && (
                  <p className="text-xs text-muted-foreground font-mono">
                    Neto VuelaTour: {fmtUsd(breakdown.meta.neto_vuelatour_usd)}
                  </p>
                )}
            </div>
          </Field>

          <Field label="Notas (visibles en PDF)" hint="Opcional">
            <Textarea rows={2} placeholder="Ej. Sujeto a slot CUN…" {...register("notas")} />
          </Field>

          {/* En REVISE no se muestra: el DTO de revisión no acepta
              notas_internas (forbidNonWhitelisted) y lo editado se descartaba
              en silencio. Se editan desde el detalle del vuelo (Editar datos). */}
          {!isRevise && (
            <Field label="Notas internas" hint="Opcional · no aparecen en PDF">
              <Textarea
                rows={2}
                placeholder="Solo para el equipo"
                {...register("notas_internas")}
              />
            </Field>
          )}

        </CardContent>
      </Card>

      {/* CÁLCULO — en el mismo flujo, bajo el formulario. El total vive en
          la TotalBar fija de arriba, así que aquí queda el detalle. */}
      <div className="space-y-6">
        {error ? (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-base text-destructive">
                Error al calcular
              </CardTitle>
              <CardDescription className="text-destructive/80">{error}</CardDescription>
            </CardHeader>
          </Card>
        ) : !calcPayload ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-muted-foreground">
                Completa los parámetros
              </CardTitle>
              <CardDescription>
                Necesito aeronave, ruta y pasajeros para calcular.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : breakdown ? (
          <Preview
            breakdown={breakdown}
            loading={loading}
            tuasLineas={values.tuas_lineas ?? []}
            onTuaChange={setTuaLinea}
            cobrarTuas={values.cobrar_tuas}
            onCobrarTuasChange={(c) => setValue("cobrar_tuas", c)}
            tcUsdMxn={Number(values.tc_usd_mxn) > 0 ? Number(values.tc_usd_mxn) : null}
            tiempoOverride={values.tiempo_vuelo_override_hr}
            onTiempoOverride={(v) => setValue("tiempo_vuelo_override_hr", v)}
          />
        ) : (
          <PreviewSkeleton />
        )}

        {/* Save bar */}
        <Card>
          <CardContent className="p-4 space-y-3">
            {mxnSinTc && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                Hay TUAS o extras capturados en MXN sin tipo de cambio: el
                total mostrado aún NO los incluye. Captura el TC (MXN por USD)
                arriba para aplicarlos y poder guardar.
              </p>
            )}
            {isRevise && initialQuote ? (
              <>
                <div className="text-sm">
                  <p className="font-medium">
                    Aplicar revisión v{initialQuote.cotizacion_version + 1}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    La versión actual queda en el historial. El cálculo nuevo
                    reemplaza el snapshot del vuelo.
                  </p>
                </div>
                <Field label="Motivo de la revisión" required>
                  <Textarea
                    rows={2}
                    placeholder="Ej. Cliente cambió fecha y aumentó pasajeros"
                    {...register("motivo")}
                  />
                </Field>
                <div className="flex items-center justify-end">
                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={!canSave || saving}
                    className="gap-2"
                  >
                    <BookmarkSquareIcon className="h-4 w-4" />
                    {saving
                      ? "Guardando…"
                      : `Aplicar revisión v${initialQuote.cotizacion_version + 1}`}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm">
                  <p className="font-medium">Guardar cotización</p>
                  <p className="text-xs text-muted-foreground">
                    Se crea como v1 en estado COTIZADO. Podrás revisar o confirmar después.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave || saving}
                  className="gap-2"
                >
                  <BookmarkSquareIcon className="h-4 w-4" />
                  {saving ? "Guardando…" : "Guardar cotización"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>


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

      {/* Confirmación de "todo en $0": borra extras y overrides ya capturados. */}
      <Dialog open={ceroOpen} onOpenChange={setCeroOpen}>
        <DialogContent className="sm:max-w-md">
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
              {values.es_externo && <li>Precio pactado del vuelo externo</li>}
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

/**
 * Mini-desglose EN VIVO (26-ago): bajo cada ajuste del formulario se ve
 * cuánto suma/resta ese apartado al total — para entender la cotización sin
 * ir a buscar al panel de la derecha ("sencillo, no tedioso").
 */
function AporteChip({
  usd,
  nota,
}: {
  usd: number | null | undefined;
  nota?: string;
}) {
  const v = Math.round((Number(usd) || 0) * 100) / 100;
  if (v === 0) return null;
  return (
    <p
      className={cn(
        "text-xs font-medium mt-1",
        v > 0
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-amber-600 dark:text-amber-400",
      )}
    >
      {v > 0 ? "+" : "−"}
      {fmtUsd(Math.abs(v))} en el total
      {nota ? (
        <span className="text-muted-foreground font-normal"> · {nota}</span>
      ) : null}
    </p>
  );
}

/**
 * Barra FIJA del total (26-ago): siempre visible al hacer scroll — se va
 * ajustando la cotización y el total + mini-desglose se actualizan en vivo,
 * sin regresar arriba. Sustituye a la barra flotante inferior y al panel
 * lateral pegajoso (el cotizador pasó a UNA columna).
 */
function TotalBar({
  breakdown,
  loading,
  error,
  sinDatos,
}: {
  breakdown: QuoteBreakdown | null;
  loading: boolean;
  error: string | null;
  sinDatos: boolean;
}) {
  const chips: { label: string; value: string }[] = [];
  if (breakdown) {
    chips.push({
      label: "Subtotal",
      value: fmtUsd(breakdown.totales.subtotal_vuelo_usd),
    });
    chips.push({ label: "TUAS", value: fmtUsd(breakdown.totales.tuas_total_usd) });
    if (breakdown.totales.viaticos_pernocta_usd) {
      chips.push({
        label: "Pernocta",
        value: fmtUsd(breakdown.totales.viaticos_pernocta_usd),
      });
    }
    if (breakdown.totales.extras_total_usd) {
      chips.push({
        label: "Extras",
        value: fmtUsd(breakdown.totales.extras_total_usd),
      });
    }
    // La comisión del vendedor SÍ es parte del total (la paga el cliente)
    // pero viaja en meta, no en totales: sin este chip el desglose de la
    // barra no sumaría el número grande de al lado.
    if (breakdown.meta?.comision_vendedor_usd) {
      chips.push({
        label: "Comisión",
        value: fmtUsd(breakdown.meta.comision_vendedor_usd),
      });
    }
    if (breakdown.totales.ajuste_final_usd) {
      chips.push({
        label:
          (breakdown.totales.ajuste_final_usd ?? 0) < 0
            ? "Descuento"
            : "Redondeo",
        value: fmtUsd(breakdown.totales.ajuste_final_usd!),
      });
    }
    chips.push({ label: "IVA", value: fmtUsd(breakdown.totales.iva_usd) });
  }
  return (
    <div className="sticky top-0 z-30 -mx-1 px-1 pt-1">
      <div className="rounded-xl border border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90 shadow-sm px-4 py-2.5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div
            className={cn(
              "flex items-baseline gap-2 transition-opacity",
              loading && "opacity-60",
            )}
          >
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Total
            </span>
            {error ? (
              <span className="text-sm font-medium text-destructive">
                Error al calcular
              </span>
            ) : sinDatos ? (
              <span className="text-sm text-muted-foreground">
                Completa aeronave, ruta y pasajeros
              </span>
            ) : !breakdown ? (
              <span className="text-sm text-muted-foreground">Calculando…</span>
            ) : (
              <>
                <span className="text-2xl font-bold tracking-tight font-mono tabular-nums">
                  {fmtUsd(breakdown.totales.total_usd)}
                </span>
                <span className="text-xs text-muted-foreground">USD</span>
                {breakdown.totales.total_mxn != null && (
                  <span className="text-xs text-muted-foreground font-mono">
                    {fmtMxn(breakdown.totales.total_mxn)}
                  </span>
                )}
              </>
            )}
          </div>
          {breakdown && !error && (
            <div
              className={cn(
                "hidden md:flex items-baseline gap-4 text-xs transition-opacity",
                loading && "opacity-60",
              )}
            >
              {chips.map((c) => (
                <span key={c.label} className="whitespace-nowrap">
                  <span className="text-muted-foreground">{c.label} </span>
                  <span className="font-mono tabular-nums">{c.value}</span>
                </span>
              ))}
              <Badge variant="outline" className="text-[10px]">
                {breakdown.tarifa.tipo}
              </Badge>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Fila del desglose del TOTAL, estilo recibo: etiqueta a la izquierda, monto
 * mono a la derecha. Sustituye al grid de celdas (26-ago): las celdas
 * condicionales desbordaban a una segunda fila y "Redondeo" quedaba huérfano
 * y desalineado — el recibo nunca se rompe y se lee en el orden de la suma.
 */
function FilaTotal({
  label,
  hint,
  value,
}: {
  label: string;
  hint?: string;
  value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">
        {label}
        {hint ? (
          <span className="text-xs"> · {hint}</span>
        ) : null}
      </span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

function Preview({
  breakdown,
  loading,
  tuasLineas,
  onTuaChange,
  cobrarTuas,
  onCobrarTuasChange,
  tcUsdMxn,
  tiempoOverride,
  onTiempoOverride,
}: {
  breakdown: QuoteBreakdown;
  loading: boolean;
  tuasLineas: TuaLinea[];
  onTuaChange: (iata: string, monto: number | null, moneda: "USD" | "MXN") => void;
  cobrarTuas: boolean;
  onCobrarTuasChange: (c: boolean) => void;
  tcUsdMxn: number | null;
  /** Tiempo de vuelo PACTADO (hr) capturado en la card de Tiempos. */
  tiempoOverride: number | null;
  onTiempoOverride: (v: number | null) => void;
}) {
  // Aeropuertos ÚNICOS del itinerario (todos, no solo origen/destino).
  const aeropuertos = (() => {
    const list =
      breakdown.tuas.aeropuertos ??
      [
        breakdown.tuas.origen,
        ...(breakdown.tuas.intermedios ?? []),
        breakdown.tuas.destino,
      ].filter(Boolean);
    const seen = new Set<string>();
    return list.filter((a) => {
      if (!a || seen.has(a.iata)) return false;
      seen.add(a.iata);
      return true;
    });
  })();
  const filaPorIata = new Map(
    (breakdown.tuas.filas ?? []).map((f) => [f.iata, f]),
  );
  const lineaPorIata = new Map(tuasLineas.map((l) => [l.iata, l]));

  // Composición del total MXN (motor): componentes USD × tc + nativos MXN.
  const mxnNativos = Number(breakdown.totales.mxn_nativos) || 0;
  const usdDeMxn =
    Math.round(
      ((breakdown.tuas.filas ?? [])
        .filter((f) => f.moneda === "MXN")
        .reduce((acc, f) => acc + f.total_usd, 0) +
        (breakdown.extras ?? [])
          .filter((e) => e.moneda === "MXN")
          .reduce((acc, e) => acc + e.monto_usd, 0)) *
        100,
    ) / 100;
  const componentesUsd =
    Math.round((breakdown.totales.total_usd - usdDeMxn) * 100) / 100;
  const componentesUsdEnMxn =
    breakdown.totales.total_mxn != null
      ? Math.round((breakdown.totales.total_mxn - mxnNativos) * 100) / 100
      : null;

  return (
    <>
      {/* TOTAL */}
      <Card className={cn("transition-opacity", loading && "opacity-60")}>
        <CardContent className="p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total</p>
              <p className="text-4xl md:text-5xl font-bold tracking-tight">
                {fmtUsd(breakdown.totales.total_usd)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">USD</p>
              {/* Comisión del vendedor: se SUMA al precio (la paga el
                  cliente); el neto VuelaTour lo manda el motor en meta —
                  fuente única, no se calcula aquí. */}
              {!!breakdown.meta?.comision_vendedor_usd && (
                <p className="text-xs text-muted-foreground mt-2">
                  Comisión vendedor
                  {breakdown.meta.comision_vendedor_nombre
                    ? ` (${breakdown.meta.comision_vendedor_nombre})`
                    : ""}
                  : +{fmtUsd(breakdown.meta.comision_vendedor_usd)} (la paga el
                  cliente)
                  {breakdown.meta.neto_vuelatour_usd != null && (
                    <>
                      {" "}·{" "}
                      <span className="font-semibold text-foreground">
                        Neto VuelaTour:{" "}
                        {fmtUsd(breakdown.meta.neto_vuelatour_usd)}
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
          {/* Desglose tipo RECIBO, en el MISMO orden de la suma canónica
              (subtotal + TUAS + pernocta + extras + ajuste + IVA = total):
              se lee de arriba a abajo y siempre queda alineado. */}
          <div className="mt-4 pt-3 border-t border-border space-y-1.5 text-sm">
            <FilaTotal
              label="Subtotal vuelo"
              value={fmtUsd(breakdown.totales.subtotal_vuelo_usd)}
            />
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
                label={
                  (breakdown.totales.ajuste_final_usd ?? 0) < 0
                    ? "Descuento"
                    : "Redondeo"
                }
                hint="fuera de IVA"
                value={fmtUsd(breakdown.totales.ajuste_final_usd!)}
              />
            )}
            <FilaTotal
              label="IVA"
              hint={
                breakdown.iva.porcentaje > 0
                  ? `${(breakdown.iva.porcentaje * 100).toFixed(0)}%`
                  : "0%"
              }
              value={fmtUsd(breakdown.totales.iva_usd)}
            />
          </div>
          {(breakdown.extras?.length ?? 0) > 0 && (
            <div className="mt-3 pt-3 border-t border-border space-y-1">
              {breakdown.extras!.map((e, i) => (
                <div
                  key={`${e.concepto}-${i}`}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="text-muted-foreground min-w-0 break-words">
                    {e.concepto}
                    {e.aplica_iva === false && (
                      <span className="ml-1 text-[10px]">(sin IVA)</span>
                    )}
                  </span>
                  <span className="font-mono shrink-0">
                    {/* Renglón MXN: pesos nativos primero, canon USD al lado. */}
                    {e.moneda === "MXN" && e.monto_nativo != null && (
                      <span className="mr-1.5 text-muted-foreground">
                        {fmtMxn(e.monto_nativo)} =
                      </span>
                    )}
                    {fmtUsd(e.monto_usd)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {/* Total consolidado en MXN (motor ≥1.3.1): EXACTO por composición
              — componentes USD × tc + renglones nativos MXN tal cual. */}
          {breakdown.totales.total_mxn != null && (
            <div className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
              {mxnNativos > 0 ? (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Total por moneda
                  </p>
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>
                      Componentes USD: {fmtUsd(componentesUsd)}
                      {tcUsdMxn ? ` × tc ${fmtDecimal(tcUsdMxn, 4)}` : ""}
                    </span>
                    <span className="font-mono shrink-0">
                      {componentesUsdEnMxn != null ? fmtMxn(componentesUsdEnMxn) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>Nativos MXN (TUAS/extras en pesos, tal cual)</span>
                    <span className="font-mono shrink-0">{fmtMxn(mxnNativos)}</span>
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
                  <span className="font-mono font-semibold">
                    {fmtMxn(breakdown.totales.total_mxn)}
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalle por tramo (MULTIESCALA) */}
      {breakdown.tramos && breakdown.tramos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Detalle por tramo</CardTitle>
            <CardDescription className="text-xs">
              Pasajeros, TUAS, ferry, pernocta y paradas de servicio por tramo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {breakdown.tramos.map((t) => (
              <div
                key={t.orden}
                className="rounded-lg border border-border p-2.5 text-sm space-y-1"
              >
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
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {fmtDecimal(t.millas)} NM · {fmtDecimal(t.tiempo_hr, 4)} hr
                  </span>
                  <span>TUAS {fmtUsd(t.tuas_usd)}</span>
                </div>
                {t.tipo_parada === "SERVICIO" && t.servicio_notas && (
                  <p className="text-xs text-sky-700 dark:text-sky-300">
                    {t.servicio_notas}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tiempos + Tarifa */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tiempos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {/* Tiempo de vuelo PACTADO (25-ago): editable aquí mismo para
                cobrar un tiempo distinto al calculado; vacío = NM ÷ kts. */}
            <div className="flex items-center justify-between gap-2">
              <div>
                <p>Vuelo</p>
                <p className="text-xs text-muted-foreground">
                  {breakdown.tiempos.vuelo_proviene_de_override
                    ? `pactado · calculado ${fmtDecimal(breakdown.tiempos.vuelo_hr_calculado ?? 0, 4)} hr (${fmtDecimal(breakdown.ruta.millas_nauticas_totales)} NM ÷ ${breakdown.aeronave.velocidad_crucero_kts} kts)`
                    : `${fmtDecimal(breakdown.ruta.millas_nauticas_totales)} NM ÷ ${breakdown.aeronave.velocidad_crucero_kts} kts`}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={24}
                  placeholder={fmtDecimal(
                    breakdown.tiempos.vuelo_hr_calculado ??
                      breakdown.tiempos.vuelo_hr,
                    4,
                  )}
                  className="h-7 w-24 text-right font-mono"
                  value={tiempoOverride ?? ""}
                  onChange={(e) =>
                    onTiempoOverride(
                      e.target.value === ""
                        ? null
                        : Math.max(0, Number(e.target.value)),
                    )
                  }
                />
                <span className="text-xs text-muted-foreground">hr</span>
              </div>
            </div>
            {breakdown.tiempos.vuelo_proviene_de_override &&
              Number(breakdown.tiempos.vuelo_hr) <
                Number(breakdown.tiempos.vuelo_hr_calculado ?? 0) && (
                <p className="text-xs text-amber-600">
                  Ojo: el tiempo pactado es MENOR al calculado — se cobraría
                  menos que el vuelo real.
                </p>
              )}
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
            <Row
              label="Cobrable"
              value={`${fmtDecimal(breakdown.tiempos.cobrable_hr, 4)} hr`}
              bold
            />
            {breakdown.tiempos.minimo_hora_aplicado && (
              <p className="text-xs text-amber-600">
                Vuelo corto: se cobra la hora completa (mínimo 1 hr).
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tarifa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label="USD / hr"
              value={fmtUsd(breakdown.tarifa.usd_por_hora)}
              hint={
                breakdown.tarifa.proviene_de_override
                  ? "Override manual"
                  : breakdown.tarifa.preferencial_cliente
                    ? "Preferencial del cliente"
                    : "Del avión"
              }
            />
            {breakdown.tarifa.preferencial_cliente && (
              <p className="text-xs text-emerald-600">
                Este cliente tiene tarifa preferencial pactada para este avión; manda
                sobre la tarifa {breakdown.tarifa.tipo === "PUBLICO" ? "público" : "broker"} default.
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

      {/* TUAS desglose EDITABLE: todos los aeropuertos del itinerario, con
          monto por pax capturable + moneda propia (pass-through de lo que el
          aeropuerto cobra; manda sobre el catálogo). */}
      <Card className={cn("transition-opacity", !cobrarTuas && "opacity-60")}>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm">TUAS por aeropuerto</CardTitle>
            {/* El switch vive AQUÍ, junto a donde se editan los montos. */}
            <label className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
              {cobrarTuas ? "Se cobra" : "No se cobra"}
              <Switch checked={cobrarTuas} onCheckedChange={onCobrarTuasChange} />
            </label>
          </div>
          <CardDescription className="text-xs">
            {breakdown.tuas.pasajeros} {breakdown.tuas.pasajeros === 1 ? "pasajero" : "pasajeros"} de
            referencia (cada tramo puede llevar el suyo). Regla aplicada por
            matrícula {breakdown.aeronave.matricula.startsWith("XA")
              ? "XA"
              : breakdown.aeronave.matricula.startsWith("XB")
                ? "XB"
                : "N"}
            . Edita el monto por pasajero si el aeropuerto cobra distinto
            (USD o MXN); vacío = monto del catálogo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!cobrarTuas && (
            <p className="text-xs text-muted-foreground">
              El switch «Cobrar TUAS» está apagado: no se cobran en esta
              cotización.
            </p>
          )}
          {aeropuertos.map((air) => (
            <TuasAirportRow
              key={air.iata}
              air={air}
              fila={filaPorIata.get(air.iata)}
              linea={lineaPorIata.get(air.iata)}
              paxGlobal={breakdown.tuas.pasajeros}
              disabled={!cobrarTuas}
              tcCapturado={tcUsdMxn != null}
              onChange={onTuaChange}
            />
          ))}
          <div className="pt-3 border-t border-border space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">Total TUAS</span>
              <span className="font-bold font-mono">{fmtUsd(breakdown.tuas.total_usd)}</span>
            </div>
            {Number(breakdown.tuas.total_mxn_nativo) > 0 && (
              <p className="text-right text-xs text-muted-foreground">
                incluye {fmtMxn(breakdown.tuas.total_mxn_nativo)} nativos —
                entran al total MXN en pesos tal cual
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* IVA */}
      <Card>
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
      <Card>
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/**
 * Fila editable de TUA por aeropuerto: monto por pax capturable + moneda
 * propia. Vacío = monto del catálogo (placeholder gris); lo capturado manda.
 */
function TuasAirportRow({
  air,
  fila,
  linea,
  paxGlobal,
  disabled,
  tcCapturado,
  onChange,
}: {
  air: TuasAeropuerto;
  fila?: TuasFila;
  linea?: TuaLinea;
  paxGlobal: number;
  disabled: boolean;
  tcCapturado: boolean;
  onChange: (iata: string, monto: number | null, moneda: "USD" | "MXN") => void;
}) {
  // Moneda elegida antes de capturar monto (sin monto aún no viaja la línea).
  const [monedaDraft, setMonedaDraft] = useState<"USD" | "MXN">(
    linea?.moneda ?? (air.moneda === "MXN" ? "MXN" : "USD"),
  );
  const moneda = linea?.moneda ?? monedaDraft;
  const capturada = !!linea;
  const montoCatalogo = air.monto_pax ?? air.usd_pax;
  const pax = fila?.pax ?? (air.aplica ? paxGlobal : 0);
  const editable = !disabled && air.aplica;

  const handleMonto = (raw: string) => {
    // Vacío = des-capturar (vuelve al catálogo). "0" = TUA capturada en $0
    // (pass-through cero: el aeropuerto no cobra) — SÍ viaja al motor.
    if (raw.trim() === "") {
      onChange(air.iata, null, moneda);
      return;
    }
    const n = Number(raw);
    onChange(air.iata, Number.isFinite(n) && n >= 0 ? n : null, moneda);
  };
  const handleMoneda = (m: "USD" | "MXN") => {
    setMonedaDraft(m);
    if (linea) onChange(air.iata, linea.monto_pax, m);
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-border p-2.5 space-y-1.5",
        !air.aplica && "opacity-70",
      )}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="flex items-center gap-2 text-sm font-medium">
          {air.aplica ? (
            <CheckCircleIcon className="h-4 w-4 text-green-600 shrink-0" />
          ) : (
            <XCircleIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="font-mono">{air.iata}</span>
          {capturada && (
            <Badge variant="outline" className="text-[10px]">
              {linea!.monto_pax === 0 ? "TUA en $0 (capturada)" : "monto capturado"}
            </Badge>
          )}
        </span>
        {/* Cuenta EXPLÍCITA (26-ago): "N pax × unitario = total" — la
            oficina ve de dónde sale el número, no solo el resultado. */}
        <span className="font-mono text-sm">
          {fila ? (
            <>
              <span className="text-xs text-muted-foreground">
                {fila.pax} ×{" "}
                {fila.moneda === "MXN"
                  ? fmtMxn(fila.monto_pax)
                  : fmtUsd(fila.monto_pax)}{" "}
                ={" "}
              </span>
              {fila.moneda === "MXN" ? (
                <>
                  {fmtMxn(fila.total_nativo)}
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    = {fmtUsd(fila.total_usd)}
                  </span>
                </>
              ) : (
                fmtUsd(fila.total_usd)
              )}
            </>
          ) : (
            "$0"
          )}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="0.01"
          min={0}
          className="h-8 w-28"
          disabled={!editable}
          defaultValue={linea ? String(linea.monto_pax) : ""}
          placeholder={montoCatalogo > 0 ? montoCatalogo.toFixed(2) : "0.00"}
          aria-label={`TUA por pasajero en ${air.iata}`}
          onChange={(ev) => handleMonto(ev.target.value)}
        />
        <MonedaSelect value={moneda} onChange={handleMoneda} disabled={!editable} />
        <span className="text-xs text-muted-foreground">
          por pax × {pax} pax
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{air.razon}</p>
      {/* Solo con línea CAPTURADA >0 en MXN: con puro select flipeado (sin
          monto) no viaja nada, y el campo de TC ni estaría montado. */}
      {capturada && linea!.monto_pax > 0 && moneda === "MXN" && !tcCapturado && editable && (
        <button
          type="button"
          onClick={focusTcField}
          className="text-left text-xs font-medium text-amber-600 dark:text-amber-400 underline underline-offset-2"
        >
          Captura el TC arriba — sin tipo de cambio esta TUA en MXN no entra
          al total.
        </button>
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  hint,
  bold,
}: {
  label: string;
  value: string;
  hint?: string;
  bold?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("font-mono", bold ? "font-bold" : "font-medium")}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function Row({
  label,
  value,
  hint,
  bold,
}: {
  label: string;
  value: string;
  hint?: string;
  bold?: boolean;
}) {
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


function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex w-full rounded-lg border border-border bg-muted/30 p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            type="button"
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 h-8 px-3 text-xs font-medium rounded-md transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}


const EXTRAS_SUGERIDOS = ["Handler", "Comisariato", "Extensión de servicios"];

/** Editor de conceptos extra: agrega, edita y quita líneas en la misma pantalla. */
function ExtrasEditor({
  value,
  onChange,
  tcCapturado,
}: {
  value: ExtraConcepto[];
  onChange: (extras: ExtraConcepto[]) => void;
  /** Hay TC (MXN por USD) capturado: sin él los renglones MXN no entran al total. */
  tcCapturado: boolean;
}) {
  const update = (idx: number, patch: Partial<ExtraConcepto>) => {
    const next = [...value];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const add = (concepto = "") =>
    onChange([...value, { concepto, monto_usd: 0, moneda: "USD", aplica_iva: true }]);
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Conceptos extra</Label>
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Handler, comisariato, extensión de servicios… se suman al total sin
          salir de esta pantalla.
        </p>
      )}
      {value.map((e, idx) => (
        <div
          key={idx}
          className="rounded-lg border border-border bg-muted/20 p-2.5 space-y-2"
        >
          <div className="grid grid-cols-[1fr_96px_76px] gap-2">
            <Input
              placeholder="Concepto (ej. Handler)"
              value={e.concepto}
              onChange={(ev) => update(idx, { concepto: ev.target.value })}
            />
            <Input
              type="number"
              step="0.01"
              min={0}
              // El monto es NATIVO en la moneda del renglón (MXN entra al
              // total en pesos tal cual; requiere TC capturado).
              placeholder={e.moneda === "MXN" ? "MXN" : "USD"}
              value={e.monto_usd || ""}
              onChange={(ev) =>
                update(idx, { monto_usd: Number(ev.target.value) || 0 })
              }
            />
            <MonedaSelect
              value={e.moneda === "MXN" ? "MXN" : "USD"}
              onChange={(m) => update(idx, { moneda: m })}
            />
          </div>
          {/* Extra MXN sin TC: se retiene fuera del cálculo (no tira el
              preview con el 400 del motor) y guardar queda bloqueado. */}
          {e.moneda === "MXN" && Number(e.monto_usd) > 0 && !tcCapturado && (
            <button
              type="button"
              onClick={focusTcField}
              className="text-left text-xs font-medium text-amber-600 dark:text-amber-400 underline underline-offset-2"
            >
              Captura el TC arriba — sin tipo de cambio este extra en MXN no
              entra al total.
            </button>
          )}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked={e.aplica_iva ?? true}
                onCheckedChange={(c) => update(idx, { aplica_iva: c })}
              />
              Entra a la base de IVA
            </label>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-xs text-destructive hover:opacity-80 transition-opacity"
            >
              Quitar
            </button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => add()}
          className="gap-1.5"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Agregar concepto
        </Button>
        {EXTRAS_SUGERIDOS.filter(
          (sug) => !value.some((e) => e.concepto.toLowerCase() === sug.toLowerCase()),
        ).map((sug) => (
          <button
            key={sug}
            type="button"
            onClick={() => add(sug)}
            className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
          >
            + {sug}
          </button>
        ))}
      </div>

    </div>
  );
}
