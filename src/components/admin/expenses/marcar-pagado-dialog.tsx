"use client";

import { useId, useState, useTransition } from "react";
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
import { todayCancun } from "@/lib/datetime";
import { toastMesCerradoSiAplica } from "@/components/admin/aviso-mes-cerrado";
import { marcarPagadoGastoAction, type ActionResult } from "@/app/admin/expenses/actions";
import {
  AYUDA_FECHA_PAGO,
  DESCRIPCION_MARCAR_PAGADO,
  ETIQUETA_FECHA_PAGO,
  TEXTO_GUARDANDO_PAGADO,
  TEXTO_MARCAR_PAGADO,
  TITULO_MARCAR_PAGADO,
  errorFechaPago,
  mensajeErrorMarcarPagado,
  resumenGastoPorPagar,
  toastMarcadoPagado,
  type GastoPorPagar,
} from "@/lib/admin/gasto-por-pagar";
import type { Gasto } from "@/types/expenses";

/**
 * El diálogo. Se MONTA solo al abrirse (quien lo abre lo desmonta con
 * `onCerrar`): así la fecha arranca en hoy en cada apertura sin efectos.
 * Éxito ⇒ toast y cerrar (la server action revalida la pantalla). 409
 * `MES_CERRADO` ⇒ su aviso con «Ir a Reportes». `CONFLICTO_VERSION`, 404 o
 * sin respuesta ⇒ el texto, cerrar y recargar. Lo demás (el API en es-MX:
 * `POR_PAGAR_FECHA_FUTURA`, `POR_PAGAR_NO_DISPONIBLE`…) se dice tal cual y el
 * diálogo sigue abierto.
 */
export function MarcarPagadoDialog({
  gasto,
  onCerrar,
}: {
  gasto: GastoPorPagar;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const idFecha = useId();
  const [hoy] = useState(todayCancun);
  const [fecha, setFecha] = useState(hoy);
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const errorFecha = errorFechaPago(fecha, hoy);

  const marcar = () => {
    if (pending || errorFecha) return;
    setErrorApi(null);
    startTransition(async () => {
      // Nunca un `await` desnudo: una server action que revienta (deploy,
      // red) no debe mandar la pantalla al error boundary.
      const r = await marcarPagadoGastoAction(gasto.id, {
        fecha_gasto: fecha,
        if_updated_at: gasto.updated_at ?? null,
      }).catch((): ActionResult<Gasto> => ({ ok: false, error: "", code: "SIN_CONEXION" }));
      if (r.ok) {
        toast.success(toastMarcadoPagado(fecha));
        onCerrar();
        return;
      }
      // 409 `MES_CERRADO` (API 0.0.88): el aviso con «Ir a Reportes».
      if (toastMesCerradoSiAplica(r)) return;
      const e = mensajeErrorMarcarPagado(r);
      toast.error(e.texto);
      if (e.recargar) {
        onCerrar();
        router.refresh();
      } else {
        setErrorApi(e.texto);
      }
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !pending) onCerrar();
      }}
    >
      <DialogContent className="sm:max-w-sm" data-marcar-pagado="">
        <DialogHeader>
          <DialogTitle>{TITULO_MARCAR_PAGADO}</DialogTitle>
          <DialogDescription>
            <span className="block font-medium text-foreground">{resumenGastoPorPagar(gasto)}</span>
            <span className="mt-1 block">{DESCRIPCION_MARCAR_PAGADO}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={idFecha} className="text-sm font-medium">
            {ETIQUETA_FECHA_PAGO}
          </Label>
          <Input
            id={idFecha}
            type="date"
            max={hoy}
            value={fecha}
            onChange={(e) => {
              setFecha(e.target.value);
              setErrorApi(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                marcar();
              }
            }}
            aria-invalid={errorFecha ? true : undefined}
            aria-describedby={`${idFecha}-ayuda`}
            className="cursor-pointer"
          />
          <p id={`${idFecha}-ayuda`} className="text-xs text-muted-foreground">
            {AYUDA_FECHA_PAGO}
          </p>
          {(errorFecha || errorApi) && (
            <p role="alert" className="text-xs text-destructive">
              {errorFecha ?? errorApi}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar} disabled={pending} className="cursor-pointer">
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={marcar}
            disabled={pending || !!errorFecha}
            className="cursor-pointer"
            data-confirmar-pagado=""
          >
            {pending ? TEXTO_GUARDANDO_PAGADO : TEXTO_MARCAR_PAGADO}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
