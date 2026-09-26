"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
import { cancunInputToIso, fmtDateOnly } from "@/lib/datetime";
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
import { registerCobroAction, updateCobroAction } from "@/app/admin/flights/actions";
import {
  cuentaSugeridaPorMetodo,
  METODOS_CON_CUENTA,
  METODOS_PAGO,
  PAYWISE_COMISION_PCT_DEFAULT,
} from "@/lib/admin/metodos-pago";
import type { MetodoPago } from "@/types/quote";
import type { FlightCobro } from "@/types/flights";
import { Field } from "@/components/admin/form-field";

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
  /** Tras registrar (o corregir) con éxito (además del router.refresh() propio). */
  onRegistrado?: () => void;
}

type TcSugerido = { valor: number; fuente: "cotizacion" | "oficial" };

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
function defaultsEdicion(inicial: InicialEdicionCobro): CobroFormValues {
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
  };
}

/** Lo que el diff de la edición necesita del formulario (sin el modo). */
function valoresParaEdicion(values: CobroFormValues): ValoresEdicionCobro {
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
  onRegistrado,
}: CobroFormSheetProps) {
  const diaTcOficial = tcOficialFecha ? fmtDateOnly(tcOficialFecha) : null;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // ---- Modo EDICIÓN («Corregir cobro», 26-sep-2026) ----
  const enEdicion = cobroEditar != null;
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
    defaultValues: inicial ? defaultsEdicion(inicial) : defaults(montoPrefill, prefill),
  });

  useEffect(() => {
    if (open && !inicial) {
      const base = defaults(montoPrefill, prefill);
      reset(base);
      setTcPrefill(null);
      setComisionSugerida(null);
      // Con un prefill explícito de monto (p. ej. el abono de Paywise) NO hay
      // sugerencia que pisar: ese importe es el dato bueno.
      setMontoSugerido(
        prefill?.monto != null && prefill.monto > 0 ? null : (base.monto as number),
      );
    }
  }, [open, montoPrefill, prefill, reset, inicial]);

  // EDICIÓN: el cobro tal como está guardado; nada se sugiere encima. Efecto
  // aparte a propósito: solo depende de abrir y de QUÉ cobro se corrige — un
  // `router.refresh()` que cambie el pendiente de la página (p. ej. al volver
  // a la pestaña) no puede borrar una corrección a medio capturar.
  useEffect(() => {
    if (open && inicial) {
      reset(defaultsEdicion(inicial));
      setTcPrefill(null);
      setComisionSugerida(null);
      setMontoSugerido(null);
      setConfirmacion(null);
      setErrorGuardado(null);
    }
  }, [open, inicial, reset]);

  const moneda = watch("moneda");
  const metodo = watch("metodo_cobro");
  const monto = watch("monto");
  const tc = watch("tc_usd_mxn");
  const comisionPct = watch("comision_banco_pct");
  const comisionMontoDirecto = watch("comision_banco_monto");
  const cuentaDestino = watch("cuenta_destino");

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
  const handleMonedaChange = (v: Moneda) => {
    setValue("moneda", v);
    if (v !== "MXN") {
      const actual = getValues("tc_usd_mxn");
      if (tcPrefill && Number(actual) === tcPrefill.valor) {
        setValue("tc_usd_mxn", "");
      }
      setTcPrefill(null);
      // De vuelta a dólares: el importe vuelve a ser el pendiente en USD.
      if (!cancelado && pendingUsd > 0) {
        aplicarSugerenciaMonto(Number(pendingUsd.toFixed(2)));
      }
      return;
    }
    const actual = getValues("tc_usd_mxn");
    const yaTecleado = actual !== undefined && actual !== "" && Number(actual) > 0;
    if (!yaTecleado && tcSugerido) {
      setValue("tc_usd_mxn", tcSugerido.valor, { shouldValidate: true });
      setTcPrefill(tcSugerido);
    }
    const tcEfectivo = yaTecleado ? Number(actual) : (tcSugerido?.valor ?? 0);
    aplicarSugerenciaMonto(montoMxnSugerido(tcEfectivo));
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
    if (m === "DOLARES") handleMonedaChange("USD");
    else if (m === "EFECTIVO" || m === "PAYWISE") handleMonedaChange("MXN");
  };

  const comisionPctHint =
    metodo === "PAYWISE"
      ? comisionSugerida != null && Number(comisionPct) === comisionSugerida
        ? `Sugerida: comisión de Paywise (${paywiseComisionPct} %). Se sustituye por la real al conciliar el estado de cuenta de Paywise.`
        : "Comisión de Paywise sobre este cobro; se sustituye por la real al conciliar el estado de cuenta."
      : "Si conoces el porcentaje.";

  const tcHint =
    tcPrefill && Number(tc) === tcPrefill.valor
      ? tcPrefill.fuente === "cotizacion"
        ? "Prellenado con el TC de la cotización — puedes editarlo."
        : `Prellenado con el TC oficial de referencia del día de la cotización${diaTcOficial ? ` (${diaTcOficial})` : ""} — puedes editarlo.`
      : inicial
        ? hintTcEdicion(inicial, tc)
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

  const onSubmit = handleSubmit((values) => {
    // EDICIÓN: validar lo propio del tipo de cobro, calcular el diff y
    // CONFIRMAR el antes → después (es dinero). Nada viaja todavía.
    if (cobroEditar && inicial && edicion) {
      const valoresEd = valoresParaEdicion(values);
      const errores = Object.entries(erroresEdicionCobro(inicial, valoresEd, edicion));
      if (errores.length > 0) {
        for (const [campo, message] of errores) {
          setError(campo as keyof CobroFormValues, { type: "manual", message });
        }
        return;
      }
      const cambios = cambiosDeCobro(cobroEditar, inicial, valoresEd, edicion);
      if (!cambios.hayCambios) {
        toast.info(TEXTO_SIN_CAMBIOS_COBRO);
        return;
      }
      setErrorGuardado(null);
      setConfirmacion(cambios);
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
      });
      if (res.ok) {
        toast.success(
          cancelado ? "Cargo por cancelación registrado" : "Cobro registrado",
        );
        onOpenChange(false);
        router.refresh();
        onRegistrado?.();
      } else {
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
  // además solo si el tipo de cobro lo permite (reembolso/conciliado no).
  const mostrarTc = moneda === "MXN" && !tcBloqueado;
  // «Equivale a … USD» solo cuando algo editable lo puede mover (con el
  // dinero bloqueado, solo el T.C. de un cobro en pesos).
  const mostrarEquivalencia =
    usdEquivalente !== null && (!dineroBloqueado || mostrarTc);

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
              <Field label="Método de cobro" required>
                <SearchableSelect
                  options={METODOS_PAGO.map((m) => ({
                    value: m.value,
                    label: m.label,
                    description: m.hint,
                  }))}
                  value={metodo}
                  onChange={handleMetodoChange}
                  placeholder="Selecciona método"
                />
              </Field>

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

          {mostrarEquivalencia && usdEquivalente !== null && (
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Equivale a </span>
              <span className="font-mono font-semibold">
                {fmtUsd(usdEquivalente)}
              </span>
              <span className="text-muted-foreground"> USD. </span>
              {enEdicion ? (
                // Al corregir no se promete «cubre el pendiente»: el
                // pendiente de la página YA descuenta este mismo cobro. El
                // cobrado lo recalcula el API al guardar.
                <span className="text-muted-foreground">
                  El saldo del vuelo se recalcula al guardar.
                </span>
              ) : cancelado ? (
                <span className="text-muted-foreground">
                  Queda como cobro retenido del vuelo cancelado.
                </span>
              ) : usdEquivalente >= pendingUsd ? (
                <span className="text-green-600 dark:text-green-400">
                  Cubre el pendiente — el vuelo se marcará como cobrado.
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Quedará pendiente {fmtUsd(pendingUsd - usdEquivalente)} USD.
                </span>
              )}
            </div>
          )}

          {!dineroBloqueado && (
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

          <Field label="Fecha del cobro" error={errors.fecha_cobro?.message}>
            <Input type="date" {...register("fecha_cobro")} />
          </Field>

          <Field label="Notas" error={errors.notas?.message}>
            <Textarea
              rows={2}
              placeholder="Opcional"
              {...register("notas")}
            />
          </Field>

          {/* Rechazo del API al corregir: se queda a la vista (el toast se
              va solo) con el mensaje en es-MX. */}
          {enEdicion && errorGuardado && (
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
          <Button type="button" onClick={onSubmit} disabled={pending}>
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
