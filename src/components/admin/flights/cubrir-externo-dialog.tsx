"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
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
import {
  cubrirExternoAction,
  revertirExternoAction,
} from "@/app/admin/flights/actions";
import type { FlightListItem } from "@/types/flights";

interface CubrirExternoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flight: FlightListItem;
}

/**
 * Cubre el vuelo con un operador EXTERNO (Itzy): suelta avión, piloto y
 * tacómetros — la cotización del cliente no cambia; solo se registra quién lo
 * vuela y cuánto nos cobra ese apoyo. Sobre un vuelo ya externo, edita
 * operador/costo.
 */
export function CubrirExternoDialog({
  open,
  onOpenChange,
  flight,
}: CubrirExternoDialogProps) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const yaExterno = flight.es_externo;
  const [operador, setOperador] = useState(flight.operador_externo ?? "");
  const [costo, setCosto] = useState(
    Number(flight.costo_externo_usd) > 0 ? String(flight.costo_externo_usd) : "",
  );
  // TC pactado: sin él, un vuelo cotizado en USD no se puede facturar.
  const [tc, setTc] = useState("");
  // Regreso a vuelo propio: paso de confirmación inline (acción significativa).
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [reverting, startRevert] = useTransition();

  const handleRevert = () => {
    startRevert(async () => {
      const res = await revertirExternoAction(flight.id);
      if (res.ok) {
        toast.success(
          `Vuelo #${flight.folio} regresó a vuelo propio: asigna avión y piloto.`,
        );
        setConfirmRevert(false);
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo regresar a vuelo propio");
      }
    });
  };

  const handleSave = () => {
    if (operador.trim().length < 2) {
      toast.error("Indica el nombre del operador externo");
      return;
    }
    startSaving(async () => {
      const res = await cubrirExternoAction(flight.id, {
        operador_externo: operador.trim(),
        costo_externo_usd: Math.max(0, Number(costo) || 0),
        tc_usd_mxn: Number(tc) > 0 ? Number(tc) : undefined,
      });
      if (res.ok) {
        toast.success(
          yaExterno
            ? "Datos del operador externo actualizados"
            : `Vuelo #${flight.folio} cubierto con ${operador.trim()}`,
        );
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo cubrir con externo");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PaperAirplaneIcon className="h-5 w-5 text-amber-600" />
            {yaExterno
              ? "Editar operador externo"
              : `Cubrir vuelo #${flight.folio} con externo`}
          </DialogTitle>
          <DialogDescription>
            {yaExterno
              ? "Actualiza quién vuela y cuánto nos cobra ese apoyo."
              : "Otro operador vuela por nosotros: se sueltan avión, piloto y tacómetros. La cotización del cliente NO cambia — si el precio al cliente cambia por el operador, revisa después la cotización y captura ahí el precio pactado."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Operador externo <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="Ej. Aerocharter del Caribe"
              value={operador}
              onChange={(e) => setOperador(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Costo del apoyo (USD)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              placeholder="0.00"
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Lo que nos cobra el operador por cubrir el vuelo (costo interno;
              no aparece al cliente).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Tipo de cambio (MXN por USD)
            </Label>
            <Input
              type="number"
              step="0.0001"
              min={0}
              placeholder="Ej. 18.50"
              value={tc}
              onChange={(e) => setTc(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Opcional: sin TC el vuelo no se puede facturar (el CFDI se emite
              en MXN); también se puede capturar al emitir la factura.
            </p>
          </div>
          {!yaExterno && (flight.aeronave_id || flight.piloto_id) && (
            <p className="text-xs text-amber-600">
              El avión y el piloto asignados quedarán libres; el estado del
              vuelo pasará a marcarse a mano (Iniciar / Cerrar).
            </p>
          )}
          {yaExterno && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-sm font-medium">
                ¿Al final sí sale con avión de la casa?
              </p>
              {confirmRevert ? (
                <div className="space-y-2">
                  <p className="text-xs text-amber-600">
                    Se quita al operador {flight.operador_externo ?? "externo"} y
                    su costo del apoyo; el vuelo queda listo para asignar avión
                    y piloto propios (tacómetros y gastos vuelven a aplicar).
                    La cotización del cliente no cambia.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmRevert(false)}
                      disabled={reverting}
                    >
                      No, sigue cubierto
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleRevert}
                      disabled={reverting}
                      className="bg-emerald-600 hover:bg-emerald-600/90 text-white"
                    >
                      {reverting ? "Regresando…" : "Sí, regresar a vuelo propio"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmRevert(true)}
                  disabled={saving || reverting}
                >
                  Regresar a vuelo propio
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Volver
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || operador.trim().length < 2}
            className="bg-amber-600 hover:bg-amber-600/90 text-white"
          >
            {saving
              ? "Guardando…"
              : yaExterno
                ? "Guardar cambios"
                : "Cubrir con externo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
