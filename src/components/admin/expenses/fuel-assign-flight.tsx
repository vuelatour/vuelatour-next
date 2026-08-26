"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LinkIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  sugerirVueloAction,
  assignVueloGastoAction,
  type SugerirVueloResult,
} from "@/app/admin/expenses/actions";

const RAZON_LABEL: Record<string, string> = {
  EN_RUTA: "Carga en ruta de este vuelo",
  SIGUIENTE_SALIDA: "Siguiente salida de la aeronave",
  VUELO_ANTERIOR: "Último vuelo de la aeronave",
};

/**
 * Liga una carga de combustible a su vuelo (OPCIONAL: el combustible se
 * controla por avión y mes; la liga solo alimenta el reporte por vuelo).
 * Sugiere por matrícula + horario (carga en ruta → vuelo en curso; previno →
 * siguiente salida) y deja elegir entre los candidatos cercanos.
 */
export function FuelAssignFlight({
  gastoId,
  aeronaveId,
  fechaHora,
  vueloActual,
}: {
  gastoId: string;
  aeronaveId: string | null;
  /** fecha_hora_carga si existe; si no, fecha_gasto a mediodía. */
  fechaHora: string | null;
  vueloActual: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<SugerirVueloResult | null>(null);
  const [pending, startTransition] = useTransition();

  const abrir = async () => {
    if (!aeronaveId) {
      toast.error("La carga no tiene avión; asígnalo primero con \"Asignar avión\".");
      return;
    }
    setOpen(true);
    setLoading(true);
    const r = await sugerirVueloAction(
      aeronaveId,
      fechaHora ?? new Date().toISOString(),
    );
    setLoading(false);
    if (r.ok && r.data) setRes(r.data);
    else toast.error(r.error ?? "No se pudo sugerir el vuelo");
  };

  const asignar = (vueloId: string | null) => {
    startTransition(async () => {
      const r = await assignVueloGastoAction(gastoId, vueloId);
      if (r.ok) {
        toast.success(vueloId ? "Carga ligada al vuelo" : "Carga desligada");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error ?? "No se pudo ligar la carga");
      }
    });
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={abrir}
        title="Opcional: solo alimenta el reporte por vuelo"
        className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <LinkIcon className="h-3 w-3" />
        {vueloActual ? "Reasignar" : "Ligar a vuelo"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿A qué vuelo corresponde esta carga?</DialogTitle>
            <DialogDescription>
              Liga opcional (informativa, para el reporte por vuelo). Sugerido
              por matrícula y horario del ticket; aplica al vuelo y a su
              cotización.
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <p className="text-sm text-muted-foreground py-4">Buscando vuelos…</p>
          ) : !res || res.candidatos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Sin vuelos cercanos para esta aeronave.
            </p>
          ) : (
            <div className="space-y-2">
              {res.candidatos.map((c) => {
                const esSugerido = c.vuelo_id === res.sugerido?.vuelo_id;
                return (
                  <button
                    key={c.vuelo_id}
                    type="button"
                    disabled={pending}
                    onClick={() => asignar(c.vuelo_id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors hover:border-brand-500/60 ${
                      esSugerido ? "border-brand-500 bg-brand-500/5" : "border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">
                        {c.origen_iata ?? "—"} → {c.destino_iata ?? "—"}
                        {c.folio != null && (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            · #{c.folio}
                          </span>
                        )}
                      </span>
                      {esSugerido && (
                        <span className="shrink-0 rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-medium text-brand-600">
                          Sugerido
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.fecha_vuelo
                        ? new Date(c.fecha_vuelo).toLocaleString("es-MX", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: "America/Cancun",
                          })
                        : "Sin fecha"}
                      {esSugerido && res.sugerido?.razon
                        ? ` · ${RAZON_LABEL[res.sugerido.razon] ?? res.sugerido.razon}`
                        : ""}
                    </p>
                  </button>
                );
              })}
              {vueloActual && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => asignar(null)}
                  className="w-full text-destructive hover:text-destructive"
                >
                  Quitar liga al vuelo
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
