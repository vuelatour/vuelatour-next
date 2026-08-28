"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { extraerCompraAction, importarCompraAction } from "@/app/admin/inventory/actions";

interface LineaEdit {
  nombre: string;
  numero_parte: string;
  categoria: string;
  cantidad: string;
  costo_unitario_usd: string;
}

interface ImportCompraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providers: { id: string; nombre: string }[];
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

export function ImportCompraDialog({ open, onOpenChange, providers }: ImportCompraDialogProps) {
  const router = useRouter();
  const [extracting, setExtracting] = useState(false);
  const [importing, startImport] = useTransition();
  const [lineas, setLineas] = useState<LineaEdit[]>([]);
  // Compra registrada por el API a partir del PDF: al terminar se ofrece
  // abrirla para ligar envío/impuestos y recibirla en bodega.
  const [compraCreada, setCompraCreada] = useState<{ id: string; resumen: string } | null>(null);
  const [proveedorId, setProveedorId] = useState("");
  const [fechaOrden, setFechaOrden] = useState("");
  const [referencia, setReferencia] = useState("");
  // Moneda de la factura completa: MXN default (compras locales); USD para
  // Aircraft Spruce. Con MXN el TC de la compra es obligatorio.
  const [moneda, setMoneda] = useState<"MXN" | "USD">("MXN");
  const [tc, setTc] = useState("");

  const reset = () => {
    setLineas([]);
    setProveedorId("");
    setFechaOrden("");
    setReferencia("");
    setCompraCreada(null);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setExtracting(true);
    try {
      const b64 = await readBase64(file);
      const res = await extraerCompraAction(b64);
      if (!res.ok || !res.data) {
        toast.error(res.error ?? "No se pudo leer el PDF");
        return;
      }
      const d = res.data;
      if (d.proveedor && !proveedorId) {
        const match = providers.find((p) => p.nombre.toLowerCase() === d.proveedor!.toLowerCase());
        if (match) setProveedorId(match.id);
      }
      if (d.fecha) setFechaOrden(d.fecha);
      setLineas(
        d.lineas.map((l) => ({
          nombre: l.nombre,
          numero_parte: l.numero_parte ?? "",
          categoria: "refacciones",
          cantidad: String(l.cantidad ?? 1),
          costo_unitario_usd: String(
            l.precio_unitario_usd ??
              (l.total_usd && l.cantidad ? l.total_usd / l.cantidad : 0),
          ),
        })),
      );
      toast.success(`${d.lineas.length} líneas extraídas · revisa antes de importar`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al leer el archivo");
    } finally {
      setExtracting(false);
    }
  };

  const setLinea = (i: number, patch: Partial<LineaEdit>) => {
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const removeLinea = (i: number) => setLineas((prev) => prev.filter((_, idx) => idx !== i));

  const onImport = () => {
    const lineasValidas = lineas
      .filter((l) => l.nombre.trim() && Number(l.cantidad) > 0)
      .map((l) => ({
        nombre: l.nombre.trim(),
        numero_parte: l.numero_parte.trim() || undefined,
        categoria: l.categoria.trim() || "refacciones",
        cantidad: Number(l.cantidad),
        costo_unitario_usd: Number(l.costo_unitario_usd) || 0,
      }));
    if (lineasValidas.length === 0) {
      toast.error("No hay líneas válidas para importar");
      return;
    }
    if (moneda === "MXN" && !(Number(tc) > 0)) {
      toast.error("Captura el tipo de cambio de la compra (MXN por USD)");
      return;
    }
    startImport(async () => {
      const res = await importarCompraAction({
        proveedor_id: proveedorId || undefined,
        fecha_orden: fechaOrden || undefined,
        referencia: referencia || undefined,
        moneda,
        tc_usd_mxn: moneda === "MXN" ? Number(tc) || undefined : undefined,
        lineas: lineasValidas,
      });
      if (res.ok && res.data) {
        const resumen = `${res.data.entradas} entradas · ${res.data.items_creados} ítems nuevos`;
        toast.success(`Importado: ${resumen}`);
        if (res.data.compra_id) {
          // Se queda abierto con el acceso a la compra (un toast se va).
          setLineas([]);
          setCompraCreada({ id: res.data.compra_id, resumen });
        } else {
          reset();
          onOpenChange(false);
        }
      } else {
        toast.error(res.error ?? "Error al importar");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar compra (PDF)</DialogTitle>
          <DialogDescription>
            Sube la factura/orden (ej. Aircraft Spruce). La IA extrae las líneas; revísalas y se
            registran como entradas al inventario.
          </DialogDescription>
        </DialogHeader>

        {compraCreada ? (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
            <p className="font-medium text-emerald-700 dark:text-emerald-400">
              Compra registrada · {compraCreada.resumen}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Abre la compra para ligar el envío y los impuestos cuando lleguen y recibirla en
              bodega con el costo real.
            </p>
          </div>
        ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">PDF de la compra</Label>
            <Input
              type="file"
              accept="application/pdf"
              disabled={extracting}
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            {extracting && <p className="text-xs text-muted-foreground">Leyendo el PDF con IA…</p>}
          </div>

          {lineas.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Proveedor</Label>
                  <SearchableSelect
                    options={providers.map((p) => ({ value: p.id, label: p.nombre }))}
                    value={proveedorId}
                    onChange={setProveedorId}
                    placeholder="Proveedor"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Fecha orden</Label>
                  <Input type="date" value={fechaOrden} onChange={(e) => setFechaOrden(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Referencia</Label>
                  <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} />
                </div>
              </div>

              {/* Moneda de TODA la factura + TC si es MXN (se convierte a USD
                  para el balance; se guarda el precio original en pesos). */}
              <div className="flex items-end gap-3 flex-wrap">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Moneda de la factura</Label>
                  <select
                    value={moneda}
                    onChange={(e) => setMoneda(e.target.value as "MXN" | "USD")}
                    className="h-9 w-28 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30 block"
                  >
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                {moneda === "MXN" && (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Tipo de cambio (MXN por USD)</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      min="0"
                      placeholder="Ej. 18.50"
                      className="w-32"
                      value={tc}
                      onChange={(e) => setTc(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {lineas.map((l, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <Input
                      className="col-span-4"
                      value={l.nombre}
                      placeholder="Producto"
                      onChange={(e) => setLinea(i, { nombre: e.target.value })}
                    />
                    <Input
                      className="col-span-2 font-mono"
                      value={l.numero_parte}
                      placeholder="No. parte"
                      onChange={(e) => setLinea(i, { numero_parte: e.target.value })}
                    />
                    <Input
                      className="col-span-2"
                      value={l.categoria}
                      placeholder="categoría"
                      onChange={(e) => setLinea(i, { categoria: e.target.value })}
                    />
                    <Input
                      className="col-span-1"
                      type="number"
                      step="any"
                      value={l.cantidad}
                      onChange={(e) => setLinea(i, { cantidad: e.target.value })}
                    />
                    <Input
                      className="col-span-2"
                      type="number"
                      step="any"
                      value={l.costo_unitario_usd}
                      placeholder={moneda}
                      onChange={(e) => setLinea(i, { costo_unitario_usd: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => removeLinea(i)}
                      className="col-span-1 text-xs text-destructive hover:underline"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        )}

        <DialogFooter>
          {compraCreada ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                Cerrar
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const id = compraCreada.id;
                  reset();
                  onOpenChange(false);
                  router.push(`/admin/inventory/compras/${id}`);
                }}
              >
                Ver compra
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
                Cancelar
              </Button>
              <Button type="button" onClick={onImport} disabled={importing || lineas.length === 0}>
                {importing ? "Importando…" : `Importar ${lineas.length} líneas`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
