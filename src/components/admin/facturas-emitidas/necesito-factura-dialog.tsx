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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { solicitarFacturaAction } from "@/app/admin/flights/actions";
import {
  LIMITE_NOTA_SOLICITUD,
  avisarCambioPorFacturar,
  textoNotificados,
} from "@/lib/admin/facturas-emitidas";

/**
 * «¿Este vuelo necesita factura?» (24-sep-2026, pedido de Itzi: «que haya
 * algo que yo marque así como de necesito factura … y a Mari le salga una
 * alertita»). Guarda la SOLICITUD en el vuelo y el API avisa a los
 * responsables de facturación; el vuelo aparece en Facturas emitidas → Por
 * facturar hasta que alguien registre su factura.
 *
 * `router.refresh()` es seguro con el cotizador SUCIO: su rehidratación no
 * pisa un borrador (`quote-calculator.tsx`, «form SUCIO → el borrador NO se
 * pisa»).
 */
export function NecesitoFacturaDialog({
  open,
  onOpenChange,
  vueloId,
  vueloFolio,
  grupo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vueloId: string;
  vueloFolio: number;
  /** Grupo multi-avión (con >1 avión se ofrece pedir para todos). */
  grupo?: { id: string; total_aviones: number } | null;
}) {
  const router = useRouter();
  const idNota = useId();
  const idPaga = useId();
  const idGrupo = useId();
  const [nota, setNota] = useState("");
  const [paga, setPaga] = useState(false);
  const conGrupo = !!grupo && grupo.total_aviones > 1;
  // El cliente paga el grupo como uno: por defecto se pide para todos.
  const [todoGrupo, setTodoGrupo] = useState(true);
  const [pendiente, startTransition] = useTransition();

  const pedir = () => {
    startTransition(async () => {
      const res = await solicitarFacturaAction(vueloId, {
        nota: nota.trim() || null,
        paga_contra_factura: paga,
        todo_el_grupo: conGrupo && todoGrupo ? true : undefined,
      });
      if (res.ok && res.data) {
        toast.success(textoNotificados(res.data.notificados));
        avisarCambioPorFacturar();
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo pedir la factura.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pendiente && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>¿Este vuelo necesita factura?</DialogTitle>
          <DialogDescription>
            Le avisamos a facturación que el vuelo #{vueloFolio} necesita factura. Aparecerá en
            Facturas emitidas → Por facturar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={idNota} className="text-sm">
              Nota para facturación (opcional)
            </Label>
            <Textarea
              id={idNota}
              value={nota}
              maxLength={LIMITE_NOTA_SOLICITUD}
              rows={3}
              placeholder="Ej. El cliente la necesita para pagar; mandó sus datos fiscales por correo."
              onChange={(e) => setNota(e.target.value)}
              disabled={pendiente}
            />
            <p className="text-[11px] text-muted-foreground text-right tabular-nums">
              {nota.length}/{LIMITE_NOTA_SOLICITUD}
            </p>
          </div>

          <div className="flex items-start gap-3">
            <Switch
              id={idPaga}
              checked={paga}
              onCheckedChange={(v) => setPaga(v === true)}
              disabled={pendiente}
            />
            <Label htmlFor={idPaga} className="text-sm font-normal leading-snug">
              El cliente paga hasta recibir la factura
            </Label>
          </div>

          {conGrupo && (
            <div className="flex items-start gap-3">
              <Switch
                id={idGrupo}
                checked={todoGrupo}
                onCheckedChange={(v) => setTodoGrupo(v === true)}
                disabled={pendiente}
              />
              <Label htmlFor={idGrupo} className="text-sm font-normal leading-snug">
                Pedir para los {grupo?.total_aviones} aviones del grupo
              </Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pendiente}>
            Cancelar
          </Button>
          <Button onClick={pedir} disabled={pendiente}>
            {pendiente ? "Pidiendo…" : "Pedir factura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
