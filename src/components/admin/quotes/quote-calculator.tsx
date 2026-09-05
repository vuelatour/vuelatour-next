"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  CheckCircleIcon,
  XCircleIcon,
  BookmarkSquareIcon,
  ChevronDownIcon,
  PlusIcon,
  PencilSquareIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { RouteFormSheet } from "@/components/admin/routes/route-form-sheet";
import { QuoteDesgloseCard } from "@/components/admin/quotes/quote-desglose-card";
import { updateClientAction } from "@/app/admin/clients/actions";
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
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { MonedaSelect } from "@/components/admin/quotes/moneda-select";
import { ExtrasEditor } from "@/components/admin/quotes/extras-editor";
import {
  extrasAPayload,
  montoExtraActivo,
  normalizarExtrasEditor,
  textoCantidadUnitario,
} from "@/lib/admin/extras";
import { grupoDeVuelo } from "@/lib/admin/grupos-ui";
import { tuasLineasAPayload, upsertTuaLinea } from "@/lib/admin/tuas";
import { modelosCotizadosTexto } from "@/lib/admin/avion-cotizado";
import type { VueloConGrupo } from "@/types/grupos";
import { QuoteLegsEditor } from "@/components/admin/quotes/quote-legs-editor";
import { RutaRapidaInput } from "@/components/admin/ruta-rapida-input";
import { AirportQuickCreateButton } from "@/components/admin/airports/airport-quick-create-button";
import type { Airport } from "@/types/airports";
import { RoutePreviewMap } from "@/components/admin/route-preview-map";
import { cn } from "@/lib/utils";
import { calculateQuote } from "@/lib/api/quotes-browser";
import { isApiError } from "@/lib/api/errors";
import { fmtDecimal, fmtMxn, fmtUsd } from "@/lib/format";
import {
  cancunInputToIso,
  fmtDateTime,
  isoToCancunInput,
  TZ_LABEL,
} from "@/lib/datetime";
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

export interface AircraftOption {
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

export interface RouteOption {
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

export interface AirportOption {
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
  /** COBRABLE pactado (hr): sustituye la suma final de horas a cobrar. */
  tiempo_cobrable_override_hr: number | null;
  /** Switch rápido de TUAS: apagado = no se cobra (override $0/pax). */
  cobrar_tuas: boolean;
  /** TUAS capturadas POR AEROPUERTO (pass-through): mandan sobre el catálogo. */
  tuas_lineas: TuaLinea[];
  cotizacion_abierta: boolean;
  /** PDF: mostrar tarifa por hora (default apagado) e itinerario (default prendido). */
  pdf_mostrar_tarifa: boolean;
  pdf_mostrar_itinerario: boolean;
  /** Vuelo CUBIERTO por operador externo (sin avión propio ni tacómetros). */
  es_externo: boolean;
  operador_externo: string;
  /** Ficha del avión AJENO (ej. HAWKER 400 A / XA-REG): sale en el PDF. */
  avion_externo_modelo: string;
  avion_externo_matricula: string;
  /** Lo que cobra el operador externo (costo para VuelaTour) en su moneda. */
  costo_externo_monto: number | null;
  /** Moneda del costo del externo (29-ago). MXN exige TC para derivar USD. */
  costo_externo_moneda: "USD" | "MXN";
  /**
   * LEGADO (2-sep-2026): la captura del precio pactado se eliminó del
   * cotizador (sin input). El valor solo se rehidrata del snapshot en folios
   * viejos (24/69/148) para que revisar/ajustar no mueva su total acordado.
   */
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
      lectura?: undefined;
      onRevisar?: undefined;
      revisarBloqueado?: undefined;
      revisarLabel?: undefined;
      onCancelar?: undefined;
      onGuardado?: undefined;
      tramoExtraLectura?: undefined;
      notaTramosLectura?: undefined;
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
       * Página ÚNICA de la cotización (5-sep-2026): el mismo layout del
       * cotizador sirve para VER (lectura) y para REVISAR (edición) sin
       * cambiar de página. `lectura=true` pinta cada sección con valores
       * legibles (texto, sin inputs ni botones de agregar/quitar), NO
       * recalcula por tecla (el breakdown es el `calculo_snapshot`
       * persistido) y muestra «Revisar» en la barra del total; el padre
       * controla el modo con `onRevisar`/`onCancelar`/`onGuardado`.
       */
      lectura?: boolean;
      /** Lectura: pasa a edición ahí mismo (botón «Revisar» de la barra). */
      onRevisar?: () => void;
      /** Lectura: razón por la que NO se puede revisar (botón deshabilitado
       *  con el mismo texto que la barra de acciones); null = se puede. */
      revisarBloqueado?: string | null;
      /** Texto del botón «Revisar» (p. ej. «Revisar (cancelada)»). */
      revisarLabel?: string;
      /** Edición: descarta los cambios y vuelve a lectura (sin recargar). */
      onCancelar?: () => void;
      /**
       * Edición: revisión guardada. Con este handler el cotizador NO navega
       * (`router.push`) — solo hace `router.refresh()`; el padre vuelve a
       * lectura y la página se rehidrata con la versión nueva.
       */
      onGuardado?: (quote: PersistedQuote) => void;
      /**
       * Lectura: contenido extra por tramo del itinerario cotizado (índice
       * 0..N-1 en el MISMO orden que los tramos rehidratados) — aquí viven los
       * toggles de PDF (ocultar tramo / fecha por tramo) del detalle.
       */
      tramoExtraLectura?: (idx: number, leg: EscalaInput) => ReactNode;
      /** Lectura: nota al pie de la lista de tramos (leyenda de los toggles). */
      notaTramosLectura?: ReactNode;
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

/** "$750/hr" compacto (sin decimales) para el sub del selector de tarifa. */
function tarifaSub(
  n: number | string | null | undefined,
): string | undefined {
  if (n == null || `${n}`.trim() === "") return undefined;
  const v = Number(n);
  if (!Number.isFinite(v)) return undefined;
  return `$${Math.round(v).toLocaleString("en-US")}/hr`;
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

export function QuoteCalculator(props: QuoteCalculatorProps) {
  const { aircraft, routes, airports: airportsCatalogo } = props;
  const mode = props.mode ?? "create";
  const isRevise = mode === "revise";
  // Página única (5-sep): modo LECTURA controlado por el padre (solo revise).
  const lectura = isRevise ? (props.lectura ?? false) : false;
  const onRevisar = isRevise ? props.onRevisar : undefined;
  const revisarBloqueado = isRevise ? (props.revisarBloqueado ?? null) : null;
  const revisarLabel = isRevise ? (props.revisarLabel ?? "Revisar") : "Revisar";
  const onCancelar = isRevise ? props.onCancelar : undefined;
  const onGuardado = isRevise ? props.onGuardado : undefined;
  const tramoExtraLectura = isRevise ? props.tramoExtraLectura : undefined;
  const notaTramosLectura = isRevise ? props.notaTramosLectura : undefined;

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
  // Hijo de una cotización de GRUPO (4-sep): los renglones de extras con
  // origen GRUPO se pintan bloqueados con la liga al grupo.
  const grupoDelHijo = grupoDeVuelo(initialQuote as (typeof initialQuote & VueloConGrupo) | undefined);
  const clientName = isRevise ? props.clientName : undefined;
  const reviseClienteInterno = isRevise ? (props.clientEsInterno ?? false) : false;
  const clients = isRevise ? [] : props.clients;
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
  // Al revisar una versión con tarifa AJUSTADA a mano, la sección de
  // "Personalizada" en Tipo de tarifa (25-ago): modo elegido a mano; el
  // derivado overrideTarifaActivo cubre revises y "todo en $0".
  const [tarifaCustom, setTarifaCustom] = useState(false);
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
  // Confirmación de "Cotizar con estos tramos" (pisa los tramos capturados).
  const [opsATramosOpen, setOpsATramosOpen] = useState(false);
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
    };
  }, [initialQuote, defaultAircraftId, defaultRutaId]);

  const {
    register,
    watch,
    setValue,
    reset,
  } = useForm<QuoteFormValues>({
    mode: "onChange",
    defaultValues: formDefaults,
  });

  // Restaura el borrador de la URL UNA vez al montar (solo alta nueva: en
  // revise la verdad viene del snapshot y no se toca).
  const draftRestaurado = useRef(false);
  useEffect(() => {
    if (isRevise || draftRestaurado.current) return;
    draftRestaurado.current = true;
    const raw = new URLSearchParams(window.location.search).get(DRAFT_PARAM);
    if (!raw) return;
    const f = decodeDraft(raw);
    if (f) {
      reset({ ...formDefaults, ...f });
      toast.info("Se restauró tu avance desde la URL.");
    }
    // Solo al montar; formDefaults es estable en el alta nueva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // LECTURA (página única): el form SIEMPRE espeja lo persistido — al entrar
  // a lectura (montaje, «Cancelar» o tras guardar) y cada vez que el server
  // rehidrata la cotización (router.refresh tras revisar / ajuste rápido /
  // toggles del PDF) se resetea a los defaults recién derivados. En edición
  // no se toca: lo que el operador teclea es suyo hasta guardar o cancelar.
  useEffect(() => {
    if (!lectura) return;
    reset(formDefaults);
    setTarifaCustom(false);
  }, [lectura, formDefaults, reset]);

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

  // Escribe el borrador en la URL con el MISMO debounce del cálculo.
  // Pristino (igual a los defaults) = sin parámetro, para no ensuciar URLs.
  useEffect(() => {
    if (isRevise || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (debouncedJson === JSON.stringify(formDefaults)) {
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

  const calcPayload = useMemo<CalculateQuoteRequest | null>(() => {
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
  }, [debounced, clienteInterno, teniaModeloPersistido, teniaMatriculaPersistida]);

  // En LECTURA el breakdown es el snapshot PERSISTIDO (lo que se guardó, sin
  // recalcular): arranca con él para que el primer render ya pinte el total.
  const snapshotPersistido = initialQuote?.calculo_snapshot ?? null;
  const [breakdown, setBreakdown] = useState<QuoteBreakdown | null>(
    lectura ? snapshotPersistido : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lectura) {
      // Sin llamadas al motor en lectura: el desglose es el guardado. Al
      // pasar a edición el efecto re-corre con calcPayload y recalcula.
      setBreakdown(snapshotPersistido);
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
  }, [calcPayload, lectura, snapshotPersistido]);

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
      (watch("escalas") ?? [])
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

  const aplicarOpsComoEscalas = () => {
    setValue("escalas", opsComoEscalas(), { shouldDirty: true });
    setOpsATramosOpen(false);
    // El autollenado de millas del editor completa las que vengan en 0.
    toast.success("Tramos de la operación cargados — captura los pasajeros");
  };

  // Upsert de una línea de TUA por aeropuerto; monto null = quitar la línea
  // (vuelve al monto del catálogo). Regla compartida con el grupo.
  const setTuaLinea = (
    iata: string,
    monto: number | null,
    moneda: "USD" | "MXN",
  ) => {
    setValue("tuas_lineas", upsertTuaLinea(values.tuas_lineas, iata, monto, moneda));
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
    !costoExternoMxnSinTc &&
    previewFresco &&
    (isRevise
      ? motivoTrim.length >= 3 && !!calcPayload && !!breakdown && !error
      : !!values.cliente_id && !!calcPayload && !!breakdown && !error);

  const handleSave = () => {
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
      if (motivoTrim.length < 3) {
        toast.error("Indica un motivo (mínimo 3 caracteres)");
        return;
      }
      startSaving(async () => {
        const res = await reviseQuoteAction(initialQuote!.id, {
          ...calcPayload,
          motivo: motivoTrim,
          notas: values.notas || undefined,
          // Externo (28-ago): operador y lo que cobra el operador externo se
          // editan también al revisar; el costo vacío se limpia (monto null).
          // 29-ago: viaja NATIVO (monto + moneda); con MXN el API deriva el
          // USD con el tc_usd_mxn del calcPayload.
          ...(initialQuote?.es_externo
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
            `Cotización #${res.data.folio} revisada (v${res.data.cotizacion_version})`,
          );
          if (onGuardado) {
            // Página única: sin navegar — el padre vuelve a lectura y el
            // refresh trae la versión nueva al mismo lugar.
            onGuardado(res.data);
            router.refresh();
          } else {
            router.push(`/admin/quotes/${res.data.id}`);
            router.refresh();
          }
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
        toast.success(`Cotización #${res.data.folio} creada`);
        router.push(`/admin/quotes/${res.data.id}`);
      } else {
        toast.error(res.error ?? "Error al guardar");
      }
    });
  };

  // ===== Secciones colapsables (SOLO presentación; nada entra al form) =====
  // Estado local por sección con defaults deterministas por modo — sin leer
  // storage en el primer render (no romper la hidratación); un useEffect
  // aplica los overrides guardados (solo alta nueva). El plegado JAMÁS entra
  // a QuoteFormValues: contaminaría el borrador ?d= y el pristino.
  const [abiertas, setAbiertas] = useState<Record<SeccionId, boolean>>(() =>
    seccionesDefault(isRevise),
  );
  useEffect(() => {
    if (isRevise) return;
    try {
      const raw = localStorage.getItem(SECCIONES_LS_KEY);
      if (!raw) return;
      const guardado = JSON.parse(raw) as Record<string, unknown>;
      if (!guardado || typeof guardado !== "object") return;
      setAbiertas((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next) as SeccionId[]) {
          if (typeof guardado[k] === "boolean") next[k] = guardado[k] as boolean;
        }
        return next;
      });
    } catch {
      // Storage no disponible (modo privado/bloqueado): quedan los defaults.
    }
  }, [isRevise]);
  const toggleSeccion = (id: SeccionId) => {
    const next = { ...abiertas, [id]: !abiertas[id] };
    setAbiertas(next);
    // Solo el alta nueva persiste la preferencia (patrón data-table).
    if (!isRevise) {
      try {
        localStorage.setItem(SECCIONES_LS_KEY, JSON.stringify(next));
      } catch {
        // Sin storage, el plegado vive solo en la sesión.
      }
    }
  };
  /** Apertura programática (atajos scroll+focus): no persiste preferencia. */
  const abrirSeccion = (id: SeccionId) =>
    setAbiertas((prev) => (prev[id] ? prev : { ...prev, [id]: true }));

  // Al prender «cubierto por externo» (switch o borrador ?d= restaurado) la
  // sección se auto-abre: sus campos requeridos no deben quedar escondidos.
  useEffect(() => {
    if (!isRevise && values.es_externo) {
      setAbiertas((prev) => (prev.externo ? prev : { ...prev, externo: true }));
    }
  }, [isRevise, values.es_externo]);

  // Atajos de scroll+focus: con la sección plegada (hidden) el elemento
  // existe pero no tiene layout y scrollIntoView muere en silencio — hay que
  // ABRIR primero la sección contenedora y esperar un tick (mismo patrón
  // setTimeout(60) del acceso a la tarifa override).
  const focusTc = () => {
    abrirSeccion("cobro");
    setTimeout(focusTcField, 60);
  };
  const focusCobrable = () => {
    abrirSeccion("detalle");
    setTimeout(() => {
      const el = document.getElementById("cobrable-field");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.querySelector("input")?.focus();
    }, 60);
  };
  const focusMotivo = () => {
    const el = document.getElementById("motivo-revision-field");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.querySelector("textarea")?.focus();
  };

  // «Cancelar» la revisión en el lugar (página única 5-sep): si el operador
  // ya capturó algo distinto a lo persistido (motivo incluido) se confirma
  // antes de descartar — regla del cliente: toda acción que tira trabajo
  // pide confirmación (mismo patrón que el grupo). Sin cambios, sale directo.
  const [confirmDescartar, setConfirmDescartar] = useState(false);
  const hayCambiosRevision =
    isRevise && !lectura && JSON.stringify(values) !== JSON.stringify(formDefaults);
  const pedirCancelar = () => {
    if (!onCancelar) return;
    if (hayCambiosRevision) {
      setConfirmDescartar(true);
      return;
    }
    onCancelar();
  };

  // SOLO presentación de la TotalBar: cuando lo ÚNICO que falta para guardar
  // es el motivo de la revisión, el botón guía al textarea (scroll+focus) en
  // lugar de quedarse muerto. canSave NO cambia.
  const faltaSoloMotivo =
    isRevise &&
    motivoTrim.length < 3 &&
    !capacidadExcedida &&
    !mxnSinTc &&
    !costoExternoMxnSinTc &&
    previewFresco &&
    !!calcPayload &&
    !!breakdown &&
    !error;

  // Margen informativo del vuelo externo — MISMA fórmula que la leyenda de
  // la card (hoisted para que el resumen del encabezado muestre el mismo
  // número). Costo MXN: se convierte con el TC capturado; sin TC no hay
  // margen que mostrar (el candado costoExternoMxnSinTc ya bloquea guardar).
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

  // ===== Resúmenes de encabezado plegado: PURO formateo de valores que ya
  // existen (values/breakdown/estado local) — cero cálculos de dinero
  // nuevos; montos y horas salen del breakdown canónico del motor. =====
  const clienteNombreResumen = isRevise
    ? (clientName ?? null)
    : (allClients.find((c) => c.id === values.cliente_id)?.nombre ?? null);
  const resumenCliente = [
    clienteNombreResumen ?? "Sin cliente",
    fechaCortaDeInput(values.fecha_vuelo),
    `${maxPasajeros || 0} pax`,
    values.cotizacion_abierta ? "abierta" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const origenTarifaResumen = breakdown
    ? breakdown.tarifa.proviene_de_override
      ? "override"
      : breakdown.tarifa.preferencial_cliente
        ? "pactada"
        : breakdown.tarifa.tipo === "BROKER"
          ? "broker"
          : "público"
    : null;
  const resumenAvion = [
    selectedAircraft
      ? `${selectedAircraft.matricula} ${selectedAircraft.modelo}`
      : "Sin avión",
    values.es_externo ? "referencia (externo)" : null,
    breakdown
      ? `${fmtUsd(breakdown.tarifa.usd_por_hora)}/hr · ${origenTarifaResumen}`
      : null,
    Number(values.sobrevuelo_hr) > 0
      ? `sobrevuelo ${fmtDecimal(Number(values.sobrevuelo_hr))} hr`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const rutaResumen =
    values.escalas.length > 0
      ? [
          values.escalas[0].origen_iata,
          ...values.escalas.map((l) => l.destino_iata),
        ]
          .filter(Boolean)
          .join(" → ")
      : null;
  const resumenTramos = rutaResumen
    ? [
        rutaResumen,
        `${values.escalas.length} ${values.escalas.length === 1 ? "tramo" : "tramos"}`,
        breakdown
          ? `${fmtDecimal(breakdown.ruta.millas_nauticas_totales)} NM`
          : null,
        breakdown ? `${fmtDecimal(breakdown.tiempos.cobrable_hr)} hr` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Sin tramos capturados";
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

  const resumenCargos = breakdown
    ? [
        values.cobrar_tuas
          ? `TUAS ${fmtUsd(breakdown.totales.tuas_total_usd)}`
          : "sin TUAS",
        Number(breakdown.totales.extras_total_usd) > 0
          ? `Extras ${fmtUsd(breakdown.totales.extras_total_usd)}`
          : null,
        Number(breakdown.totales.viaticos_pernocta_usd) > 0
          ? `Pernocta ${fmtUsd(breakdown.totales.viaticos_pernocta_usd)}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Se llena al calcular";

  const metodoPagoLabel =
    METODOS_PAGO.find((m) => m.value === values.metodo_pago)?.label ??
    values.metodo_pago;
  const resumenCobro = [
    values.metodo_pago === "OTRO" && values.metodo_pago_detalle.trim()
      ? `Otro: ${values.metodo_pago_detalle.trim()}`
      : metodoPagoLabel,
    breakdown ? `IVA ${(breakdown.iva.porcentaje * 100).toFixed(0)}%` : null,
    Number(values.tc_usd_mxn) > 0
      ? `TC ${fmtDecimal(Number(values.tc_usd_mxn), 2)}`
      : null,
    breakdown?.meta?.comision_vendedor_usd
      ? `comisión ${fmtUsd(breakdown.meta.comision_vendedor_usd)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
          [opsLegs[0].origen, ...opsLegs.map((l) => l.destino)]
            .filter(Boolean)
            .join(" → "),
          `${opsLegs.length} ${opsLegs.length === 1 ? "tramo" : "tramos"}`,
        ].join(" · ");

  const resumenNotas = [
    values.notas.trim() ? "1 nota" : "sin notas",
    `PDF ${values.pdf_mostrar_tarifa ? "con" : "sin"} tarifa/hr`,
    `${values.pdf_mostrar_itinerario ? "con" : "sin"} itinerario`,
  ].join(" · ");

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

  const resumenDetalle = breakdown
    ? [
        modeloCotizadoTexto,
        `Subtotal ${fmtUsd(breakdown.totales.subtotal_vuelo_usd)}`,
        `IVA ${fmtUsd(breakdown.totales.iva_usd)}`,
        `${fmtDecimal(breakdown.tiempos.cobrable_hr)} hr`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Se llena al calcular";

  // Regla transversal: una sección con aviso activo pinta badge ámbar en su
  // encabezado (plegada o abierta) — un warning JAMÁS se esconde al plegar.
  const avisoCliente = capacidadExcedida ? "Capacidad excedida" : null;
  const avisoTramos = anclaCunPendiente
    ? "No ancla en CUN"
    : hayMillasEnCero
      ? "Millas en 0"
      : null;
  const avisoCargos = mxnSinTc ? "MXN sin TC" : null;
  const avisoCobro = mxnSinTc || costoExternoMxnSinTc ? "Falta TC" : null;
  const avisoExterno = costoExternoMxnSinTc
    ? "Costo MXN sin TC"
    : margenExternoUsd != null && margenExternoUsd < 0
      ? "Margen negativo"
      : null;
  const avisoDetalle = error ? "Error al calcular" : null;

  // ===== Nodos compartidos entre EDICIÓN y LECTURA (página única 5-sep):
  // la misma presentación en ambos modos, definida una sola vez. =====
  const sobrevueloAporteNode =
    breakdown && Number(breakdown.tiempos.sobrevuelo_hr) > 0
      ? (() => {
          // Aporte REAL: la parte del sobrevuelo absorbida por la hora
          // mínima no suma (0.7 + 0.5 hr cobra 1.2 → solo 0.2 hr son del
          // sobrevuelo). min(sob, cobrable − 1).
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
        })()
      : null;

  const cierreResumenNode =
    breakdown &&
    ((breakdown.totales.ajuste_final_usd ?? 0) !== 0 ||
      (Number(values.descuento_usd) || 0) > 0)
      ? (() => {
          const cotizado =
            breakdown.totales.total_usd -
            (breakdown.totales.ajuste_final_usd ?? 0);
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
              {/* 2-sep-2026: la línea "Ajuste al precio pactado" se eliminó
                  junto con la captura del pactado. En folios legado
                  (24/69/148) el motor sigue aterrizando el total en lo
                  pactado vía el ajuste; ese delta ya no se desglosa aquí. */}
              <div className="flex justify-between border-t border-border pt-1 font-semibold">
                <span>Total a cobrar</span>
                <span className="font-mono">
                  {fmtUsd(breakdown.totales.total_usd)}
                </span>
              </div>
            </div>
          );
        })()
      : null;

  // Margen = lo que paga el cliente − lo que cobra el operador externo (solo
  // informativo; el API es la fuente). Derivado ARRIBA (hoisted) para que el
  // resumen del encabezado de la sección muestre el mismo número.
  const margenExternoNode =
    margenExternoUsd != null ? (
      <p
        className={`text-xs ${margenExternoUsd < 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}
      >
        Margen VuelaTour: {fmtUsd(precioClienteUsd)} al cliente −{" "}
        {fmtUsd(costoExtUsd)} del operador externo
        {costoExtEsMxn && (
          <span className="font-mono">
            {" "}
            ({fmtMxn(costoExtNativo)} ÷ tc {fmtDecimal(costoExtTc, 4)})
          </span>
        )}{" "}
        ={" "}
        <span className="font-mono font-semibold">
          {fmtUsd(margenExternoUsd)}
        </span>
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
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 py-0 text-muted-foreground"
                  >
                    cancelado
                  </Badge>
                )}
              </li>
            ))}
        </ol>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Abajo está la ruta COMERCIAL (lo que paga el cliente, abre y cierra
          en CUN). Los tramos operativos se editan en el detalle del vuelo.
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

  return (
    // UNA columna: formulario en secciones colapsables (encabezado = título +
    // resumen compacto + chevron) y la barra del TOTAL fija arriba, ahora con
    // el botón primario de guardar siempre a la vista.
    <div className="mx-auto max-w-4xl space-y-6">
      <TotalBar
        breakdown={breakdown}
        loading={loading}
        error={error}
        sinDatos={lectura ? false : !calcPayload}
        // Lectura sin snapshot (cotización de un motor anterior): el total
        // persistido se pinta tal cual — nunca "Calculando…".
        totalFallback={
          lectura && initialQuote
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
        avion={cotizadoEnTexto}
        // Identidad al lado derecho (pedido 28-ago): cliente + folio·versión
        // llenan el hueco de la barra y se leen sin bajar al formulario.
        titulo={
          isRevise
            ? (clientName ?? null)
            : ((clients ?? []).find((c) => c.id === debounced.cliente_id)
                ?.nombre ??
              null)
        }
        subtitulo={
          isRevise && initialQuote
            ? lectura
              ? `#${initialQuote.folio} · v${initialQuote.cotizacion_version}`
              : `#${initialQuote.folio} · v${initialQuote.cotizacion_version} → v${
                  initialQuote.cotizacion_version + 1
                }`
            : "Nueva cotización"
        }
        // LECTURA: el botón primario es «Revisar» (pasa a edición ahí
        // mismo, mismos candados/razones que la barra de acciones).
        // EDICIÓN: «Guardar revisión» + «Cancelar». Alta: «Guardar».
        saveLabel={
          lectura
            ? revisarLabel
            : saving
              ? "Guardando…"
              : isRevise
                ? "Guardar revisión"
                : "Guardar cotización"
        }
        saveIcon={lectura ? "revisar" : "guardar"}
        saveTitle={lectura ? (revisarBloqueado ?? undefined) : undefined}
        saveDisabled={
          lectura
            ? !onRevisar || !!revisarBloqueado
            : saving || (!canSave && !faltaSoloMotivo)
        }
        onSave={
          lectura
            ? onRevisar
            : () => {
                // En revise con motivo pendiente el botón GUÍA al textarea del
                // motivo (scroll+focus, mismo patrón focusTcField) en vez de
                // quedarse muerto; el guardado real pasa por handleSave con
                // TODOS sus candados intactos.
                if (faltaSoloMotivo) {
                  focusMotivo();
                  return;
                }
                handleSave();
              }
        }
        onCancel={isRevise && !lectura && onCancelar ? pedirCancelar : undefined}
        cancelDisabled={saving}
      />

      {/* Motivo de la revisión (EDICIÓN, página única 5-sep): a la vista
          justo bajo la barra del total — «Revisar» pide el motivo aquí y
          guarda/cancela en la barra. Ancla del botón de la barra: con el
          motivo pendiente el clic guía aquí (scroll+focus). */}
      {isRevise && !lectura && initialQuote && (
        <Card
          id="motivo-revision-field"
          className="scroll-mt-24 border-t-2 border-t-amber-500/70"
        >
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="text-sm">
                <p className="font-medium">
                  Revisando · se generará la v
                  {initialQuote.cotizacion_version + 1}
                </p>
                <p className="text-xs text-muted-foreground">
                  Edita lo que necesites abajo. La versión actual queda en el
                  historial; guarda o cancela en la barra del total.
                </p>
              </div>
              {onCancelar && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={pedirCancelar}
                  disabled={saving}
                  className="gap-1.5"
                >
                  <XMarkIcon className="h-4 w-4" />
                  Cancelar revisión
                </Button>
              )}
            </div>
            <Field label="Motivo de la revisión" required>
              <Textarea
                rows={2}
                placeholder="Ej. Cliente cambió fecha y aumentó pasajeros"
                {...register("motivo")}
              />
            </Field>
          </CardContent>
        </Card>
      )}

      {/* 1 · Cliente y fechas */}
      <SeccionCotizador
        id="cliente"
        titulo="Cliente y fechas"
        resumen={resumenCliente}
        aviso={avisoCliente}
        abierta={abiertas.cliente}
        onToggle={() => toggleSeccion("cliente")}
      >
        {lectura && initialQuote ? (
          // ===== LECTURA: mismos bloques y mismo orden que la edición, con
          // los valores como texto (fechas ISO → hora Cancún con fmtDateTime).
          <>
            <div className="rounded-lg border border-border bg-navy-800/50 px-3 py-2 space-y-0.5">
              <p className="text-[11px] uppercase tracking-wider text-foreground/70">
                Cliente · folio
              </p>
              <p className="text-sm font-medium">
                {clientName ?? initialQuote.cliente_id}
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono">#{initialQuote.folio}</span> ·{" "}
                <span className="font-mono">v{initialQuote.cotizacion_version}</span>
                {clienteInterno
                  ? " · cliente interno (operación propia: puede ir en $0)"
                  : ""}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Dato
                label="Fecha de traslado inicial"
                value={
                  initialQuote.fecha_vuelo
                    ? fmtDateTime(initialQuote.fecha_vuelo)
                    : "—"
                }
                hint={TZ_LABEL}
              />
              <Dato
                label="Fecha de traslado final"
                value={
                  initialQuote.fecha_traslado_final ? (
                    fmtDateTime(initialQuote.fecha_traslado_final)
                  ) : initialQuote.fecha_fin &&
                    initialQuote.fecha_fin !== initialQuote.fecha_vuelo ? (
                    // Sin traslado capturado pero el viaje termina otro día:
                    // fecha_fin la deriva el trigger (GREATEST de los tramos).
                    <>
                      {fmtDateTime(initialQuote.fecha_fin)}
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        · derivado del itinerario
                      </span>
                    </>
                  ) : (
                    "—"
                  )
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Dato
                label="Pasajeros"
                value={
                  paxPorTramo
                    ? `${maxPaxTramos} · definido por tramo`
                    : String(Number(values.pasajeros) || 0)
                }
                hint={
                  <>
                    {selectedAircraft && selectedAircraft.asientos > 0 && (
                      <span
                        className={cn(
                          "block",
                          capacidadExcedida && "text-destructive font-medium",
                        )}
                      >
                        {capacidadExcedida
                          ? `Excede la capacidad: ${maxPasajeros} pax en un tramo vs máx. ${selectedAircraft.asientos} (${selectedAircraft.modelo}).`
                          : `Máx. ${selectedAircraft.asientos} pasajeros (${selectedAircraft.modelo}).`}
                      </span>
                    )}
                    {/* Cuánto pagan de TUAS estos pasajeros, aeropuerto por
                        aeropuerto — mismas filas del desglose guardado. */}
                    {values.cobrar_tuas &&
                      breakdown &&
                      (breakdown.tuas.filas ?? []).map((f) => (
                        <span key={f.iata} className="block">
                          TUA <span className="font-mono">{f.iata}</span>:{" "}
                          <span className="font-mono">
                            {f.pax} ×{" "}
                            {f.moneda === "MXN"
                              ? fmtMxn(f.monto_pax)
                              : fmtUsd(f.monto_pax)}{" "}
                            = {fmtUsd(f.total_usd)} USD
                          </span>
                        </span>
                      ))}
                  </>
                }
              />
              <Dato
                label="Pase de abordar"
                value={values.pase_abordar ? "Sí" : "No"}
                hint="Exenta TUAS (excepto CZM)"
              />
            </div>
            <Dato
              label="Cotización abierta"
              value={
                values.cotizacion_abierta
                  ? "Sí — el itinerario/precio se cierra al final"
                  : "No"
              }
              hint="Abierta = permite re-cotizar con los tramos reales hasta antes de cobrar/facturar."
            />
          </>
        ) : (
          <>
          {/* Cliente */}
          {isRevise && initialQuote ? (
            <div className="rounded-lg border border-border bg-navy-800/50 px-3 py-2 space-y-0.5">
              <p className="text-[11px] uppercase tracking-wider text-foreground/70">
                Cliente · folio
              </p>
              <p className="text-sm font-medium">{clientName ?? initialQuote.cliente_id}</p>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono">#{initialQuote.folio}</span> ·{" "}
                <span className="font-mono">v{initialQuote.cotizacion_version}</span>{" "}
                · revisar genera v{initialQuote.cotizacion_version + 1}
              </p>
              {clienteInterno && (
                <div className="mt-1 rounded-md border border-sky-500/40 bg-sky-500/15 px-2.5 py-1.5 text-xs text-sky-700 dark:text-sky-400 space-y-1.5">
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
                    <div className="rounded-lg border border-brand-500/30 bg-brand-500/15 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-lg font-bold leading-tight">{sel.nombre}</p>
                        <button
                          type="button"
                          title="Corregir el nombre del cliente"
                          onClick={() => {
                            setEditClienteNombre(sel.nombre);
                            setEditClienteOpen(true);
                          }}
                          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                        </button>
                      </div>
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
                                  ? "text-emerald-600 dark:text-emerald-400"
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
                              // Activa "Personalizada", ABRE la sección del
                              // avión (puede estar plegada: hidden no tiene
                              // layout y el scroll moriría en silencio) y
                              // espera el render antes del scroll.
                              setTarifaCustom(true);
                              abrirSeccion("avion");
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
                  <div className="rounded-md border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-xs text-sky-700 dark:text-sky-400 space-y-2">
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
                            ? "border-brand-500 bg-brand-500/15 font-medium text-brand-600 dark:text-brand-400"
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

          <div className="flex items-center justify-between rounded-lg border border-border bg-navy-800/50 p-3">
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
          </>
        )}
      </SeccionCotizador>

      {/* 2 · Avión y tarifa */}
      <SeccionCotizador
        id="avion"
        titulo="Avión y tarifa"
        resumen={resumenAvion}
        abierta={abiertas.avion}
        onToggle={() => toggleSeccion("avion")}
      >
        {lectura ? (
          <>
            <Dato
              label="Aeronave"
              value={
                selectedAircraft
                  ? `${selectedAircraft.matricula} — ${selectedAircraft.modelo}`
                  : breakdown?.aeronave?.modelo
                    ? [breakdown.aeronave.matricula, breakdown.aeronave.modelo]
                        .filter(Boolean)
                        .join(" — ")
                    : "—"
              }
              hint={
                <>
                  {selectedAircraft && (
                    <span className="block">
                      Tarifa público {fmtUsd(selectedAircraft.tarifa_hora_pub_usd)} / hr
                      · broker {fmtUsd(selectedAircraft.tarifa_hora_broker_usd)} / hr
                    </span>
                  )}
                  {values.es_externo && (
                    <span className="block">
                      Vuelo externo: este avión es solo la referencia de tarifa
                      para cotizar — el vuelo no lo opera la flota.
                    </span>
                  )}
                </>
              }
            />
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
                  {/* Tarifa efectiva: del snapshot; sin snapshot (motor
                      anterior) la columna persistida tarifa_hora_usd. */}
                  {breakdown ? (
                    <span className="font-mono">
                      {fmtUsd(breakdown.tarifa.usd_por_hora)}/hr
                    </span>
                  ) : Number(initialQuote?.tarifa_hora_usd) > 0 ? (
                    <span className="font-mono">
                      {fmtUsd(Number(initialQuote!.tarifa_hora_usd))}/hr
                    </span>
                  ) : null}
                  {origenTarifaResumen && (
                    <span className="text-xs text-muted-foreground">
                      · {origenTarifaResumen}
                    </span>
                  )}
                </span>
              }
              hint={
                tarifaSegment === "CUSTOM"
                  ? "Tarifa ajustada SOLO para esta cotización (no cambia la tarifa del cliente)."
                  : breakdown?.tarifa.preferencial_cliente
                    ? "Tarifa pactada con este cliente para este avión."
                    : undefined
              }
            />
            <div className="grid grid-cols-2 gap-3">
              {/* Tiempo cobrable PERSISTIDO (la card «Tarifa» del detalle
                  anterior lo mostraba): el desglose de Tiempos vive en
                  «Detalle del cálculo». */}
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
                    ? "Pactado a mano (override)"
                    : breakdown?.tiempos.minimo_hora_aplicado
                      ? "Vuelo corto: se cobra la hora completa (mínimo 1 hr)"
                      : undefined
                }
              />
              <Dato
                label="Sobrevuelo (hr)"
                value={
                  Number(values.sobrevuelo_hr) > 0
                    ? `${fmtDecimal(Number(values.sobrevuelo_hr))} hr`
                    : "—"
                }
                hint={
                  <>
                    Tiempo extra sobre la zona; se suma al cobrable
                    {sobrevueloAporteNode}
                  </>
                }
              />
            </div>
          </>
        ) : (
          <>
          {/* Aeronave: SIEMPRE de la flota. En externos es la referencia de
              tarifa con la que se cotiza (el vuelo persiste sin avión propio)
              — el modo "sin avión / monto pactado por tramo" se retiró
              29-ago: el precio sale de completar la cotización normal. */}
          <Field label="Aeronave" required>
            <SearchableSelect
              options={aircraft.map((a) => {
                const sinTarifa =
                  !a.tarifa_hora_pub_usd && !a.tarifa_hora_broker_usd;
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
            {values.es_externo && (
              <p className="text-xs text-muted-foreground mt-1">
                Vuelo externo: este avión es solo la referencia de tarifa para
                cotizar — el vuelo no lo opera la flota.
              </p>
            )}
          </Field>

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
                {
                  value: "PUBLICO",
                  label: "Público",
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
                  // Solo con override capturado (puede ser $0: interno).
                  sub: overrideTarifaActivo
                    ? tarifaSub(values.tarifa_hora_override_usd)
                    : undefined,
                },
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
              {sobrevueloAporteNode}
            </Field>
            {/* El switch de Cobrar TUAS vive en la card "TUAS por
                aeropuerto" de Cargos adicionales (26-ago): junto a donde se
                editan los montos, que es donde tiene sentido. */}
          </div>
          </>
        )}
      </SeccionCotizador>

      {/* 3 · Tramos (ruta comercial que se cobra) */}
      <SeccionCotizador
        id="tramos"
        titulo="Tramos"
        resumen={resumenTramos}
        aviso={avisoTramos}
        abierta={abiertas.tramos}
        onToggle={() => toggleSeccion("tramos")}
      >
        {lectura ? (
          <>
            <Dato
              label="Ruta guardada"
              value={
                selectedRouteOpt
                  ? rutaPathTexto(selectedRouteOpt)
                  : "Itinerario propio (sin ruta del catálogo)"
              }
              hint={
                selectedRouteOpt && itinerarioAjustado
                  ? "El itinerario de esta cotización difiere de la ruta guardada."
                  : undefined
              }
            />
            {rutaOperativaLectura}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Tramos de esta cotización
              </Label>
              {/* Ruta COMERCIAL cotizada (lo que paga el cliente). Los
                  toggles del PDF por tramo (ocultar / fecha) los cuelga el
                  padre en `tramoExtraLectura` sobre la escala VIVA. */}
              <TramosLectura legs={values.escalas} extra={tramoExtraLectura} />
              {notaTramosLectura}
            </div>
            {values.escalas.length > 0 && (
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
            )}
          </>
        ) : (
          <>
          {/* Ruta */}
          <Field label="Ruta guardada" required>
            {/* Sugeridas por historial: lo que este cliente suele pedir. */}
            {rutasSugeridas.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] uppercase tracking-wider text-foreground/70">
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
                          ? "border-brand-500 bg-brand-500/15 font-medium text-brand-600 dark:text-brand-400"
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
                  disabled={opsComoEscalas().length === 0}
                  title="Copia origen→destino de los tramos con pasajeros como punto de partida de la cotización. Los pax se capturan aquí, no se copian."
                  onClick={() => {
                    const nuevos = opsComoEscalas();
                    if (
                      values.escalas.length > 0 &&
                      legsSignature(values.escalas) !== legsSignature(nuevos)
                    ) {
                      // Ya hay tramos capturados distintos: confirmar antes
                      // de sobreescribir (regla permanente del cliente).
                      setOpsATramosOpen(true);
                    } else {
                      aplicarOpsComoEscalas();
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
                  .map((e, i) =>
                    e.es_ferry || e.solo_operativa ? `T${i + 1} ferry` : null,
                  )
                  .filter(Boolean)
                  .join(" · ") || "Todos los tramos con pasajeros"}
                {" · "}Los tramos de abajo son la ruta COMERCIAL (lo que paga el
                cliente, abre y cierra en CUN); la operativa no se toca al cotizar.
              </p>
              <AlertDialog open={opsATramosOpen} onOpenChange={setOpsATramosOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      ¿Reemplazar los tramos capturados?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Los tramos de la cotización se sustituyen por los de la
                      ruta operativa (sin pasajeros: esos se capturan aquí).
                      El total se recalcula en vivo.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={aplicarOpsComoEscalas}>
                      Reemplazar tramos
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {values.escalas.length > 0 ? (
            <>
              <Field
                label="Tramos de esta cotización"
                hint="Los ajustes (pax, ferry, pernocta) aplican solo a esta cotización; la ruta guardada no se modifica; la fecha que ve el cliente en el PDF se captura en el detalle de la cotización."
              >
                <QuoteLegsEditor
                  value={values.escalas}
                  onChange={(legs) => setValue("escalas", legs)}
                  routes={allRoutes}
                  airports={airports}
                  onAeropuertoCreado={onAeropuertoCreado}
                  avisoAnclaCun
                />
                {/* Acceso al COBRABLE pactado: vive en «Detalle del
                    cálculo» — se abre esa sección y se lleva al input. */}
                {breakdown && (
                  <button
                    type="button"
                    onClick={focusCobrable}
                    className="mt-1 text-left text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    ¿Pactar las horas a cobrar? El Cobrable se edita en el
                    detalle del cálculo.
                  </button>
                )}
              </Field>
              {itinerarioAjustado && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-navy-800/50 p-2.5">
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
                onAeropuertoCreado={onAeropuertoCreado}
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
          </>
        )}
      </SeccionCotizador>

      {/* 4 · Cargos adicionales (TUAS + extras + pernoctas) */}
      <SeccionCotizador
        id="cargos"
        titulo="Cargos adicionales"
        resumen={resumenCargos}
        aviso={avisoCargos}
        abierta={abiertas.cargos}
        onToggle={() => toggleSeccion("cargos")}
      >
        {/* Card «TUAS por aeropuerto» (vivía en el Preview; 26-ago el switch
            quedó junto a los montos): editable, manda sobre el catálogo. Sin
            breakdown aún no hay desglose que editar. */}
        {breakdown ? (
          <TuasCard
            breakdown={breakdown}
            tuasLineas={values.tuas_lineas ?? []}
            onTuaChange={setTuaLinea}
            cobrarTuas={values.cobrar_tuas}
            onCobrarTuasChange={(c) => setValue("cobrar_tuas", c)}
            tcUsdMxn={Number(values.tc_usd_mxn) > 0 ? Number(values.tc_usd_mxn) : null}
            onFocusTc={focusTc}
            readOnly={lectura}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            {lectura
              ? "Esta versión no guardó el desglose de TUAS por aeropuerto (cotización de un motor anterior)."
              : "TUAS por aeropuerto: captura los tramos para ver el desglose editable."}
          </p>
        )}

          {/* Conceptos extra (lectura: lista legible, sin agregar/quitar) */}
          <ExtrasEditor
            value={values.extras}
            onChange={(extras) => setValue("extras", extras)}
            tcCapturado={Number(values.tc_usd_mxn) > 0}
            onFocusTc={focusTc}
            pasajeros={Number(values.pasajeros) > 0 ? Number(values.pasajeros) : null}
            grupo={grupoDelHijo}
            readOnly={lectura}
          />
          {breakdown && (
            <AporteChip
              usd={breakdown.totales.extras_total_usd}
              nota="conceptos extra"
            />
          )}
        {/* Línea informativa de pernoctas (viático cobrado al cliente); el
            costo por tramo se captura en la sección de Tramos. */}
        {breakdown && (
          <AporteChip
            usd={breakdown.totales.viaticos_pernocta_usd}
            nota="pernoctas cobradas al cliente"
          />
        )}
      </SeccionCotizador>

      {/* 5 · Cobro y cierre */}
      <SeccionCotizador
        id="cobro"
        titulo="Cobro y cierre"
        resumen={resumenCobro}
        aviso={avisoCobro}
        abierta={abiertas.cobro}
        onToggle={() => toggleSeccion("cobro")}
      >
        {lectura ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Dato
                label="Método de pago"
                value={
                  values.metodo_pago === "OTRO"
                    ? `Otro${
                        values.metodo_pago_detalle.trim()
                          ? ` — ${values.metodo_pago_detalle.trim()}`
                          : ""
                      }`
                    : metodoPagoLabel
                }
                hint={
                  METODOS_PAGO.find((m) => m.value === values.metodo_pago)?.hint
                }
              />
              {values.metodo_pago === "BILLPOCKET" && (
                <Dato
                  label="Comisión BillPocket"
                  value={
                    Number(values.comision_billpocket_pct) > 0
                      ? `${values.comision_billpocket_pct}%`
                      : "—"
                  }
                  hint="Custom por operación · sin IVA · aparece en el desglose como «Comisión BillPocket»"
                />
              )}
              <Dato
                label="Tipo de cambio (MXN por USD)"
                value={
                  Number(values.tc_usd_mxn) > 0
                    ? fmtDecimal(Number(values.tc_usd_mxn), 4)
                    : "Sin capturar"
                }
                hint={
                  Number(values.tc_usd_mxn) > 0 &&
                  breakdown?.totales.total_mxn != null
                    ? `Total ${fmtMxn(breakdown.totales.total_mxn)}`
                    : hayLineasMxn || costoExternoEnMxn
                      ? "Hay renglones en pesos: sin TC no pueden convertirse."
                      : "Solo si el pago entra en pesos."
                }
              />
              <Dato
                label="IVA"
                value={
                  breakdown
                    ? `${(breakdown.iva.porcentaje * 100).toFixed(0)}%${
                        `${values.iva_pct_override ?? ""}`.trim() !== ""
                          ? " · override manual"
                          : ""
                      }`
                    : `${values.iva_pct_override ?? ""}`.trim() !== ""
                      ? `${(Number(values.iva_pct_override) * 100).toFixed(0)}% · override manual`
                      : "Automático (según método de pago)"
                }
                hint={breakdown?.iva.nota}
              />
            </div>
            <Dato
              label="Comisión del vendedor (interna)"
              value={comisionVendedorTexto}
              hint={
                <>
                  Se SUMA al precio del cliente · interna, no aparece en el PDF.
                  {breakdown?.meta?.comision_vendedor_usd &&
                  breakdown.meta.neto_vuelatour_usd != null ? (
                    <span className="block font-mono">
                      Neto VuelaTour: {fmtUsd(breakdown.meta.neto_vuelatour_usd)}
                    </span>
                  ) : null}
                </>
              }
            />
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Cierre del total</p>
              {breakdown && (
                <AporteChip
                  usd={breakdown.totales.ajuste_final_usd}
                  nota="ajuste neto (redondeo − descuento)"
                />
              )}
              <div className="grid grid-cols-3 gap-3">
                <Dato
                  label="Redondeo automático"
                  value={values.redondeo_auto ? "Sí" : "No"}
                  hint="Al siguiente múltiplo de $10 (976→980)."
                />
                {!values.redondeo_auto && (
                  <Dato
                    label="Redondeo manual"
                    value={
                      Number(values.redondeo_usd) > 0
                        ? fmtUsd(Number(values.redondeo_usd))
                        : "—"
                    }
                  />
                )}
                <Dato
                  label="Descuento"
                  value={
                    Number(values.descuento_usd) > 0
                      ? fmtUsd(Number(values.descuento_usd))
                      : "—"
                  }
                />
              </div>
              {cierreResumenNode}
            </div>
          </>
        ) : (
          <>
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
              Con renglones nativos en MXN (TUAS/extras) o el costo del
              operador externo en MXN, el campo también aparece con método
              DOLARES: sin TC no pueden convertirse. */}
          {(values.metodo_pago !== "DOLARES" ||
            hayLineasMxn ||
            costoExternoEnMxn) && (
            <div id="tc-usd-mxn-field" className="scroll-mt-24">
            <Field
              label="Tipo de cambio (MXN por USD)"
              hint={
                hayLineasMxn
                  ? "Requerido: hay TUAS/extras capturados en pesos"
                  : costoExternoEnMxn
                    ? "Requerido: el costo del operador externo va en pesos"
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
            {/* 2-sep-2026: el aviso "el pactado manda" se eliminó junto con
                la captura del precio pactado (ya no existe la opción). */}
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
            {cierreResumenNode}
          </div>
          </>
        )}
      </SeccionCotizador>

          {/* Vuelo cubierto por operador EXTERNO. Al crear: se prende AQUÍ
              cuando la venta nace con un avión AJENO (broker, ej. HAWKER
              400 A) — con avión propio se puede seguir cubriendo después
              desde el detalle del vuelo («Cubrir con externo»). Al revisar:
              muestra el estado y edita la ficha del avión y el costo del
              operador (el precio pactado se retiró el 2-sep-2026). */}
      {(!isRevise || initialQuote?.es_externo) && (
        <SeccionCotizador
          id="externo"
          titulo="Operador externo"
          resumen={resumenExterno}
          aviso={avisoExterno}
          abierta={abiertas.externo}
          onToggle={() => toggleSeccion("externo")}
        >
          {lectura && initialQuote ? (
            // LECTURA: la card ámbar "Cubierto por operador externo" que
            // vivía en el aside del detalle, en el mismo sitio de la sección.
            <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Otro operador vuela este servicio; VuelaTour cobra al cliente y
                paga al apoyo. Sin avión propio ni tacómetros; los gastos sí se
                registran en el vuelo. El avión de «Avión y tarifa» es solo la
                referencia de tarifa.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Dato
                  label="Operador externo"
                  value={initialQuote.operador_externo ?? "—"}
                  hint="Quién vuela el servicio"
                />
                <Dato
                  label="Avión"
                  value={
                    [
                      initialQuote.avion_externo_modelo,
                      initialQuote.avion_externo_matricula,
                    ]
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
                        {/* Costo capturado en MXN: el USD es DERIVADO por el
                            API (monto ÷ tc); el nativo se muestra al lado. */}
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
                    value={fmtUsd(
                      Number(initialQuote.calculo_snapshot!.meta!.total_pactado_usd),
                    )}
                  />
                )}
              </div>
              {margenExternoNode}
              <p className="text-[11px] text-muted-foreground">
                Antes de IVA/comisiones y otros costos. El operador y su costo
                se editan con «Revisar» o en{" "}
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
                    Vuelo cubierto por{" "}
                    <strong>{initialQuote.operador_externo}</strong>. El avión
                    de abajo es solo la referencia de tarifa. Aquí capturas lo
                    que cobra el operador externo y lo que se le cobra al
                    cliente: no son lo mismo.
                  </div>
                  <Field
                    label="Operador externo"
                    hint="Quién vuela el servicio (vacío = se conserva el actual)"
                  >
                    <Input
                      placeholder="Ej. Aerocharter del Caribe"
                      maxLength={120}
                      value={values.operador_externo}
                      onChange={(e) =>
                        setValue("operador_externo", e.target.value)
                      }
                    />
                  </Field>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        Cubierto por operador externo
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Otro operador vuela el servicio (ej. venta broker de
                        un jet ajeno). Sin tacómetros; los gastos sí se
                        registran en el vuelo.
                      </p>
                    </div>
                    <Switch
                      checked={values.es_externo}
                      onCheckedChange={(c) => setValue("es_externo", c)}
                    />
                  </div>
                  {values.es_externo && (
                    <Field
                      label="Operador externo"
                      required
                      hint="Quién vuela el servicio"
                    >
                      <Input
                        placeholder="Ej. Aerocharter del Caribe"
                        maxLength={120}
                        value={values.operador_externo}
                        onChange={(e) =>
                          setValue("operador_externo", e.target.value)
                        }
                      />
                    </Field>
                  )}
                </>
              )}
              {values.es_externo && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="Modelo del avión"
                      hint="Sale en el PDF del cliente"
                    >
                      <Input
                        placeholder="HAWKER 400 A"
                        maxLength={80}
                        value={values.avion_externo_modelo}
                        onChange={(e) =>
                          setValue("avion_externo_modelo", e.target.value)
                        }
                      />
                    </Field>
                    <Field label="Matrícula (opcional)">
                      <Input
                        placeholder="XA-REG"
                        maxLength={20}
                        value={values.avion_externo_matricula}
                        onChange={(e) =>
                          setValue("avion_externo_matricula", e.target.value)
                        }
                      />
                    </Field>
                  </div>
                  {/* Regla 28-ago: lo que COBRA el operador externo (costo,
                      interno) y lo que se le COBRA al cliente son dos cosas
                      distintas — ambas se capturan aquí, al crear y al
                      revisar. 29-ago: el costo lleva su MONEDA (USD|MXN). */}
                  <Field
                    label="Lo que cobra el operador externo (costo)"
                    hint="Lo que el operador nos cobra por el vuelo, en su moneda · interno, no lo ve el cliente"
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        placeholder="0.00"
                        value={values.costo_externo_monto ?? ""}
                        onChange={(e) =>
                          setValue(
                            "costo_externo_monto",
                            e.target.value === ""
                              ? null
                              : Math.max(0, Number(e.target.value)),
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
                        Costo en MXN: captura el TC en «Cobro y cierre» — sin
                        tipo de cambio no se puede derivar el USD ni guardar.
                      </button>
                    )}
                  </Field>
                  {/* El input "Precio pactado con el cliente (total, USD)" se
                      ELIMINÓ (decisión del cliente, 2-sep-2026: "no tiene por
                      qué existir"). El precio al cliente sale del cálculo
                      normal; en folios viejos con pactado persistido
                      (24/69/148) el motor sigue aterrizando su total vía la
                      rehidratación silenciosa (initialValues/calcPayload). */}
                  {/* Margen = lo que paga el cliente − lo que cobra el
                      operador externo (solo informativo; el API es la
                      fuente). Derivado ARRIBA (hoisted) para que el resumen
                      del encabezado de la sección muestre el mismo número. */}
                  {margenExternoNode}
                </>
              )}
            </div>
          )}
        </SeccionCotizador>
      )}

          {/* Ruta OPERATIVA opcional (solo al crear): la ruta real del avión
              para gastos/tacómetros; puede salir de otra base y llevar ferries.
              Es independiente de los tramos comerciales de arriba (el dinero). */}
      {!isRevise && (
        <SeccionCotizador
          id="operativa"
          titulo="Ruta operativa"
          resumen={resumenOperativa}
          abierta={abiertas.operativa}
          onToggle={() => toggleSeccion("operativa")}
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
                        title="El piloto pernocta tras este tramo (viático en la cotización). SOLO se marca a mano — el sistema ya no la activa por salto de fecha."
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
                    <div className="flex flex-wrap items-start gap-2">
                      {/* Calendario + hora en TEXTO libre ("8pm"/"20:00"):
                          emite el mismo string datetime-local pared-Cancún
                          que guarda opsLegs[].hora. */}
                      <div
                        className="w-[264px] shrink-0"
                        title="Fecha y hora del tramo (opcional, hora Cancún). Vacía = tramo 1 sale a la fecha del vuelo. Es la salida programada del piloto; la fecha del PDF del cliente se captura en el detalle de la cotización."
                      >
                        <FechaHoraCampo
                          className="[&_input]:h-8"
                          value={l.hora}
                          onChange={(v) =>
                            setOpsLegs((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, hora: v } : x,
                              ),
                            )
                          }
                        />
                      </div>
                      <Input
                        className="h-8 min-w-[12rem] flex-1"
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
        </SeccionCotizador>
      )}

      {/* 8 · Notas y PDF */}
      <SeccionCotizador
        id="notas"
        titulo="Notas y PDF"
        resumen={resumenNotas}
        abierta={abiertas.notas}
        onToggle={() => toggleSeccion("notas")}
      >
        {lectura ? (
          <>
            <Dato
              label="Notas (visibles en PDF)"
              value={
                values.notas.trim() ? (
                  <span className="whitespace-pre-wrap font-normal">
                    {values.notas}
                  </span>
                ) : (
                  "Sin notas"
                )
              }
            />
            {/* Notas internas: el DTO de revisión no las acepta (se editan
                desde el detalle del vuelo), pero en lectura SÍ se muestran
                — vivían en el detalle y no se pierden. */}
            <Dato
              label="Notas internas"
              value={
                initialQuote?.notas_internas ? (
                  <span className="whitespace-pre-wrap font-normal">
                    {initialQuote.notas_internas}
                  </span>
                ) : (
                  "—"
                )
              }
              hint="Solo para el equipo. No aparecen en el PDF al cliente; se editan desde el detalle del vuelo (Editar datos)."
            />
            <div className="space-y-1 rounded-lg border border-border bg-navy-800/50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
                PDF de la cotización
              </p>
              <p className="text-sm">
                Mostrar tarifa por hora:{" "}
                <span className="font-medium">
                  {values.pdf_mostrar_tarifa ? "Sí" : "No"}
                </span>
              </p>
              <p className="text-sm">
                Mostrar itinerario de tramos:{" "}
                <span className="font-medium">
                  {values.pdf_mostrar_itinerario ? "Sí" : "No"}
                </span>
              </p>
            </div>
          </>
        ) : (
          <>
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

          {/* Presentación del PDF (27-ago): configurable por cotización. */}
          <div className="space-y-2 rounded-lg border border-border bg-navy-800/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
              PDF de la cotización
            </p>
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">
                  Mostrar tarifa por hora
                </Label>
                <p className="text-xs text-muted-foreground">
                  El desglose dice «Servicio aéreo (1.6 h × $1,650/hr)».
                  Apagado, solo el monto.
                </p>
              </div>
              <Switch
                checked={values.pdf_mostrar_tarifa}
                onCheckedChange={(c) => setValue("pdf_mostrar_tarifa", c)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">
                  Mostrar itinerario de tramos
                </Label>
                <p className="text-xs text-muted-foreground">
                  La tabla de tramos de la hoja 1; apagado queda solo el mapa
                  de la ruta.
                </p>
              </div>
              <Switch
                checked={values.pdf_mostrar_itinerario}
                onCheckedChange={(c) => setValue("pdf_mostrar_itinerario", c)}
              />
            </div>
          </div>
          </>
        )}
      </SeccionCotizador>

      {/* 9 · Detalle del cálculo — el total vive en la TotalBar
          fija; aquí queda el detalle (solo lectura salvo Cobrable). */}
      <SeccionCotizador
        id="detalle"
        titulo="Detalle del cálculo"
        resumen={resumenDetalle}
        aviso={avisoDetalle}
        abierta={abiertas.detalle}
        onToggle={() => toggleSeccion("detalle")}
      >
        {lectura && initialQuote ? (
          // LECTURA: el desglose GUARDADO (snapshot) tal cual + el desglose
          // canónico para balance (líneas que suman exacto, copiar, cotizado
          // en / opera en, partición avión/VuelaTour) que vivía en el detalle.
          <>
            {breakdown ? (
              <Preview
                breakdown={breakdown}
                loading={false}
                avion={cotizadoEnTexto}
                tcUsdMxn={
                  Number(values.tc_usd_mxn) > 0 ? Number(values.tc_usd_mxn) : null
                }
                tiempoOverride={values.tiempo_cobrable_override_hr}
                onTiempoOverride={() => {}}
                readOnly
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Esta versión no guardó el detalle del cálculo (cotización de un
                motor anterior): abajo va el desglose reconstruido desde las
                columnas guardadas.
              </p>
            )}
            <QuoteDesgloseCard quote={initialQuote} />
          </>
        ) : error ? (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-base text-destructive">
                Error al calcular
              </CardTitle>
              <CardDescription className="text-destructive/80">{error}</CardDescription>
            </CardHeader>
          </Card>
        ) : !calcPayload ? (
          <Card className="border-t-2 border-t-brand-600/60">
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
            avion={cotizadoEnTexto}
            tcUsdMxn={Number(values.tc_usd_mxn) > 0 ? Number(values.tc_usd_mxn) : null}
            tiempoOverride={values.tiempo_cobrable_override_hr}
            onTiempoOverride={(v) => setValue("tiempo_cobrable_override_hr", v)}
          />
        ) : (
          <PreviewSkeleton />
        )}
      </SeccionCotizador>

        {/* Save bar (oculta en LECTURA: ahí el único botón es «Revisar» en
            la barra del total). */}
        {!lectura && (
        <Card className="border-t-2 border-t-brand-600/60">
          <CardContent className="p-4 space-y-3">
            {mxnSinTc && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                Hay TUAS o extras capturados en MXN sin tipo de cambio: el
                total mostrado aún NO los incluye. Captura el TC (MXN por USD)
                en «Cobro y cierre» para aplicarlos y poder guardar.
              </p>
            )}
            {isRevise && initialQuote ? (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm">
                  <p className="font-medium">
                    Guardar revisión v{initialQuote.cotizacion_version + 1}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    La versión actual queda en el historial. El cálculo nuevo
                    reemplaza el snapshot del vuelo. El motivo se captura
                    arriba, bajo la barra del total.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {onCancelar && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={pedirCancelar}
                      disabled={saving}
                    >
                      Cancelar
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={() => {
                      if (faltaSoloMotivo) {
                        focusMotivo();
                        return;
                      }
                      handleSave();
                    }}
                    disabled={saving || (!canSave && !faltaSoloMotivo)}
                    className="gap-2"
                  >
                    <BookmarkSquareIcon className="h-4 w-4" />
                    {saving ? "Guardando…" : "Guardar revisión"}
                  </Button>
                </div>
              </div>
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
        )}

      {/* Cancelar la revisión en el lugar con cambios capturados: se confirma
          (lo escrito se pierde; la cotización queda tal como está guardada). */}
      {isRevise && initialQuote && (
        <AlertDialog open={confirmDescartar} onOpenChange={setConfirmDescartar}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Descartar los cambios de la revisión?</AlertDialogTitle>
              <AlertDialogDescription>
                Lo que capturaste en esta revisión se pierde y la cotización
                #{initialQuote.folio} queda tal como está guardada (v
                {initialQuote.cotizacion_version}). No se genera ninguna versión
                nueva.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Seguir editando</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  setConfirmDescartar(false);
                  onCancelar?.();
                }}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Descartar cambios
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
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
        <DialogContent className="sm:max-w-sm">
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
 * Campo en LECTURA (página única 5-sep): etiqueta discreta + valor legible
 * como texto — nunca un input gris deshabilitado. Mismo ritmo visual que
 * `Field` para que el acomodo de cada sección sea el MISMO en ambos modos.
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
      <p className="text-[11px] uppercase tracking-wider text-foreground/70">
        {label}
      </p>
      <div className="text-sm font-medium break-words">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/** "CUN → HOL → CUN" de una ruta del catálogo (mismo texto del selector). */
function rutaPathTexto(r: RouteOption): string {
  return r.tramos.length > 0
    ? [r.tramos[0]?.origen_iata, ...r.tramos.map((t) => t.destino_iata)]
        .filter(Boolean)
        .join(" → ")
    : `${r.origen_iata} → ${r.destino_iata}`;
}

/**
 * Tramos de la cotización en LECTURA: un renglón legible por tramo
 * (origen → destino · NM · pax/ferry · pernocta · servicio) con un slot
 * `extra` por tramo donde el padre cuelga los toggles del PDF. Misma
 * información que el editor, sin inputs ni agregar/quitar.
 */
function TramosLectura({
  legs,
  extra,
}: {
  legs: EscalaInput[];
  extra?: (idx: number, leg: EscalaInput) => ReactNode;
}) {
  if (legs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Sin tramos capturados.</p>
    );
  }
  // Suma de MILLAS (no dinero): misma cuenta del pie del editor.
  const nmTotal = legs.reduce(
    (acc, l) => acc + (Number(l.millas_nauticas) || 0),
    0,
  );
  return (
    <ol className="space-y-1.5">
      {legs.map((l, idx) => {
        const conPax =
          !l.es_ferry && l.pasajeros != null && `${l.pasajeros}` !== "";
        return (
          <li
            key={`${idx}-${l.origen_iata}-${l.destino_iata}`}
            className="rounded-lg border border-border bg-navy-800/50 px-2.5 py-2 text-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono">
                <span className="text-muted-foreground mr-2">{idx + 1}.</span>
                {l.origen_iata} → {l.destino_iata}
              </span>
              <span className="flex flex-wrap items-center justify-end gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {Number(l.millas_nauticas) > 0
                    ? `${fmtDecimal(Number(l.millas_nauticas))} NM`
                    : "—"}
                </span>
                {l.es_ferry ? (
                  <Badge variant="outline" className="text-[10px]">
                    Ferry · vacío
                  </Badge>
                ) : conPax ? (
                  <Badge variant="outline" className="text-[10px]">
                    {l.pasajeros} pax
                  </Badge>
                ) : null}
                {l.requiere_pernocta && (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                  >
                    Pernocta
                    {l.pernocta_costo_usd != null
                      ? ` · ${fmtUsd(l.pernocta_costo_usd)}`
                      : ""}
                  </Badge>
                )}
                {l.tipo_parada === "SERVICIO" && (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30"
                  >
                    Servicio
                  </Badge>
                )}
                {l.origen_iata && l.origen_iata === l.destino_iata && (
                  <Badge
                    variant="outline"
                    className="text-[10px] border-sky-500/40 text-sky-600 dark:text-sky-400"
                  >
                    Sobrevuelo
                  </Badge>
                )}
                {extra?.(idx, l)}
              </span>
            </div>
            {l.tipo_parada === "SERVICIO" && l.servicio_notas && (
              <p className="mt-1 text-xs text-sky-700 dark:text-sky-300">
                {l.servicio_notas}
              </p>
            )}
          </li>
        );
      })}
      <li className="pt-2 mt-1 border-t border-border flex items-center justify-between text-xs">
        <span className="font-semibold">Total</span>
        <span className="font-mono font-bold">
          {fmtDecimal(nmTotal)} NM · {legs.length}{" "}
          {legs.length === 1 ? "tramo" : "tramos"}
        </span>
      </li>
    </ol>
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

// ===== Secciones colapsables del cotizador (reorganización sep-2026) =====
// El colapso es por CSS (hidden), NUNCA por desmontar: los hijos conservan
// sus register() de RHF, los defaultValue no controlados (TuasAirportRow) y
// los ids ancla de los atajos scroll+focus.

type SeccionId =
  | "cliente"
  | "avion"
  | "tramos"
  | "cargos"
  | "cobro"
  | "externo"
  | "operativa"
  | "notas"
  | "detalle";

/** Overrides de plegado del operador (solo alta nueva), patrón data-table. */
const SECCIONES_LS_KEY = "vt-cotizador-plegado-v1";

/** Defaults deterministas por modo (sin leer storage: hidratación estable). */
function seccionesDefault(isRevise: boolean): Record<SeccionId, boolean> {
  return isRevise
    ? {
        // Página única (5-sep-2026): la cotización se abre en su formato
        // COMPLETO — todas las secciones abiertas en lectura y el mismo
        // acomodo al pasar a edición ("que no se revuelva todo"). El
        // plegado sigue disponible a mano y no se persiste en revise.
        cliente: true,
        avion: true,
        tramos: true,
        cargos: true,
        cobro: true,
        externo: true,
        operativa: false, // no se renderiza en revise
        notas: true,
        detalle: true,
      }
    : {
        cliente: true,
        avion: true,
        tramos: true,
        cargos: true,
        cobro: true,
        externo: false, // plegada: el resumen invita a prenderla
        operativa: false,
        notas: true,
        detalle: false,
      };
}

const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/**
 * "YYYY-MM-DDTHH:mm" (pared Cancún del datetime-local) → "12 sep 14:00".
 * PURO formateo de texto: jamás new Date() sobre el string crudo (regla de
 * fechas del workspace — el parseo local correría la hora).
 */
function fechaCortaDeInput(v: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v ?? "");
  if (!m) return null;
  const mes = MESES_CORTOS[Number(m[2]) - 1] ?? m[2];
  return `${Number(m[3])} ${mes} ${m[4]}:${m[5]}`;
}

/**
 * Card-sección colapsable del cotizador: encabezado clickeable (título +
 * resumen compacto cuando está plegada + badge ámbar de aviso + chevron),
 * accesible (button + aria-expanded). El cuerpo se esconde con hidden.
 */
function SeccionCotizador({
  id,
  titulo,
  resumen,
  aviso,
  abierta,
  onToggle,
  children,
}: {
  id: SeccionId;
  titulo: string;
  /** Resumen compacto del contenido; visible solo con la sección plegada. */
  resumen?: ReactNode;
  /** Aviso activo: badge ámbar SIEMPRE visible — un warning no se esconde. */
  aviso?: string | null;
  abierta: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Card className="border-t-2 border-t-brand-600/60">
      <button
        type="button"
        aria-expanded={abierta}
        aria-controls={`seccion-${id}`}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 text-left"
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <span className="flex flex-wrap items-center gap-2 font-heading text-base font-medium leading-snug">
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
          {!abierta && resumen && (
            <span className="block truncate text-xs text-muted-foreground">
              {resumen}
            </span>
          )}
        </div>
        <ChevronDownIcon
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            abierta && "rotate-180",
          )}
        />
      </button>
      {/* hidden (CSS), no render condicional: ver nota de arriba. */}
      <div id={`seccion-${id}`} hidden={!abierta} className="px-4">
        <div className="space-y-4">{children}</div>
      </div>
    </Card>
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
  avion,
  titulo,
  subtitulo,
  saveLabel,
  saveDisabled,
  saveIcon = "guardar",
  saveTitle,
  onSave,
  onCancel,
  cancelLabel = "Cancelar",
  cancelDisabled,
  totalFallback,
}: {
  breakdown: QuoteBreakdown | null;
  loading: boolean;
  error: string | null;
  sinDatos: boolean;
  /** «Cotizado en: Piper Seneca V» (modelo, nunca matrícula). */
  avion?: string | null;
  /** Cliente de la cotización (lado derecho de la barra). */
  titulo?: string | null;
  /** Folio · versión (o "Nueva cotización"). */
  subtitulo?: string | null;
  /** Botón primario de la barra (guardar/aplicar revisión), siempre a la
      vista con el total — el guardado real vive en el padre (handleSave). */
  saveLabel?: string;
  saveDisabled?: boolean;
  /** Icono del primario: «revisar» (lápiz) en lectura, «guardar» si no. */
  saveIcon?: "guardar" | "revisar";
  /** Tooltip del primario (razón del candado cuando está deshabilitado). */
  saveTitle?: string;
  onSave?: () => void;
  /** Botón secundario «Cancelar» (edición de la página única). */
  onCancel?: () => void;
  cancelLabel?: string;
  cancelDisabled?: boolean;
  /** Lectura sin snapshot: el total PERSISTIDO a pintar (nunca "Calculando…"). */
  totalFallback?: {
    usd: number;
    mxn: number | null;
    tarifaTipo?: string | null;
  } | null;
}) {
  // Desglose SIEMPRE visible bajo el total (27-ago; antes: chips solo en
  // ≥md): celdas compactas que PINTAN campos del breakdown canónico tal
  // cual — cero cálculos aquí. Las de $0 se omiten, salvo las estructurales
  // (Horas, Tarifa, Servicio aéreo, IVA) que anclan la lectura.
  const celdas: { label: string; value: string }[] = [];
  if (breakdown) {
    const t = breakdown.totales;
    celdas.push({
      label: "Horas",
      value: `${fmtDecimal(breakdown.tiempos.cobrable_hr)} hr`,
    });
    const origenTarifa = breakdown.tarifa.proviene_de_override
      ? "Override"
      : breakdown.tarifa.preferencial_cliente
        ? "Preferencial"
        : breakdown.tarifa.tipo === "BROKER"
          ? "Broker"
          : "Pública";
    celdas.push({
      label: `Tarifa · ${origenTarifa}`,
      value: `${fmtUsd(breakdown.tarifa.usd_por_hora)}/hr`,
    });
    celdas.push({
      label: "Servicio aéreo",
      value: fmtUsd(t.subtotal_vuelo_usd),
    });
    if (t.tuas_total_usd) {
      celdas.push({ label: "TUAS", value: fmtUsd(t.tuas_total_usd) });
    }
    if (t.viaticos_pernocta_usd) {
      celdas.push({
        label: "Pernocta",
        value: fmtUsd(t.viaticos_pernocta_usd),
      });
    }
    if (t.extras_total_usd) {
      celdas.push({ label: "Extras", value: fmtUsd(t.extras_total_usd) });
    }
    // La comisión del vendedor SÍ es parte del total (la paga el cliente)
    // pero viaja en meta, no en totales: sin esta celda el desglose no
    // sumaría el número grande de arriba.
    if (breakdown.meta?.comision_vendedor_usd) {
      celdas.push({
        label: "Comisión vendedor",
        value: fmtUsd(breakdown.meta.comision_vendedor_usd),
      });
    }
    if (t.ajuste_final_usd) {
      celdas.push({
        label: (t.ajuste_final_usd ?? 0) < 0 ? "Descuento" : "Redondeo",
        value: fmtUsd(t.ajuste_final_usd),
      });
    }
    celdas.push({ label: "IVA", value: fmtUsd(t.iva_usd) });
  }
  return (
    <div className="sticky top-0 z-30 -mx-1 px-1 pt-1">
      {/* Rojo VuelaTour sólido (pedido 28-ago): al hacer scroll la barra
          fija debe RESALTAR como el módulo activo del sidebar. */}
      <div className="rounded-xl border border-brand-500 bg-brand-600 text-white shadow-md px-4 py-2.5">
        <div
          className={cn(
            "flex flex-wrap items-baseline gap-2 transition-opacity",
            loading && "opacity-60",
          )}
        >
          {/* total_usd YA incluye IVA (las celdas de abajo lo desglosan):
              la etiqueta lo dice explícito — cambio de texto, no de dato. */}
          <span className="text-[11px] uppercase tracking-wider text-white/80">
            Total con IVA
          </span>
          {error ? (
            <span className="text-sm font-semibold text-white">
              Error al calcular
            </span>
          ) : sinDatos ? (
            <span className="text-sm text-white/85">
              Completa aeronave, ruta y pasajeros
            </span>
          ) : !breakdown ? (
            totalFallback ? (
              <>
                <span className="text-2xl font-bold tracking-tight font-mono tabular-nums">
                  {fmtUsd(totalFallback.usd)}
                </span>
                <span className="text-xs text-white/80">USD</span>
                {totalFallback.mxn != null && (
                  <span className="text-xs text-white/80 font-mono">
                    {fmtMxn(totalFallback.mxn)}
                  </span>
                )}
                {totalFallback.tarifaTipo && (
                  <Badge
                    variant="outline"
                    className="text-[10px] border-white/50 text-white"
                  >
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
              <Badge
                variant="outline"
                className="text-[10px] border-white/50 text-white"
              >
                {breakdown.tarifa.tipo}
              </Badge>
            </>
          )}
          {(titulo || subtitulo || avion || onSave || onCancel) && (
            <div className="ml-auto flex min-w-0 items-center gap-3">
              {(titulo || subtitulo || avion) && (
                <div className="min-w-0 text-right">
                  {titulo && (
                    <p className="truncate text-sm font-semibold leading-tight max-w-[280px]">
                      {titulo}
                    </p>
                  )}
                  {subtitulo && (
                    <p className="font-mono text-[11px] leading-tight text-white/80">
                      {subtitulo}
                    </p>
                  )}
                  {avion && !error && (
                    <p className="truncate text-[11px] leading-tight text-white/80 max-w-[280px]">
                      {avion}
                    </p>
                  )}
                </div>
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
              {/* Lectura con candado: la razón se LEE (no solo tooltip),
                  igual que en la barra del grupo. */}
              {onSave && saveIcon === "revisar" && saveDisabled && saveTitle && (
                <span className="max-w-[240px] text-right text-[11px] leading-tight text-white/85">
                  {saveTitle}
                </span>
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
                  {saveIcon === "revisar" ? (
                    <PencilSquareIcon className="h-4 w-4" />
                  ) : (
                    <BookmarkSquareIcon className="h-4 w-4" />
                  )}
                  {saveLabel}
                </Button>
              )}
            </div>
          )}
        </div>
        {breakdown && !error && (
          <div
            className={cn(
              "mt-1.5 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-white/25 pt-1.5 transition-opacity",
              loading && "opacity-60",
            )}
          >
            {celdas.map((c) => (
              <div key={c.label}>
                <p className="text-[11px] uppercase tracking-wider leading-tight text-white/75 whitespace-nowrap">
                  {c.label}
                </p>
                <p className="font-mono tabular-nums text-xs whitespace-nowrap">
                  {c.value}
                </p>
              </div>
            ))}
          </div>
        )}
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
  avion,
  tcUsdMxn,
  tiempoOverride,
  onTiempoOverride,
  readOnly = false,
}: {
  breakdown: QuoteBreakdown;
  loading: boolean;
  /** «Cotizado en: Piper Seneca V» — modelo cotizado, nunca matrícula. */
  avion?: string | null;
  /** TC capturado; solo para el display del total por moneda. */
  tcUsdMxn: number | null;
  /** COBRABLE pactado (hr) capturado en la card de Tiempos. */
  tiempoOverride: number | null;
  onTiempoOverride: (v: number | null) => void;
  /** Lectura (página única): el Cobrable se pinta como valor, sin input. */
  readOnly?: boolean;
}) {

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
      <Card className={cn("border-t-2 border-t-brand-600/60 transition-opacity", loading && "opacity-60")}>
        <CardContent className="p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total</p>
              <p className="text-4xl md:text-5xl font-bold tracking-tight">
                {fmtUsd(breakdown.totales.total_usd)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">USD</p>
              {/* Tipo de avión cotizado (feedback 4-sep): el MODELO, nunca
                  la matrícula — a veces se cotiza en un avión y la ruta
                  operativa va en otro. */}
              {avion && <p className="text-xs text-muted-foreground mt-1">{avion}</p>}
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
                    {/* Renglón cantidad × unitario: el motor ya derivó el
                        monto; aquí solo la leyenda. */}
                    {e.unitario != null && (
                      <span className="ml-1 font-mono text-[10px]">
                        · {textoCantidadUnitario(e, e.cantidad ?? null)}
                      </span>
                    )}
                    {e.aplica_iva === false && (
                      <span className="ml-1 text-[10px]">(sin IVA)</span>
                    )}
                    {e.origen === "GRUPO" && (
                      <span className="ml-1 rounded bg-fuchsia-500/15 px-1 text-[10px] text-fuchsia-700 dark:text-fuchsia-300">
                        grupo
                      </span>
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
            <div className="mt-3 rounded-lg border border-border bg-navy-800/50 px-3 py-2 text-sm">
              {mxnNativos > 0 ? (
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wider text-foreground/70">
                    Total por moneda
                  </p>
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
        <Card className="border-t-2 border-t-brand-600/60">
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
                <div className="flex items-center justify-between text-xs">
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
        <Card className="border-t-2 border-t-brand-600/60">
          <CardHeader>
            <CardTitle className="text-sm">Tiempos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {/* Vuelo y calzos SIEMPRE calculados (26-ago, corrige al 25-ago:
                lo pactable no es el componente, es la SUMA final). */}
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
            {/* COBRABLE editable: la suma final de horas. Vacío = la regla
                (vuelo + calzos + sobrevuelo, con mínimo de 1 hr); con valor
                = pactado a mano (decide si se redondea o no). El id es el
                ancla del acceso «¿pactar horas?» de la sección Tramos. */}
            <div
              id="cobrable-field"
              className="flex items-center justify-between gap-2 pt-1 border-t border-border scroll-mt-24"
            >
              <div>
                <p className="font-semibold">Cobrable</p>
                <p className="text-xs text-muted-foreground">
                  {breakdown.tiempos.cobrable_proviene_de_override
                    ? `pactado a mano · la regla daría ${fmtDecimal(breakdown.tiempos.cobrable_hr_regla ?? 0, 4)} hr`
                    : "vacío = regla (suma, mínimo 1 hr)"}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {readOnly ? (
                  <span className="font-mono font-semibold">
                    {fmtDecimal(breakdown.tiempos.cobrable_hr, 4)}
                  </span>
                ) : (
                  <Input
                    type="number"
                    step="0.1"
                    min={0}
                    max={48}
                    placeholder={fmtDecimal(
                      breakdown.tiempos.cobrable_hr_regla ??
                        breakdown.tiempos.cobrable_hr,
                      4,
                    )}
                    className="h-7 w-24 text-right font-mono font-semibold"
                    value={tiempoOverride ?? ""}
                    onChange={(e) =>
                      onTiempoOverride(
                        e.target.value === ""
                          ? null
                          : Math.max(0, Number(e.target.value)),
                      )
                    }
                  />
                )}
                <span className="text-xs text-muted-foreground">hr</span>
              </div>
            </div>
            {breakdown.tiempos.cobrable_proviene_de_override &&
              Number(breakdown.tiempos.cobrable_hr) <
                Number(breakdown.tiempos.vuelo_hr) +
                  Number(breakdown.tiempos.calzos_hr) +
                  Number(breakdown.tiempos.sobrevuelo_hr ?? 0) && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Ojo: el cobrable pactado es MENOR al tiempo real (vuelo +
                  calzos): se cobraría de menos.
                </p>
              )}
            {breakdown.tiempos.minimo_hora_aplicado && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Vuelo corto: se cobra la hora completa (mínimo 1 hr).
                {!readOnly &&
                  " Escribe otro valor en Cobrable si quieres pactarlo distinto."}
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
                  ? "Override manual"
                  : breakdown.tarifa.preferencial_cliente
                    ? "Preferencial del cliente"
                    : "Del avión"
              }
            />
            {breakdown.tarifa.preferencial_cliente && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-t-2 border-t-brand-600/60">
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
        <Card className="border-t-2 border-t-brand-600/60">
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
 * Card «TUAS por aeropuerto» (EDITABLE): vivía dentro del Preview y ahora se
 * renderiza en la sección «Cargos adicionales» — mismo contenido; las props
 * (tuas_lineas, setTuaLinea, cobrar_tuas, tc) ya se derivaban en el padre.
 */
function TuasCard({
  breakdown,
  tuasLineas,
  onTuaChange,
  cobrarTuas,
  onCobrarTuasChange,
  tcUsdMxn,
  onFocusTc,
  readOnly = false,
}: {
  breakdown: QuoteBreakdown;
  tuasLineas: TuaLinea[];
  onTuaChange: (iata: string, monto: number | null, moneda: "USD" | "MXN") => void;
  cobrarTuas: boolean;
  onCobrarTuasChange: (c: boolean) => void;
  tcUsdMxn: number | null;
  /** Abre la sección de Cobro antes del scroll+focus al campo de TC. */
  onFocusTc: () => void;
  /** Lectura (página única): sin switch ni inputs; montos como texto. */
  readOnly?: boolean;
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
  return (
      <Card className={cn("border-t-2 border-t-brand-600/60 transition-opacity", !cobrarTuas && "opacity-60")}>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm">TUAS por aeropuerto</CardTitle>
            {/* El switch vive AQUÍ, junto a donde se editan los montos. */}
            {readOnly ? (
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {cobrarTuas ? "Se cobra" : "No se cobra"}
              </Badge>
            ) : (
              <label className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                {cobrarTuas ? "Se cobra" : "No se cobra"}
                <Switch checked={cobrarTuas} onCheckedChange={onCobrarTuasChange} />
              </label>
            )}
          </div>
          <CardDescription className="text-xs">
            {breakdown.tuas.pasajeros}{" "}
            {breakdown.tuas.pasajeros === 1 ? "pasajero" : "pasajeros"} de
            referencia (cada tramo puede llevar el suyo). Regla aplicada
            por matrícula{" "}
            {breakdown.aeronave.matricula?.startsWith("XA")
              ? "XA"
              : breakdown.aeronave.matricula?.startsWith("XB")
                ? "XB"
                : "N"}
            .
            {!readOnly &&
              " Edita el monto por pasajero si el aeropuerto cobra distinto (USD o MXN); vacío = monto del catálogo."}
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
              onFocusTc={onFocusTc}
              readOnly={readOnly}
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
  onFocusTc,
  readOnly = false,
}: {
  air: TuasAeropuerto;
  fila?: TuasFila;
  linea?: TuaLinea;
  paxGlobal: number;
  disabled: boolean;
  tcCapturado: boolean;
  onChange: (iata: string, monto: number | null, moneda: "USD" | "MXN") => void;
  /** Abre la sección de Cobro antes del scroll+focus al campo de TC. */
  onFocusTc?: () => void;
  /** Lectura: el monto por pax se pinta como texto (capturado o catálogo). */
  readOnly?: boolean;
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
      {readOnly ? (
        <p className="text-xs text-muted-foreground">
          Por pasajero:{" "}
          <span className="font-mono text-foreground">
            {capturada
              ? moneda === "MXN"
                ? fmtMxn(linea!.monto_pax)
                : fmtUsd(linea!.monto_pax)
              : montoCatalogo > 0
                ? air.moneda === "MXN"
                  ? fmtMxn(montoCatalogo)
                  : fmtUsd(montoCatalogo)
                : "$0"}
          </span>{" "}
          {capturada ? "(monto capturado)" : "(catálogo)"} × {pax} pax
        </p>
      ) : (
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
      )}
      <p className="text-xs text-muted-foreground">{air.razon}</p>
      {/* Solo con línea CAPTURADA >0 en MXN: con puro select flipeado (sin
          monto) no viaja nada, y el campo de TC ni estaría montado. */}
      {!readOnly && capturada && linea!.monto_pax > 0 && moneda === "MXN" && !tcCapturado && editable && (
        <button
          type="button"
          onClick={onFocusTc ?? focusTcField}
          className="text-left text-xs font-medium text-amber-600 dark:text-amber-400 underline underline-offset-2"
        >
          Captura el TC en «Cobro y cierre» — sin tipo de cambio esta TUA en
          MXN no entra al total.
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
  options: {
    value: string;
    label: string;
    /** Dato sutil junto al label (ej. "$750/hr" en el selector de tarifa). */
    sub?: string;
    /** Opción no disponible en el contexto actual (ej. POR_HORA sin avión). */
    disabled?: boolean;
  }[];
}) {
  return (
    <div className="inline-flex w-full rounded-lg border border-border bg-navy-800/50 p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            type="button"
            key={opt.value}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 h-8 px-3 text-xs font-medium rounded-md transition-colors",
              active
                ? "bg-navy-700 text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              opt.disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            {opt.label}
            {opt.sub && (
              <span
                className={cn(
                  "ml-1 font-mono text-[10px] font-normal tabular-nums",
                  // En el activo apenas más visible; en el resto, muted.
                  active ? "text-foreground/70" : "text-muted-foreground",
                )}
              >
                {opt.sub}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

