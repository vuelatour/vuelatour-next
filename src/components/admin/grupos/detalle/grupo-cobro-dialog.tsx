"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/admin/form-field";
import {
  previsualizarCobroGrupoAction,
  registrarCobroGrupoAction,
} from "@/app/admin/quotes/grupo/actions";
import {
  CUENTAS_COBRO,
  CUENTAS_COBRO_VALUES,
  monedaDeCuenta,
  TOLERANCIA_COBRO_USD,
} from "@/lib/admin/cobros";
import {
  etiquetaModoParticion,
  explicacionModoParticion,
  mensajeErrorGrupo,
} from "@/lib/admin/grupos-ui";
import { METODOS_PAGO } from "@/lib/admin/metodos-pago";
import { cancunInputToIso, fmtDateOnly, todayCancun } from "@/lib/datetime";
import { fmtDecimal, fmtMxn, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MetodoPago } from "@/types/quote";
import type {
  CreateCobroGrupoInput,
  GrupoDetalle,
  MonedaGrupo,
  PrevisualizacionCobro,
} from "@/types/grupos";

/**
 * Diálogo en DOS pasos para el SOBRE de cobro del grupo (Fase 2):
 *   1) captura igual que el cobro por vuelo (método, monto/moneda, TC,
 *      comisión, cuenta destino, referencia, fecha, notas);
 *   2) VISTA PREVIA de la partición que propone el API (previsualizar, sin
 *      escribir): tabla por avión con saldo antes/parte/saldo después, modo
 *      detectado, verificación Σ exacta y avisos; switch «Partir a mano»
 *      (modo MANUAL: el panel manda `particion_manual` y el API valida
 *      Σ == monto — la diferencia local en rojo es solo ayuda visual).
 * «Confirmar» manda `client_request_id` (uuid generado al abrir): un
 * reintento devuelve 200 idempotente → «Este cobro ya estaba registrado».
 * Reembolso = el mismo diálogo con monto NEGATIVO, sin comisión, motivo
 * obligatorio y confirmación explícita (quita dinero).
 *
 * El componente se MONTA al abrir y se desmonta al cerrar (la card lo
 * renderiza condicionalmente): así cada apertura nace limpia, con llave
 * de idempotencia nueva y sin setState en efectos.
 */

export type TipoSobre = "COBRO" | "REEMBOLSO";

/** Métodos que tocan banco: solo en ellos se pregunta a qué cuenta llegó. */
const METODOS_CON_CUENTA: MetodoPago[] = ["TRANSFERENCIA", "HSBC_LINK", "CHEQUE"];

const METODO_VALUES = METODOS_PAGO.map((m) => m.value) as [MetodoPago, ...MetodoPago[]];

const SobreFormSchema = z
  .object({
    monto: z.coerce.number().positive("Captura un monto mayor a 0"),
    moneda: z.enum(["USD", "MXN"]),
    metodo_cobro: z.enum(METODO_VALUES),
    tc_usd_mxn: z
      .union([z.coerce.number(), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : Number(v))),
    comision_banco_pct: z
      .union([
        z.coerce.number().min(0, "No puede ser negativa").max(20, "Máximo 20%"),
        z.literal(""),
      ])
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : Number(v))),
    comision_banco_monto: z
      .union([z.coerce.number().min(0, "No puede ser negativa"), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : Number(v))),
    referencia: z.string().max(100, "Máximo 100 caracteres").optional().or(z.literal("")),
    cuenta_destino: z.enum(CUENTAS_COBRO_VALUES).optional().or(z.literal("")),
    fecha_cobro: z.string().optional().or(z.literal("")),
    notas: z.string().max(500, "Máximo 500 caracteres").optional().or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    if (val.moneda === "MXN" && (!val.tc_usd_mxn || val.tc_usd_mxn <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tc_usd_mxn"],
        message: "TC requerido para cobros en MXN (para partir y sumar en USD)",
      });
    }
  });

type SobreFormValues = z.input<typeof SobreFormSchema>;

type TcSugerido = { valor: number; fuente: "cotizacion" | "oficial" };

/** uuid v4 para la llave de idempotencia (respaldo si el navegador no expone randomUUID). */
function uuidV4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function fmtMonto(v: number | null | undefined, moneda: string): string {
  return moneda === "MXN" ? fmtMxn(v) : fmtUsd(v);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function defaults(tipo: TipoSobre, saldoUsd: number): SobreFormValues {
  return {
    // Cobro: sugiere el saldo del grupo (del API); reembolso: se teclea.
    // Un saldo dentro de la tolerancia de redondeo (≤ 1 USD) no es deuda:
    // no se sugiere (misma regla que pendienteCobro).
    monto: tipo === "COBRO" && saldoUsd > TOLERANCIA_COBRO_USD ? round2(saldoUsd) : 0,
    moneda: "USD",
    metodo_cobro: "TRANSFERENCIA",
    tc_usd_mxn: undefined,
    comision_banco_pct: undefined,
    comision_banco_monto: undefined,
    referencia: "",
    cuenta_destino: "",
    fecha_cobro: todayCancun(),
    notas: "",
  };
}

interface GrupoCobroDialogProps {
  grupo: GrupoDetalle;
  tipo: TipoSobre;
  /** Cerrar (la card desmonta el diálogo). */
  onClose: () => void;
  /** TC oficial de referencia del día de la cotización (respaldo si el
   *  grupo no fijó TC). */
  tcOficial?: number | null;
  /** Día (YYYY-MM-DD, Cancún) al que corresponde `tcOficial`. */
  tcOficialFecha?: string | null;
}

export function GrupoCobroDialog({
  grupo,
  tipo,
  onClose,
  tcOficial = null,
  tcOficialFecha = null,
}: GrupoCobroDialogProps) {
  const router = useRouter();
  const esReembolso = tipo === "REEMBOLSO";
  const signo = esReembolso ? -1 : 1;
  const folio = grupo.folio_texto;
  const total = grupo.consolidado?.total_usd ?? 0;
  const cobrado = grupo.cobrado_usd ?? 0;
  const saldo = grupo.saldo_usd ?? 0;
  const vivos = useMemo(
    () =>
      grupo.aviones
        .filter((a) => !a.cancelado)
        .sort((a, b) => (a.posicion ?? 999) - (b.posicion ?? 999)),
    [grupo.aviones],
  );

  // Llave de idempotencia: UNA por apertura del diálogo (se conserva en los
  // reintentos del mismo intento para que el API no duplique dinero).
  const [crid] = useState(() => uuidV4());
  const [paso, setPaso] = useState<1 | 2>(1);
  const [preview, setPreview] = useState<PrevisualizacionCobro | null>(null);
  const [manual, setManual] = useState(false);
  /** Montos ABSOLUTOS por avión (el signo lo pone el tipo del sobre). */
  const [manualMontos, setManualMontos] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [tcPrefill, setTcPrefill] = useState<TcSugerido | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<SobreFormValues>({
    resolver: zodResolver(SobreFormSchema),
    defaultValues: defaults(tipo, saldo),
  });

  const moneda = watch("moneda");
  const metodo = watch("metodo_cobro");
  const monto = watch("monto");
  const tc = watch("tc_usd_mxn");
  const comisionPct = watch("comision_banco_pct");
  const comisionMontoDirecto = watch("comision_banco_monto");
  const cuentaDestino = watch("cuenta_destino");
  const notas = watch("notas");

  // TC sugerido al cobrar en MXN: el del grupo (el que el cliente vio); si
  // no lo fijó, el oficial de referencia del día de la cotización.
  const diaTcOficial = tcOficialFecha ? fmtDateOnly(tcOficialFecha) : null;
  const tcSugerido: TcSugerido | null =
    grupo.tc_usd_mxn != null && grupo.tc_usd_mxn > 0
      ? { valor: grupo.tc_usd_mxn, fuente: "cotizacion" }
      : tcOficial != null && tcOficial > 0
        ? { valor: tcOficial, fuente: "oficial" }
        : null;

  // Único camino para cambiar la moneda (misma regla que el cobro por
  // vuelo): al pasar a MXN con TC vacío se prellena el sugerido; un TC
  // tecleado a mano nunca se pisa ni se pierde al cambiar de moneda.
  const handleMonedaChange = (v: MonedaGrupo) => {
    setValue("moneda", v);
    if (v !== "MXN") {
      const actual = getValues("tc_usd_mxn");
      if (tcPrefill && Number(actual) === tcPrefill.valor) setValue("tc_usd_mxn", "");
      setTcPrefill(null);
      return;
    }
    if (!tcSugerido) return;
    const actual = getValues("tc_usd_mxn");
    if (actual !== undefined && actual !== "" && Number(actual) > 0) return;
    setValue("tc_usd_mxn", tcSugerido.valor, { shouldValidate: true });
    setTcPrefill(tcSugerido);
  };

  const handleMetodoChange = (v: string) => {
    const m = v as MetodoPago;
    setValue("metodo_cobro", m);
    if (!METODOS_CON_CUENTA.includes(m)) setValue("cuenta_destino", "");
    if (m === "DOLARES") handleMonedaChange("USD");
    else if (m === "EFECTIVO") handleMonedaChange("MXN");
  };

  const tcHint =
    tcPrefill && Number(tc) === tcPrefill.valor
      ? tcPrefill.fuente === "cotizacion"
        ? "Prellenado con el TC del grupo — puedes editarlo."
        : `Prellenado con el TC oficial de referencia del día de la cotización${diaTcOficial ? ` (${diaTcOficial})` : ""} — puedes editarlo.`
      : "Necesario para saber cuánto cubre del total en USD y partirlo entre los aviones";

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
      ? `Ojo: la cuenta es en ${monedaCuenta} y el ${esReembolso ? "reembolso" : "cobro"} en ${moneda}. Verifica que sea la correcta.`
      : `Opcional · primero aparecen las cuentas en la moneda del ${esReembolso ? "reembolso" : "cobro"}`;

  // Equivalente informativo en USD (misma aritmética simple que el cobro
  // por vuelo; la partición real la calcula el API).
  const usdEquivalente =
    moneda === "USD"
      ? Number(monto) || 0
      : tc && Number(tc) > 0
        ? (Number(monto) || 0) / Number(tc)
        : null;

  /** Body del API a partir del formulario (sin llave ni modo: se agregan al confirmar). */
  const armarPayload = (values: SobreFormValues): CreateCobroGrupoInput => {
    const m = values.metodo_cobro as MetodoPago;
    const conComision = !esReembolso;
    return {
      monto: signo * round2(Number(values.monto)),
      moneda: values.moneda as MonedaGrupo,
      metodo_cobro: m,
      tc_usd_mxn:
        values.moneda === "MXN" && Number(values.tc_usd_mxn) > 0
          ? Number(values.tc_usd_mxn)
          : undefined,
      // El DTO exige máximo 2 decimales (400 si se teclean 3): se redondea
      // aquí igual que el monto.
      comision_banco_monto:
        conComision && Number(values.comision_banco_monto) > 0
          ? round2(Number(values.comision_banco_monto))
          : undefined,
      comision_banco_pct:
        conComision &&
        !(Number(values.comision_banco_monto) > 0) &&
        Number(values.comision_banco_pct) > 0
          ? Number(values.comision_banco_pct)
          : undefined,
      cuenta_destino:
        METODOS_CON_CUENTA.includes(m) && values.cuenta_destino
          ? values.cuenta_destino
          : undefined,
      referencia: values.referencia?.trim() || undefined,
      fecha_cobro: values.fecha_cobro
        ? cancunInputToIso(`${values.fecha_cobro.slice(0, 10)}T12:00`)
        : undefined,
      notas: values.notas?.trim() || undefined,
    };
  };

  /** Paso 1 → 2: pide la vista previa al API (no escribe). */
  const onPrevisualizar = handleSubmit((values) => {
    if (esReembolso && !values.notas?.trim()) {
      toast.error("El motivo del reembolso es obligatorio.");
      return;
    }
    startTransition(async () => {
      const res = await previsualizarCobroGrupoAction(grupo.id, armarPayload(values));
      if (!res.ok) {
        toast.error(mensajeErrorGrupo(res.error));
        return;
      }
      setPreview(res.data);
      // Partición manual arranca desde la propuesta del API (0 para los
      // aviones que no recibieron parte).
      const porVuelo = new Map(res.data.partes.map((p) => [p.vuelo_id, p.monto]));
      setManualMontos(
        Object.fromEntries(
          vivos.map((a) => [
            a.vuelo_id,
            porVuelo.has(a.vuelo_id) ? String(Math.abs(porVuelo.get(a.vuelo_id) ?? 0)) : "0",
          ]),
        ),
      );
      setManual(false);
      setPaso(2);
    });
  });

  // Ayuda visual de la partición manual: Σ local vs monto (NO decide nada;
  // el API valida Σ == monto exacto al confirmar).
  const montoSobre = preview?.monto ?? 0;
  // Los inputs son ABSOLUTOS (el signo lo pone el tipo del sobre): un "-"
  // tecleado a mano no invierte la parte ni descuadra la ayuda visual.
  const montoManualAbs = (vueloId: string) => Math.abs(Number(manualMontos[vueloId]) || 0);
  const sumaManualAbs = round2(vivos.reduce((acc, a) => acc + montoManualAbs(a.vuelo_id), 0));
  const diferenciaManual = round2(sumaManualAbs - Math.abs(montoSobre));
  const manualCuadra = Math.abs(diferenciaManual) < 0.005;

  const onConfirmar = () => {
    if (!preview) return;
    const values = getValues();
    const base = armarPayload(values);
    const payload: CreateCobroGrupoInput = manual
      ? {
          ...base,
          client_request_id: crid,
          modo: "MANUAL",
          particion_manual: vivos
            .map((a) => ({
              vuelo_id: a.vuelo_id,
              monto: signo * round2(montoManualAbs(a.vuelo_id)),
            }))
            .filter((p) => p.monto !== 0),
        }
      : { ...base, client_request_id: crid, modo: "AUTO" };
    if (manual && payload.particion_manual!.length === 0) {
      toast.error("Captura al menos una parte por avión (distinta de 0).");
      return;
    }
    startTransition(async () => {
      const res = await registrarCobroGrupoAction(grupo.id, payload);
      if (!res.ok) {
        toast.error(mensajeErrorGrupo(res.error));
        return;
      }
      const s = res.data.sobre;
      const n = s.partes.length;
      if (res.data.idempotente) {
        toast.info("Este cobro ya estaba registrado", {
          description: `${fmtMonto(s.monto, s.moneda)} del grupo ${folio} (no se duplicó).`,
        });
      } else {
        toast.success(
          esReembolso
            ? `Reembolso registrado: ${fmtMonto(Math.abs(s.monto), s.moneda)} restado en ${n} ${n === 1 ? "avión" : "aviones"} del grupo ${folio}`
            : `Cobro registrado: ${fmtMonto(s.monto, s.moneda)} repartido en ${n} ${n === 1 ? "avión" : "aviones"} del grupo ${folio}`,
        );
        if (!s.cuadra) {
          toast.warning(
            "El sobre quedó descuadrado (sus partes no suman el monto): revísalo en Cobros del grupo — elimínalo o re-pártelo.",
            { duration: 12000 },
          );
        }
      }
      onClose();
      router.refresh();
    });
  };

  const titulo = esReembolso ? "Registrar reembolso del grupo" : "Registrar cobro del grupo";
  const filasPreview = preview?.partes ?? [];
  const previewPorVuelo = new Map(filasPreview.map((p) => [p.vuelo_id, p]));
  const modoMostrado = manual ? "MANUAL" : (preview?.modo_particion ?? null);
  const comisionPreview = preview?.comision_banco_monto ?? null;

  return (
    <Dialog
      open
      onOpenChange={(o, details) => {
        // Como el cobro por vuelo: un clic fuera o Esc NO tira la captura
        // (dinero); se cierra solo con Cancelar / la X.
        if (
          !o &&
          (details.reason === "outside-press" ||
            details.reason === "escape-key" ||
            details.reason === "focus-out")
        ) {
          return;
        }
        if (!o && !pending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {titulo} · <span className="font-mono">{folio}</span>
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              paso {paso} de 2
            </span>
          </DialogTitle>
          <DialogDescription>
            {esReembolso ? (
              <>
                Devolución al cliente. Se guarda como sobre NEGATIVO y{" "}
                <span className="font-medium text-foreground">
                  RESTA del cobrado de cada avión
                </span>{" "}
                en proporción a lo que tiene cobrado; sin comisión bancaria.
              </>
            ) : (
              <>
                Un solo pago del cliente que el sistema PARTE en un cobro por avión.
                Total <span className="font-mono">{fmtUsd(total)}</span> · Cobrado{" "}
                <span className="font-mono">{fmtUsd(cobrado)}</span> · Saldo{" "}
                <span
                  className={cn(
                    "font-mono",
                    saldo > 0 ? "text-destructive font-semibold" : "text-muted-foreground",
                  )}
                >
                  {fmtUsd(saldo)}
                </span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* ================= PASO 1: captura ================= */}
        <form
          onSubmit={onPrevisualizar}
          className={cn("space-y-4", paso !== 1 && "hidden")}
          aria-hidden={paso !== 1}
        >
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
            <p className="mb-1.5 font-medium text-foreground">Grupo</p>
            <div className="grid grid-cols-3 gap-2">
              <Dato label="Total USD" value={fmtUsd(total)} />
              <Dato
                label={tcSugerido?.fuente === "oficial" ? "TC oficial de referencia" : "TC del grupo"}
                value={tcSugerido ? fmtDecimal(tcSugerido.valor, 4) : "—"}
              />
              <Dato
                label="Aviones vivos"
                value={`${vivos.length}`}
              />
            </div>
            {!tcSugerido && (
              <p className="mt-1.5 text-muted-foreground">
                El grupo no fijó tipo de cambio y no hay TC oficial del día de la cotización:
                si cobras en pesos, captura el TC.
              </p>
            )}
          </div>

          <Field
            label={esReembolso ? "Método de devolución" : "Método de cobro"}
            required
            hint={
              metodo === "OTRO"
                ? "El sobre no tiene campo aparte para el método manual: escribe cuál fue en Notas."
                : undefined
            }
          >
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
            <Field label={esReembolso ? "Monto devuelto" : "Monto"} required error={errors.monto?.message}>
              <Input type="number" step="0.01" min={0} placeholder="0.00" {...register("monto")} />
            </Field>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Moneda</Label>
              <Segmented
                value={moneda}
                onChange={(v) => handleMonedaChange(v as MonedaGrupo)}
                options={[
                  { value: "USD", label: "USD" },
                  { value: "MXN", label: "MXN" },
                ]}
              />
            </div>
          </div>

          {moneda === "MXN" && (
            <Field
              label="Tipo de cambio USD/MXN"
              required
              hint={tcHint}
              error={errors.tc_usd_mxn?.message}
            >
              <Input
                type="number"
                step="0.0001"
                min={0}
                placeholder="20.50"
                {...register("tc_usd_mxn")}
              />
            </Field>
          )}

          {usdEquivalente !== null && Number(monto) > 0 && (
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Equivale a </span>
              <span className="font-mono font-semibold">{fmtUsd(usdEquivalente)}</span>
              <span className="text-muted-foreground"> USD. </span>
              {esReembolso ? (
                <span className="text-muted-foreground">
                  Se resta del cobrado del grupo (hoy {fmtUsd(cobrado)}).
                </span>
              ) : usdEquivalente > saldo + TOLERANCIA_COBRO_USD ? (
                // Misma regla del API (LIQUIDACION solo si cubre los saldos ±1
                // USD): por encima se reparte proporcional al precio y el API
                // avisa el sobrepago en la vista previa.
                <span className="text-amber-600 dark:text-amber-400">
                  Supera el saldo del grupo por ≈ {fmtUsd(usdEquivalente - saldo)} USD: se
                  repartirá en proporción al precio de cada avión y algún avión quedará con
                  cobrado mayor a su precio. Revisa el monto o usa «Partir a mano» en el
                  siguiente paso.
                </span>
              ) : usdEquivalente >= saldo - TOLERANCIA_COBRO_USD ? (
                <span className="text-green-600 dark:text-green-400">
                  Cubre el saldo — cada avión recibirá exactamente lo que le falta.
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Pago parcial: se repartirá en proporción al precio de cada avión. Quedará
                  pendiente ≈ {fmtUsd(saldo - usdEquivalente)} USD.
                </span>
              )}
            </div>
          )}

          {!esReembolso && (
            <>
              <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                <Field
                  label="Comisión del banco (%)"
                  hint="Si conoces el porcentaje."
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
                El cliente pagó el monto completo; el banco deposita monto − comisión. La
                comisión se reparte entre los aviones con los mismos pesos que el pago.
              </p>
              {Number(monto) > 0 &&
                (Number(comisionMontoDirecto) > 0 || Number(comisionPct) > 0) && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
                    {(() => {
                      // Mismo redondeo que el API (comisión a 2 decimales; el
                      // neto se deriva de ella). Solo informativo.
                      const comision =
                        Number(comisionMontoDirecto) > 0
                          ? round2(Number(comisionMontoDirecto))
                          : round2(Number(monto) * (Number(comisionPct) / 100));
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
                            −{fmtMonto(comision, moneda)}
                          </span>
                          <span className="text-muted-foreground"> · El banco depositará </span>
                          <span className="font-mono font-semibold">
                            {fmtMonto(Number(monto) - comision, moneda)}
                          </span>
                          <span className="text-muted-foreground">
                            . Los aviones se acreditan por el monto completo.
                          </span>
                        </>
                      );
                    })()}
                  </div>
                )}
            </>
          )}

          {METODOS_CON_CUENTA.includes(metodo) && (
            <Field
              label={esReembolso ? "¿De qué cuenta salió?" : "¿A qué cuenta llegó?"}
              hint={cuentaHint}
              error={errors.cuenta_destino?.message}
            >
              <SearchableSelect
                options={cuentaOptions}
                value={cuentaDestino ?? ""}
                onChange={(v) =>
                  setValue("cuenta_destino", v as SobreFormValues["cuenta_destino"], {
                    shouldValidate: true,
                  })
                }
                placeholder="Sin especificar"
                searchPlaceholder="Buscar cuenta…"
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <Field
              label="Referencia"
              hint="Folio bancario, ticket, voucher BillPocket, etc."
              error={errors.referencia?.message}
            >
              <Input placeholder="Opcional" {...register("referencia")} />
            </Field>
            <Field
              label={esReembolso ? "Fecha del reembolso" : "Fecha del cobro"}
              error={errors.fecha_cobro?.message}
            >
              <Input type="date" {...register("fecha_cobro")} />
            </Field>
          </div>

          <Field
            label={esReembolso ? "Motivo del reembolso" : "Notas"}
            required={esReembolso}
            hint={esReembolso ? "Queda registrado en cada parte (auditoría)." : undefined}
            error={errors.notas?.message}
          >
            <Textarea
              rows={2}
              placeholder={
                esReembolso
                  ? "Ej. el grupo se redujo: se devuelve la diferencia"
                  : "Opcional"
              }
              {...register("notas")}
            />
          </Field>
        </form>

        {/* ================= PASO 2: vista previa de la partición ================= */}
        {paso === 2 && preview && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Dato
                  label={esReembolso ? "Reembolso" : "Monto del sobre"}
                  value={fmtMonto(preview.monto, preview.moneda)}
                />
                <Dato
                  label="≈ USD"
                  value={fmtUsd(preview.monto_usd)}
                />
                <Dato
                  label="Comisión banco"
                  value={
                    comisionPreview != null && comisionPreview > 0
                      ? `−${fmtMonto(comisionPreview, preview.moneda)}`
                      : "—"
                  }
                />
                <Dato
                  label="Neto al banco"
                  value={
                    comisionPreview != null && comisionPreview > 0
                      ? fmtMonto(preview.neto, preview.moneda)
                      : fmtMonto(preview.monto, preview.moneda)
                  }
                />
              </div>
              {preview.moneda === "MXN" && preview.tc_usd_mxn != null && (
                <p className="mt-1.5 text-muted-foreground">
                  TC {fmtDecimal(preview.tc_usd_mxn, 4)} · cada parte se guarda en pesos con
                  este mismo TC.
                </p>
              )}
            </div>

            {/* Modo detectado + explicación de una línea */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="text-muted-foreground">Partición: </span>
                  <Badge variant="outline" className="font-medium">
                    {etiquetaModoParticion(modoMostrado)}
                  </Badge>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {explicacionModoParticion(modoMostrado, { esReembolso })}
                </p>
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm cursor-pointer select-none">
                <span>
                  Partir a mano
                  <span className="block text-[11px] text-muted-foreground">
                    Captura cuánto {esReembolso ? "se devuelve a" : "recibe"} cada avión
                  </span>
                </span>
                <Switch checked={manual} onCheckedChange={setManual} disabled={pending} />
              </label>
            </div>

            {/* Avisos del API (sobrepago, avión que recibiría más que su saldo…): NUNCA se esconden. */}
            {preview.avisos.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                <ExclamationTriangleIcon className="h-4 w-4 shrink-0 mt-0.5" />
                <ul className="space-y-0.5 list-disc pl-4">
                  {preview.avisos.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Tabla por avión (números del API; en manual, los inputs son la captura) */}
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Avión</TableHead>
                    <TableHead className="text-right">Saldo antes</TableHead>
                    <TableHead className="text-right">
                      {esReembolso ? "Devuelve" : "Parte"} ({preview.moneda})
                    </TableHead>
                    {preview.moneda === "MXN" && <TableHead className="text-right">≈ USD</TableHead>}
                    <TableHead className="text-right">Saldo después</TableHead>
                    <TableHead className="text-right">Peso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(manual ? vivos.map((a) => ({ avion: a, parte: previewPorVuelo.get(a.vuelo_id) ?? null })) : filasPreview.map((p) => ({ avion: vivos.find((a) => a.vuelo_id === p.vuelo_id) ?? null, parte: p }))).map((fila, i) => {
                    const vueloId = fila.avion?.vuelo_id ?? fila.parte?.vuelo_id ?? String(i);
                    const posicion = fila.parte?.posicion ?? fila.avion?.posicion ?? null;
                    const matricula =
                      fila.parte?.matricula ?? fila.avion?.aeronave?.matricula ?? "Sin avión";
                    const folioHijo = fila.parte?.folio ?? fila.avion?.folio ?? null;
                    // Saldo antes: del API si vino en la propuesta; si no
                    // (avión sin parte), el saldo que trae el detalle.
                    const saldoAntes =
                      fila.parte?.saldo_antes_usd ??
                      (fila.avion ? round2(fila.avion.total_usd - fila.avion.cobrado_usd) : null);
                    return (
                      <TableRow key={vueloId}>
                        <TableCell className="font-mono text-xs">{posicion ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          <span className="font-mono font-medium">{matricula}</span>
                          {folioHijo != null && (
                            <Link
                              href={`/admin/quotes/${vueloId}`}
                              target="_blank"
                              className="ml-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                            >
                              #{folioHijo}
                            </Link>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {saldoAntes != null ? fmtUsd(saldoAntes) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {manual ? (
                            <Input
                              type="number"
                              step="0.01"
                              min={0}
                              inputMode="decimal"
                              className="h-8 w-32 ml-auto text-right font-mono"
                              value={manualMontos[vueloId] ?? ""}
                              onChange={(e) =>
                                setManualMontos((m) => ({ ...m, [vueloId]: e.target.value }))
                              }
                              aria-label={`Parte del avión ${posicion ?? ""} (${matricula})`}
                            />
                          ) : (
                            <span className={cn(esReembolso && "text-red-600 dark:text-red-400")}>
                              {fmtMonto(fila.parte?.monto ?? 0, preview.moneda)}
                            </span>
                          )}
                        </TableCell>
                        {preview.moneda === "MXN" && (
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {manual ? "—" : fmtUsd(fila.parte?.monto_usd ?? 0)}
                          </TableCell>
                        )}
                        <TableCell className="text-right font-mono text-xs">
                          {manual || !fila.parte ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span
                              className={cn(
                                fila.parte.saldo_despues_usd < -1 && "text-amber-600 dark:text-amber-400",
                                fila.parte.saldo_despues_usd <= 1 && fila.parte.saldo_despues_usd >= -1 && "text-emerald-600 dark:text-emerald-400",
                              )}
                              title={
                                fila.parte.saldo_despues_usd < -1
                                  ? "Quedaría con cobrado mayor a su precio"
                                  : undefined
                              }
                            >
                              {fmtUsd(fila.parte.saldo_despues_usd)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-[11px] text-muted-foreground">
                          {manual || !fila.parte ? "—" : `${fmtDecimal(fila.parte.factor * 100, 2)}%`}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Verificación Σ (del API en AUTO; ayuda visual local en MANUAL) */}
            {manual ? (
              <p
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  manualCuadra ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
                )}
                role="status"
              >
                {manualCuadra ? (
                  <>
                    <CheckCircleIcon className="h-4 w-4" />
                    Las partes suman {fmtMonto(sumaManualAbs, preview.moneda)}: cuadran con el
                    sobre.
                  </>
                ) : (
                  <>
                    <ExclamationTriangleIcon className="h-4 w-4" />
                    Las partes suman {fmtMonto(sumaManualAbs, preview.moneda)} y el sobre es{" "}
                    {fmtMonto(Math.abs(montoSobre), preview.moneda)}:{" "}
                    {diferenciaManual > 0 ? "sobran" : "faltan"}{" "}
                    {fmtMonto(Math.abs(diferenciaManual), preview.moneda)}. El sistema exige
                    que sumen exacto.
                  </>
                )}
              </p>
            ) : (
              <p
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  preview.verificacion.cuadra && preview.verificacion.cuadra_comision
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive",
                )}
                role="status"
              >
                {preview.verificacion.cuadra ? (
                  <>
                    <CheckCircleIcon className="h-4 w-4" />
                    Las {filasPreview.length} partes suman exacto{" "}
                    {fmtMonto(preview.verificacion.suma_partes, preview.moneda)}
                    {comisionPreview != null && comisionPreview > 0
                      ? preview.verificacion.cuadra_comision
                        ? " · la comisión también cuadra"
                        : " · la comisión NO cuadra"
                      : ""}
                    .
                  </>
                ) : (
                  <>
                    <ExclamationTriangleIcon className="h-4 w-4" />
                    Las partes suman {fmtMonto(preview.verificacion.suma_partes, preview.moneda)} y
                    el sobre es {fmtMonto(preview.verificacion.monto, preview.moneda)}: no cuadra,
                    no confirmes. Avisa a soporte.
                  </>
                )}
              </p>
            )}

            {esReembolso && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs">
                Al confirmar, esto <span className="font-semibold">RESTA</span> del cobrado de
                cada avión listado; el saldo del grupo se recalcula al instante y puede volver a
                quedar pendiente de cobro.
                {notas?.trim() ? (
                  <>
                    {" "}
                    Motivo: <span className="font-medium">{notas.trim()}</span>
                  </>
                ) : null}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {paso === 1 ? (
            <>
              <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
                Cancelar
              </Button>
              <Button type="button" onClick={onPrevisualizar} disabled={pending}>
                {pending ? "Calculando…" : "Ver partición por avión"}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPaso(1)}
                disabled={pending}
                className="gap-1.5"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Volver a editar
              </Button>
              <Button
                type="button"
                onClick={onConfirmar}
                disabled={pending || (!manual && !preview?.verificacion.cuadra)}
                className={cn(esReembolso && "bg-destructive text-white hover:bg-destructive/90")}
              >
                {pending
                  ? "Registrando…"
                  : esReembolso
                    ? "Confirmar reembolso"
                    : "Confirmar cobro"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Par etiqueta/valor compacto. */
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
              "flex-1 h-7 px-2 text-xs font-medium rounded-md transition-colors",
              active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
