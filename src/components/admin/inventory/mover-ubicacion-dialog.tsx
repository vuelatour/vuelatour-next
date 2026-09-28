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
  UbicacionSelector,
  useCatalogoUbicaciones,
} from "@/components/admin/inventory/ubicacion-selector";
import {
  TOPE_MOVER_UBICACION,
  particionMover,
  textoBotonMover,
  textoConfirmarMover,
  textoAltaUbicacionPendiente,
  textoNadaQueMover,
  textoProductos,
  textoResultadoMover,
  ubicacionesActivas,
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
  /**
   * Catálogo COMPLETO (con inactivas). Los destinos elegibles son SOLO las
   * activas, en su orden (el selector se encarga).
   */
  ubicaciones: InventarioUbicacion[];
  /**
   * «＋ Agregar ubicación…» y el engrane «Administrar ubicaciones» junto al
   * destino (28-sep-2026). El diálogo ya solo se monta para ADMIN/MECANICO.
   */
  puedeAdministrar?: boolean;
}

/**
 * «Mover a…» en lote (25-sep-2026): cambia la UBICACIÓN de los productos que
 * se ven en la tabla. El diálogo ES la confirmación: dice cuántos cambian de
 * verdad (los que ya están en el destino se cuentan aparte), a dónde y una
 * muestra de cuáles, y aclara que no mueve stock ni dinero. Un solo update en
 * el API (`POST items/mover-ubicacion`); viajan TODOS los ids de la vista y
 * el API decide cuáles ya estaban (`sin_cambio`) — si el panel tuviera un
 * dato viejo, manda el API.
 *
 * El destino es el MISMO `UbicacionSelector` del formulario del producto
 * (28-sep-2026): si el lugar no existe, se agrega ahí mismo y queda elegido.
 */
export function MoverUbicacionDialog({
  open,
  onOpenChange,
  productos,
  ubicaciones,
  puedeAdministrar = true,
}: MoverUbicacionDialogProps) {
  const router = useRouter();
  const [destinoId, setDestinoId] = useState("");
  const [pending, startTransition] = useTransition();
  const [catalogo, setCatalogo] = useCatalogoUbicaciones(ubicaciones);
  // Nombre tecleado en «＋ Agregar ubicación…» y aún sin guardar.
  const [altaPendiente, setAltaPendiente] = useState<string | null>(null);
  const destino = ubicacionesActivas(catalogo).find((d) => d.id === destinoId) ?? null;
  const total = productos.length;
  const excede = total > TOPE_MOVER_UBICACION;
  const { porMover, yaAhi } = particionMover(productos, destino?.id);
  const n = porMover.length;

  const cerrar = (o: boolean) => {
    if (pending) return;
    if (!o) {
      setDestinoId("");
      setAltaPendiente(null);
    }
    onOpenChange(o);
  };

  const mover = () => {
    if (!destino || n === 0 || excede || pending) return;
    // Con un nombre a medias en «＋ Agregar ubicación…» se movería al destino
    // ANTERIOR y el nombre se perdería: se dice qué falta (el botón NO se
    // apaga: un botón apagado no explica nada).
    if (altaPendiente) {
      toast.error(textoAltaUbicacionPendiente(altaPendiente));
      return;
    }
    startTransition(async () => {
      const res = await moverUbicacionAction(
        productos.map((p) => p.id),
        destino.id,
      );
      if (res.ok && res.data) {
        const { titulo, detalle } = textoResultadoMover(res.data);
        toast.success(titulo, detalle ? { description: detalle } : undefined);
        setDestinoId("");
        setAltaPendiente(null);
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

        <div className="space-y-1.5 text-sm">
          <span className="font-medium">¿A dónde?</span>
          <UbicacionSelector
            value={destinoId}
            onChange={setDestinoId}
            ubicaciones={catalogo}
            onCatalogoCambio={setCatalogo}
            etiquetaVacia="Elige la ubicación…"
            ariaLabel="Ubicación destino"
            puedeAdministrar={puedeAdministrar}
            disabled={pending}
            onAltaPendiente={setAltaPendiente}
          />
        </div>

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
