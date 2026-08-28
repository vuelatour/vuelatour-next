"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { updateCompraAction } from "@/app/admin/inventory/compras/actions";
import {
  fmtMontoMoneda,
  toNum,
  type CompraDetalle,
  type CompraLinea,
  type CompraLineaInput,
} from "@/types/compras";

export interface ItemOption {
  id: string;
  nombre: string;
  numero_parte: string | null;
}

interface LineaEdit {
  key: string;
  id?: string;
  item_id: string;
  nombre: string;
  numero_parte: string;
  categoria: string;
  cantidad: string;
  costo_unitario: string;
}

const NUEVO_ITEM = "__nuevo__";

function desdeServidor(l: CompraLinea): LineaEdit {
  return {
    key: l.id,
    id: l.id,
    item_id: l.item?.id ?? "",
    nombre: l.nombre,
    numero_parte: l.numero_parte ?? "",
    categoria: l.categoria ?? "",
    cantidad: String(toNum(l.cantidad)),
    costo_unitario: String(toNum(l.costo_unitario)),
  };
}

function nuevaLinea(): LineaEdit {
  return {
    key: `nueva-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    item_id: "",
    nombre: "",
    numero_parte: "",
    categoria: "refacciones",
    cantidad: "1",
    costo_unitario: "",
  };
}

function iguales(a: LineaEdit, b: LineaEdit): boolean {
  return (
    a.item_id === b.item_id &&
    a.nombre === b.nombre &&
    a.numero_parte === b.numero_parte &&
    a.categoria === b.categoria &&
    toNum(a.cantidad) === toNum(b.cantidad) &&
    toNum(a.costo_unitario) === toNum(b.costo_unitario)
  );
}

/**
 * Líneas de la compra (cada refacción): editables mientras la compra está
 * ABIERTA. Las columnas "costo final" son las que calcula el API (factura +
 * cargos prorrateados); para una línea editada y aún sin guardar se muestra
 * una ESTIMACIÓN con el factor vigente (≈) hasta que se guarde.
 */
export function CompraLineasCard({
  compra,
  items,
}: {
  compra: CompraDetalle;
  items: ItemOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const editable = compra.estado === "ABIERTA";
  const [lineas, setLineas] = useState<LineaEdit[]>(() => compra.lineas.map(desdeServidor));
  const originales = new Map(compra.lineas.map((l) => [l.id, l]));

  const moneda = compra.moneda;
  const factor = toNum(compra.resumen.factor) || 1;
  const tc = toNum(compra.resumen.tc_usd_mxn ?? compra.tc_usd_mxn) || null;

  const dirty =
    lineas.length !== compra.lineas.length ||
    lineas.some((l) => {
      if (!l.id) return true;
      const o = originales.get(l.id);
      return !o || !iguales(l, desdeServidor(o));
    });

  const setLinea = (key: string, patch: Partial<LineaEdit>) =>
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const elegirItem = (key: string, itemId: string) => {
    if (itemId === NUEVO_ITEM) {
      setLinea(key, { item_id: "" });
      return;
    }
    const it = items.find((i) => i.id === itemId);
    setLineas((prev) =>
      prev.map((l) =>
        l.key === key
          ? {
              ...l,
              item_id: itemId,
              // Completa nombre/parte desde el catálogo si venían vacíos.
              nombre: l.nombre.trim() ? l.nombre : (it?.nombre ?? l.nombre),
              numero_parte: l.numero_parte.trim()
                ? l.numero_parte
                : (it?.numero_parte ?? l.numero_parte),
            }
          : l,
      ),
    );
  };

  const guardar = () => {
    const payload: CompraLineaInput[] = [];
    for (const [i, l] of lineas.entries()) {
      if (!l.nombre.trim()) {
        toast.error(`Línea ${i + 1}: captura el nombre del producto`);
        return;
      }
      if (!(Number(l.cantidad) > 0)) {
        toast.error(`Línea ${i + 1}: la cantidad debe ser mayor a cero`);
        return;
      }
      if (l.costo_unitario.trim() === "" || Number(l.costo_unitario) < 0) {
        toast.error(`Línea ${i + 1}: captura el costo unitario de factura`);
        return;
      }
      payload.push({
        id: l.id,
        item_id: l.item_id || undefined,
        nombre: l.nombre.trim(),
        numero_parte: l.numero_parte.trim() || undefined,
        categoria: l.categoria.trim() || undefined,
        cantidad: Number(l.cantidad),
        costo_unitario: Number(l.costo_unitario),
      });
    }
    startTransition(async () => {
      const r = await updateCompraAction(compra.id, { lineas: payload });
      if (r.ok && r.data) {
        toast.success("Líneas guardadas");
        setLineas(r.data.lineas.map(desdeServidor));
        router.refresh();
      } else {
        toast.error(r.error ?? "No se pudieron guardar las líneas");
      }
    });
  };

  // Costo final por línea: del API si la línea está guardada sin cambios;
  // estimado (factor vigente) si se editó.
  const finales = (l: LineaEdit) => {
    const o = l.id ? originales.get(l.id) : undefined;
    if (o && iguales(l, desdeServidor(o))) {
      return {
        estimado: false,
        unit: toNum(o.costo_unitario_final),
        usd: o.costo_unitario_final_usd != null ? toNum(o.costo_unitario_final_usd) : null,
        mxn: o.costo_unitario_final_mxn != null ? toNum(o.costo_unitario_final_mxn) : null,
        total: toNum(o.total_linea_final),
      };
    }
    const unit = toNum(l.costo_unitario) * factor;
    const usd = moneda === "USD" ? unit : tc ? unit / tc : null;
    const mxn = moneda === "MXN" ? unit : tc ? unit * tc : null;
    return { estimado: true, unit, usd, mxn, total: unit * toNum(l.cantidad) };
  };

  const totalFactura = lineas.reduce(
    (s, l) => s + toNum(l.cantidad) * toNum(l.costo_unitario),
    0,
  );

  const itemOptions = [
    { value: NUEVO_ITEM, label: "Nuevo ítem (se crea al recibir)" },
    ...items.map((i) => ({
      value: i.id,
      label: i.nombre,
      description: i.numero_parte ?? undefined,
    })),
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">
              Refacciones{" "}
              <span className="text-sm font-normal text-muted-foreground">({lineas.length})</span>
            </CardTitle>
            <CardDescription>
              {editable
                ? "Costo unitario tal como viene en la factura. El costo final suma envío e impuestos prorrateados por valor."
                : "Compra recibida: las líneas ya generaron su entrada al inventario y no se editan."}
            </CardDescription>
          </div>
          {editable && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLineas((p) => [...p, nuevaLinea()])}
                disabled={pending}
                className="gap-1.5"
              >
                <PlusIcon className="h-4 w-4" />
                Agregar línea
              </Button>
              <Button size="sm" onClick={guardar} disabled={pending || !dirty}>
                {pending ? "Guardando…" : "Guardar líneas"}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {lineas.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            {editable
              ? "Sin líneas todavía. Agrega cada refacción de la factura."
              : "Esta compra no tiene líneas."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead className="min-w-[200px]">Ítem del inventario</TableHead>
                <TableHead className="min-w-[200px]">Producto</TableHead>
                <TableHead>No. parte</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Costo factura ({moneda})</TableHead>
                <TableHead className="text-right">Costo final ({moneda})</TableHead>
                <TableHead className="text-right">USD</TableHead>
                <TableHead className="text-right">MXN</TableHead>
                <TableHead className="text-right">Total final</TableHead>
                {editable && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineas.map((l, i) => {
                const f = finales(l);
                const o = l.id ? originales.get(l.id) : undefined;
                const pre = f.estimado ? "≈ " : "";
                return (
                  <TableRow key={l.key}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      {editable ? (
                        <SearchableSelect
                          options={itemOptions}
                          value={l.item_id || NUEVO_ITEM}
                          onChange={(v) => elegirItem(l.key, v)}
                          placeholder="Ítem"
                          className="h-8"
                        />
                      ) : o?.item ? (
                        <Link
                          href={`/admin/inventory/${o.item.id}`}
                          className="text-brand-600 hover:underline"
                        >
                          {o.item.nombre}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <Input
                          className="h-8"
                          value={l.nombre}
                          placeholder="Producto"
                          onChange={(e) => setLinea(l.key, { nombre: e.target.value })}
                        />
                      ) : (
                        l.nombre
                      )}
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <Input
                          className="h-8 w-32 font-mono"
                          value={l.numero_parte}
                          placeholder="No. parte"
                          onChange={(e) => setLinea(l.key, { numero_parte: e.target.value })}
                        />
                      ) : (
                        <span className="font-mono text-xs">{l.numero_parte || "—"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <Input
                          className="h-8 w-32"
                          value={l.categoria}
                          placeholder="categoría"
                          onChange={(e) => setLinea(l.key, { categoria: e.target.value })}
                        />
                      ) : (
                        <span className="text-muted-foreground">{l.categoria || "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {editable ? (
                        <Input
                          className="h-8 w-20 text-right"
                          type="number"
                          step="any"
                          min="0"
                          value={l.cantidad}
                          onChange={(e) => setLinea(l.key, { cantidad: e.target.value })}
                        />
                      ) : (
                        toNum(l.cantidad).toLocaleString("es-MX", { maximumFractionDigits: 2 })
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {editable ? (
                        <Input
                          className="h-8 w-28 text-right"
                          type="number"
                          step="any"
                          min="0"
                          value={l.costo_unitario}
                          placeholder="0.00"
                          onChange={(e) => setLinea(l.key, { costo_unitario: e.target.value })}
                        />
                      ) : (
                        fmtMontoMoneda(l.costo_unitario, moneda)
                      )}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-medium ${f.estimado ? "text-muted-foreground" : ""}`}
                      title={f.estimado ? "Estimado con el factor vigente; se calcula al guardar." : undefined}
                    >
                      {pre}
                      {fmtMontoMoneda(f.unit, moneda)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {f.usd != null ? `${pre}${fmtMontoMoneda(f.usd, "USD")}` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {f.mxn != null ? `${pre}${fmtMontoMoneda(f.mxn, "MXN")}` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pre}
                      {fmtMontoMoneda(f.total, moneda)}
                      {o?.inventario_movimiento_id && (
                        <p className="text-[10px] text-emerald-600">Entrada registrada</p>
                      )}
                    </TableCell>
                    {editable && (
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => setLineas((p) => p.filter((x) => x.key !== l.key))}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-destructive hover:bg-muted"
                          title="Quitar línea"
                          disabled={pending}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {lineas.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground flex-wrap">
            <span>
              Factor de cargos vigente: <span className="font-mono">× {factor.toFixed(4)}</span>
              {tc ? (
                <>
                  {" "}
                  · TC <span className="font-mono">{tc.toFixed(4)}</span>
                </>
              ) : (
                " · sin tipo de cambio: no hay conversión USD↔MXN"
              )}
            </span>
            <span>
              Mercancía en factura:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {fmtMontoMoneda(totalFactura, moneda)}
              </span>
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
