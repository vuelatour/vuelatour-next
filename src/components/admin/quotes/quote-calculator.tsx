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
import { calculateQuote, getAirportDistance } from "@/lib/api/quotes-browser";
import { isApiError } from "@/lib/api/errors";
import { fmtDecimal, fmtUsd } from "@/lib/format";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { createQuoteAction, reviseQuoteAction } from "@/app/admin/quotes/actions";
import type {
  CalculateQuoteRequest,
  EscalaInput,
  MetodoPago,
  QuoteBreakdown,
  TipoTarifa,
  TipoVuelo,
} from "@/types/quote";
import type { PersistedQuote } from "@/types/quotes-persisted";

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
  ruta_mode: "predefined" | "manual";
  ruta_id: string;
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: number;
  es_redondo_auto: boolean;
  num_aterrizajes: number;
  escalas: EscalaInput[];
  tipo_tarifa: TipoTarifa;
  pasajeros: number;
  pase_abordar: boolean;
  metodo_pago: MetodoPago;
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
      initialQuote?: undefined;
      clientName?: undefined;
    }
  | {
      mode: "revise";
      clients?: undefined;
      initialQuote: PersistedQuote;
      clientName: string;
    }
);

const METODOS_PAGO: { value: MetodoPago; label: string; hint: string }[] = [
  { value: "TRANSFERENCIA", label: "Transferencia", hint: "Con factura · IVA 16%" },
  { value: "HSBC_LINK", label: "HSBC link", hint: "Con factura · IVA 16%" },
  { value: "BILLPOCKET", label: "BillPocket", hint: "Sin factura" },
  { value: "EFECTIVO", label: "Efectivo", hint: "Sin IVA" },
  { value: "DOLARES", label: "Dólares directo", hint: "Sin IVA" },
];

const TIPOS_VUELO: { value: TipoVuelo; label: string }[] = [
  { value: "REDONDO", label: "Redondo" },
  { value: "MULTIESCALA", label: "Multiescala" },
];

/** Convierte un tramo de ruta (o escala persistida) a EscalaInput con su detalle. */
function tramoToEscala(t: {
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: number | string | null;
  pasajeros?: number | null;
  es_ferry?: boolean | null;
  requiere_pernocta?: boolean | null;
  pernocta_costo_usd?: number | string | null;
  tipo_parada?: "NORMAL" | "SERVICIO" | null;
  servicio_notas?: string | null;
}): EscalaInput {
  return {
    origen_iata: t.origen_iata,
    destino_iata: t.destino_iata,
    millas_nauticas: Number(t.millas_nauticas) || 0,
    pasajeros: t.pasajeros ?? null,
    es_ferry: t.es_ferry ?? false,
    requiere_pernocta: t.requiere_pernocta ?? false,
    pernocta_costo_usd:
      t.pernocta_costo_usd != null ? Number(t.pernocta_costo_usd) : null,
    tipo_parada: t.tipo_parada ?? "NORMAL",
    servicio_notas: t.servicio_notas ?? null,
  };
}

export function QuoteCalculator(props: QuoteCalculatorProps) {
  const { aircraft, routes, airports } = props;
  const mode = props.mode ?? "create";
  const isRevise = mode === "revise";
  const initialQuote = isRevise ? props.initialQuote : undefined;
  const clientName = isRevise ? props.clientName : undefined;
  const clients = isRevise ? [] : props.clients;

  const router = useRouter();
  const [advanced, setAdvanced] = useState(false);
  const [saving, startSaving] = useTransition();

  // Rutas creadas inline desde el sheet. Se agregan al dropdown sin esperar
  // a un revalidate del servidor para que el flujo del cotizador sea continuo.
  const [extraRoutes, setExtraRoutes] = useState<RouteOption[]>([]);
  const [routeSheetOpen, setRouteSheetOpen] = useState(false);

  const allRoutes = useMemo(
    () => [...routes, ...extraRoutes],
    [routes, extraRoutes],
  );

  const airportOptions = useMemo(
    () => airports.map((a) => ({ value: a.iata, label: `${a.iata} — ${a.nombre}` })),
    [airports],
  );

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
      // Para revise: en MULTIESCALA arrancamos en modo manual con escalas del
      // snapshot del vuelo (no del catalogo, que pudo haber cambiado).
      const isMulti = q.tipo === "MULTIESCALA";
      return {
        cliente_id: q.cliente_id,
        tipo: q.tipo,
        fecha_vuelo: q.fecha_vuelo ? q.fecha_vuelo.slice(0, 16) : "",
        fecha_traslado_final: q.fecha_traslado_final
          ? q.fecha_traslado_final.slice(0, 16)
          : "",
        aeronave_id: q.aeronave_id ?? defaultAircraftId,
        ruta_mode: isMulti
          ? "manual"
          : q.ruta_id
            ? "predefined"
            : "manual",
        ruta_id: isMulti ? "" : q.ruta_id ?? "",
        origen_iata: q.origen_iata,
        destino_iata: q.destino_iata,
        millas_nauticas: q.millas_nauticas_one_way
          ? Number(q.millas_nauticas_one_way)
          : 0,
        es_redondo_auto: q.es_redondo_auto,
        num_aterrizajes: q.num_aterrizajes,
        escalas: isMulti && q.escalas ? q.escalas.map(tramoToEscala) : [],
        tipo_tarifa: q.tarifa_tipo,
        pasajeros: q.pasajeros,
        pase_abordar: q.pase_abordar,
        metodo_pago: (q.metodo_cobro ?? "TRANSFERENCIA") as MetodoPago,
        tarifa_hora_override_usd: null,
        tuas_override_usd_pax: null,
        iva_pct_override: null,
        notas: q.notas ?? "",
        notas_internas: q.notas_internas ?? "",
        motivo: "",
      };
    }
    return {
      cliente_id: "",
      tipo: "REDONDO",
      fecha_vuelo: "",
      fecha_traslado_final: "",
      aeronave_id: defaultAircraftId,
      ruta_mode: "predefined",
      ruta_id: defaultRutaId,
      origen_iata: "",
      destino_iata: "",
      millas_nauticas: 0,
      es_redondo_auto: true,
      num_aterrizajes: 2,
      escalas: [],
      tipo_tarifa: "PUBLICO",
      pasajeros: 2,
      pase_abordar: false,
      metodo_pago: "TRANSFERENCIA",
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
      tipo: debounced.tipo,
      tipo_tarifa: debounced.tipo_tarifa,
      pasajeros: Number(debounced.pasajeros) || 0,
      pase_abordar: debounced.pase_abordar,
      metodo_pago: debounced.metodo_pago,
    };
    if (debounced.ruta_mode === "predefined") {
      // El backend hidrata: si la ruta es MULTIESCALA carga sus tramos, si no
      // usa origen/destino/NM de la ruta. No necesitamos enviar escalas.
      if (!debounced.ruta_id) return null;
      base.ruta_id = debounced.ruta_id;
    } else if (debounced.tipo === "MULTIESCALA") {
      const legs = debounced.escalas ?? [];
      if (legs.length < 2) return null;
      const incomplete = legs.some(
        (l) => !l.origen_iata || !l.destino_iata || !(Number(l.millas_nauticas) > 0),
      );
      if (incomplete) return null;
      base.escalas = legs.map((l) => ({
        origen_iata: l.origen_iata,
        destino_iata: l.destino_iata,
        millas_nauticas: Number(l.millas_nauticas),
        pasajeros: l.es_ferry ? 0 : (l.pasajeros ?? null),
        es_ferry: l.es_ferry ?? false,
        requiere_pernocta: l.requiere_pernocta ?? false,
        pernocta_costo_usd: l.pernocta_costo_usd ?? null,
        tipo_parada: l.tipo_parada ?? "NORMAL",
        servicio_notas: l.servicio_notas ?? null,
      }));
    } else {
      if (!debounced.origen_iata || !debounced.destino_iata || !debounced.millas_nauticas) {
        return null;
      }
      base.origen_iata = debounced.origen_iata;
      base.destino_iata = debounced.destino_iata;
      base.millas_nauticas = Number(debounced.millas_nauticas);
      // Todos los vuelos son redondos: el motor siempre multiplica NM × 2.
      base.es_redondo_auto = true;
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
  const [nmWarning, setNmWarning] = useState<string | null>(null);

  // Autocompleta millas náuticas (great-circle) al fijar origen+destino en modo
  // manual. Fallback a captura manual con aviso si falta coordenada o falla la API.
  useEffect(() => {
    if (debounced.ruta_mode !== "manual" || debounced.tipo === "MULTIESCALA") {
      setNmWarning(null);
      return;
    }
    const o = (debounced.origen_iata ?? "").trim().toUpperCase();
    const d = (debounced.destino_iata ?? "").trim().toUpperCase();
    if (o.length < 3 || d.length < 3 || o === d) {
      setNmWarning(null);
      return;
    }
    let cancelled = false;
    getAirportDistance(o, d)
      .then((res) => {
        if (cancelled) return;
        if (res.millas_nauticas != null) {
          setValue("millas_nauticas", res.millas_nauticas);
          setNmWarning(null);
        } else {
          setNmWarning(
            `Sin coordenadas para ${res.origen} o ${res.destino}. Captura las millas manualmente.`,
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNmWarning("No se pudo calcular millas automáticamente. Captura manual.");
        }
      });
    return () => {
      cancelled = true;
    };
    // setValue es estable en RHF; lo omitimos a propósito para no re-disparar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced.ruta_mode, debounced.tipo, debounced.origen_iata, debounced.destino_iata]);

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
  // En MULTIESCALA un tramo posterior puede subir más pax: valida contra el máximo.
  const maxPasajeros =
    values.tipo === "MULTIESCALA" && values.escalas.length > 0
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
  const selectedRoute = allRoutes.find((r) => r.id === values.ruta_id);
  const tipoTarifa = values.tipo_tarifa;
  const rutaMode = values.ruta_mode;

  const motivoTrim = values.motivo?.trim() ?? "";
  const canSave =
    !capacidadExcedida &&
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
      const res = await createQuoteAction({
        ...calcPayload,
        cliente_id: values.cliente_id,
        tipo: values.tipo,
        fecha_vuelo: values.fecha_vuelo || undefined,
        fecha_traslado_final: values.fecha_traslado_final || undefined,
        notas: values.notas || undefined,
        notas_internas: values.notas_internas || undefined,
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
              <SearchableSelect
                options={(clients ?? []).map((c) => ({
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
                  const cli = (clients ?? []).find((c) => c.id === v);
                  if (cli?.es_broker) setValue("tipo_tarifa", "BROKER");
                }}
                placeholder="Selecciona cliente"
                emptyText="Sin clientes activos"
              />
            </Field>
          )}

          <Field label="Tipo de vuelo" required>
            <SearchableSelect
              options={TIPOS_VUELO.map((t) => ({ value: t.value, label: t.label }))}
              value={values.tipo}
              onChange={(v) => {
                const next = v as TipoVuelo;
                setValue("tipo", next);
                // Si la ruta_id apunta a un tipo que ya no aplica (ej. cambiar
                // de Redondo->Multiescala con una ruta SIMPLE en memoria),
                // limpiarla para evitar payloads incoherentes.
                const currentRuta = allRoutes.find((r) => r.id === values.ruta_id);
                const needsMulti = next === "MULTIESCALA";
                const rutaIsMulti = currentRuta?.tipo === "MULTIESCALA";
                if (currentRuta && needsMulti !== rutaIsMulti) {
                  setValue("ruta_id", "");
                  if (!needsMulti) setValue("escalas", []);
                }
              }}
            />
          </Field>

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
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Ruta<span className="text-destructive ml-0.5">*</span>
            </Label>
            <Segmented
              value={rutaMode}
              onChange={(v) => {
                const next = v as "predefined" | "manual";
                setValue("ruta_mode", next);
                if (next === "manual") {
                  // Al cambiar a manual: olvidar la ruta del catalogo. Si era multi,
                  // mantenemos las escalas cargadas como base editable.
                  setValue("ruta_id", "");
                }
              }}
              options={[
                { value: "predefined", label: "Predefinida" },
                { value: "manual", label: "Manual" },
              ]}
            />
          </div>

          {rutaMode === "predefined" ? (
            <Field
              label={
                values.tipo === "MULTIESCALA" ? "Ruta multiescala" : "Ruta predefinida"
              }
              required
            >
              <SearchableSelect
                options={allRoutes
                  .filter((r) =>
                    values.tipo === "MULTIESCALA"
                      ? r.tipo === "MULTIESCALA"
                      : r.tipo === "SIMPLE",
                  )
                  .map((r) => {
                    if (r.tipo === "MULTIESCALA") {
                      const path = [
                        r.tramos[0]?.origen_iata,
                        ...r.tramos.map((t) => t.destino_iata),
                      ]
                        .filter(Boolean)
                        .join(" → ");
                      return {
                        value: r.id,
                        label: path,
                        description: `${r.millas_nauticas} NM · ${r.tramos.length} tramos`,
                      };
                    }
                    return {
                      value: r.id,
                      label: `${r.origen_iata} → ${r.destino_iata}`,
                      description: `${r.millas_nauticas} NM one-way${
                        r.es_redondo_auto ? " (× 2 auto)" : ""
                      }`,
                    };
                  })}
                value={values.ruta_id}
                onChange={(v) => {
                  setValue("ruta_id", v);
                  const ruta = allRoutes.find((r) => r.id === v);
                  if (ruta?.tipo === "MULTIESCALA") {
                    // Auto-sync: el tipo de vuelo y las escalas siguen al catalogo,
                    // incluyendo el detalle por tramo (defaults de plantilla).
                    setValue("tipo", "MULTIESCALA");
                    setValue("escalas", ruta.tramos.map(tramoToEscala));
                  }
                }}
                placeholder={
                  values.tipo === "MULTIESCALA"
                    ? "Selecciona ruta multiescala"
                    : "Selecciona ruta"
                }
                emptyText={
                  values.tipo === "MULTIESCALA"
                    ? "Sin rutas multiescala — crea una abajo"
                    : "Sin rutas — crea una abajo"
                }
              />
              <button
                type="button"
                onClick={() => setRouteSheetOpen(true)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-600/80 transition-colors"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                {values.tipo === "MULTIESCALA"
                  ? "Crear ruta multiescala"
                  : "Crear nueva ruta"}
              </button>
              {selectedRoute?.tipo === "MULTIESCALA" && selectedRoute.tramos.length > 0 && (
                <div className="mt-2 rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Tramos del catálogo · solo lectura
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setValue("ruta_mode", "manual");
                        setValue("ruta_id", "");
                      }}
                      className="text-[11px] font-medium text-brand-600 hover:text-brand-600/80 transition-colors"
                    >
                      Personalizar tramos
                    </button>
                  </div>
                  <ol className="space-y-1 text-xs font-mono">
                    {selectedRoute.tramos.map((t, i) => (
                      <li key={i} className="flex items-center justify-between gap-2">
                        <span>
                          <span className="text-muted-foreground mr-2">{i + 1}.</span>
                          {t.origen_iata} → {t.destino_iata}
                        </span>
                        <span className="text-muted-foreground">
                          {fmtDecimal(t.millas_nauticas)} NM
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {selectedRoute?.tipo === "SIMPLE" && selectedRoute.es_redondo_auto && (
                <p className="text-xs text-muted-foreground mt-1">
                  Redondo auto: el motor calcula{" "}
                  {fmtDecimal(selectedRoute.millas_nauticas * 2)} NM totales.
                </p>
              )}
            </Field>
          ) : values.tipo === "MULTIESCALA" ? (
            <Field
              label="Tramos"
              required
              hint="Origen del siguiente tramo queda fijo al destino del anterior."
            >
              <QuoteLegsEditor
                value={values.escalas}
                onChange={(legs) => setValue("escalas", legs)}
                routes={allRoutes}
                airports={airports}
              />
            </Field>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Origen IATA" required>
                  <SearchableSelect
                    options={airportOptions}
                    value={values.origen_iata}
                    onChange={(v) => setValue("origen_iata", v)}
                    placeholder="Selecciona origen"
                    emptyText="Sin aeropuertos"
                  />
                </Field>
                <Field label="Destino IATA" required>
                  <SearchableSelect
                    options={airportOptions}
                    value={values.destino_iata}
                    onChange={(v) => setValue("destino_iata", v)}
                    placeholder="Selecciona destino"
                    emptyText="Sin aeropuertos"
                  />
                </Field>
              </div>
              <Field
                label="Millas náuticas one-way"
                hint={
                  nmWarning ??
                  "Se autocompletan al fijar origen y destino. Editable. El motor multiplica × 2 (redondo)."
                }
                required
              >
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="63.14"
                  {...register("millas_nauticas")}
                />
                {nmWarning && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    ⚠ {nmWarning}
                  </p>
                )}
              </Field>
              <Field label="Aterrizajes" hint="0.15 hr de calzos por aterrizaje">
                <Input type="number" min={1} {...register("num_aterrizajes")} />
              </Field>
              <div className="hidden xl:block">
                <RoutePreviewMap
                  airports={airports}
                  originIata={values.origen_iata}
                  destinationIata={values.destino_iata}
                />
              </div>
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

      <RouteFormSheet
        open={routeSheetOpen}
        onOpenChange={setRouteSheetOpen}
        airports={airports}
        defaultTipo={values.tipo === "MULTIESCALA" ? "MULTIESCALA" : "SIMPLE"}
        onSaved={(route: Route) => {
          const opt: RouteOption = {
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
          setExtraRoutes((prev) => [...prev, opt]);
          setValue("ruta_mode", "predefined");
          setValue("ruta_id", opt.id);
          if (opt.tipo === "MULTIESCALA") {
            setValue("tipo", "MULTIESCALA");
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
          </div>
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
