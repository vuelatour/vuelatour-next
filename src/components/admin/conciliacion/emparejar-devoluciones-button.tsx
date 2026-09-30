"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
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
import {
  emparejarReversosAutoAction,
  type ActionResult,
} from "@/app/admin/conciliacion/actions";
import {
  BOTON_EMPAREJAR_AUTO,
  CONFIRMAR_EMPAREJAR_AUTO,
  NOTA_EMPAREJAR_AUTO,
  TITULO_BOTON_EMPAREJAR_AUTO,
  mensajeErrorReverso,
  resumenReversosAuto,
  textoAlcanceAuto,
  type ResumenReversosAuto,
} from "@/lib/admin/conciliacion-reverso";
import type { ReversosAutoResultado } from "@/types/conciliacion";

interface EmparejarDevolucionesButtonProps {
  /** Filtros de la vista: lo que se va a tocar (sin ellos, todo). */
  cuentaId?: string;
  /** Nombre de la cuenta para decirlo en la confirmación. */
  cuentaLabel?: string | null;
  desde?: string;
  hasta?: string;
}

/**
 * «Emparejar devoluciones» (30-sep-2026), junto a «Cruzar pendientes».
 *
 * Pregunta del cliente: «¿Cómo puedo conciliar los cargos reembolsados?» —
 * 7 cargos «ASUR CANCUN» y 7 abonos «CARGO INDEBIDO 21 SEP» que había que
 * clasificar uno por uno. El API busca los abonos que el banco rotula como
 * devolución y los empareja con su cargo (mismo monto, ±60 días); lo
 * ambiguo lo deja pendiente. Confirma ANTES (toca muchos movimientos a la
 * vez) y dice el resultado por resultado.
 */
export function EmparejarDevolucionesButton({
  cuentaId,
  cuentaLabel,
  desde,
  hasta,
}: EmparejarDevolucionesButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [corriendo, setCorriendo] = useState(false);
  const [resumen, setResumen] = useState<ResumenReversosAuto | null>(null);

  const abrir = () => {
    setResumen(null);
    setOpen(true);
  };

  const correr = () => {
    setCorriendo(true);
    void (async () => {
      const r: ActionResult<ReversosAutoResultado> = await emparejarReversosAutoAction({
        ...(cuentaId ? { cuenta_bancaria_id: cuentaId } : {}),
        ...(desde ? { desde } : {}),
        ...(hasta ? { hasta } : {}),
      }).catch((err: unknown) => ({
        ok: false,
        error: err instanceof Error ? err.message : "No se pudieron emparejar las devoluciones",
      }));
      setCorriendo(false);
      if (!r.ok || !r.data) {
        const e = mensajeErrorReverso(r);
        toast.error(e.titulo, e.descripcion ? { description: e.descripcion } : undefined);
        return;
      }
      const res = resumenReversosAuto(r.data);
      setResumen(res);
      if (res.tono === "exito") {
        toast.success(res.titulo, res.descripcion ? { description: res.descripcion } : undefined);
      } else {
        toast.info(res.titulo, res.descripcion ? { description: res.descripcion } : undefined);
      }
      router.refresh();
    })();
  };

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={abrir} title={TITULO_BOTON_EMPAREJAR_AUTO}>
        <ArrowUturnLeftIcon className="h-4 w-4" />
        {BOTON_EMPAREJAR_AUTO}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o && corriendo) return; // no cerrar a media corrida
          setOpen(o);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{resumen ? "Resultado" : `${BOTON_EMPAREJAR_AUTO}`}</DialogTitle>
            <DialogDescription>
              {resumen ? resumen.titulo : CONFIRMAR_EMPAREJAR_AUTO}
            </DialogDescription>
          </DialogHeader>

          {resumen ? (
            resumen.lineas.length > 0 && (
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {resumen.lineas.map((l) => (
                  <li key={l}>· {l}</li>
                ))}
              </ul>
            )
          ) : (
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">
                {textoAlcanceAuto({ cuenta: cuentaLabel ?? null, desde, hasta })}
              </p>
              <p>{NOTA_EMPAREJAR_AUTO}</p>
              {corriendo && <p>Emparejando…</p>}
            </div>
          )}

          <DialogFooter>
            {resumen ? (
              <Button onClick={() => setOpen(false)}>Cerrar</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={corriendo}>
                  Cancelar
                </Button>
                <Button onClick={correr} disabled={corriendo}>
                  {corriendo ? "Emparejando…" : "Continuar"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
