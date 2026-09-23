"use client";

import type { ReactNode } from "react";
import type { UseFormRegister, UseFormSetValue } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Field } from "@/components/admin/form-field";
import { CampoHorasPactadas } from "@/components/admin/quotes/campo-horas-pactadas";
import { QuotePlegable } from "./quote-plegable";
import { METODOS_PAGO, metodoPagoLabel } from "@/lib/admin/metodos-pago";
import { HORAS_EPSILON_4, fmtHorasDecimal, mismasHoras } from "@/lib/admin/horas";
import { type SegmentoTarifa } from "@/lib/admin/tarifa";
import { fmtDecimal, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AircraftOption, QuoteFormValues } from "./quote-form-types";
import type { MetodoPago, QuoteBreakdown, TipoTarifa } from "@/types/quote";
import type { PersistedQuote } from "@/types/quotes-persisted";

/**
 * CAPTURA DE LA COTIZACIÓN para el rol que NO ve la hoja interna (hoy solo
 * SOCIO), en un `<details>` DEBAJO de la hoja del cliente.
 *
 * POR QUÉ EXISTE (22-sep-2026, revisión de la Fase 2.3). Al retirar el panel
 * lateral «Interno · no se imprime», la tarifa, las horas, la comisión del
 * vendedor y el bloque de cobro se mudaron AL PAPEL de la hoja interna. Pero
 * la hoja interna solo la ven `ROLES_HOJA_INTERNA` (ADMIN, COORDINADOR,
 * FACTURACION, ANALISTA): a SOCIO —que entra al cotizador por el menú y
 * puede SIMULAR precios (`POST /v1/quotes/calculate` sí lo admite)— la
 * pantalla se le quedó sin UN SOLO control de dinero. El panel que se retiró
 * se pintaba para todos los roles, así que eso era perder trece controles que
 * ese rol tenía ayer. Aquí vuelven, con el MISMO campo RHF y el MISMO id
 * ancla, sin duplicarlos: este bloque se monta ÚNICAMENTE cuando la hoja
 * interna NO está montada.
 *
 * REGLAS QUE NO CAMBIAN:
 *  - Ni un número se calcula aquí: todo es `setValue`/`register` sobre los
 *    campos del formulario; el dinero lo sigue resolviendo el motor
 *    (`POST /calculate`) y se lee en el desglose de la hoja.
 *  - El contenido NUNCA se desmonta (`QuotePlegable` es un `<details>`), así
 *    que plegar no pierde lo tecleado ni deja sin destino a los ids ancla.
 *  - Solo el `<summary>` va `data-guard-exempt`: cambiar cualquiera de estos
 *    controles ES editar y tiene que disparar la confirmación única de
 *    CONFIRMADO/RESERVA.
 *
 * Abre por DEFECTO: es el único sitio donde este rol puede tocar la tarifa.
 */
export function QuoteCapturaBasica({
  lectura,
  isRevise,
  initialQuote,
  values,
  setValue,
  register,
  breakdown,
  selectedAircraft,
  clienteInterno,
  tarifaSegment,
  setTarifaCustom,
}: {
  lectura: boolean;
  isRevise: boolean;
  initialQuote?: PersistedQuote;
  values: QuoteFormValues;
  setValue: UseFormSetValue<QuoteFormValues>;
  register: UseFormRegister<QuoteFormValues>;
  breakdown: QuoteBreakdown | null;
  selectedAircraft?: AircraftOption;
  clienteInterno: boolean;
  tarifaSegment: SegmentoTarifa;
  setTarifaCustom: (v: boolean) => void;
}) {
  const tarifaHrTxt = breakdown
    ? `${fmtUsd(breakdown.tarifa.usd_por_hora)}/hr`
    : Number(initialQuote?.tarifa_hora_usd) > 0
      ? `${fmtUsd(Number(initialQuote!.tarifa_hora_usd))}/hr`
      : "—";
  const resumen = [
    tarifaSegment === "CUSTOM" ? "tarifa personalizada" : tarifaSegment === "BROKER" ? "tarifa broker" : "tarifa pública",
    tarifaHrTxt,
    metodoPagoLabel(values.metodo_pago),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <QuotePlegable
      id="captura"
      titulo="Ajustes de la cotización (tarifa, horas, cobro)"
      resumen={resumen}
      abiertoPorDefecto
    >
      {lectura ? (
        <CapturaLectura
          values={values}
          breakdown={breakdown}
          initialQuote={initialQuote}
          tarifaSegment={tarifaSegment}
          tarifaHrTxt={tarifaHrTxt}
        />
      ) : (
        <div className="space-y-4">
          {/* ---------- TARIFA Y HORAS ---------- */}
          <Apartado titulo="Tarifa y horas">
            <div id="tarifa-tipo-field" className="scroll-mt-24 space-y-2">
              <Label className="text-sm font-medium">Tipo de tarifa</Label>
              <Segmentado
                value={tarifaSegment}
                onChange={(v) => {
                  if (v === "CUSTOM") {
                    setTarifaCustom(true);
                    return;
                  }
                  setTarifaCustom(false);
                  // Volver a la tarifa estándar LIMPIA el override: si no,
                  // seguiría mandando sobre Pública/Broker en silencio
                  // (misma regla que tenía el panel y que hoy tiene el papel).
                  setValue("tarifa_hora_override_usd", null);
                  setValue("tipo_tarifa", v as TipoTarifa);
                }}
                options={[
                  { value: "PUBLICO", label: "Pública", sub: tarifaSub(selectedAircraft?.tarifa_hora_pub_usd) },
                  { value: "BROKER", label: "Broker", sub: tarifaSub(selectedAircraft?.tarifa_hora_broker_usd) },
                  { value: "CUSTOM", label: "Personalizada", sub: tarifaSub(values.tarifa_hora_override_usd) },
                ]}
              />
              {breakdown && (
                <p className="text-xs text-muted-foreground">
                  Aplica <span className="font-mono font-semibold text-foreground">{tarifaHrTxt}</span>{" "}
                  {breakdown.tarifa.proviene_de_override
                    ? "· cambiada SOLO para esta cotización"
                    : breakdown.tarifa.preferencial_cliente
                      ? "· tarifa pactada con este cliente"
                      : `· tarifa ${breakdown.tarifa.tipo === "PUBLICO" ? "pública" : "broker"} del avión`}
                </p>
              )}
            </div>
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
                  {/* 6 decimales (#105): con `step="0.01"` el navegador marca
                      inválido un 989.583333, que es lo que persiste el API. */}
                  <Input
                    type="number"
                    step="0.000001"
                    min={0}
                    placeholder="Auto"
                    className="w-36 font-mono"
                    {...register("tarifa_hora_override_usd")}
                  />
                </Field>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div id="sobrevuelo-field" className="scroll-mt-24">
                <Field label="Sobrevuelo (hr)" hint="Tiempo extra sobre la zona; se suma al cobrable.">
                  <Input
                    type="number"
                    step="0.1"
                    min={0}
                    max={24}
                    placeholder="0"
                    className="w-28 font-mono"
                    {...register("sobrevuelo_hr")}
                  />
                </Field>
              </div>
              <div id="cobrable-field" className="scroll-mt-24">
                <Field
                  label="Cobrable pactado (hr)"
                  hint={
                    breakdown
                      ? breakdown.tiempos.cobrable_proviene_de_override
                        ? `Pactado a mano · la regla daría ${fmtHorasDecimal(breakdown.tiempos.cobrable_hr_regla ?? 0, 4)} hr`
                        : `Vuelo ${fmtDecimal(breakdown.tiempos.vuelo_hr, 2)} · calzos ${fmtDecimal(breakdown.tiempos.calzos_hr, 2)} hr · vacío = regla (mínimo 1 hr). Acepta h:mm, p. ej. 2:20.`
                      : "Vacío = regla (vuelo + calzos + sobrevuelo, mínimo 1 hr). Acepta h:mm, p. ej. 2:20."
                  }
                >
                  <CampoHorasPactadas
                    id="cobrable-input"
                    valor={values.tiempo_cobrable_override_hr}
                    onChange={(v) => setValue("tiempo_cobrable_override_hr", v)}
                    placeholder={
                      breakdown
                        ? fmtHorasDecimal(breakdown.tiempos.cobrable_hr_regla ?? breakdown.tiempos.cobrable_hr, 4)
                        : "2:20 o 2.5"
                    }
                    tarifaUsdHr={breakdown?.tarifa.usd_por_hora ?? null}
                    importeUsd={breakdown?.totales.subtotal_vuelo_usd ?? null}
                    // El breakdown va un debounce atrás: el importe solo se
                    // enseña cuando corresponde a las horas que se ven.
                    importeVigente={
                      !!breakdown &&
                      breakdown.tiempos.cobrable_proviene_de_override === true &&
                      mismasHoras(
                        breakdown.tiempos.cobrable_hr,
                        values.tiempo_cobrable_override_hr,
                        HORAS_EPSILON_4,
                      )
                    }
                  />
                </Field>
              </div>
            </div>
          </Apartado>

          {/* ---------- COMISIÓN DEL VENDEDOR ---------- */}
          <Apartado titulo="Comisión del vendedor">
            <div className="w-56">
              <Segmentado
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
            <p className="text-[11px] text-muted-foreground">
              Se SUMA al precio del cliente y se absorbe en «Servicio aéreo»: nunca sale como línea en el
              PDF.
              {breakdown?.meta?.neto_vuelatour_usd != null && (
                <>
                  {" · "}
                  <span className="font-mono">Neto VuelaTour {fmtUsd(breakdown.meta.neto_vuelatour_usd)}</span>
                </>
              )}
            </p>
          </Apartado>

          {/* ---------- COBRO ---------- */}
          <Apartado titulo="Cobro">
            <div id="metodo-pago-field" className="scroll-mt-24">
              <Field
                label="Método de pago previsto"
                required
                hint="Decide el IVA (16 % con factura). Es lo previsto: el método REAL es el de cada cobro registrado."
              >
                <SearchableSelect
                  options={METODOS_PAGO.map((m) => ({ value: m.value, label: m.label, description: m.hint }))}
                  value={values.metodo_pago}
                  onChange={(v) => setValue("metodo_pago", v as MetodoPago)}
                  placeholder="Selecciona método"
                />
              </Field>
            </div>
            {values.metodo_pago === "OTRO" && (
              <Field label="¿Cuál método?" required hint="Escríbelo tal como quieren verlo (ej. PayPal).">
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
                  label="Comisión de terminal (%)"
                  hint="Custom por operación · tope 20 % · sin IVA · sale como línea «Comisión BillPocket»."
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
              <Interruptor
                titulo="Redondeo automático a número cerrado"
                ayuda="Hacia arriba al siguiente múltiplo de $10 (976→980). Se absorbe en «Servicio aéreo»."
                checked={values.redondeo_auto}
                onCheckedChange={(c) => setValue("redondeo_auto", c)}
              />
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
            </div>
            <Interruptor
              recuadro
              titulo="Se cobran TUAS"
              ayuda={`Apagado: ninguna TUA entra al total. El monto por aeropuerto se edita en el desglose de la hoja.${
                breakdown && values.cobrar_tuas ? ` · Total ${fmtUsd(breakdown.tuas.total_usd)}` : ""
              }`}
              checked={values.cobrar_tuas}
              onCheckedChange={(c) => setValue("cobrar_tuas", c)}
            />
            <Interruptor
              recuadro
              titulo="Cotización abierta"
              ayuda="El itinerario/precio se cierra al final: permite re-cotizar con los tramos reales hasta antes de cobrar/facturar."
              checked={values.cotizacion_abierta}
              onCheckedChange={(c) => setValue("cotizacion_abierta", c)}
            />
            <Interruptor
              recuadro
              titulo="Pase de abordar"
              ayuda="Exenta TUAS (excepto CZM)."
              checked={values.pase_abordar}
              onCheckedChange={(c) => setValue("pase_abordar", c)}
            />
          </Apartado>

          {/* ---------- NOTAS INTERNAS ---------- */}
          <Apartado titulo="Notas internas">
            {!isRevise ? (
              <Field label="Notas internas" hint="Solo para el equipo · no aparecen en el PDF.">
                <Textarea rows={2} placeholder="Solo para el equipo" {...register("notas_internas")} />
              </Field>
            ) : (
              <p className="text-sm">
                {initialQuote?.notas_internas ? (
                  <span className="whitespace-pre-wrap">{initialQuote.notas_internas}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
                <span className="mt-1 block text-xs text-muted-foreground">
                  Se editan desde el detalle del vuelo («Editar datos»): al revisar una cotización no
                  viajan.
                </span>
              </p>
            )}
          </Apartado>
        </div>
      )}
    </QuotePlegable>
  );
}

/** Lo MISMO en LECTURA: los datos que este rol leía en el panel retirado. */
function CapturaLectura({
  values,
  breakdown,
  initialQuote,
  tarifaSegment,
  tarifaHrTxt,
}: {
  values: QuoteFormValues;
  breakdown: QuoteBreakdown | null;
  initialQuote?: PersistedQuote;
  tarifaSegment: SegmentoTarifa;
  tarifaHrTxt: string;
}) {
  const cobrable = breakdown
    ? `${fmtHorasDecimal(breakdown.tiempos.cobrable_hr, 4)} hr`
    : Number(initialQuote?.tiempo_cobrable_hr) > 0
      ? `${fmtHorasDecimal(Number(initialQuote!.tiempo_cobrable_hr), 4)} hr`
      : "—";
  const filas: [string, ReactNode][] = [
    [
      "Tipo de tarifa",
      `${tarifaSegment === "CUSTOM" ? "Personalizada" : tarifaSegment === "BROKER" ? "Broker" : "Pública"} · ${tarifaHrTxt}`,
    ],
    ["Sobrevuelo", Number(values.sobrevuelo_hr) > 0 ? `${fmtDecimal(Number(values.sobrevuelo_hr))} hr` : "—"],
    ["Tiempo cobrable", cobrable],
    [
      "Comisión del vendedor",
      breakdown?.meta?.comision_vendedor_usd
        ? `${fmtUsd(breakdown.meta.comision_vendedor_usd)}${values.comision_vendedor_nombre ? ` · ${values.comision_vendedor_nombre}` : ""}`
        : "—",
    ],
    ["Método de pago", metodoPagoLabel(values.metodo_pago)],
    [
      "Redondeo",
      values.redondeo_auto
        ? "Automático (múltiplo de $10)"
        : Number(values.redondeo_usd) > 0
          ? `Manual ${fmtUsd(Number(values.redondeo_usd))}`
          : "—",
    ],
    ["TUAS", values.cobrar_tuas ? "Se cobran" : "No se cobran"],
    ["Cotización abierta", values.cotizacion_abierta ? "Sí" : "No"],
    ["Pase de abordar", values.pase_abordar ? "Sí" : "No"],
    [
      "Notas internas",
      initialQuote?.notas_internas ? (
        <span className="whitespace-pre-wrap">{initialQuote.notas_internas}</span>
      ) : (
        "—"
      ),
    ],
  ];
  return (
    <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
      {filas.map(([k, v]) => (
        <div key={k} className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">{k}:</dt>
          <dd className="font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Apartado({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">{titulo}</p>
      {children}
    </section>
  );
}

/** Switch con su etiqueta y su ayuda (el patrón del panel retirado). */
function Interruptor({
  titulo,
  ayuda,
  checked,
  onCheckedChange,
  recuadro = false,
}: {
  titulo: string;
  ayuda: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  recuadro?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3",
        recuadro && "rounded-lg border border-border p-3",
      )}
    >
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{titulo}</Label>
        <p className="text-xs text-muted-foreground">{ayuda}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={titulo} />
    </div>
  );
}

/** Selector segmentado que no recorta (copia literal del panel retirado). */
function Segmentado({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; sub?: string; disabled?: boolean }[];
}) {
  const conSub = options.some((o) => !!o.sub);
  return (
    <div
      role="group"
      className="grid w-full gap-0.5 rounded-lg border border-border bg-muted/40 p-1"
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
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              opt.disabled && "cursor-not-allowed opacity-50",
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
                {opt.sub ?? " "}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** «$1,550/hr» bajo una opción del segmento (o nada si no hay tarifa). */
function tarifaSub(n: number | string | null | undefined): string | undefined {
  if (n == null || `${n}`.trim() === "") return undefined;
  const v = Number(n);
  if (!Number.isFinite(v)) return undefined;
  if (Number.isInteger(v)) return `$${v.toLocaleString("en-US")}/hr`;
  return `${fmtUsd(v)}/hr`;
}
