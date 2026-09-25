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
import { moverUbicacionAction } from "@/app/admin/inventory/actions";
import {
  TOPE_MOVER_UBICACION,
  particionMover,
  textoBotonMover,
  textoConfirmarMover,
  textoNadaQueMover,
  textoProductos,
  textoResultadoMover,
} from "@/lib/admin/inventario-ubicacion";
import type { InventarioUbicacion } from "@/types/inventory";

interface MoverUbicacionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Los productos que el operador está VIENDO (filtro + búsqueda), en su
   * orden, con su ubicación actual (para no contar como «se moverán» los que
   * ya están en el destino).
   */
  productos: Array<{ id: string; nombre: string; ubicacion_id?: string | null }>;
  /** Destinos elegibles: SOLO ubicaciones activas, en el orden del catálogo. */
  destinos: InventarioUbicacion[];
}

/**
 * «Mover a…» en lote (25-sep-2026): cambia la UBICACIÓN de los productos que
 * se ven en la tabla. El diálogo ES la confirmación: dice cuántos cambian de
 * verdad (los que ya están en el destino se cuentan aparte), a dónde y una
 * muestra de cuáles, y aclara que no mueve stock ni dinero. Un solo update en
 * el API (`POST items/mover-ubicacion`); viajan TODOS los ids de la vista y
 * el API decide cuáles ya estaban (`sin_cambio`) — si el panel tuviera un
 * dato viejo, manda el API.
 */
export function MoverUbicacionDialog({
  open,
  onOpenChange,
  productos,
  destinos,
}: MoverUbicacionDialogProps) {
  const router = useRouter();
  const [destinoId, setDestinoId] = useState("");
  const [pending, startTransition] = useTransition();
  const destino = destinos.find((d) => d.id === destinoId) ?? null;
  const total = productos.length;
  const excede = total > TOPE_MOVER_UBICACION;
  const { porMover, yaAhi } = particionMover(productos, destino?.id);
  const n = porMover.length;

  const cerrar = (o: boolean) => {
    if (pending) return;
    if (!o) setDestinoId("");
    onOpenChange(o);
  };

  const mover = () => {
    if (!destino || n === 0 || excede || pending) return;
    startTransition(async () => {
      const res = await moverUbicacionAction(
        productos.map((p) => p.id),
        destino.id,
      );
      if (res.ok && res.data) {
        const { titulo, detalle } = textoResultadoMover(res.data);
        toast.success(titulo, detalle ? { description: detalle } : undefined);
        setDestinoId("");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudieron mover los productos");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mover a otra ubicación</DialogTitle>
          <DialogDescription>
            Cambia dónde están guardados los {textoProductos(total)} que estás viendo en la tabla
            (según el filtro y la búsqueda).
          </DialogDescription>
        </DialogHeader>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">¿A dónde?</span>
          <select
            value={destinoId}
            onChange={(e) => setDestinoId(e.target.value)}
            disabled={pending}
            aria-label="Ubicación destino"
            className="h-9 w-full cursor-pointer rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30"
          >
            <option value="">Elige la ubicación…</option>
            {destinos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </label>

        {destino && !excede && n > 0 && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            {textoConfirmarMover(
              n,
              destino.nombre,
              porMover.map((p) => p.nombre),
              yaAhi,
            )}
          </p>
        )}
        {destino && !excede && n === 0 && yaAhi > 0 && (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {textoNadaQueMover(yaAhi, destino.nombre)}
          </p>
        )}
        {excede && (
          <p className="text-sm text-destructive">
            Se pueden mover hasta {TOPE_MOVER_UBICACION} productos a la vez; acota la lista con el
            buscador o el filtro.
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => cerrar(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" onClick={mover} disabled={!destino || n === 0 || excede || pending}>
            {pending ? "Moviendo…" : textoBotonMover(destino ? n : total)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
