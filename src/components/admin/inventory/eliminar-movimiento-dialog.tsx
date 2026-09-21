"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExclamationTriangleIcon, TrashIcon } from "@heroicons/react/24/outline";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  eliminarMovimientoAction,
  previewEliminarMovimientoAction,
} from "@/app/admin/inventory/actions";
import {
  AVISO_IRREVERSIBLE,
  estadoMotivo,
  lineasVistaPrevia,
  mensajeErrorEliminacion,
  mensajeExito,
  MOTIVO_MAX,
  tituloBloqueo,
} from "@/lib/admin/inventario-eliminar";
import type { EliminacionMovimientoPreview } from "@/types/inventory";

/** Lo mínimo (serializable) de un movimiento para darlo de baja. */
export interface MovimientoEliminable {
  id: string;
  itemId: string;
  itemNombre: string;
  /** Unidad del ítem (pza, litro…): solo para redactar las frases. */
  unidad?: string | null;
}

interface EliminarMovimientoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movimiento: MovimientoEliminable | null;
}

/**
 * Baja de un movimiento del cardex con JUSTIFICACIÓN (21-sep-2026).
 *
 * Pedido del cliente: «podemos agregar una opción para eliminar algunos
 * movimientos, pero que al momento de eliminarlos pida justificación y
 * sepamos quién lo hizo». Regla permanente: toda acción destructiva confirma.
 *
 * El diálogo NO decide nada: al abrirse pide la VISTA PREVIA al API y pinta
 * en claro qué va a pasar (qué se borra, cómo queda la existencia, qué gasto
 * se va con él). Si el API la bloquea, se enseña el motivo y qué hacer —sin
 * botón de eliminar—. El botón destructivo solo se habilita con el motivo
 * capturado (mínimo 10 caracteres, igual que el API y la BD).
 */
export function EliminarMovimientoDialog({
  open,
  onOpenChange,
  movimiento,
}: EliminarMovimientoDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Arranca en "cargando": el diálogo se monta con `key` por movimiento y lo
  // primero que hace es preguntarle al API (nunca se pinta una vista previa
  // vieja ni un botón de eliminar antes de saber si se puede).
  const [cargando, setCargando] = useState(true);
  const [preview, setPreview] = useState<EliminacionMovimientoPreview | null>(null);
  const [errorPreview, setErrorPreview] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  const movId = movimiento?.id ?? null;
  const itemId = movimiento?.itemId ?? null;

  // Al abrir se pide la vista previa (mismo patrón que combinar-vuelos: IIFE
  // con guarda `alive` para no escribir estado de un diálogo ya cerrado). El
  // motivo NO se limpia aquí: el padre monta este diálogo con `key` por
  // movimiento, así que cada baja arranca con su propio estado y nunca se
  // hereda lo que se escribió para otra fila.
  useEffect(() => {
    if (!open || !itemId || !movId) return;
    let alive = true;
    (async () => {
      const res = await previewEliminarMovimientoAction(itemId, movId);
      if (!alive) return;
      if (res.ok && res.data) {
        setPreview(res.data);
        setErrorPreview(null);
      } else {
        setPreview(null);
        // 404 de la RUTA = API sin desplegar: el mensaje lo dice con todas
        // sus letras en vez de un "no encontrado" que nadie sabría leer.
        setErrorPreview(mensajeErrorEliminacion(res));
      }
      setCargando(false);
    })();
    return () => {
      alive = false;
    };
  }, [open, itemId, movId]);

  const estado = estadoMotivo(motivo);
  const permitido = preview?.permitido === true;

  const onEliminar = () => {
    if (!itemId || !movId || !estado.valido) return;
    startTransition(async () => {
      const res = await eliminarMovimientoAction(itemId, movId, motivo);
      if (res.ok && res.data) {
        toast.success(mensajeExito(res.data, movimiento?.unidad));
        onOpenChange(false);
        router.refresh();
        return;
      }
      if (res.fieldErrors?.motivo?.[0]) {
        toast.error(res.fieldErrors.motivo[0]);
        return;
      }
      // Los 409 del API (candados) y el 503 (migración pendiente) ya vienen
      // redactados y dicen qué hacer: se pintan tal cual y el diálogo se
      // queda abierto con el motivo escrito.
      toast.error(mensajeErrorEliminacion(res));
      // Se vuelve a leer la vista previa: un rechazo suele significar que el
      // cardex cambió (otro movimiento nuevo, un gasto conciliado…), y desde
      // ahí el diálogo ya enseña el bloqueo en vez de invitar a reintentar.
      const previa = await previewEliminarMovimientoAction(itemId, movId);
      if (previa.ok && previa.data) {
        setPreview(previa.data);
        setErrorPreview(null);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>¿Eliminar este movimiento del cardex?</DialogTitle>
          <DialogDescription>{movimiento?.itemNombre ?? ""}</DialogDescription>
        </DialogHeader>

        {cargando && (
          <p className="text-sm text-muted-foreground">
            Revisando qué pasa si se elimina…
          </p>
        )}

        {!cargando && errorPreview && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p className="text-destructive">{errorPreview}</p>
          </div>
        )}

        {!cargando && preview && !permitido && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-50 p-3 dark:bg-amber-950/20">
            <p className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-500">
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
              {tituloBloqueo(preview.codigo_bloqueo)}
            </p>
            {/* El mensaje del API es el único que nombra QUÉ hay que
                eliminar primero (con su fecha): se pinta tal cual. */}
            <p className="mt-1.5 text-sm text-muted-foreground">{preview.mensaje}</p>
          </div>
        )}

        {!cargando && preview && permitido && (
          <>
            <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
              {lineasVistaPrevia(preview, movimiento?.unidad).map((linea) => (
                <p key={linea}>{linea}</p>
              ))}
            </div>
            <p className="-mt-1 text-xs text-muted-foreground">{AVISO_IRREVERSIBLE}</p>

            <div className="space-y-1.5">
              <Label htmlFor="motivo-eliminar-movimiento">
                ¿Por qué se elimina? <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="motivo-eliminar-movimiento"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. se capturó por error el 29 de agosto, la salida nunca ocurrió"
                rows={3}
                maxLength={MOTIVO_MAX}
                autoFocus
              />
              <p
                className={`text-xs ${
                  estado.valido ? "text-muted-foreground" : "text-amber-600 dark:text-amber-500"
                }`}
              >
                {estado.contador}
              </p>
            </div>
          </>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {/* Bloqueado no hay nada que cancelar: solo enterarse. */}
            {permitido || cargando ? "Cancelar" : "Entendido"}
          </Button>
          {permitido && (
            <Button
              type="button"
              onClick={onEliminar}
              disabled={pending || !estado.valido}
              className="gap-1.5 bg-destructive text-white hover:bg-destructive/90"
            >
              <TrashIcon className="h-4 w-4" />
              {pending ? "Eliminando…" : "Eliminar movimiento"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
