"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { toastMesCerradoSiAplica } from "@/components/admin/aviso-mes-cerrado";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { cancunInputToIso, fmtDateOnly, todayCancun } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { fmtMxn, fmtTc, fmtUsd } from "@/lib/format";
import {
  CUENTAS_COBRO,
  CUENTAS_COBRO_VALUES,
  monedaDeCuenta,
  montoSugeridoMxn,
  textoRegistroCobro,
} from "@/lib/admin/cobros";
import {
  cambiosDeCobro,
  datosSoloLecturaCobro,
  descripcionConfirmarEdicion,
  descripcionFichaEdicion,
  edicionDeCobro,
  erroresEdicionCobro,
  formularioDesdeCobro,
  hintCuentaLegada,
  hintTcEdicion,
  mensajeErrorEdicionCobro,
  NOTA_RECALCULO_COBRO,
  resumenCambiosCobro,
  TEXTO_COBRO_CORREGIDO,
  TEXTO_SIN_CAMBIOS_COBRO,
  TITULO_CONFIRMAR_EDICION,
  TITULO_SOLO_LECTURA_COBRO,
  tituloFichaEdicion,
  type CambiosCobro,
  type InicialEdicionCobro,
  type ValoresEdicionCobro,
} from "@/lib/admin/cobro-edicion";
import {
  CLASE_CAJA_VISTA_PREVIA,
  CLASE_TEXTO_VISTA_PREVIA,
  vistaPreviaMontoCobro,
} from "@/lib/admin/cobrado-de-mas";
import {
  AYUDA_SELECTOR_FACTURA_COBRO,
  facturaPreseleccionada,
  opcionesFacturaDeCobro,
  textoCobroRegistradoConFactura,
} from "@/lib/admin/cobro-factura";
import { puedeRegistrarFactura } from "@/lib/admin/facturas-emitidas";
import {
  registerCobroAction,
  registrarCobroUtilidadesAction,
  sociosParaCobroUtilidadesAction,
  updateCobroAction,
} from "@/app/admin/flights/actions";
import {
  cuentaSugeridaPorMetodo,
  METODOS_CON_CUENTA,
  METODOS_PAGO,
  PAYWISE_COMISION_PCT_DEFAULT,
} from "@/lib/admin/metodos-pago";
import {
  CARGA_SOCIOS_SIN_CARGAR,
  METODO_UTILIDADES_SOCIO,
  NOTA_COBRO_CON_UTILIDADES,
  TEXTO_COBRO_UTILIDADES_YA_REGISTRADO,
  TEXTO_FALLO_RED_COBRO_UTILIDADES,
  TEXTO_FALLO_RED_SOCIOS,
  avionPorDefecto,
  ayudaFechaUtilidades,
  ayudaTcUtilidades,
  cargaSociosDeRespuesta,
  confirmacionAdelantoCobro,
  esCobroConUtilidades,
  fechaPorDefectoUtilidades,
  monedaPorDefectoUtilidades,
  ofreceCobroConUtilidades,
  opcionesMetodoCobro,
  pasoTrasCobroUtilidades,
  payloadCobroUtilidades,
  socioDe,
  socioPreseleccionado,
  textoCobroUtilidadesRegistrado,
  textoSaldoUtilidades,
  validarCobroUtilidades,
  type CargaSociosCobro,
  type ContextoCobroUtilidades,
  type ErroresCobroUtilidades,
} from "@/lib/admin/cobro-utilidades";
import type { MetodoPago } from "@/types/quote";
import type { CobroUtilidadesPayload, FlightCobro } from "@/types/flights";
import type { FacturaEmitidaMini } from "@/types/facturas-emitidas";
import { Field } from "@/components/admin/form-field";
import { AvisoCapturaAntesDelInicio } from "@/components/admin/aviso-captura-inicio";
import { CamposUtilidadesSocio } from "./cobro-utilidades-campos";

type Moneda = "USD" | "MXN";

// Métodos de pago: FUENTE ÚNICA `lib/admin/metodos-pago.ts` (misma lista y
// etiquetas que el cotizador, el grupo y los reembolsos; METODOS_CON_CUENTA
// decide cuándo se pregunta a qué cuenta llegó). OTRO = método manual: se
// describe en la referencia/notas.
const METODO_VALUES = METODOS_PAGO.map((m) => m.value) as [MetodoPago, ...MetodoPago[]];

const CobroFormSchema = z
  .object({
    monto: z.coerce.number().positive("Monto debe ser > 0"),
    moneda: z.enum(["USD", "MXN"]),
    metodo_cobro: z.enum(METODO_VALUES),
    tc_usd_mxn: z
      .union([z.coerce.number(), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : Number(v))),
    // % que retiene el banco (terminal/transferencia): el banco deposita
    // monto − comisión; sin esto el reporte no cuadra con el estado de cuenta.
    comision_banco_pct: z
      .union([
        z.coerce
          .number()
          .min(0, "No puede ser negativa")
          .max(20, "Máximo 20%"),
        z.literal(""),
      ])
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : Number(v))),
    // Alternativa por MONTO directo (el estado de cuenta trae pesos, no %):
    // si se llena, manda sobre el % y el % se deriva como referencia.
    comision_banco_monto: z
      .union([z.coerce.number().min(0, "No puede ser negativa"), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : Number(v))),
    referencia: z.string().max(100).optional().or(z.literal("")),
    // Catálogo FIJO de cuentas (el API valida con @IsIn); "" = sin dato.
    cuenta_destino: z.enum(CUENTAS_COBRO_VALUES).optional().or(z.literal("")),
    fecha_cobro: z.string().optional().or(z.literal("")),
    notas: z.string().max(1000).optional().or(z.literal("")),
    // CORREGIR un cobro (26-sep-2026): en edición las reglas del T.C. y del
    // dinero dependen del TIPO de cobro (reembolso, conciliado, anticipo) y
    // las decide `erroresEdicionCobro` (lib/admin/cobro-edicion). Campo
    // oculto: nunca viaja al API.
    modo_edicion: z.boolean().optional(),
    // FACTURAS POR COBRO (16-oct-2026, API 0.0.82): la factura emitida que
    // AMPARA este cobro ("" = sin factura todavía). Solo viaja si el selector
    // se pintó (`asignacion_disponible` del bloque); es clasificación, no
    // dinero.
    factura_emitida_id: z.string().uuid().optional().or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    if (val.modo_edicion) return;
    if (val.moneda === "MXN" && (!val.tc_usd_mxn || val.tc_usd_mxn <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tc_usd_mxn"],
        message: "TC requerido para cobros en MXN (para conciliar con total USD)",
      });
    }
  });

type CobroFormValues = z.input<typeof CobroFormSchema>;

/**
 * Prellenado externo del formulario (p. ej. «Registrar cobro» desde un abono
 * de Paywise sin cobro en la auditoría): solo lo que viene se pisa sobre los
 * defaults. `fecha_cobro` en YYYY-MM-DD.
 */
export interface CobroPrefill {
  monto?: number;
  moneda?: Moneda;
  metodo_cobro?: MetodoPago;
  tc_usd_mxn?: number;
  comision_banco_pct?: number;
  comision_banco_monto?: number;
  referencia?: string;
  cuenta_destino?: CobroFormValues["cuenta_destino"];
  fecha_cobro?: string;
  notas?: string;
}

interface CobroFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flightId: string;
  flightFolio: number;
  /** Total USD de la cotización. */
  montoTotalUsd: number;
  /** Pendiente USD a cobrar (auto-prefills el monto). */
  pendingUsd: number;
  /** Vuelo CANCELADO: se registra lo que el cliente pagó y NO se reembolsa
      (anticipo retenido / cargo por cancelación). Sin prefill de monto ni
      noción de "pendiente"; entra íntegro al balance del avión. */
  cancelado?: boolean;
  /** TC USD→MXN con el que se cotizó (null si la cotización no lo fijó).
      Manda como sugerencia al cobrar en MXN. */
  tcCotizacion?: number | null;
  /**
   * `vuelo.monto_total_mxn`: el total en pesos EXACTO que el cliente vio en
   * su cotización (lo compuso el motor con los renglones capturados en pesos
   * tal cual). FUENTE ÚNICA del «Total MXN» de esta ficha: multiplicar
   * `usd × tc` por nuestra cuenta daba $99,999.81 donde la hoja decía
   * $100,000.00 (vuelo #314, 17-sep-2026). null = el API no lo trae (vuelo
   * sin pesos pactados o respuesta previa al deploy): entonces sí se estima.
   */
  montoTotalMxn?: number | null;
  /**
   * ¿El vuelo YA tiene cobros registrados? Decide el monto que se sugiere al
   * pasar a MXN: sin cobros, los pesos completos de la cotización; con
   * cobros, el pendiente convertido con el TC.
   */
  tieneCobros?: boolean;
  /** TC oficial de referencia (open.er-api / BCE) del DÍA DE LA COTIZACIÓN:
      respaldo cuando la cotización no fijó TC. null si el API no tiene dato. */
  tcOficial?: number | null;
  /** Día (YYYY-MM-DD) al que corresponde `tcOficial` (para decirlo en la UI). */
  tcOficialFecha?: string | null;
  /** Comisión (%) sugerida al elegir Paywise (config `paywise_comision_pct`;
      default 8.857). Editable; el API aplica la misma si no viaja ninguna. */
  paywiseComisionPct?: number;
  /** Prellenado de campos (ver `CobroPrefill`). Se aplica al abrir. */
  prefill?: CobroPrefill | null;
  /**
   * MODO EDICIÓN (26-sep-2026, «Corregir cobro»): el cobro YA registrado que
   * se corrige. El MISMO formulario, prellenado con el cobro; al guardar
   * confirma el antes → después y manda SOLO lo que cambió
   * (`PATCH /v1/flights/cobros/:id`). Lo que el tipo de cobro no permite
   * tocar (reembolso, conciliado, anticipo) va de solo lectura con la
   * explicación. Reglas: `lib/admin/cobro-edicion.ts`.
   */
  cobroEditar?: FlightCobro | null;
  /**
   * CORREGIR (14-oct-2026, API 0.0.78, D21): el `monto_usd` del cobro que se
   * corrige (snapshot; null/ausente = API previo o pesos sin T.C.) y el saldo
   * del vuelo SIN topar (monto total − cobrado, números del API). Con los
   * dos, la ficha dice si con el cambio el vuelo quedará cobrado de más,
   * cubierto o con pendiente; sin ellos, «El saldo del vuelo se recalcula al
   * guardar», como siempre.
   */
  montoUsdOriginal?: number | null;
  saldoUsd?: number | null;
  /** Cotización ABIERTA (el precio se cierra al final del viaje): nunca dice «cobrado de más». */
  cotizacionAbierta?: boolean;
  /** Tras registrar (o corregir) con éxito (además del router.refresh() propio). */
  onRegistrado?: () => void;
  /**
   * FACTURAS POR COBRO (16-oct-2026, API 0.0.82, invariante 84 del API):
   * facturas VIGENTES del vuelo (`factura_servicio.facturas`) y si el API
   * puede asignar (`factura_servicio.asignacion_disponible`). El selector
   * «Factura» se pinta SOLO con las dos cosas, con ≥ 1 vigente, en un cobro
   * que no es reembolso y para ADMIN/FACTURACION (`rol`): sin selector, la
   * llave `factura_emitida_id` jamás viaja (un API ≤ 0.0.81 respondería 400).
   */
  facturasVigentes?: ReadonlyArray<FacturaEmitidaMini> | null;
  asignacionFactura?: boolean;
  rol?: string | null;
  /** «Asignar factura» desde el chip del cobro: abre con el foco en el selector. */
  enfocarFactura?: boolean;
  /**
   * COBRO CON UTILIDADES DEL SOCIO (23-nov-2026, API 0.0.148): SOLO la página
   * del vuelo lo pasa. Con él (en el alta, para DIRECCION/FACTURACION y en un
   * vuelo no cancelado) el selector de método gana la opción «Utilidades del
   * socio»: el socio paga su vuelo con sus utilidades — no entra dinero —.
   * Es una opción de la PANTALLA, no un método: el cobro se registra con
   * `registrarCobroUtilidadesAction`, que crea también la entrega al socio.
   * Sin la prop (cotización, auditoría de Paywise) la ficha es la de siempre.
   * Reglas y textos: `lib/admin/cobro-utilidades.ts`.
   */
  utilidadesSocio?: ContextoCobroUtilidades | null;
}

type TcSugerido = { valor: number; fuente: "cotizacion" | "oficial" };

/** uuid v4 de la llave de idempotencia (respaldo si el navegador no expone randomUUID). */
function nuevoIdSolicitud(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  c?.getRandomValues?.(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function todayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function defaults(pendingUsd: number, prefill?: CobroPrefill | null): CobroFormValues {
  // Prefill útil: si hay pendiente, sugiere ese monto en USD.
  const base: CobroFormValues = {
    monto: pendingUsd > 0 ? Number(pendingUsd.toFixed(2)) : 0,
    moneda: "USD",
    metodo_cobro: "TRANSFERENCIA",
    tc_usd_mxn: undefined,
    comision_banco_pct: undefined,
    comision_banco_monto: undefined,
    referencia: "",
    cuenta_destino: "",
    fecha_cobro: todayLocal(),
    notas: "",
    modo_edicion: false,
    factura_emitida_id: "",
  };
  if (!prefill) return base;
  return {
    ...base,
    ...(prefill.monto != null && prefill.monto > 0
      ? { monto: Number(prefill.monto.toFixed(2)) }
      : {}),
    ...(prefill.moneda ? { moneda: prefill.moneda } : {}),
    ...(prefill.metodo_cobro ? { metodo_cobro: prefill.metodo_cobro } : {}),
    ...(prefill.tc_usd_mxn != null && prefill.tc_usd_mxn > 0
      ? { tc_usd_mxn: prefill.tc_usd_mxn }
      : {}),
    ...(prefill.comision_banco_pct != null && prefill.comision_banco_pct > 0
      ? { comision_banco_pct: prefill.comision_banco_pct }
      : {}),
    ...(prefill.comision_banco_monto != null && prefill.comision_banco_monto > 0
      ? { comision_banco_monto: Number(prefill.comision_banco_monto.toFixed(2)) }
      : {}),
    ...(prefill.referencia ? { referencia: prefill.referencia.slice(0, 100) } : {}),
    ...(prefill.cuenta_destino ? { cuenta_destino: prefill.cuenta_destino } : {}),
    ...(prefill.fecha_cobro ? { fecha_cobro: prefill.fecha_cobro.slice(0, 10) } : {}),
    ...(prefill.notas ? { notas: prefill.notas.slice(0, 1000) } : {}),
  };
}

/** Valores del formulario en EDICIÓN: el cobro tal como está guardado. */
function defaultsEdicion(inicial: InicialEdicionCobro, facturaId = ""): CobroFormValues {
  const v = inicial.valores;
  return {
    monto: v.monto,
    moneda: v.moneda,
    metodo_cobro: v.metodo_cobro,
    tc_usd_mxn: v.tc_usd_mxn,
    comision_banco_pct: v.comision_banco_pct,
    comision_banco_monto: v.comision_banco_monto,
    referencia: v.referencia,
    cuenta_destino: v.cuenta_destino,
    fecha_cobro: v.fecha_cobro,
    notas: v.notas,
    modo_edicion: true,
    factura_emitida_id: facturaId,
  };
}

/**
 * Lo que el diff de la edición necesita del formulario (sin el modo). La
 * factura entra SOLO si el selector se pintó: sin él, `undefined` y el campo
 * no existe para el diff.
 */
function valoresParaEdicion(values: CobroFormValues, conFactura: boolean): ValoresEdicionCobro {
  return {
    monto: values.monto,
    moneda: values.moneda,
    metodo_cobro: values.metodo_cobro,
    tc_usd_mxn: values.tc_usd_mxn,
    comision_banco_pct: values.comision_banco_pct,
    comision_banco_monto: values.comision_banco_monto,
    referencia: values.referencia,
    cuenta_destino: values.cuenta_destino,
    fecha_cobro: values.fecha_cobro,
    notas: values.notas,
    ...(conFactura ? { factura_emitida_id: values.factura_emitida_id ?? "" } : {}),
  };
}

export function CobroFormSheet({
  open,
  onOpenChange,
  flightId,
  flightFolio,
  montoTotalUsd,
  pendingUsd,
  cancelado = false,
  tcCotizacion = null,
  montoTotalMxn = null,
  tieneCobros = false,
  tcOficial = null,
  tcOficialFecha = null,
  paywiseComisionPct = PAYWISE_COMISION_PCT_DEFAULT,
  prefill = null,
  cobroEditar = null,
  montoUsdOriginal = null,
  saldoUsd = null,
  cotizacionAbierta = false,
  onRegistrado,
  facturasVigentes = null,
  asignacionFactura = false,
  rol = null,
  enfocarFactura = false,
  utilidadesSocio = null,
}: CobroFormSheetProps) {
  const diaTcOficial = tcOficialFecha ? fmtDateOnly(tcOficialFecha) : null;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const idSelectorFactura = useId();
  // ---- Modo EDICIÓN («Corregir cobro», 26-sep-2026) ----
  const enEdicion = cobroEditar != null;
  // ---- COBRO CON UTILIDADES DEL SOCIO (23-nov-2026, API 0.0.148) ----
  // La opción solo existe en el ALTA, en la página del vuelo (quien pasa
  // `utilidadesSocio`), para DIRECCION/FACTURACION y en un vuelo no cancelado.
  const ofrecerUtilidades = ofreceCobroConUtilidades({
    contexto: utilidadesSocio,
    rol,
    enEdicion,
    cancelado,
  });
  // ¿Está elegida «Utilidades del socio» en el selector? (valor de PANTALLA:
  // el método del formulario sigue siendo uno real y jamás viaja en este modo).
  const [conUtilidades, setConUtilidades] = useState(false);
  const modoUtilidades = ofrecerUtilidades && conUtilidades;
  // Los socios se piden al ELEGIR la opción (no al abrir la ficha).
  const [cargaSocios, setCargaSocios] = useState<CargaSociosCobro>(CARGA_SOCIOS_SIN_CARGAR);
  const turnoCargaSocios = useRef(0);
  const [socioId, setSocioId] = useState("");
  const [avionId, setAvionId] = useState("");
  const [erroresUtilidades, setErroresUtilidades] = useState<ErroresCobroUtilidades>({});
  // 409 PAGO_EXCEDE_SALDO ⇒ confirmación del ADELANTO. Se guarda el cuerpo
  // que rebotó: «Registrar como adelanto» reenvía ESE mismo cuerpo con
  // `aceptar_exceso` y la MISMA llave.
  const [adelanto, setAdelanto] = useState<{
    details: unknown;
    payload: CobroUtilidadesPayload;
    fecha: string;
    socioNombre: string;
  } | null>(null);
  // Idempotencia: UNA llave por apertura de la ficha (se renueva al abrir).
  const [solicitudId, setSolicitudId] = useState("");
  // La fecha con la que abrió la ficha (hoy) y la que sugirió este modo (la
  // del vuelo): la sugerencia nunca pisa una fecha tecleada a mano.
  const [fechaBase, setFechaBase] = useState("");
  const [fechaSugerida, setFechaSugerida] = useState<string | null>(null);
  // ---- FACTURAS POR COBRO (16-oct-2026, API 0.0.82) ----
  // El selector «Factura» SOLO cuando el API puede asignar, el vuelo tiene
  // vigentes, el cobro no es reembolso y quien mira puede registrar facturas
  // (ADMIN/FACTURACION: a los demás el API les descarta el campo). Sin
  // selector, la llave NO viaja ni en el alta ni en el diff.
  const vigentes = useMemo(() => facturasVigentes ?? [], [facturasVigentes]);
  const mostrarSelectorFactura =
    asignacionFactura &&
    vigentes.length > 0 &&
    !(cobroEditar != null && Number(cobroEditar.monto) < 0) &&
    puedeRegistrarFactura(rol);
  // En edición, la factura del cobro entra como opción aunque no sea de este
  // vuelo (liga que quedó en el original tras reasignar avión): el selector
  // debe mostrar lo que el cobro tiene puesto.
  const facturaActual = cobroEditar?.factura_emitida ?? null;
  const opcionesFactura = useMemo(
    () => opcionesFacturaDeCobro(vigentes, facturaActual),
    [vigentes, facturaActual],
  );
  const edicion = useMemo(
    () => (cobroEditar ? edicionDeCobro(cobroEditar) : null),
    [cobroEditar],
  );
  const inicial = useMemo(
    () => (cobroEditar ? formularioDesdeCobro(cobroEditar) : null),
    [cobroEditar],
  );
  const dineroBloqueado = edicion?.dineroBloqueado === true;
  const tcBloqueado = edicion?.tcBloqueado === true;
  // Cambios a confirmar (antes → después); null = sin diálogo.
  const [confirmacion, setConfirmacion] = useState<CambiosCobro | null>(null);
  // Último rechazo del API: se queda a la vista hasta volver a intentar.
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  // Qué TC se prellenó (para el hint); se apaga si el usuario lo edita.
  const [tcPrefill, setTcPrefill] = useState<TcSugerido | null>(null);
  // Último monto SUGERIDO por la hoja (USD al abrir, pesos al pasar a MXN):
  // solo se pisa el importe mientras siga siendo esa sugerencia — un monto
  // tecleado a mano nunca se toca.
  const [montoSugerido, setMontoSugerido] = useState<number | null>(null);
  // Comisión % SUGERIDA por el método (Paywise): se recuerda para retirarla
  // al cambiar de método solo si sigue siendo la sugerida (nunca pisa una
  // comisión tecleada a mano).
  const [comisionSugerida, setComisionSugerida] = useState<number | null>(null);
  // En cancelado NO se sugiere el pendiente: el importe retenido lo decide la
  // oficina (anticipo, % de cancelación…), así que se teclea siempre.
  const montoPrefill = cancelado ? 0 : pendingUsd;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    setError,
    formState: { errors },
  } = useForm<CobroFormValues>({
    resolver: zodResolver(CobroFormSchema),
    defaultValues: inicial
      ? defaultsEdicion(inicial, facturaPreseleccionada(vigentes, "edicion", cobroEditar))
      : defaults(montoPrefill, prefill),
  });

  useEffect(() => {
    if (open && !inicial) {
      const base = defaults(montoPrefill, prefill);
      // Alta: UNA vigente CON cupo ⇒ preseleccionada; completa o 2+ ⇒ vacío.
      // Se decide al ABRIR (no al cambiar las vigentes a media captura).
      reset({
        ...base,
        factura_emitida_id: mostrarSelectorFactura ? facturaPreseleccionada(vigentes, "alta") : "",
      });
      setTcPrefill(null);
      setComisionSugerida(null);
      // Con un prefill explícito de monto (p. ej. el abono de Paywise) NO hay
      // sugerencia que pisar: ese importe es el dato bueno.
      setMontoSugerido(
        prefill?.monto != null && prefill.monto > 0 ? null : (base.monto as number),
      );
      // «Utilidades del socio»: cada apertura empieza de cero — la opción sin
      // elegir, los socios sin cargar (sus saldos cambian con cada cobro) y
      // una llave de idempotencia NUEVA. Una respuesta tardía de la carga
      // anterior se descarta (turno).
      turnoCargaSocios.current += 1;
      setConUtilidades(false);
      setCargaSocios(CARGA_SOCIOS_SIN_CARGAR);
      setSocioId("");
      setAvionId("");
      setErroresUtilidades({});
      setAdelanto(null);
      setErrorGuardado(null);
      setSolicitudId(nuevoIdSolicitud());
      setFechaBase(String(base.fecha_cobro ?? ""));
      setFechaSugerida(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la preselección de la factura se fija al abrir
  }, [open, montoPrefill, prefill, reset, inicial]);

  // EDICIÓN: el cobro tal como está guardado; nada se sugiere encima. Efecto
  // aparte a propósito: solo depende de abrir y de QUÉ cobro se corrige — un
  // `router.refresh()` que cambie el pendiente de la página (p. ej. al volver
  // a la pestaña) no puede borrar una corrección a medio capturar.
  useEffect(() => {
    if (open && inicial) {
      reset(defaultsEdicion(inicial, facturaPreseleccionada(vigentes, "edicion", cobroEditar)));
      setTcPrefill(null);
      setComisionSugerida(null);
      setMontoSugerido(null);
      setConfirmacion(null);
      setErrorGuardado(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la factura actual se lee del cobro que se corrige
  }, [open, inicial, reset]);

  // «Asignar factura» desde el chip del cobro: el foco va al selector.
  useEffect(() => {
    if (!open || !enfocarFactura || !mostrarSelectorFactura) return;
    const t = window.setTimeout(() => {
      document.getElementById(idSelectorFactura)?.focus();
    }, 50);
    return () => window.clearTimeout(t);
  }, [open, enfocarFactura, mostrarSelectorFactura, idSelectorFactura]);

  const moneda = watch("moneda");
  const metodo = watch("metodo_cobro");
  const monto = watch("monto");
  const tc = watch("tc_usd_mxn");
  const comisionPct = watch("comision_banco_pct");
  const comisionMontoDirecto = watch("comision_banco_monto");
  const cuentaDestino = watch("cuenta_destino");
  const facturaElegida = watch("factura_emitida_id") ?? "";
  const fechaCobro = watch("fecha_cobro");

  // TC sugerido al cobrar en MXN: el de la cotización manda (es el que el
  // cliente vio); si la cotización no lo fijó, el oficial de referencia del día.
  const tcSugerido: TcSugerido | null =
    tcCotizacion != null && tcCotizacion > 0
      ? { valor: tcCotizacion, fuente: "cotizacion" }
      : tcOficial != null && tcOficial > 0
        ? { valor: tcOficial, fuente: "oficial" }
        : null;

  /** Monto sugerido al cobrar en pesos (regla ÚNICA en `lib/admin/cobros`). */
  const montoMxnSugerido = (tc: number): number | null =>
    montoSugeridoMxn({ montoTotalMxn, pendienteUsd: pendingUsd, tc, tieneCobros, cancelado });

  /** Solo se pisa el importe mientras siga siendo el que sugerimos nosotros. */
  const montoEsSugerido = () => {
    const actual = Number(getValues("monto"));
    return !(actual > 0) || (montoSugerido != null && actual === montoSugerido);
  };

  const aplicarSugerenciaMonto = (n: number | null) => {
    // Al CORREGIR un cobro el importe es el que se capturó: jamás se sugiere
    // otro (el pendiente ya descuenta a este mismo cobro).
    if (enEdicion) return;
    if (n == null || !montoEsSugerido()) return;
    setValue("monto", n, { shouldValidate: true });
    setMontoSugerido(n);
  };

  /**
   * Prellena el T.C. con el sugerido (cotización u oficial) SOLO si está
   * vacío — nunca pisa uno tecleado — y devuelve el que queda vigente.
   */
  const prellenarTcSiFalta = (): number => {
    const actual = getValues("tc_usd_mxn");
    const yaTecleado = actual !== undefined && actual !== "" && Number(actual) > 0;
    if (!yaTecleado && tcSugerido) {
      setValue("tc_usd_mxn", tcSugerido.valor, { shouldValidate: true });
      setTcPrefill(tcSugerido);
    }
    return yaTecleado ? Number(actual) : (tcSugerido?.valor ?? 0);
  };

  // ÚNICO camino para cambiar la moneda: al pasar a MXN con el TC vacío,
  // se prellena con el sugerido (editable). Nunca pisa un TC ya tecleado.
  // Al salir de MXN el input del TC se desmonta pero RHF CONSERVA el valor:
  // se limpia SOLO si sigue siendo el prellenado (para que al volver a MXN
  // se vuelva a sugerir con su hint). Un TC tecleado a mano se conserva
  // oculto — nunca viaja en USD por el guard de onSubmit — y reaparece al
  // regresar a MXN: cambiar de moneda por error no borra lo capturado.
  // El MONTO viaja con la moneda por el mismo camino y con la misma regla:
  // al pasar a MXN se sugiere en pesos y al volver a USD se restaura el
  // pendiente, siempre que el operador no lo haya tecleado.
  //
  // `utilidades` («Utilidades del socio», API 0.0.148): ahí el T.C. es
  // OBLIGATORIO EN LAS DOS MONEDAS (la cuenta del socio es en pesos), así que
  // al pasar a dólares NO se limpia y, si falta, se prellena igual. Se pasa
  // explícito cuando el modo cambia en el mismo clic (el estado aún no llega).
  const handleMonedaChange = (v: Moneda, utilidades: boolean = modoUtilidades) => {
    setValue("moneda", v);
    if (v !== "MXN") {
      if (utilidades) {
        prellenarTcSiFalta();
      } else {
        const actual = getValues("tc_usd_mxn");
        if (tcPrefill && Number(actual) === tcPrefill.valor) {
          setValue("tc_usd_mxn", "");
        }
        setTcPrefill(null);
      }
      // De vuelta a dólares: el importe vuelve a ser el pendiente en USD.
      if (!cancelado && pendingUsd > 0) {
        aplicarSugerenciaMonto(Number(pendingUsd.toFixed(2)));
      }
      return;
    }
    aplicarSugerenciaMonto(montoMxnSugerido(prellenarTcSiFalta()));
  };

  // Si cambia el método, auto-sugiere moneda compatible (DOLARES→USD,
  // EFECTIVO/PAYWISE→MXN). PAYWISE (9-sep-2026) además sugiere la cuenta
  // Paywise y la comisión de la pasarela (editable; el estado de cuenta de
  // Paywise la sustituye por la real al conciliar).
  const handleMetodoChange = (v: string) => {
    const m = v as MetodoPago;
    setValue("metodo_cobro", m);
    // La cuenta destino solo aplica a métodos bancarios: al salir de ellos se
    // limpia para no mandar una cuenta oculta en un cobro en efectivo.
    if (!METODOS_CON_CUENTA.includes(m)) setValue("cuenta_destino", "");
    const cuentaSugerida = cuentaSugeridaPorMetodo(m);
    if (cuentaSugerida && !getValues("cuenta_destino")) {
      setValue("cuenta_destino", cuentaSugerida, { shouldValidate: true });
    }
    if (m === "PAYWISE") {
      const pctActual = Number(getValues("comision_banco_pct"));
      const montoActual = Number(getValues("comision_banco_monto"));
      if (!(pctActual > 0) && !(montoActual > 0) && paywiseComisionPct > 0) {
        setValue("comision_banco_pct", paywiseComisionPct, { shouldValidate: true });
        setComisionSugerida(paywiseComisionPct);
      }
    } else if (comisionSugerida != null) {
      // Solo se retira la comisión si sigue siendo la sugerida de Paywise.
      if (Number(getValues("comision_banco_pct")) === comisionSugerida) {
        setValue("comision_banco_pct", "");
      }
      setComisionSugerida(null);
    }
    // Un método REAL nunca es el modo «Utilidades del socio»: se dice
    // explícito (al salir de ese modo el estado todavía no se actualiza).
    if (m === "DOLARES") handleMonedaChange("USD", false);
    else if (m === "EFECTIVO" || m === "PAYWISE") handleMonedaChange("MXN", false);
  };

  // ════════════ «Utilidades del socio» (23-nov-2026, API 0.0.148) ════════════

  /** Pide los socios (con sus aviones y saldos) y propone socio y avión. */
  const cargarSocios = () => {
    const turno = ++turnoCargaSocios.current;
    setCargaSocios({ estado: "cargando" });
    void sociosParaCobroUtilidadesAction()
      .catch(() => ({ ok: false as const, error: TEXTO_FALLO_RED_SOCIOS }))
      .then((res) => {
        // La ficha se cerró o se volvió a pedir: esta respuesta ya no cuenta.
        if (turno !== turnoCargaSocios.current) return;
        const carga = cargaSociosDeRespuesta(res);
        setCargaSocios(carga);
        if (carga.estado !== "ok") return;
        // Si el cliente del vuelo ES un socio, se preselecciona (y su avión).
        const propuesto = socioPreseleccionado(carga.socios, utilidadesSocio?.clienteNombre);
        setSocioId(propuesto);
        setAvionId(avionPorDefecto(socioDe(carga.socios, propuesto), utilidadesSocio?.aeronaveId));
      });
  };

  /** Se eligió «Utilidades del socio» en el selector de método. */
  const elegirUtilidades = () => {
    // El formulario queda como un cobro sin banco (sin cuenta ni comisión
    // sugerida de otro método). OTRO es el método interno con el que el API
    // guarda este cobro; aquí NO viaja: el cuerpo ni siquiera lleva método.
    handleMetodoChange("OTRO");
    setConUtilidades(true);
    setErroresUtilidades({});
    setErrorGuardado(null);
    // Moneda: pesos si el vuelo tiene total en pesos (la cuenta del socio es
    // en pesos); si no, dólares. El monto y el T.C. los pone la regla de
    // siempre (lo pendiente; T.C. de la cotización o el oficial).
    handleMonedaChange(monedaPorDefectoUtilidades(montoTotalMxn), true);
    // Fecha: la del VUELO (de su mes se descuentan las utilidades), salvo que
    // el operador ya haya tecleado otra.
    const actual = String(getValues("fecha_cobro") ?? "");
    if (actual === "" || actual === fechaBase) {
      const sugerida = fechaPorDefectoUtilidades(utilidadesSocio?.fechaVuelo, todayCancun());
      setValue("fecha_cobro", sugerida, { shouldValidate: true });
      setFechaSugerida(sugerida);
    }
    if (cargaSocios.estado !== "ok" && cargaSocios.estado !== "cargando") cargarSocios();
  };

  /** Se eligió un método REAL estando en «Utilidades del socio». */
  const salirDeUtilidades = () => {
    setConUtilidades(false);
    setErroresUtilidades({});
    setErrorGuardado(null);
    // La fecha vuelve a la de siempre si seguía siendo la sugerida (la del vuelo).
    if (fechaSugerida != null && getValues("fecha_cobro") === fechaSugerida) {
      setValue("fecha_cobro", fechaBase, { shouldValidate: true });
    }
    setFechaSugerida(null);
  };

  /**
   * `onChange` del selector «Método de cobro». «Utilidades del socio» es un
   * valor CENTINELA de la pantalla: nunca se escribe en `metodo_cobro` ni se
   * manda al API.
   */
  const handleMetodoSelector = (v: string) => {
    if (v === METODO_UTILIDADES_SOCIO) {
      if (ofrecerUtilidades && !modoUtilidades) elegirUtilidades();
      return;
    }
    if (modoUtilidades) salirDeUtilidades();
    handleMetodoChange(v);
  };

  const cambiarSocio = (id: string) => {
    setSocioId(id);
    const socios = cargaSocios.estado === "ok" ? cargaSocios.socios : [];
    setAvionId(avionPorDefecto(socioDe(socios, id), utilidadesSocio?.aeronaveId));
    setErroresUtilidades((e) => ({ ...e, socio: undefined, avion: undefined }));
  };

  const cambiarAvion = (id: string) => {
    setAvionId(id);
    setErroresUtilidades((e) => ({ ...e, avion: undefined }));
  };

  const opcionesMetodo = opcionesMetodoCobro(ofrecerUtilidades);
  const socioElegido =
    modoUtilidades && cargaSocios.estado === "ok" ? socioDe(cargaSocios.socios, socioId) : null;
  // Renglón gris bajo el avión: lo por entregar de meses cerrados y cómo
  // queda después de este cobro (null = el dato no llegó: sin números).
  const saldoUtilidades = modoUtilidades
    ? textoSaldoUtilidades({ socio: socioElegido, avionId, monto, moneda, tc })
    : null;

  const comisionPctHint =
    metodo === "PAYWISE"
      ? comisionSugerida != null && Number(comisionPct) === comisionSugerida
        ? `Sugerida: comisión de Paywise (${paywiseComisionPct} %). Se sustituye por la real al conciliar el estado de cuenta de Paywise.`
        : "Comisión de Paywise sobre este cobro; se sustituye por la real al conciliar el estado de cuenta."
      : "Si conoces el porcentaje.";

  const tcHintPrellenado =
    tcPrefill && Number(tc) === tcPrefill.valor
      ? tcPrefill.fuente === "cotizacion"
        ? "Prellenado con el TC de la cotización — puedes editarlo."
        : `Prellenado con el TC oficial de referencia del día de la cotización${diaTcOficial ? ` (${diaTcOficial})` : ""} — puedes editarlo.`
      : null;
  // Con «Utilidades del socio» el T.C. se pide también en dólares: se dice
  // por qué (la cuenta del socio es en pesos).
  const tcHint = tcHintPrellenado
    ? modoUtilidades && moneda === "USD"
      ? `${tcHintPrellenado} ${ayudaTcUtilidades("USD")}`
      : tcHintPrellenado
    : inicial
      ? hintTcEdicion(inicial, tc)
      : modoUtilidades
        ? ayudaTcUtilidades(moneda)
        : "Necesario para saber cuánto cubre del total en USD";

  // Cuentas del catálogo: primero las de la moneda del cobro (sugerencia
  // suave — no se fuerza ninguna; "" = sin especificar).
  const cuentaOptions = useMemo(() => {
    const ordenadas = [...CUENTAS_COBRO].sort(
      (a, b) => Number(a.moneda !== moneda) - Number(b.moneda !== moneda),
    );
    return [
      { value: "", label: "Sin especificar" },
      ...ordenadas.map((c) => ({
        value: c.value,
        label: c.value,
        description: c.moneda === "USD" ? "Cuenta en USD" : "Cuenta en MXN",
      })),
    ];
  }, [moneda]);
  const monedaCuenta = monedaDeCuenta(cuentaDestino);
  const cuentaHint =
    monedaCuenta && monedaCuenta !== moneda
      ? `Ojo: la cuenta es en ${monedaCuenta} y el cobro en ${moneda}. Verifica que sea la correcta.`
      : inicial?.cuentaLegada && !cuentaDestino
        ? hintCuentaLegada(inicial.cuentaLegada)
        : "Opcional · primero aparecen las cuentas en la moneda del cobro";

  // Total en pesos de la ficha. FUENTE ÚNICA: `monto_total_mxn`, el número
  // EXACTO que salió impreso en la cotización del cliente (lo compuso el
  // motor, con las TUAS/extras capturados en pesos entrando tal cual). Solo
  // cuando el vuelo no lo tiene se ESTIMA con `usd × tc` y se etiqueta «≈»:
  // ese producto es el que decía $99,999.81 donde la hoja decía $100,000.00.
  const tcReferencia = tcSugerido?.valor ?? null;
  const totalMxnCotizado =
    montoTotalMxn != null && Number.isFinite(montoTotalMxn) ? montoTotalMxn : null;
  const totalMxnEstimado =
    tcReferencia != null ? Math.round(montoTotalUsd * tcReferencia * 100) / 100 : null;
  const totalMxnReferencia = totalMxnCotizado ?? totalMxnEstimado;

  // Por qué el importe viene puesto (solo mientras siga siendo la sugerencia).
  const montoHint =
    montoSugerido == null || Number(monto) !== montoSugerido
      ? undefined
      : moneda === "MXN"
        ? totalMxnCotizado != null && montoSugerido === totalMxnCotizado
          ? "Los pesos EXACTOS de la cotización (lo que el cliente tiene enfrente)."
          : "El pendiente convertido con el tipo de cambio."
        : undefined;

  const usdEquivalente =
    moneda === "USD"
      ? Number(monto) || 0
      : tc && Number(tc) > 0
        ? (Number(monto) || 0) / Number(tc)
        : null;

  // ¿Ya se puede registrar con utilidades? (socios cargados y al menos uno).
  const utilidadesListas = cargaSocios.estado === "ok" && cargaSocios.socios.length > 0;

  /**
   * Manda el cobro con utilidades — o lo REENVÍA como adelanto confirmado, con
   * el mismo cuerpo y la misma llave —. El 409 `PAGO_EXCEDE_SALDO` no es un
   * error: abre la confirmación del adelanto (`pasoTrasCobroUtilidades`).
   */
  const enviarCobroUtilidades = (
    payload: CobroUtilidadesPayload,
    ctx: { fecha: string; socioNombre: string },
  ) => {
    startTransition(async () => {
      // La action nunca lanza, pero la LLAMADA sí puede (red caída, 502).
      const res = await registrarCobroUtilidadesAction(flightId, payload).catch(() => ({
        ok: false as const,
        error: TEXTO_FALLO_RED_COBRO_UTILIDADES,
        code: "SIN_CONEXION",
      }));
      const paso = pasoTrasCobroUtilidades(res);
      switch (paso.paso) {
        case "adelanto":
          setAdelanto({ details: paso.details, payload, ...ctx });
          return;
        case "error":
          setAdelanto(null);
          setErrorGuardado(paso.mensaje);
          // 409 `MES_CERRADO` (API 0.0.88): toast con «Ir a Reportes».
          if (!toastMesCerradoSiAplica(res)) toast.error(paso.mensaje);
          return;
        case "listo":
          setAdelanto(null);
          if (paso.idempotente) toast.info(TEXTO_COBRO_UTILIDADES_YA_REGISTRADO);
          else toast.success(textoCobroUtilidadesRegistrado(ctx.socioNombre));
          onOpenChange(false);
          router.refresh();
          onRegistrado?.();
          return;
      }
    });
  };

  /** Valida lo propio de «Utilidades del socio» y manda el cobro a SU endpoint. */
  const registrarConUtilidades = (values: CobroFormValues) => {
    if (cargaSocios.estado !== "ok") {
      toast.error("Todavía no se cargan los socios. Espera un momento o pulsa «Reintentar».");
      return;
    }
    const form = {
      socioId,
      avionId,
      monto: values.monto,
      moneda: values.moneda as Moneda,
      tc: values.tc_usd_mxn,
      fecha: String(values.fecha_cobro ?? "").slice(0, 10),
      notas: values.notas ?? "",
    };
    const errores = validarCobroUtilidades(form, { socios: cargaSocios.socios, hoy: todayCancun() });
    setErroresUtilidades(errores);
    if (errores.monto) setError("monto", { type: "manual", message: errores.monto });
    if (errores.tc) setError("tc_usd_mxn", { type: "manual", message: errores.tc });
    if (errores.fecha) setError("fecha_cobro", { type: "manual", message: errores.fecha });
    if (errores.notas) setError("notas", { type: "manual", message: errores.notas });
    if (Object.keys(errores).length > 0) return;
    setErrorGuardado(null);
    enviarCobroUtilidades(payloadCobroUtilidades(form, { clientRequestId: solicitudId }), {
      fecha: form.fecha,
      socioNombre: socioDe(cargaSocios.socios, socioId)?.nombre ?? "",
    });
  };

  const onSubmit = handleSubmit((values) => {
    // EDICIÓN: validar lo propio del tipo de cobro, calcular el diff y
    // CONFIRMAR el antes → después (es dinero). Nada viaja todavía.
    if (cobroEditar && inicial && edicion) {
      const valoresEd = valoresParaEdicion(values, mostrarSelectorFactura);
      const errores = Object.entries(erroresEdicionCobro(inicial, valoresEd, edicion));
      if (errores.length > 0) {
        for (const [campo, message] of errores) {
          setError(campo as keyof CobroFormValues, { type: "manual", message });
        }
        return;
      }
      const cambios = cambiosDeCobro(cobroEditar, inicial, valoresEd, edicion, { facturas: vigentes });
      if (!cambios.hayCambios) {
        toast.info(TEXTO_SIN_CAMBIOS_COBRO);
        return;
      }
      setErrorGuardado(null);
      setConfirmacion(cambios);
      return;
    }
    // «UTILIDADES DEL SOCIO» (API 0.0.148): no es un cobro con método. Va a
    // SU endpoint, que crea el cobro y la entrega al socio en una sola
    // llamada; el alta de siempre (abajo) no se toca.
    if (modoUtilidades) {
      registrarConUtilidades(values);
      return;
    }
    startTransition(async () => {
      const res = await registerCobroAction(flightId, {
        monto: Number(values.monto),
        moneda: values.moneda as Moneda,
        metodo_cobro: values.metodo_cobro as MetodoPago,
        // El TC solo tiene sentido en MXN: en USD nunca se manda, aunque el
        // formulario conserve un valor prellenado de un cambio de moneda.
        tc_usd_mxn:
          values.moneda === "MXN" && Number(values.tc_usd_mxn) > 0
            ? Number(values.tc_usd_mxn)
            : undefined,
        // Monto directo manda sobre el % (el API deriva el % de referencia).
        comision_banco_monto:
          values.comision_banco_monto !== undefined &&
          Number(values.comision_banco_monto) > 0
            ? Number(values.comision_banco_monto)
            : undefined,
        comision_banco_pct:
          Number(values.comision_banco_monto) > 0
            ? undefined
            : values.comision_banco_pct !== undefined &&
                Number(values.comision_banco_pct) > 0
              ? Number(values.comision_banco_pct)
              : undefined,
        referencia: values.referencia?.trim() || undefined,
        cuenta_destino: values.cuenta_destino || undefined,
        fecha_cobro: values.fecha_cobro
          ? cancunInputToIso(`${values.fecha_cobro.slice(0, 10)}T12:00`)
          : undefined,
        notas: values.notas?.trim() || undefined,
        // La factura SOLO si el selector se pintó y se eligió una: sin la
        // llave, un API ≤ 0.0.81 responde 400 (`forbidNonWhitelisted`).
        ...(mostrarSelectorFactura && values.factura_emitida_id
          ? { factura_emitida_id: values.factura_emitida_id }
          : {}),
      });
      if (res.ok) {
        const amparada =
          mostrarSelectorFactura && values.factura_emitida_id
            ? (vigentes.find((f) => f.id === values.factura_emitida_id)?.etiqueta ?? null)
            : null;
        toast.success(
          cancelado
            ? "Cargo por cancelación registrado"
            : amparada
              ? textoCobroRegistradoConFactura(amparada)
              : "Cobro registrado",
        );
        onOpenChange(false);
        router.refresh();
        onRegistrado?.();
      } else if (!toastMesCerradoSiAplica(res)) {
        toast.error(res.error ?? "Error al registrar cobro");
      }
    });
  });

  /** Tras confirmar: PATCH con SOLO lo que cambió; el API recalcula el cobrado. */
  const guardarCorreccion = () => {
    if (!cobroEditar || !confirmacion) return;
    const cambios = confirmacion;
    startTransition(async () => {
      const res = await updateCobroAction(flightId, cobroEditar.id, cambios.patch);
      setConfirmacion(null);
      if (res.ok) {
        toast.success(TEXTO_COBRO_CORREGIDO, {
          description: resumenCambiosCobro(cambios.lineas),
        });
        onOpenChange(false);
        router.refresh();
        onRegistrado?.();
        return;
      }
      const mensaje = mensajeErrorEdicionCobro(res);
      setErrorGuardado(mensaje);
      // 409 `MES_CERRADO` (API 0.0.88): toast con «Ir a Reportes».
      if (toastMesCerradoSiAplica(res)) return;
      // Parte de un sobre de grupo (candado del API): atajo al grupo.
      const d = res.details as { grupo_id?: string } | undefined;
      toast.error(mensaje, {
        action:
          res.code === "COBRO_DE_GRUPO" && d?.grupo_id
            ? {
                label: "Ir al grupo",
                onClick: () => router.push(`/admin/quotes/grupo/${d.grupo_id}`),
              }
            : undefined,
      });
    });
  };

  const registroCobro = cobroEditar ? textoRegistroCobro(cobroEditar) : null;
  const soloLectura = cobroEditar && edicion ? datosSoloLecturaCobro(cobroEditar, edicion) : [];
  // El T.C. se captura: en el alta, siempre que sea en pesos; al corregir,
  // además solo si el tipo de cobro lo permite (reembolso/conciliado no). Con
  // «Utilidades del socio» se captura en las DOS monedas (API 0.0.148).
  const mostrarTc = (moneda === "MXN" || modoUtilidades) && !tcBloqueado;
  // Confirmación del ADELANTO (409 PAGO_EXCEDE_SALDO): textos de la fuente única.
  const confirmarAdelanto = adelanto
    ? confirmacionAdelantoCobro(adelanto.details, adelanto.fecha)
    : null;
  // La ficha de corrección de un cobro con utilidades (solo se abre por
  // «Asignar factura»): su fecha tampoco se corrige.
  const fechaSoloLectura = cobroEditar != null && esCobroConUtilidades(cobroEditar);
  // «Equivale a … USD» solo cuando algo editable lo puede mover (con el
  // dinero bloqueado, solo el T.C. de un cobro en pesos).
  const mostrarEquivalencia =
    usdEquivalente !== null && (!dineroBloqueado || mostrarTc);
  // Lo que dice la ficha bajo «Equivale a…» (D21, API 0.0.78): rebasa /
  // cubre / queda pendiente, con la tolerancia de la bandera `cobrado`.
  // Texto y regla: `vistaPreviaMontoCobro` (lib/admin/cobrado-de-mas).
  const vistaPrevia =
    usdEquivalente !== null
      ? vistaPreviaMontoCobro({
          usdEquivalente,
          pendingUsd,
          montoTotalUsd,
          cancelado,
          enEdicion,
          cotizacionAbierta,
          saldoUsd,
          montoUsdOriginal,
        })
      : null;

  return (
    <>
    <Sheet
      open={open}
      onOpenChange={(nextOpen, details) => {
        if (
          !nextOpen &&
          (details.reason === "outside-press" ||
            details.reason === "escape-key" ||
            details.reason === "focus-out")
        ) {
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-md sm:w-[480px] flex flex-col p-0"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>
            {cobroEditar ? (
              <>
                {tituloFichaEdicion(cobroEditar)}
                {flightFolio > 0 ? ` · vuelo #${flightFolio}` : ""}
              </>
            ) : (
              <>
                {cancelado ? "Registrar cargo por cancelación" : "Registrar cobro"} ·
                vuelo #{flightFolio}
              </>
            )}
          </SheetTitle>
          <SheetDescription>
            {cobroEditar ? (
              descripcionFichaEdicion(cobroEditar, registroCobro)
            ) : cancelado ? (
              <>
                Cotizado:{" "}
                <span className="font-mono">{fmtUsd(montoTotalUsd)}</span> · vuelo
                cancelado (sin pendiente)
              </>
            ) : (
              <>
                Total a cobrar:{" "}
                <span className="font-mono">{fmtUsd(montoTotalUsd)}</span> ·
                Pendiente:{" "}
                <span
                  className={cn(
                    "font-mono",
                    pendingUsd > 0
                      ? "text-destructive font-semibold"
                      : "text-muted-foreground",
                  )}
                >
                  {fmtUsd(pendingUsd)}
                </span>
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {cancelado && !enEdicion && (
            <div
              role="note"
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs"
            >
              <span className="font-medium">Vuelo cancelado:</span> registra lo
              que el cliente pagó y NO se reembolsa (anticipo retenido o cargo
              por cancelación). Entra íntegro al balance del avión.
            </div>
          )}

          {/* Vista rápida de la cotización (informativa): total, TC con el
              que se cotizó y su equivalente en pesos, para que quien cobra
              no tenga que ir a buscarlos. */}
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
            <p className="mb-1.5 font-medium text-foreground">Cotización</p>
            <div className="grid grid-cols-3 gap-2">
              <Dato label="Total USD" value={fmtUsd(montoTotalUsd)} />
              <Dato
                label={
                  tcSugerido?.fuente === "oficial"
                    ? "TC oficial de referencia (hoy)"
                    : "TC de la cotización"
                }
                value={tcReferencia != null ? fmtTc(tcReferencia) : "—"}
              />
              <Dato
                label={totalMxnCotizado != null ? "Total MXN (cotización)" : "Total ≈ MXN"}
                value={totalMxnReferencia != null ? fmtMxn(totalMxnReferencia) : "—"}
              />
            </div>
            {tcSugerido?.fuente === "oficial" && (
              <p className="mt-1.5 text-muted-foreground">
                La cotización no fijó tipo de cambio; se usa el TC oficial de
                referencia del día en que se cotizó
                {diaTcOficial ? ` (${diaTcOficial})` : ""}:{" "}
                {fmtTc(tcSugerido.valor)} — el mismo que usan los Excel
                del balance.
              </p>
            )}
            {!tcSugerido && (
              <p className="mt-1.5 text-muted-foreground">
                La cotización no fijó tipo de cambio y no hay TC oficial del día
                de la cotización disponible.
              </p>
            )}
          </div>

          {/* CORREGIR: lo que el tipo de cobro no deja tocar (reembolso,
              conciliado, anticipo) se LEE aquí, con la explicación de qué
              hacer si está mal. Nunca un input deshabilitado sin razón. */}
          {edicion && soloLectura.length > 0 && (
            <div
              role="note"
              className="space-y-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs"
            >
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                <LockClosedIcon className="h-3.5 w-3.5" aria-hidden />
                {TITULO_SOLO_LECTURA_COBRO}
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                {soloLectura.map((f) => (
                  <div key={f.etiqueta} className="contents">
                    <dt className="text-muted-foreground">{f.etiqueta}</dt>
                    <dd className="font-mono">{f.valor}</dd>
                  </div>
                ))}
              </dl>
              {edicion.explicacion && (
                <p className="text-muted-foreground">{edicion.explicacion}</p>
              )}
            </div>
          )}

          {!dineroBloqueado && (
            <>
              {/* «Utilidades del socio» (API 0.0.148) es una opción más AL
                  FINAL del selector, solo donde se ofrece: un valor de la
                  pantalla que nunca se manda como método. */}
              <Field
                label="Método de cobro"
                required
                hint={modoUtilidades ? NOTA_COBRO_CON_UTILIDADES : undefined}
              >
                <SearchableSelect
                  options={opcionesMetodo}
                  value={modoUtilidades ? METODO_UTILIDADES_SOCIO : metodo}
                  onChange={handleMetodoSelector}
                  placeholder="Selecciona método"
                />
              </Field>

              {/* Quién paga y de las utilidades de qué avión (con su saldo). */}
              {modoUtilidades && (
                <CamposUtilidadesSocio
                  carga={cargaSocios}
                  socioId={socioId}
                  avionId={avionId}
                  aeronaveVueloId={utilidadesSocio?.aeronaveId ?? null}
                  errores={erroresUtilidades}
                  saldo={saldoUtilidades}
                  onSocio={cambiarSocio}
                  onAvion={cambiarAvion}
                  onReintentar={cargarSocios}
                />
              )}

              <div className="grid grid-cols-[1fr_120px] gap-3">
                <Field label="Monto" required hint={montoHint} error={errors.monto?.message}>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="0.00"
                    {...register("monto")}
                  />
                </Field>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Moneda</Label>
                  <Segmented
                    value={moneda}
                    onChange={(v) => handleMonedaChange(v as Moneda)}
                    options={[
                      { value: "USD", label: "USD" },
                      { value: "MXN", label: "MXN" },
                    ]}
                  />
                </div>
              </div>
            </>
          )}

          {mostrarTc && (
            <Field
              label="Tipo de cambio USD/MXN"
              required={!(inicial && inicial.valores.moneda === "MXN" && inicial.valores.tc_usd_mxn === "")}
              hint={tcHint}
              error={errors.tc_usd_mxn?.message}
            >
              <Input
                type="number"
                step="0.000001"
                min={0}
                placeholder="20.50"
                {...register("tc_usd_mxn")}
              />
            </Field>
          )}

          {mostrarEquivalencia && usdEquivalente !== null && vistaPrevia && (
            <div
              className={cn("rounded-lg border px-3 py-2 text-xs", CLASE_CAJA_VISTA_PREVIA[vistaPrevia.tono])}
              data-vista-previa-cobro={vistaPrevia.tono}
            >
              <span className="text-muted-foreground">Equivale a </span>
              <span className="font-mono font-semibold">
                {fmtUsd(usdEquivalente)}
              </span>
              <span className="text-muted-foreground"> USD. </span>
              {/* Alta: contra el pendiente de la página. Corrección: contra
                  el saldo SIN este cobro (total − cobrado + su `monto_usd`,
                  números del API); sin `monto_usd`, «El saldo del vuelo se
                  recalcula al guardar» como siempre (el pendiente de la
                  página YA descuenta este mismo cobro). */}
              <span className={CLASE_TEXTO_VISTA_PREVIA[vistaPrevia.tono]}>{vistaPrevia.texto}</span>
              {vistaPrevia.ayuda && (
                <span className="mt-1 block text-muted-foreground">{vistaPrevia.ayuda}</span>
              )}
            </div>
          )}

          {/* Con «Utilidades del socio» no hay banco: ni comisión ni cuenta. */}
          {!dineroBloqueado && !modoUtilidades && (
            <>
              <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                <Field
                  label={metodo === "PAYWISE" ? "Comisión de Paywise (%)" : "Comisión del banco (%)"}
                  hint={comisionPctHint}
                  error={errors.comision_banco_pct?.message}
                >
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    max={20}
                    placeholder="Ej. 2.9"
                    disabled={Number(comisionMontoDirecto) > 0}
                    {...register("comision_banco_pct")}
                  />
                </Field>
                <Field
                  label={`… o comisión en ${moneda}`}
                  hint="Lo que retuvo el banco, tal como viene en el estado de cuenta. Manda sobre el %."
                  error={errors.comision_banco_monto?.message}
                >
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="Ej. 589.05"
                    {...register("comision_banco_monto")}
                  />
                </Field>
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">
                El cliente pagó el monto completo; el banco deposita monto −
                comisión. Ambos campos son opcionales.
              </p>

              {Number(monto) > 0 &&
                (Number(comisionMontoDirecto) > 0 || Number(comisionPct) > 0) && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
                  {(() => {
                    // Mismo redondeo que el API: comisión a 2 decimales y el neto
                    // se deriva de ELLA (no del producto crudo) — sin ±1 centavo.
                    const comision =
                      Number(comisionMontoDirecto) > 0
                        ? Math.round(Number(comisionMontoDirecto) * 100) / 100
                        : Math.round(
                            Number(monto) * (Number(comisionPct) / 100) * 100,
                          ) / 100;
                    const pctRef =
                      Math.round((comision / Number(monto)) * 100 * 100) / 100;
                    if (comision >= Number(monto)) {
                      return (
                        <span className="text-destructive">
                          La comisión no puede ser mayor o igual al monto del cobro.
                        </span>
                      );
                    }
                    return (
                      <>
                        <span className="text-muted-foreground">Comisión: </span>
                        <span className="font-mono font-semibold">
                          −{fmtUsd(comision)} {moneda}
                        </span>
                        {Number(comisionMontoDirecto) > 0 && (
                          <span className="text-muted-foreground"> (≈{pctRef}%)</span>
                        )}
                        <span className="text-muted-foreground"> · El banco depositará </span>
                        <span className="font-mono font-semibold">
                          {fmtUsd(Number(monto) - comision)} {moneda}
                        </span>
                        <span className="text-muted-foreground">
                          . El vuelo se acredita por el monto completo.
                        </span>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* A qué cuenta LLEGÓ el dinero (pedido del equipo, 18-ago; catálogo
                  fijo desde 28-ago): una de CUENTAS_COBRO. Solo métodos que tocan
                  banco. Opcional: "Sin especificar" lo deja vacío. */}
              {METODOS_CON_CUENTA.includes(metodo) && (
                <Field
                  label="¿A qué cuenta llegó?"
                  hint={cuentaHint}
                  error={errors.cuenta_destino?.message}
                >
                  <SearchableSelect
                    options={cuentaOptions}
                    value={cuentaDestino ?? ""}
                    onChange={(v) =>
                      setValue(
                        "cuenta_destino",
                        v as CobroFormValues["cuenta_destino"],
                        { shouldValidate: true },
                      )
                    }
                    placeholder="Sin especificar"
                    searchPlaceholder="Buscar cuenta…"
                  />
                </Field>
              )}
            </>
          )}

          {/* Con «Utilidades del socio» no hay folio del banco ni factura que
              elegir aquí: los dos campos se esconden (y no viajan). */}
          {!modoUtilidades && (
            <>
          <Field
            label="Referencia"
            hint={
              metodo === "PAYWISE"
                ? "ID de operación / autorización de Paywise: con ella la auditoría cruza el abono aunque cambie la comisión."
                : "Folio bancario, ticket, voucher BillPocket, etc."
            }
            error={errors.referencia?.message}
          >
            <Input placeholder="Opcional" {...register("referencia")} />
          </Field>

          {/* FACTURAS POR COBRO (API 0.0.82): qué factura ampara este cobro.
              Clasificación, no dinero: se cambia también en un cobro
              conciliado o de anticipo. Sin selector, la llave no viaja. */}
          {mostrarSelectorFactura && (
            <Field
              label="Factura"
              hint={AYUDA_SELECTOR_FACTURA_COBRO}
              error={errors.factura_emitida_id?.message}
            >
              <SearchableSelect
                id={idSelectorFactura}
                options={opcionesFactura}
                value={facturaElegida}
                onChange={(v) => setValue("factura_emitida_id", v, { shouldValidate: true })}
                placeholder="Sin factura todavía"
                searchPlaceholder="Buscar factura…"
              />
            </Field>
          )}
            </>
          )}

          {/* Con «Utilidades del socio» la fecha decide de QUÉ MES se
              descuenta: es obligatoria y se dice el mes. En la corrección de
              un cobro con utilidades no se pinta (no se corrige). */}
          {!fechaSoloLectura && (
            <Field
              label="Fecha del cobro"
              required={modoUtilidades}
              hint={modoUtilidades ? ayudaFechaUtilidades(fechaCobro) : undefined}
              error={errors.fecha_cobro?.message}
            >
              <Input type="date" {...register("fecha_cobro")} />
              <AvisoCapturaAntesDelInicio fecha={fechaCobro} />
            </Field>
          )}

          <Field label="Notas" error={errors.notas?.message}>
            <Textarea
              rows={2}
              placeholder="Opcional"
              {...register("notas")}
            />
          </Field>

          {/* Rechazo del API al corregir (o al registrar con utilidades del
              socio): se queda a la vista (el toast se va solo) con el
              mensaje en es-MX. */}
          {(enEdicion || modoUtilidades) && errorGuardado && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {errorGuardado}
            </p>
          )}
        </form>

        <SheetFooter className="border-t border-border flex-row justify-end gap-2 mt-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          {/* Con «Utilidades del socio» no se registra hasta tener los socios. */}
          <Button
            type="button"
            onClick={onSubmit}
            disabled={pending || (modoUtilidades && !utilidadesListas)}
          >
            {enEdicion
              ? pending
                ? "Guardando…"
                : "Revisar y guardar"
              : pending
                ? "Registrando…"
                : cancelado
                  ? "Registrar cargo"
                  : "Registrar cobro"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>

    {/* Confirmación de la CORRECCIÓN: el antes → después de lo que cambia
        (es dinero). Solo «Guardar corrección» llama al API. */}
    <AlertDialog
      open={confirmacion !== null}
      onOpenChange={(o) => {
        if (!o && !pending) setConfirmacion(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{TITULO_CONFIRMAR_EDICION}</AlertDialogTitle>
          <AlertDialogDescription>
            {cobroEditar ? descripcionConfirmarEdicion(cobroEditar, flightFolio) : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="space-y-1.5 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
          {(confirmacion?.lineas ?? []).map((l) => (
            <li key={l.campo} className="leading-snug">
              <span className="text-muted-foreground">{l.etiqueta}: </span>
              <span className="text-muted-foreground line-through decoration-muted-foreground/60">
                {l.antes}
              </span>
              <span aria-hidden="true"> → </span>
              <span className="sr-only"> cambia a </span>
              <span className="font-semibold">{l.despues}</span>
            </li>
          ))}
        </ul>
        {confirmacion?.tocaDinero && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {NOTA_RECALCULO_COBRO}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Volver a editar</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              guardarCorreccion();
            }}
          >
            {pending ? "Guardando…" : "Guardar corrección"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* «Utilidades del socio»: el 409 PAGO_EXCEDE_SALDO NO es un error. Las
        utilidades de ese mes todavía no alcanzan o no han cerrado: se
        CONFIRMA el adelanto (los mismos números y la misma redacción que en
        «Registrar entrega») y se reenvía con `aceptar_exceso` y la MISMA
        llave. «Cancelar» regresa a la ficha sin registrar nada. */}
    <AlertDialog
      open={adelanto !== null}
      onOpenChange={(o) => {
        if (!o && !pending) setAdelanto(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmarAdelanto?.titulo ?? ""}</AlertDialogTitle>
          <AlertDialogDescription>{confirmarAdelanto?.descripcion ?? ""}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {confirmarAdelanto?.cancelar ?? "Cancelar"}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            data-accion="confirmar-adelanto-cobro"
            onClick={(e) => {
              e.preventDefault();
              if (!adelanto) return;
              enviarCobroUtilidades(
                { ...adelanto.payload, aceptar_exceso: true },
                { fecha: adelanto.fecha, socioNombre: adelanto.socioNombre },
              );
            }}
          >
            {pending ? "Registrando…" : (confirmarAdelanto?.confirmar ?? "")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

/** Par etiqueta/valor compacto para la vista rápida de la cotización. */
function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] text-muted-foreground">{label}</p>
      <p className="truncate font-mono font-semibold text-foreground">{value}</p>
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
              "flex-1 h-7 px-2 text-xs font-medium rounded-md transition-colors cursor-pointer",
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
