"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  CalculatorIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import { calculateQuote } from "@/lib/api/quotes-browser";
import { isApiError } from "@/lib/api/errors";
import { fmtDecimal, fmtUsd } from "@/lib/format";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type {
  CalculateQuoteRequest,
  MetodoPago,
  QuoteBreakdown,
  TipoTarifa,
} from "@/types/quote";

interface AircraftOption {
  id: string;
  matricula: string;
  modelo: string;
  pais_registro: "MX" | "USA";
  velocidad_crucero_kts: number;
  tarifa_hora_pub_usd: number | null;
  tarifa_hora_broker_usd: number | null;
}

interface RouteOption {
  id: string;
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: number;
  es_redondo_auto: boolean;
  num_aterrizajes: number;
}

interface QuoteFormValues {
  aeronave_id: string;
  ruta_mode: "predefined" | "manual";
  ruta_id: string;
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: number;
  es_redondo_auto: boolean;
  num_aterrizajes: number;
  tipo_tarifa: TipoTarifa;
  pasajeros: number;
  pase_abordar: boolean;
  metodo_pago: MetodoPago;
  tarifa_hora_override_usd: number | null;
  tuas_override_usd_pax: number | null;
  iva_pct_override: number | null;
}

const METODOS_PAGO: { value: MetodoPago; label: string; hint: string }[] = [
  { value: "TRANSFERENCIA", label: "Transferencia", hint: "Con factura · IVA 16%" },
  { value: "HSBC_LINK", label: "HSBC link", hint: "Con factura · IVA 16%" },
  { value: "BILLPOCKET", label: "BillPocket", hint: "Sin factura" },
  { value: "EFECTIVO", label: "Efectivo", hint: "Sin IVA" },
  { value: "DOLARES", label: "Dólares directo", hint: "Sin IVA" },
];

export function QuoteCalculator({
  aircraft,
  routes,
}: {
  aircraft: AircraftOption[];
  routes: RouteOption[];
}) {
  const [advanced, setAdvanced] = useState(false);

  const {
    register,
    watch,
    setValue,
    formState: { isValid },
  } = useForm<QuoteFormValues>({
    mode: "onChange",
    defaultValues: {
      aeronave_id: aircraft[0]?.id ?? "",
      ruta_mode: "predefined",
      ruta_id: routes[0]?.id ?? "",
      origen_iata: "",
      destino_iata: "",
      millas_nauticas: 0,
      es_redondo_auto: true,
      num_aterrizajes: 2,
      tipo_tarifa: "PUBLICO",
      pasajeros: 2,
      pase_abordar: false,
      metodo_pago: "TRANSFERENCIA",
      tarifa_hora_override_usd: null,
      tuas_override_usd_pax: null,
      iva_pct_override: null,
    },
  });

  const values = watch();
  const debounced = useDebouncedValue(values, 350);

  const payload = useMemo<CalculateQuoteRequest | null>(() => {
    if (!debounced.aeronave_id) return null;
    const base: CalculateQuoteRequest = {
      aeronave_id: debounced.aeronave_id,
      tipo_tarifa: debounced.tipo_tarifa,
      pasajeros: Number(debounced.pasajeros) || 0,
      pase_abordar: debounced.pase_abordar,
      metodo_pago: debounced.metodo_pago,
    };
    if (debounced.ruta_mode === "predefined") {
      if (!debounced.ruta_id) return null;
      base.ruta_id = debounced.ruta_id;
    } else {
      if (!debounced.origen_iata || !debounced.destino_iata || !debounced.millas_nauticas) {
        return null;
      }
      base.origen_iata = debounced.origen_iata;
      base.destino_iata = debounced.destino_iata;
      base.millas_nauticas = Number(debounced.millas_nauticas);
      base.es_redondo_auto = debounced.es_redondo_auto;
      base.num_aterrizajes = Number(debounced.num_aterrizajes) || 2;
    }
    if (base.pasajeros < 1) return null;
    if (debounced.tarifa_hora_override_usd) {
      base.tarifa_hora_override_usd = Number(debounced.tarifa_hora_override_usd);
    }
    if (debounced.tuas_override_usd_pax !== null && debounced.tuas_override_usd_pax !== undefined) {
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
    if (!payload) {
      setBreakdown(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    calculateQuote(payload)
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
  }, [payload]);

  const selectedAircraft = aircraft.find((a) => a.id === values.aeronave_id);
  const selectedRoute = routes.find((r) => r.id === values.ruta_id);
  const tipoTarifa = values.tipo_tarifa;
  const rutaMode = values.ruta_mode;

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
          {/* Aeronave */}
          <Field label="Aeronave" required>
            <SearchableSelect
              options={aircraft.map((a) => ({
                value: a.id,
                label: `${a.matricula} — ${a.modelo}`,
                description: `${a.velocidad_crucero_kts} kts${
                  !a.tarifa_hora_pub_usd && !a.tarifa_hora_broker_usd ? " · sin tarifa" : ""
                }`,
              }))}
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
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Ruta<span className="text-destructive ml-0.5">*</span>
            </Label>
            <Segmented
              value={rutaMode}
              onChange={(v) => setValue("ruta_mode", v as "predefined" | "manual")}
              options={[
                { value: "predefined", label: "Predefinida" },
                { value: "manual", label: "Manual" },
              ]}
            />
          </div>

          {rutaMode === "predefined" ? (
            <Field label="Ruta predefinida" required>
              <SearchableSelect
                options={routes.map((r) => ({
                  value: r.id,
                  label: `${r.origen_iata} → ${r.destino_iata}`,
                  description: `${r.millas_nauticas} NM one-way${
                    r.es_redondo_auto ? " (× 2 auto)" : ""
                  }`,
                }))}
                value={values.ruta_id}
                onChange={(v) => setValue("ruta_id", v)}
                placeholder="Selecciona ruta"
              />
              {selectedRoute && selectedRoute.es_redondo_auto && (
                <p className="text-xs text-muted-foreground mt-1">
                  Redondo auto: el motor calcula{" "}
                  {fmtDecimal(selectedRoute.millas_nauticas * 2)} NM totales.
                </p>
              )}
            </Field>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Origen IATA" required>
                  <Input
                    maxLength={4}
                    placeholder="CUN"
                    className="font-mono uppercase"
                    {...register("origen_iata")}
                  />
                </Field>
                <Field label="Destino IATA" required>
                  <Input
                    maxLength={4}
                    placeholder="CZM"
                    className="font-mono uppercase"
                    {...register("destino_iata")}
                  />
                </Field>
              </div>
              <Field label="Millas náuticas one-way" required>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="63.14"
                  {...register("millas_nauticas")}
                />
              </Field>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label className="text-sm font-medium">Redondo automático</Label>
                  <p className="text-xs text-muted-foreground">Multiplica NM × 2</p>
                </div>
                <Switch
                  checked={values.es_redondo_auto}
                  onCheckedChange={(c) => setValue("es_redondo_auto", c)}
                />
              </div>
              <Field label="Aterrizajes" hint="0.15 hr de calzos por aterrizaje">
                <Input type="number" min={1} {...register("num_aterrizajes")} />
              </Field>
            </>
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
              <Input type="number" min={1} {...register("pasajeros")} />
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
                hint="Vacío = usa la del aeropuerto"
              >
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="Auto"
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
        ) : !payload ? (
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
      </div>
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
            </div>
            <Badge className="bg-brand-600/15 text-brand-600 dark:text-brand-400 border-brand-600/30">
              {breakdown.tarifa.tipo}
            </Badge>
          </div>
          <div className="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-3 text-sm">
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
          </div>
        </CardContent>
      </Card>

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
            <Row
              label="Cobrable"
              value={`${fmtDecimal(breakdown.tiempos.cobrable_hr, 4)} hr`}
              bold
            />
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
              hint={breakdown.tarifa.proviene_de_override ? "Override manual" : "Del avión"}
            />
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

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
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
