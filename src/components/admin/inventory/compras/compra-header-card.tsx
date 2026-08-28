"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Field } from "@/components/admin/form-field";
import { updateCompraAction } from "@/app/admin/inventory/compras/actions";
import type { CompraDetalle, CompraMoneda, CompraUpdateInput } from "@/types/compras";

const MONEDAS: Array<{ value: CompraMoneda; label: string }> = [
  { value: "USD", label: "USD (dólares)" },
  { value: "MXN", label: "MXN (pesos)" },
];

const SIN_PROVEEDOR = "__sin__";

/**
 * Cabecera editable de la compra: proveedor, fecha, referencia, moneda de
 * la factura de mercancía, tipo de cambio y notas. Se guarda con un botón
 * (no autosave): la oficina revisa antes de que cambie el costo en bodega.
 * Al guardar viaja SOLO lo que cambió (diff vs inicial): el API rechaza
 * (409) los campos congelados en RECIBIDA —la moneda— aunque lleguen con el
 * mismo valor, así que en RECIBIDA la moneda ni se manda ni se edita.
 */
export function CompraHeaderCard({
  compra,
  providers,
}: {
  compra: CompraDetalle;
  providers: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const inicial = {
    proveedorId: compra.proveedor?.id ?? "",
    // `fecha` es columna date (YYYY-MM-DD, sin hora): el corte a 10 no es
    // el slice prohibido de timestamps.
    fecha: (compra.fecha ?? "").slice(0, 10),
    referencia: compra.referencia ?? "",
    moneda: compra.moneda,
    tc: compra.tc_usd_mxn != null ? String(compra.tc_usd_mxn) : "",
    notas: compra.notas ?? "",
  };
  const [form, setForm] = useState(inicial);
  const set = (patch: Partial<typeof inicial>) => setForm((f) => ({ ...f, ...patch }));
  const recibida = compra.estado === "RECIBIDA";

  const dirty =
    form.proveedorId !== inicial.proveedorId ||
    form.fecha !== inicial.fecha ||
    form.referencia !== inicial.referencia ||
    (!recibida && form.moneda !== inicial.moneda) ||
    form.tc !== inicial.tc ||
    form.notas !== inicial.notas;

  const guardar = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.fecha)) {
      toast.error("Captura la fecha de la compra");
      return;
    }
    const tc = form.tc.trim() === "" ? null : Number(form.tc);
    if (tc !== null && !(tc > 0)) {
      toast.error("El tipo de cambio debe ser mayor a cero");
      return;
    }
    // Solo lo que cambió; NUNCA la moneda en RECIBIDA (el API la congela).
    const cambios: CompraUpdateInput = {};
    if (form.proveedorId !== inicial.proveedorId) cambios.proveedor_id = form.proveedorId || null;
    if (form.fecha !== inicial.fecha) cambios.fecha = form.fecha;
    if (form.referencia !== inicial.referencia) cambios.referencia = form.referencia.trim() || null;
    if (!recibida && form.moneda !== inicial.moneda) cambios.moneda = form.moneda;
    if (form.tc !== inicial.tc) cambios.tc_usd_mxn = tc;
    if (form.notas !== inicial.notas) cambios.notas = form.notas.trim() || null;
    if (Object.keys(cambios).length === 0) return;
    startTransition(async () => {
      const r = await updateCompraAction(compra.id, cambios);
      if (r.ok) {
        toast.success("Compra actualizada");
        router.refresh();
      } else {
        toast.error(r.error ?? "No se pudo guardar");
      }
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Datos de la compra</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Proveedor">
            <SearchableSelect
              options={[
                { value: SIN_PROVEEDOR, label: "Sin proveedor" },
                ...providers.map((p) => ({ value: p.id, label: p.nombre })),
              ]}
              value={form.proveedorId || SIN_PROVEEDOR}
              onChange={(v) => set({ proveedorId: v === SIN_PROVEEDOR ? "" : v })}
              placeholder="Proveedor"
            />
          </Field>
          <Field label="Fecha de la factura" required>
            <Input type="date" value={form.fecha} onChange={(e) => set({ fecha: e.target.value })} />
          </Field>
          <Field label="Referencia" hint="Número de orden o factura del proveedor.">
            <Input
              value={form.referencia}
              onChange={(e) => set({ referencia: e.target.value })}
              placeholder="Ej. AS-1234567"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Moneda"
              hint={
                recibida
                  ? "Ya en bodega: la moneda de la factura no se cambia."
                  : "La de la factura de mercancía."
              }
            >
              <SearchableSelect
                options={MONEDAS}
                value={form.moneda}
                onChange={(v) => set({ moneda: v as CompraMoneda })}
                disabled={recibida}
              />
            </Field>
            <Field label="TC (MXN por USD)" hint="Convierte los cargos en otra moneda.">
              <Input
                type="number"
                step="0.0001"
                min="0"
                placeholder="Ej. 18.50"
                value={form.tc}
                onChange={(e) => set({ tc: e.target.value })}
              />
            </Field>
          </div>
        </div>
        <Field label="Notas">
          <Textarea rows={2} value={form.notas} onChange={(e) => set({ notas: e.target.value })} />
        </Field>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[11px] text-muted-foreground">
            {recibida
              ? "La compra ya está en bodega: la moneda queda fija; si ajustas el tipo de cambio, usa “Recalcular costos”."
              : "Moneda y tipo de cambio definen el costo final en USD y MXN de cada línea."}
          </p>
          <Button size="sm" onClick={guardar} disabled={pending || !dirty}>
            {pending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
