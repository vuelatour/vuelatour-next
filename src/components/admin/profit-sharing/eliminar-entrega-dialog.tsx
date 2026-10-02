"use client";

import { useState } from "react";
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
import { eliminarPagoSocioAction } from "@/app/admin/profit-sharing/actions";
import {
  MOTIVO_BAJA_MAX,
  TEXTO_FALLO_RED_BAJA,
  confirmacionEliminarPago,
  errorPideRefrescar,
  textoContadorMotivo,
  validarMotivoBaja,
} from "@/lib/admin/reparto-pagos";
import type { PagoSocio } from "@/types/reparto-pagos";

/**
 * Confirmación con MOTIVO (5–300) para eliminar una entrega (soft delete en
 * el API). El DELETE sale SOLO de aquí. No se cierra mientras elimina.
 */
export function EliminarEntregaDialog({
  pago,
  socioNombre,
  onCerrar,
  onEliminado,
}: {
  pago: PagoSocio | null;
  socioNombre: string;
  onCerrar: () => void;
  onEliminado: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const textos = pago ? confirmacionEliminarPago(pago, socioNombre) : null;
  const invalido = validarMotivoBaja(motivo);
  const contador = textoContadorMotivo(motivo);

  const cerrar = () => {
    setMotivo("");
    setError(null);
    onCerrar();
  };

  return (
    <Dialog open={pago !== null} onOpenChange={(o) => !o && !eliminando && cerrar()}>
      <DialogContent className="sm:max-w-md" showCloseButton={!eliminando}>
        <DialogHeader>
          <DialogTitle>{textos?.titulo}</DialogTitle>
          <DialogDescription>{textos?.descripcion}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="motivo-baja-entrega" className="text-sm font-medium">
            ¿Por qué se elimina?<span className="ml-0.5 text-destructive">*</span>
          </Label>
          <Textarea
            id="motivo-baja-entrega"
            rows={2}
            maxLength={MOTIVO_BAJA_MAX}
            placeholder="Ej. Se capturó dos veces la misma entrega."
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              setError(null);
            }}
          />
          {/* El botón apagado no tiene puntero ni enseña su `title`: el mínimo
              se DICE aquí («3/300 · mínimo 5»). */}
          <p
            className={`text-xs ${
              contador.falta && motivo.trim().length > 0
                ? "text-amber-700 dark:text-amber-400"
                : "text-muted-foreground"
            }`}
            data-contador-motivo
          >
            {contador.texto}
          </p>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer"
            disabled={eliminando}
            onClick={cerrar}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="cursor-pointer"
            disabled={eliminando || invalido !== null}
            title={invalido ?? undefined}
            data-accion="confirmar-eliminar-entrega-socio"
            onClick={async () => {
              if (!pago) return;
              setEliminando(true);
              let res: Awaited<ReturnType<typeof eliminarPagoSocioAction>>;
              try {
                res = await eliminarPagoSocioAction(pago.id, motivo);
              } catch {
                // La LLAMADA falló (red, 502): sin esto el diálogo quedaba
                // «Eliminando…» y sin poder cerrarse.
                setEliminando(false);
                setError(TEXTO_FALLO_RED_BAJA);
                return;
              }
              setEliminando(false);
              if (res.ok) {
                toast.success("Entrega eliminada; el saldo del socio se recalculó.");
                cerrar();
                onEliminado();
                return;
              }
              if (errorPideRefrescar(res.code)) {
                toast.info(res.error);
                cerrar();
                onEliminado();
                return;
              }
              setError(res.error ?? "No se pudo eliminar la entrega.");
            }}
          >
            {eliminando ? "Eliminando…" : textos?.boton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
