"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  CalculatorIcon,
  ChevronDownIcon,
  ChevronUpIcon,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { QuoteLegsEditor } from "@/components/admin/quotes/quote-legs-editor";
import { RoutePreviewMap } from "@/components/admin/route-preview-map";
import { cn } from "@/lib/utils";
import { calculateQuote } from "@/lib/api/quotes-browser";
import { isApiError } from "@/lib/api/errors";
import { fmtDecimal, fmtUsd } from "@/lib/format";
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
  EscalaInput,
  ExtraConcepto,
  MetodoPago,
  QuoteBreakdown,
  TipoTarifa,
  TipoVuelo,
} from "@/types/quote";
import type { PersistedQuote } from "@/types/quotes-persisted";
import { Field } from "@/components/admin/form-field";

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
  /** Switch rápido de TUAS: apagado = no se cobra (override $0/pax). */
  cobrar_tuas: boolean;
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
  /** TC MXN por USD con el que entrará el pago (BillPocket/transferencia en pesos). */
  tc_usd_mxn: number | null;
  /** Comisión BillPocket % (custom por operación, tope 20). */
  comision_billpocket_pct: number | null;
  /** Comisión del VENDEDOR en USD (interna): sale del precio, no del cliente. */
  comision_vendedor_usd: number | null;
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
    }
  | {
      mode: "revise";
      clients?: undefined;
      frequentClientIds?: undefined;
      initialQuote: PersistedQuote;
      clientName: string;
    }
);

const METODOS_PAGO: { value: MetodoPago; label: string; hint: string }[] = [
  { value: "TRANSFERENCIA", label: "Transferencia", hint: "Con factura · IVA 16%" },
  { value: "HSBC_LINK", label: "HSBC link", hint: "Con factura · IVA 16%" },
  { value: "CHEQUE", label: "Cheque", hint: "Con factura · IVA 16%" },
  { value: "BILLPOCKET", label: "BillPocket", hint: "Sin factura" },
  { value: "EFECTIVO", label: "Efectivo", hint: "Sin IVA" },
  { value: "DOLARES", label: "Dólares directo", hint: "Sin IVA" },
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
  // itinerario_operativo=true y el cotizador nunca la pisa.
  const [opsLegs, setOpsLegs] = useState<
    Array<{ origen: string; destino: string; ferry: boolean; pax: string }>
  >([]);
  const initialQuote = isRevise ? props.initialQuote : undefined;
  const clientName = isRevise ? props.clientName : undefined;
  const clients = isRevise ? [] : props.clients;
  const frequentClientIds = isRevise ? [] : (props.frequentClientIds ?? []);

  const router = useRouter();
  const [advanced, setAdvanced] = useState(false);
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
        ruta_id: "",
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
        // El switch de TUAS apagado se guardó como override $0/pax; un override
        // distinto de 0 se re-hidrata en el campo avanzado para no perderlo.
        cobrar_tuas: q.calculo_snapshot?.tuas?.usd_pax_default !== 0,
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
        extras: (q.extras ?? []).filter(
          (e) => !e.concepto?.startsWith("Comisión BillPocket"),
        ),
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
        tc_usd_mxn: Number(q.tc_usd_mxn) > 0 ? Number(q.tc_usd_mxn) : null,
        comision_billpocket_pct:
          q.calculo_snapshot?.meta?.comision_billpocket_pct ?? null,
        comision_vendedor_usd:
          q.calculo_snapshot?.meta?.comision_vendedor_usd ?? null,
        comision_vendedor_nombre:
          q.calculo_snapshot?.meta?.comision_vendedor_nombre ?? "",
        tarifa_hora_override_usd: null,
        tuas_override_usd_pax:
          Number(q.calculo_snapshot?.tuas?.usd_pax_default) > 0
            ? Number(q.calculo_snapshot!.tuas.usd_pax_default)
            : null,
        iva_pct_override: null,
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
      cobrar_tuas: true,
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
      tc_usd_mxn: null,
      comision_billpocket_pct: null,
      comision_vendedor_usd: null,
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
      cotizacion_abierta: debounced.cotizacion_abierta,
      extras: (debounced.extras ?? [])
        .filter((e) => e.concepto.trim() && Number(e.monto_usd) > 0)
        .map((e) => ({
          concepto: e.concepto.trim(),
          monto_usd: Number(e.monto_usd),
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
      tc_usd_mxn:
        Number(debounced.tc_usd_mxn) > 0 ? Number(debounced.tc_usd_mxn) : undefined,
      comision_billpocket_pct:
        debounced.metodo_pago === "BILLPOCKET" &&
        Number(debounced.comision_billpocket_pct) > 0
          ? Math.min(Number(debounced.comision_billpocket_pct), 20)
          : undefined,
      comision_vendedor_usd:
        Number(debounced.comision_vendedor_usd) > 0
          ? Number(debounced.comision_vendedor_usd)
          : undefined,
      comision_vendedor_nombre:
        Number(debounced.comision_vendedor_usd) > 0 &&
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
    if (base.pasajeros < 1) return null;
    if (debounced.tarifa_hora_override_usd) {
      base.tarifa_hora_override_usd = Number(debounced.tarifa_hora_override_usd);
    }
    if (!debounced.cobrar_tuas) {
      // Switch rápido apagado: la TUAS no se cobra en esta cotización.
      base.tuas_override_usd_pax = 0;
    } else if (debounced.tuas_override_usd_pax !== null && debounced.tuas_override_usd_pax !== undefined) {
      base.tuas_override_usd_pax = Number(debounced.tuas_override_usd_pax);
    }
    if (debounced.iva_pct_override !== null && debounced.iva_pct_override !== undefined) {
      base.iva_pct_override = Number(debounced.iva_pct_override);
    }
    return base;
  }, [debounced]);

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
  const maxPasajeros =
    values.escalas.length > 0
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

  const motivoTrim = values.motivo?.trim() ?? "";
  // El cliente ahora AFECTA el precio (tarifa preferencial): no se puede
  // guardar mientras el preview corresponda a otro cliente o siga recalculando
  // — lo persistido debe ser exactamente lo que el operador vio.
  const previewFresco =
    !loading && calcPayload?.cliente_id === (values.cliente_id || undefined);
  const canSave =
    !capacidadExcedida &&
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
            ? opsValidos.map((l) => ({
                origen_iata: l.origen,
                destino_iata: l.destino,
                es_ferry: l.ferry,
                pasajeros:
                  !l.ferry && l.pax !== "" ? Math.max(0, Number(l.pax)) : undefined,
              }))
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
    <div className="grid gap-6 lg:grid-cols-5">
      {/* FORM */}
      <Card className="lg:col-span-2">
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
                        {[sel.es_broker ? "Broker · tarifa broker" : null, sel.rfc]
                          .filter(Boolean)
                          .join(" · ") || "Cliente directo"}
                      </p>
                    </div>
                  );
                })()}
                <SearchableSelect
                  options={allClients.map((c) => ({
                    value: c.id,
                    label: c.nombre,
                    description: [c.rfc, c.es_broker ? "Broker" : null]
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
            <Field label="Fecha de traslado inicial" hint="Opcional · salida (fecha y hora)">
              <Input type="datetime-local" {...register("fecha_vuelo")} />
            </Field>
            <Field label="Fecha de traslado final" hint="Opcional · regreso (fecha y hora)">
              <Input type="datetime-local" {...register("fecha_traslado_final")} />
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
                    sinTarifa ? " · sin tarifa configurada" : ""
                  }`,
                  disabled: sinTarifa,
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
                />
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
              <div className="hidden xl:block">
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
            <p className="text-xs text-muted-foreground">
              Selecciona una ruta guardada (o crea una nueva) para cargar su
              itinerario y ajustarlo aquí.
            </p>
          )}

          {/* Tarifa tipo */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Tipo de tarifa</Label>
            <Segmented
              value={tipoTarifa}
              onChange={(v) => setValue("tipo_tarifa", v as TipoTarifa)}
              options={[
                { value: "PUBLICO", label: "Público" },
                { value: "BROKER", label: "Broker" },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Pasajeros" required>
              <Input
                type="number"
                min={1}
                max={selectedAircraft?.asientos || undefined}
                {...register("pasajeros")}
              />
              {selectedAircraft && selectedAircraft.asientos > 0 && (
                <p
                  className={cn(
                    "text-xs mt-1",
                    capacidadExcedida ? "text-destructive font-medium" : "text-muted-foreground",
                  )}
                >
                  {capacidadExcedida
                    ? `Excede la capacidad: máx. ${selectedAircraft.asientos} pasajeros (${selectedAircraft.modelo}).`
                    : `Máx. ${selectedAircraft.asientos} pasajeros (${selectedAircraft.modelo}).`}
                </p>
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
            </Field>
            <div className="flex flex-col gap-1">
              <Label className="text-sm font-medium">Cobrar TUAS</Label>
              <div className="flex items-center h-9">
                <Switch
                  checked={values.cobrar_tuas}
                  onCheckedChange={(c) => setValue("cobrar_tuas", c)}
                />
                <span className="text-xs text-muted-foreground ml-3">
                  {values.cobrar_tuas
                    ? "Se cobra según aeropuerto"
                    : "No se cobra en esta cotización"}
                </span>
              </div>
            </div>
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
          />

          {/* Cierre del total: el redondeo es AUTOMÁTICO (regla del cliente:
              siempre arriba al siguiente múltiplo de $10; 976→980, 991→1000)
              — lo resuelve el motor con el IVA considerado. El descuento se
              aplica antes. Hacia el motor viaja UNA línea de ajuste para que
              el desglose siga cuadrando. */}
          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">Cierre del total</p>
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
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-xs">
                        <Switch
                          checked={l.ferry}
                          onCheckedChange={(c) =>
                            setOpsLegs((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, ferry: c, pax: c ? "" : x.pax } : x,
                              ),
                            )
                          }
                        />
                        Ferry (vacío)
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
              pactado fija el total MXN y convierte los cobros MXN sin TC. */}
          {values.metodo_pago !== "DOLARES" && (
            <Field
              label="Tipo de cambio (MXN por USD)"
              hint="Opcional · si el pago entrará en pesos"
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
                    ≈ $
                    {(
                      Number(breakdown.totales.total_usd) * Number(values.tc_usd_mxn)
                    ).toLocaleString("es-MX", { minimumFractionDigits: 2 })}{" "}
                    MXN
                  </span>
                )}
              </div>
            </Field>
          )}

          {/* Comisión del VENDEDOR (Itzy/Pablo/broker): sale del precio de
              venta, NO se suma al cliente. El cliente paga el total completo;
              el neto (total − comisión) fluye a reparto/reportes. INTERNA:
              jamás aparece en el PDF del cliente. */}
          <Field
            label="Comisión del vendedor (interna)"
            hint="Opcional · sale del precio, no del cliente · no aparece en el PDF"
          >
            <div className="flex items-center gap-3 flex-wrap">
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
                    e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                  )
                }
              />
              <Input
                placeholder="Quién vendió (Itzy, Pablo…)"
                className="w-48"
                value={values.comision_vendedor_nombre}
                onChange={(e) => setValue("comision_vendedor_nombre", e.target.value)}
              />
              {Number(values.comision_vendedor_usd) > 0 && breakdown && (
                <span className="text-xs text-muted-foreground font-mono">
                  Neto VuelaTour: $
                  {(
                    Number(breakdown.totales.total_usd) -
                    Number(values.comision_vendedor_usd)
                  ).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>
          </Field>

          <Field label="Notas (visibles en PDF)" hint="Opcional">
            <Textarea rows={2} placeholder="Ej. Sujeto a slot CUN…" {...register("notas")} />
          </Field>

          <Field label="Notas internas" hint="Opcional · no aparecen en PDF">
            <Textarea
              rows={2}
              placeholder="Solo para el equipo"
              {...register("notas_internas")}
            />
          </Field>

          {/* Avanzado */}
          <button
            type="button"
            onClick={() => setAdvanced((a) => !a)}
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors pt-2 border-t border-border w-full"
          >
            {advanced ? (
              <ChevronUpIcon className="h-4 w-4" />
            ) : (
              <ChevronDownIcon className="h-4 w-4" />
            )}
            Overrides avanzados
          </button>

          {advanced && (
            <div className="space-y-3 pl-6 border-l-2 border-border">
              <Field
                label="Tarifa USD/hr (override)"
                hint="Vacío = usa la del avión"
              >
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="Auto"
                  {...register("tarifa_hora_override_usd")}
                />
              </Field>
              <Field
                label="TUAS USD/pax (override)"
                hint={
                  values.cobrar_tuas
                    ? "Vacío = usa la del aeropuerto"
                    : "Sin efecto: el switch «Cobrar TUAS» está apagado"
                }
              >
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="Auto"
                  disabled={!values.cobrar_tuas}
                  {...register("tuas_override_usd_pax")}
                />
              </Field>
              <Field label="IVA % (override)" hint="0.16 = 16%. Vacío = automático">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  max={1}
                  placeholder="Auto"
                  {...register("iva_pct_override")}
                />
              </Field>
            </div>
          )}
        </CardContent>
      </Card>

      {/* PREVIEW */}
      <div className="lg:col-span-3 space-y-6">
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
          <Preview breakdown={breakdown} loading={loading} />
        ) : (
          <PreviewSkeleton />
        )}

        {/* Save bar */}
        <Card>
          <CardContent className="p-4 space-y-3">
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
    </div>
  );
}

function Preview({
  breakdown,
  loading,
}: {
  breakdown: QuoteBreakdown;
  loading: boolean;
}) {
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
              {/* Comisión del vendedor: el cliente paga el total completo; el
                  neto es lo que queda a VuelaTour (reparto/reportes). */}
              {!!breakdown.meta?.comision_vendedor_usd && (
                <p className="text-xs text-muted-foreground mt-2">
                  Comisión vendedor
                  {breakdown.meta.comision_vendedor_nombre
                    ? ` (${breakdown.meta.comision_vendedor_nombre})`
                    : ""}
                  : −{fmtUsd(breakdown.meta.comision_vendedor_usd)} ·{" "}
                  <span className="font-semibold text-foreground">
                    Neto VuelaTour:{" "}
                    {fmtUsd(
                      breakdown.meta.neto_vuelatour_usd ??
                        breakdown.totales.total_usd -
                          breakdown.meta.comision_vendedor_usd,
                    )}
                  </span>
                </p>
              )}
            </div>
            <Badge className="bg-brand-600/15 text-brand-600 dark:text-brand-400 border-brand-600/30">
              {breakdown.tarifa.tipo}
            </Badge>
          </div>
          <div
            className={cn(
              "mt-4 pt-4 border-t border-border grid gap-3 text-sm",
              breakdown.totales.viaticos_pernocta_usd
                ? "grid-cols-2 sm:grid-cols-4"
                : "grid-cols-3",
            )}
          >
            <Cell label="Subtotal" value={fmtUsd(breakdown.totales.subtotal_vuelo_usd)} />
            <Cell
              label="TUAS"
              value={fmtUsd(breakdown.totales.tuas_total_usd)}
              hint={`${breakdown.tuas.pasajeros} pax`}
            />
            <Cell
              label="IVA"
              value={fmtUsd(breakdown.totales.iva_usd)}
              hint={
                breakdown.iva.porcentaje > 0
                  ? `${(breakdown.iva.porcentaje * 100).toFixed(0)}%`
                  : "0%"
              }
            />
            {!!breakdown.totales.viaticos_pernocta_usd && (
              <Cell
                label="Pernocta"
                value={fmtUsd(breakdown.totales.viaticos_pernocta_usd)}
                hint="viáticos · sin IVA"
              />
            )}
            {!!breakdown.totales.ajuste_final_usd && (
              <Cell
                label={
                  (breakdown.totales.ajuste_final_usd ?? 0) < 0
                    ? "Descuento"
                    : "Redondeo"
                }
                value={fmtUsd(breakdown.totales.ajuste_final_usd!)}
                hint="fuera de IVA"
              />
            )}
            {!!breakdown.totales.extras_total_usd && (
              <Cell
                label="Extras"
                value={fmtUsd(breakdown.totales.extras_total_usd)}
                hint={`${breakdown.extras?.length ?? 0} ${
                  (breakdown.extras?.length ?? 0) === 1 ? "concepto" : "conceptos"
                }`}
              />
            )}
          </div>
          {(breakdown.extras?.length ?? 0) > 0 && (
            <div className="mt-3 pt-3 border-t border-border space-y-1">
              {breakdown.extras!.map((e, i) => (
                <div
                  key={`${e.concepto}-${i}`}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-muted-foreground">
                    {e.concepto}
                    {e.aplica_iva === false && (
                      <span className="ml-1 text-[10px]">(sin IVA)</span>
                    )}
                  </span>
                  <span className="font-mono">{fmtUsd(e.monto_usd)}</span>
                </div>
              ))}
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

      {/* TUAS desglose */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">TUAS por aeropuerto</CardTitle>
          <CardDescription className="text-xs">
            {breakdown.tuas.pasajeros} {breakdown.tuas.pasajeros === 1 ? "pasajero" : "pasajeros"}.
            Regla aplicada por matrícula {breakdown.aeronave.matricula.startsWith("XA")
              ? "XA"
              : breakdown.aeronave.matricula.startsWith("XB")
                ? "XB"
                : "N"}
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <TuasRow tuas={breakdown.tuas.origen} pasajeros={breakdown.tuas.pasajeros} label="Origen" />
          <TuasRow
            tuas={breakdown.tuas.destino}
            pasajeros={breakdown.tuas.pasajeros}
            label="Destino"
          />
          <div className="pt-3 border-t border-border flex items-center justify-between text-sm">
            <span className="font-semibold">Total TUAS</span>
            <span className="font-bold font-mono">{fmtUsd(breakdown.tuas.total_usd)}</span>
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

function TuasRow({
  tuas,
  pasajeros,
  label,
}: {
  tuas: { iata: string; aplica: boolean; usd_pax: number; razon: string };
  pasajeros: number;
  label: string;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      {tuas.aplica ? (
        <CheckCircleIcon className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
      ) : (
        <XCircleIcon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">
            {label} <span className="font-mono">{tuas.iata}</span>
          </span>
          <span className="font-mono">
            {tuas.aplica ? fmtUsd(tuas.usd_pax * pasajeros) : "$0"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{tuas.razon}</p>
      </div>
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
}: {
  value: ExtraConcepto[];
  onChange: (extras: ExtraConcepto[]) => void;
}) {
  const update = (idx: number, patch: Partial<ExtraConcepto>) => {
    const next = [...value];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const add = (concepto = "") =>
    onChange([...value, { concepto, monto_usd: 0, aplica_iva: true }]);
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
          <div className="grid grid-cols-[1fr_110px] gap-2">
            <Input
              placeholder="Concepto (ej. Handler)"
              value={e.concepto}
              onChange={(ev) => update(idx, { concepto: ev.target.value })}
            />
            <Input
              type="number"
              step="0.01"
              min={0}
              placeholder="USD"
              value={e.monto_usd || ""}
              onChange={(ev) =>
                update(idx, { monto_usd: Number(ev.target.value) || 0 })
              }
            />
          </div>
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
