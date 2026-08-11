"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  assignVueloGastoAction,
  buscarVuelosCercanosAction,
  sugerirAsignacionGastoAction,
  verifyGastoAction,
  type SugerenciaAsignacion,
  type VueloCercano,
} from "@/app/admin/expenses/actions";
import { fmtDateOnly } from "@/lib/datetime";
import type { GastoVerifyValues } from "@/app/admin/expenses/schema";
import type { Gasto } from "@/types/expenses";
import { Field } from "@/components/admin/form-field";
import { ComprobantePreview } from "@/components/admin/comprobante-preview";

const CATEGORIAS = [
  ...[
    "GAS",
    "ATERRIZAJE",
    "OPERACIONES",
    "TUAS",
    "FBO",
    "COMIDA",
    "HOTEL",
    "TAXI",
    "REFACCION",
    "PERMISO",
  ].map((c) => ({ value: c, label: c })),
  { value: "PILOTO_EXTERNO", label: "Piloto externo (honorario)" },
  ...["FIJO", "OTRO"].map((c) => ({ value: c, label: c })),
];

const MEDIOS = [
  { value: "EFECTIVO", label: "Efectivo (caja chica)" },
  { value: "TARJETA_CORP", label: "Tarjeta corporativa" },
  { value: "PERSONAL_PABLO", label: "Dinero personal Pablo" },
  { value: "PERSONAL_ALE", label: "Dinero personal Ale" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "BODEGA", label: "Bodega (salida de inventario)" },
];

const ESTATUS = [
  { value: "FACTURA", label: "Factura" },
  { value: "VALE", label: "Vale (sin factura)" },
  { value: "SIN_COMPROBANTE", label: "Sin comprobante" },
];

interface ExpenseVerifyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gasto: Gasto;
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
  /** URL firmada de la foto del comprobante para validar contra el dato. */
  fotoUrl?: string;
}

export function ExpenseVerifyDialog({
  open,
  onOpenChange,
  gasto,
  aircraft,
  providers,
  fotoUrl,
}: ExpenseVerifyDialogProps) {
  const [pending, startTransition] = useTransition();
  // Sugerencia IA/regla de a qué vuelo pertenece (solo gastos sin avión).
  const [sugerencia, setSugerencia] = useState<SugerenciaAsignacion | null>(null);
  const [sugiriendo, setSugiriendo] = useState(false);
  // Vuelo elegido (sugerencia aplicada O selección manual). Sin match
  // automático, la oficina lo asigna a mano de esta lista (±15 días).
  const [vueloSel, setVueloSel] = useState<string>(gasto.vuelo_id ?? "");
  const [vuelos, setVuelos] = useState<VueloCercano[]>([]);

  const { handleSubmit, reset, watch, setValue, register } = useForm<GastoVerifyValues>({
    defaultValues: defaults(gasto),
  });

  useEffect(() => {
    if (open) reset(defaults(gasto));
  }, [open, gasto, reset]);

  // Vuelos alrededor de la fecha del gasto, para asignar/corregir a mano.
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setVueloSel(gasto.vuelo_id ?? "");
    buscarVuelosCercanosAction(gasto.fecha_gasto).then((res) => {
      if (!cancel && res.ok && res.data) setVuelos(res.data);
    });
    return () => {
      cancel = true;
    };
  }, [open, gasto.id, gasto.vuelo_id, gasto.fecha_gasto]);

  // Al abrir un gasto SIN avión: buscar el match probable (piloto + fecha ±3d;
  // IA si hay varios). Best-effort: si falla, la asignación sigue manual.
  useEffect(() => {
    if (!open || gasto.aeronave_id) {
      setSugerencia(null);
      return;
    }
    let cancel = false;
    setSugiriendo(true);
    sugerirAsignacionGastoAction(gasto.id)
      .then((res) => {
        if (!cancel) setSugerencia(res.ok ? (res.data ?? null) : null);
      })
      .finally(() => {
        if (!cancel) setSugiriendo(false);
      });
    return () => {
      cancel = true;
    };
  }, [open, gasto.id, gasto.aeronave_id]);

  const aplicarCandidato = (c: NonNullable<SugerenciaAsignacion["sugerido"]>) => {
    if (c.aeronave_id) setValue("aeronave_id", c.aeronave_id);
    setVueloSel(c.vuelo_id);
    toast.info(
      `Se aplicará: vuelo #${c.folio ?? "?"} · ${c.matricula ?? "sin matrícula"}. Guarda para confirmar.`,
    );
  };

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      // monto guardado = TOTAL PAGADO (ticket + propina): lo que llega al
      // banco. En el formulario se edita el ticket y la propina por separado
      // y aquí se recompone. Ticket vacío + propina vacía = no tocar el monto.
      const ticket = Number(values.monto);
      const propina = values.propina === "" ? 0 : Number(values.propina);
      let payload: Record<string, unknown> = { ...values };
      if (values.monto !== "" || values.propina !== "") {
        if (!(ticket > 0)) {
          toast.error("Captura el monto del ticket.");
          return;
        }
        if (!(propina >= 0)) {
          toast.error("La propina no es válida.");
          return;
        }
        payload = {
          ...values,
          monto: Math.round((ticket + propina) * 100) / 100,
          // 0 explícito: quitar la propina también debe guardarse.
          propina,
        };
      }
      // Litros solo aplican a GAS; vacío = no tocar (el zod los descarta).
      if (values.categoria !== "GAS" || values.litros === "") {
        delete (payload as { litros?: unknown }).litros;
      }
      const result = await verifyGastoAction(gasto.id, payload);
      if (result.ok) {
        // Vuelo elegido (sugerencia o manual) distinto al actual: ligarlo o
        // desligarlo junto con el resto de la verificación.
        if (vueloSel !== (gasto.vuelo_id ?? "")) {
          const link = await assignVueloGastoAction(gasto.id, vueloSel || null);
          if (!link.ok) toast.error("Gasto guardado, pero no se pudo ligar el vuelo.");
        }
        toast.success("Gasto verificado");
        onOpenChange(false);
      } else if (result.fieldErrors) {
        const f = Object.keys(result.fieldErrors)[0];
        toast.error(`${f}: ${result.fieldErrors[f]?.[0] ?? "Validación falló"}`);
      } else {
        toast.error(result.error ?? "Error desconocido");
      }
    });
  });

  const monto = Number(gasto.monto).toLocaleString("es-MX", {
    style: "currency",
    currency: gasto.moneda,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Verificar gasto · {monto}</DialogTitle>
          <DialogDescription>
            Asigna el avión y confirma categoría y comprobante. Sin avión, el gasto queda en la
            bandeja de pendientes.
          </DialogDescription>
        </DialogHeader>

        {/* Comprobante: foto subida con el registro, para validar el dato. */}
        {fotoUrl ? (
          <div className="rounded-lg border border-border overflow-hidden bg-muted/30">
            <ComprobantePreview
              path={gasto.foto_url ?? ""}
              url={fotoUrl}
              alt="Comprobante del gasto"
              thumbClassName="w-full h-auto max-h-[45vh] object-contain"
            />
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            Este gasto no tiene foto de comprobante.
          </p>
        )}

        {/* Match automático piloto+fecha (IA si es ambiguo): propone, el humano confirma. */}
        {!gasto.aeronave_id && (
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs space-y-1.5">
            {sugiriendo ? (
              <p className="text-muted-foreground">Buscando a qué vuelo pertenece…</p>
            ) : sugerencia?.sugerido ? (
              <>
                <p>
                  <span className="font-medium">✨ Sugerencia{sugerencia.fuente === "ia" ? " (IA)" : ""}:</span>{" "}
                  vuelo <span className="font-mono">#{sugerencia.sugerido.folio ?? "?"}</span>
                  {sugerencia.sugerido.matricula && (
                    <> · <span className="font-mono">{sugerencia.sugerido.matricula}</span></>
                  )}
                  {sugerencia.sugerido.ruta && <> · {sugerencia.sugerido.ruta}</>}
                  {sugerencia.confianza > 0 && (
                    <span className="text-muted-foreground"> · {Math.round(sugerencia.confianza * 100)}%</span>
                  )}
                </p>
                <p className="text-muted-foreground">{sugerencia.razon}</p>
                <Button
                  type="button"
                  size="sm"
                  variant={vueloSel === sugerencia.sugerido.vuelo_id ? "secondary" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => aplicarCandidato(sugerencia.sugerido!)}
                >
                  {vueloSel === sugerencia.sugerido.vuelo_id ? "✓ Aplicado (guarda para confirmar)" : "Aplicar sugerencia"}
                </Button>
              </>
            ) : sugerencia && sugerencia.candidatos.length > 0 ? (
              <>
                <p className="font-medium">Sin match claro — candidatos del piloto:</p>
                <p className="text-muted-foreground">{sugerencia.razon}</p>
                <div className="flex flex-wrap gap-1.5">
                  {sugerencia.candidatos.slice(0, 4).map((c) => (
                    <Button
                      key={c.vuelo_id}
                      type="button"
                      size="sm"
                      variant={vueloSel === c.vuelo_id ? "secondary" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => aplicarCandidato(c)}
                    >
                      #{c.folio ?? "?"} · {c.matricula ?? "—"}{c.ruta ? ` · ${c.ruta}` : ""}
                    </Button>
                  ))}
                </div>
              </>
            ) : sugerencia ? (
              <p className="text-muted-foreground">
                <span className="font-medium">Sin match:</span> {sugerencia.razon}
              </p>
            ) : null}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Si el enriquecimiento IA marcó ⚠ (piloto vs documento), aquí se corrige. */}
          {(gasto.notas ?? "").includes("⚠") && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              La IA detectó discrepancias entre lo capturado y el comprobante (ver ⚠ en
              notas). Corrige aquí el dato correcto — monto, fecha y moneda son editables.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto del ticket">
              <Input type="number" step="0.01" min="0" inputMode="decimal" {...register("monto")} />
            </Field>
            <Field label="Propina" hint="Solo si se agregó en la terminal (opcional).">
              <Input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="0.00"
                {...register("propina")}
              />
            </Field>
          </div>

          {/* Litros: solo combustible — corrige aquí un GAS capturado sin
              litros (el balance no calcula $/litro sin ellos). */}
          {watch("categoria") === "GAS" && (
            <Field
              label="Litros cargados"
              hint="Del ticket de combustible; el balance calcula $/litro con esto."
            >
              <Input
                type="number"
                step="0.1"
                min="0"
                inputMode="decimal"
                placeholder="Ej. 164"
                {...register("litros")}
              />
            </Field>
          )}

          {/* Total pagado EN VIVO (ticket + propina): es el monto que se
              guarda y el que aparece en el estado de cuenta del banco. */}
          <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
            <span className="font-medium">
              Total pagado:{" "}
              {(() => {
                const t = Number(watch("monto"));
                const p = Number(watch("propina"));
                const total =
                  Math.round(
                    ((Number.isFinite(t) ? t : 0) + (Number.isFinite(p) ? p : 0)) * 100,
                  ) / 100;
                return total.toLocaleString("es-MX", {
                  style: "currency",
                  currency: watch("moneda") === "USD" ? "USD" : "MXN",
                });
              })()}
            </span>{" "}
            <span className="text-muted-foreground">
              — esto es lo que llega al estado de cuenta
            </span>
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Moneda">
              <SearchableSelect
                options={[
                  { value: "MXN", label: "MXN" },
                  { value: "USD", label: "USD" },
                ]}
                value={watch("moneda")}
                onChange={(v) => setValue("moneda", v)}
                placeholder="Moneda"
              />
            </Field>
            <Field label="Fecha del gasto">
              <Input type="date" {...register("fecha_gasto")} />
            </Field>
          </div>

          <Field
            label="Folio / remisión del ticket"
            hint="Candado anti-duplicados: otro gasto con el mismo folio se rechaza."
          >
            <Input
              className="font-mono"
              placeholder="Ej. 2622242310"
              {...register("folio_ticket")}
            />
          </Field>

          {watch("moneda") === "MXN" && (
            <Field
              label="Tipo de cambio (MXN por USD)"
              hint="Sin TC, el gasto queda fuera del balance USD del reparto (bloquea el pre-cierre)."
            >
              <Input
                type="number"
                step="0.0001"
                min="0"
                inputMode="decimal"
                placeholder="Ej. 18.50"
                {...register("tc_gasto")}
              />
            </Field>
          )}

          <Field label="Avión (resuelve pendiente)">
            <SearchableSelect
              options={aircraft.map((a) => ({ value: a.id, label: a.matricula }))}
              value={watch("aeronave_id")}
              onChange={(v) => setValue("aeronave_id", v)}
              placeholder="Sin asignar"
            />
          </Field>

          {/* Asignación MANUAL del vuelo (±15 días de la fecha del gasto):
              cubre cuando la sugerencia automática no encuentra match o el
              gasto quedó ligado al vuelo equivocado. */}
          <Field label="Vuelo (asignar o corregir a mano)">
            <SearchableSelect
              options={[
                { value: "", label: "Sin vuelo" },
                ...vuelos.map((v) => ({
                  value: v.id,
                  label:
                    `#${v.folio ?? "?"} · ${v.matricula ?? "sin avión"} · ${v.ruta ?? ""}` +
                    (v.fecha ? ` · ${fmtDateOnly(v.fecha)}` : ""),
                })),
              ]}
              value={vueloSel}
              onChange={(v) => {
                setVueloSel(v);
                // El avión del vuelo elegido se refleja de inmediato.
                const opt = vuelos.find((x) => x.id === v);
                if (opt?.aeronave_id) setValue("aeronave_id", opt.aeronave_id);
              }}
              placeholder="Busca por folio, matrícula o ruta"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría">
              <SearchableSelect
                options={CATEGORIAS}
                value={watch("categoria")}
                onChange={(v) => setValue("categoria", v)}
                placeholder="Categoría"
              />
            </Field>
            <Field label="Comprobante">
              <SearchableSelect
                options={ESTATUS}
                value={watch("estatus_comprobante")}
                onChange={(v) => setValue("estatus_comprobante", v)}
                placeholder="Estatus"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Medio de pago">
              <SearchableSelect
                options={MEDIOS}
                value={watch("medio_pago")}
                onChange={(v) => setValue("medio_pago", v)}
                placeholder="Medio"
              />
            </Field>
            <Field label="Proveedor">
              <SearchableSelect
                options={providers.map((p) => ({ value: p.id, label: p.nombre }))}
                value={watch("proveedor_id")}
                onChange={(v) => setValue("proveedor_id", v)}
                placeholder="Sin proveedor"
              />
            </Field>
          </div>

          <Field label="Notas">
            <Textarea rows={2} {...register("notas")} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function defaults(g: Gasto): GastoVerifyValues {
  // El formulario separa ticket y propina; en BD monto = TOTAL PAGADO
  // (ticket + propina), así que el ticket mostrado = monto − propina.
  const propina = Number(g.propina ?? 0);
  const ticket =
    g.monto != null ? Math.round((Number(g.monto) - propina) * 100) / 100 : null;
  return {
    monto: ticket != null ? String(ticket) : "",
    propina: propina > 0 ? String(propina) : "",
    litros: g.litros != null ? String(g.litros) : "",
    moneda: g.moneda ?? "MXN",
    // fecha_gasto es columna date (YYYY-MM-DD, sin zona) — el corte por 10
    // chars aquí no es el slice prohibido de timestamps.
    fecha_gasto: (g.fecha_gasto ?? "").slice(0, 10),
    categoria: g.categoria,
    medio_pago: g.medio_pago,
    estatus_comprobante: g.estatus_comprobante,
    aeronave_id: g.aeronave_id ?? "",
    proveedor_id: g.proveedor_id ?? "",
    folio_ticket: g.folio_ticket ?? "",
    tc_gasto: g.tc_gasto != null ? String(g.tc_gasto) : "",
    notas: g.notas ?? "",
  };
}
