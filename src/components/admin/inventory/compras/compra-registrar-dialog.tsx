"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
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
import { Field } from "@/components/admin/form-field";
import { ProveedorSelector } from "@/components/admin/expenses/proveedor-selector";
import { createCompraAction } from "@/app/admin/inventory/compras/actions";
import { todayCancun } from "@/lib/datetime";
import {
  DESCRIPCION_REGISTRAR_COMPRA,
  HINT_LINEAS_COMPRA,
  HINT_TC_COMPRA_OPCIONAL,
  HINT_VINCULAR_GASTO_ENTRADA,
  TITULO_REGISTRAR_COMPRA,
  cuerpoRegistrarCompra,
  formRegistrarCompraVacio,
  lineaCompraVacia,
  toastCompraRegistrada,
  type FormRegistrarCompra,
  type LineaCompraForm,
} from "@/lib/admin/compras-estado";
import type { CompraMoneda, GastoCandidatoCompra } from "@/types/compras";
import { GastoCandidatoSelector } from "./gasto-candidato-selector";

const MONEDAS: Array<{ value: CompraMoneda; label: string }> = [
  { value: "USD", label: "USD (dólares)" },
  { value: "MXN", label: "MXN (pesos)" },
];

const NUEVO_ITEM = "__nuevo__";

export interface ItemCompraOption {
  id: string;
  nombre: string;
  numero_parte: string | null;
}

/**
 * «Registrar compra» (21-oct-2026): el pedido o la factura del proveedor con
 * sus líneas ⇒ compra ABIERTA («Pedida, sin recibir»). Si la factura ya está
 * en Gastos se puede vincular aquí mismo (y, sin líneas capturadas, el API
 * las arma con lo que leyó la IA de ese gasto). Los cargos de envío e
 * impuestos de la misma factura se capturan en el detalle.
 */
export function CompraRegistrarDialog({
  providers,
  items,
}: {
  providers: { id: string; nombre: string }[];
  items: ItemCompraOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormRegistrarCompra>(() => formRegistrarCompraVacio(todayCancun()));
  const [vincular, setVincular] = useState(false);
  const [gasto, setGasto] = useState<GastoCandidatoCompra | null>(null);
  const [contador, setContador] = useState(1);

  const set = (patch: Partial<FormRegistrarCompra>) => setForm((f) => ({ ...f, ...patch }));
  const setLinea = (key: string, patch: Partial<LineaCompraForm>) =>
    setForm((f) => ({ ...f, lineas: f.lineas.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

  const abrir = (o: boolean) => {
    if (o) {
      setForm(formRegistrarCompraVacio(todayCancun()));
      setVincular(false);
      setGasto(null);
      setContador(1);
    }
    setOpen(o);
  };

  const elegirGasto = (g: GastoCandidatoCompra | null) => {
    setGasto(g);
    set({
      gasto_mercancia_id: g?.id ?? "",
      // La moneda y el proveedor de la compra son los de su factura.
      ...(g ? { moneda: g.moneda, proveedor_id: g.proveedor?.id ?? form.proveedor_id, fecha: g.fecha_gasto } : {}),
    });
  };

  const agregarLinea = () => {
    const n = contador + 1;
    setContador(n);
    setForm((f) => ({ ...f, lineas: [...f.lineas, lineaCompraVacia(`l-${n}`)] }));
  };

  const quitarLinea = (key: string) =>
    setForm((f) => ({ ...f, lineas: f.lineas.length > 1 ? f.lineas.filter((l) => l.key !== key) : f.lineas }));

  const registrar = () => {
    const v = cuerpoRegistrarCompra(form);
    if (!v.ok) {
      toast.error(v.error);
      return;
    }
    if (v.cuerpo.lineas.length === 0 && !v.cuerpo.gasto_mercancia_id) {
      toast.error("Captura al menos una línea (o vincula el gasto de la factura para armarlas desde él).");
      return;
    }
    startTransition(async () => {
      const r = await createCompraAction(v.cuerpo);
      if (r.ok && r.data) {
        toast.success(toastCompraRegistrada(r.data));
        setOpen(false);
        router.push(`/admin/inventory/compras/${r.data.id}`);
      } else {
        toast.error(r.error ?? "No se pudo registrar la compra");
      }
    });
  };

  const opcionesItems = [
    { value: NUEVO_ITEM, label: "＋ Artículo nuevo (escribe el nombre)" },
    ...items.map((i) => ({ value: i.id, label: i.numero_parte ? `${i.nombre} · ${i.numero_parte}` : i.nombre })),
  ];

  return (
    <>
      <Button onClick={() => abrir(true)} className="gap-2" data-registrar-compra>
        <PlusIcon className="h-4 w-4" />
        {TITULO_REGISTRAR_COMPRA}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && abrir(o)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{TITULO_REGISTRAR_COMPRA}</DialogTitle>
            <DialogDescription>{DESCRIPCION_REGISTRAR_COMPRA}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 [&>*]:min-w-0">
              <Field label="Proveedor">
                <ProveedorSelector providers={providers} value={form.proveedor_id} onChange={(v) => set({ proveedor_id: v })} />
              </Field>
              <Field label="Fecha del pedido / factura" required>
                <Input type="date" value={form.fecha} onChange={(e) => set({ fecha: e.target.value })} />
              </Field>
              <Field label="Referencia" hint="Número de orden o factura del proveedor.">
                <Input value={form.referencia} onChange={(e) => set({ referencia: e.target.value })} placeholder="Ej. AS-1234567" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Moneda" required>
                  <SearchableSelect options={MONEDAS} value={form.moneda} onChange={(v) => set({ moneda: v as CompraMoneda })} />
                </Field>
                <Field label="T.C. (MXN por USD)" hint={HINT_TC_COMPRA_OPCIONAL}>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    inputMode="decimal"
                    placeholder="Opcional"
                    value={form.tc_usd_mxn}
                    onChange={(e) => set({ tc_usd_mxn: e.target.value })}
                  />
                </Field>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3" data-lineas-compra>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Líneas (lo que pediste)</p>
                  <p className="text-xs text-muted-foreground">{HINT_LINEAS_COMPRA}</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={agregarLinea}>
                  <PlusIcon className="h-4 w-4" />
                  Línea
                </Button>
              </div>
              {form.lineas.map((l, i) => (
                <div key={l.key} className="grid grid-cols-1 gap-2 sm:grid-cols-[1.2fr_1fr_0.6fr_0.7fr_auto] [&>*]:min-w-0" data-linea={i + 1}>
                  <SearchableSelect
                    options={opcionesItems}
                    value={l.item_id || NUEVO_ITEM}
                    onChange={(v) => {
                      const it = items.find((x) => x.id === v) ?? null;
                      setLinea(l.key, {
                        item_id: v === NUEVO_ITEM ? "" : v,
                        ...(it ? { nombre: it.nombre, numero_parte: it.numero_parte ?? "" } : {}),
                      });
                    }}
                    placeholder="Artículo"
                    aria-label={`Artículo de la línea ${i + 1}`}
                  />
                  <Input
                    value={l.nombre}
                    onChange={(e) => setLinea(l.key, { nombre: e.target.value })}
                    placeholder="Nombre de la refacción"
                    aria-label={`Nombre de la línea ${i + 1}`}
                  />
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    value={l.cantidad}
                    onChange={(e) => setLinea(l.key, { cantidad: e.target.value })}
                    placeholder="Unid."
                    aria-label={`Unidades de la línea ${i + 1}`}
                  />
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    value={l.costo_unitario}
                    onChange={(e) => setLinea(l.key, { costo_unitario: e.target.value })}
                    placeholder={`Costo c/u (${form.moneda})`}
                    aria-label={`Costo unitario de la línea ${i + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => quitarLinea(l.key)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-destructive hover:bg-muted disabled:opacity-40"
                    title="Quitar la línea"
                    disabled={form.lineas.length === 1}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3" data-vincular-gasto-compra>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={vincular}
                  onChange={(e) => {
                    setVincular(e.target.checked);
                    if (!e.target.checked) elegirGasto(null);
                  }}
                  className="h-4 w-4 cursor-pointer accent-brand-600"
                />
                <span>
                  La factura ya está en Gastos: vincularla{" "}
                  <span className="text-xs text-muted-foreground">({HINT_VINCULAR_GASTO_ENTRADA})</span>
                </span>
              </label>
              {vincular && <GastoCandidatoSelector value={gasto?.id ?? ""} onChange={elegirGasto} soloMercancia />}
              {gasto && (
                <p className="text-xs text-muted-foreground">
                  Queda como la factura de mercancía de la compra. Si no capturas líneas, el API las arma con lo que
                  leyó la IA de ese gasto.
                </p>
              )}
            </div>

            <Field label="Notas">
              <Textarea rows={2} value={form.notas} onChange={(e) => set({ notas: e.target.value })} />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => abrir(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={registrar} disabled={pending}>
              {pending ? "Registrando…" : TITULO_REGISTRAR_COMPRA}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
