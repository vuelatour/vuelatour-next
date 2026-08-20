"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Field } from "@/components/admin/form-field";
import {
  getCajaVinculoAction,
  setCajaOrigenAction,
  type CajaVinculoInfo,
} from "@/app/admin/users/actions";
import type { User } from "@/types/users";

const SIN_VINCULO = "__ninguna__";

/**
 * Vincular la caja chica del usuario con su caja MADRE (pedido de tesorería,
 * 20-ago-2026): cada reposición a la caja vinculada genera automáticamente
 * el descuento (REINTEGRO espejo) en la caja madre. Configurable desde
 * Usuarios para ajustes a futuro.
 */
export function CajaVinculoDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: User;
}) {
  const [info, setInfo] = useState<CajaVinculoInfo | null>(null);
  const [seleccion, setSeleccion] = useState<string>(SIN_VINCULO);
  const [retroactivo, setRetroactivo] = useState(false);
  const [pending, startTransition] = useTransition();
  // Cargando = abierto sin datos; al cerrar se limpia info (ver cerrar()).
  const cargando = open && info == null;

  useEffect(() => {
    if (!open) return;
    let activo = true;
    void getCajaVinculoAction(user.id).then((res) => {
      if (!activo) return;
      if (res.ok && res.data) {
        setInfo(res.data);
        setSeleccion(res.data.fondo?.fondo_origen_id ?? SIN_VINCULO);
        setRetroactivo(false);
      } else {
        toast.error(res.error ?? "No se pudo cargar la caja");
        onOpenChange(false);
      }
    });
    return () => {
      activo = false;
    };
  }, [open, user.id, onOpenChange]);

  const cerrar = (v: boolean) => {
    if (!v) setInfo(null);
    onOpenChange(v);
  };

  const fondo = info?.fondo ?? null;
  // Solo cajas de la MISMA moneda pueden ser madre (el saldo es por moneda).
  const opciones = (info?.opciones ?? []).filter(
    (o) => !fondo || o.moneda === fondo.moneda,
  );
  const cambio = fondo != null && seleccion !== (fondo.fondo_origen_id ?? SIN_VINCULO);
  const vinculando = seleccion !== SIN_VINCULO;
  // Re-ejecutar el retroactivo SIN cambiar de madre es válido (es
  // idempotente: solo crea los espejos que falten — p. ej. si un intento
  // anterior quedó a medias).
  const puedeGuardar = fondo != null && (cambio || (vinculando && retroactivo));

  const guardar = () => {
    if (!fondo) return;
    startTransition(async () => {
      const res = await setCajaOrigenAction(
        fondo.id,
        vinculando ? seleccion : null,
        retroactivo,
      );
      if (res.ok) {
        toast.success(
          vinculando
            ? "Caja vinculada: las reposiciones se descontarán de la caja madre"
            : "Vínculo eliminado",
        );
        cerrar(false);
      } else {
        toast.error(res.error ?? "No se pudo guardar el vínculo");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Caja chica · {user.nombre}</DialogTitle>
          <DialogDescription>
            Si esta caja se fondea desde la caja de un compañero, cada
            reposición que reciba se descuenta automáticamente de esa caja
            madre (movimiento espejo, amarrado a la reposición).
          </DialogDescription>
        </DialogHeader>

        {cargando ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : !fondo ? (
          <p className="text-sm text-muted-foreground">
            {user.nombre} aún no tiene fondo de caja chica. Ábrelo primero en
            Tesorería → Caja chica → Abrir fondo, y regresa aquí para
            vincularlo.
          </p>
        ) : (
          <div className="space-y-4">
            <Field label="Se fondea desde">
              <SearchableSelect
                options={[
                  { value: SIN_VINCULO, label: "Nadie (caja independiente)" },
                  ...opciones.map((o) => ({
                    value: o.fondoId,
                    label: `${o.nombre} · ${o.moneda}`,
                  })),
                ]}
                value={seleccion}
                onChange={(v) => setSeleccion(v ?? SIN_VINCULO)}
                placeholder="Elige la caja madre"
              />
            </Field>
            {vinculando && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={retroactivo}
                  onChange={(e) => setRetroactivo(e.target.checked)}
                />
                <span>
                  Descontar también las reposiciones YA registradas de esta
                  caja{" "}
                  <span className="text-muted-foreground">
                    (el fondeo histórico que salió de la caja madre y no quedó
                    registrado)
                  </span>
                </span>
              </label>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => cerrar(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={pending || !puedeGuardar}>
            {pending ? "Guardando…" : "Guardar vínculo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
