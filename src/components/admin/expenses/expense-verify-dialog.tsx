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
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  assignVueloGastoAction,
  sugerirAsignacionGastoAction,
  verifyGastoAction,
  type SugerenciaAsignacion,
} from "@/app/admin/expenses/actions";
import type { GastoVerifyValues } from "@/app/admin/expenses/schema";
import type { Gasto } from "@/types/expenses";
import { Field } from "@/components/admin/form-field";
import { ImagePreview } from "@/components/admin/image-preview";

const CATEGORIAS = [
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
  "FIJO",
  "OTRO",
].map((c) => ({ value: c, label: c }));

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
  const [vueloAplicado, setVueloAplicado] = useState<string | null>(null);

  const { handleSubmit, reset, watch, setValue, register } = useForm<GastoVerifyValues>({
    defaultValues: defaults(gasto),
  });

  useEffect(() => {
    if (open) reset(defaults(gasto));
  }, [open, gasto, reset]);

  // Al abrir un gasto SIN avión: buscar el match probable (piloto + fecha ±3d;
  // IA si hay varios). Best-effort: si falla, la asignación sigue manual.
  useEffect(() => {
    if (!open || gasto.aeronave_id) {
      setSugerencia(null);
      setVueloAplicado(null);
      return;
    }
    let cancel = false;
    setSugiriendo(true);
    setVueloAplicado(null);
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
    setVueloAplicado(c.vuelo_id);
    toast.info(
      `Se aplicará: vuelo #${c.folio ?? "?"} · ${c.matricula ?? "sin matrícula"}. Guarda para confirmar.`,
    );
  };

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await verifyGastoAction(gasto.id, values);
      if (result.ok) {
        // Si se aplicó una sugerencia, liga también el vuelo (no solo el avión).
        if (vueloAplicado) {
          const link = await assignVueloGastoAction(gasto.id, vueloAplicado);
          if (!link.ok) toast.error("Avión guardado, pero no se pudo ligar el vuelo.");
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
            <ImagePreview
              src={fotoUrl}
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
                  variant={vueloAplicado === sugerencia.sugerido.vuelo_id ? "secondary" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => aplicarCandidato(sugerencia.sugerido!)}
                >
                  {vueloAplicado === sugerencia.sugerido.vuelo_id ? "✓ Aplicado (guarda para confirmar)" : "Aplicar sugerencia"}
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
                      variant={vueloAplicado === c.vuelo_id ? "secondary" : "outline"}
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
          <Field label="Avión (resuelve pendiente)">
            <SearchableSelect
              options={aircraft.map((a) => ({ value: a.id, label: a.matricula }))}
              value={watch("aeronave_id")}
              onChange={(v) => setValue("aeronave_id", v)}
              placeholder="Sin asignar"
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
  return {
    categoria: g.categoria,
    medio_pago: g.medio_pago,
    estatus_comprobante: g.estatus_comprobante,
    aeronave_id: g.aeronave_id ?? "",
    proveedor_id: g.proveedor_id ?? "",
    notas: g.notas ?? "",
  };
}
