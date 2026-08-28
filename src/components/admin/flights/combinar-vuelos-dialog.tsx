"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowsRightLeftIcon, MoonIcon } from "@heroicons/react/24/outline";
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
import {
  combinarVuelosAction,
  getCombinarCandidatosAction,
  type CombinarCandidato,
} from "@/app/admin/flights/actions";
import { fmtDateOnly } from "@/lib/datetime";
import type { FlightListItem } from "@/types/flights";

interface CombinarVuelosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** El vuelo CUBIERTO (el que se está viendo): su ferry de ida se cancela. */
  flight: FlightListItem;
}

/**
 * COMBINAR vuelos (estrategia de pernocta): el avión de otro vuelo (el
 * ANFITRIÓN) ya duerme en el destino del ferry de ida de este vuelo — al
 * combinarlos se cancelan los DOS tramos vacíos (regreso del anfitrión + ida
 * de este vuelo), este vuelo se reasigna a ese avión y ambos quedan ligados.
 * Los PRECIOS de ambos clientes NO cambian: el ahorro es de la empresa.
 */
export function CombinarVuelosDialog({
  open,
  onOpenChange,
  flight,
}: CombinarVuelosDialogProps) {
  const router = useRouter();
  // null = cargando (el diálogo se monta al abrir, así que carga al montar).
  const [candidatos, setCandidatos] = useState<CombinarCandidato[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<CombinarCandidato | null>(null);
  const [aplicarPiloto, setAplicarPiloto] = useState(true);
  const [marcarPernocta, setMarcarPernocta] = useState(true);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getCombinarCandidatosAction(flight.id);
      if (!alive) return;
      if (res.ok) {
        setCandidatos(res.data ?? []);
      } else {
        setCandidatos([]);
        setLoadError(res.error ?? "No se pudieron buscar los candidatos");
      }
    })();
    return () => {
      alive = false;
    };
  }, [flight.id]);

  const handleCombinar = () => {
    if (!seleccionado) return;
    const sel = seleccionado;
    startSaving(async () => {
      const res = await combinarVuelosAction(flight.id, {
        vuelo_anfitrion_id: sel.vuelo_id,
        tramo_ferry_id: sel.tramo_ferry_id,
        tramo_ferry_anfitrion_id: sel.tramo_ferry_anfitrion_id,
        aplicar_piloto: aplicarPiloto,
        marcar_pernocta: marcarPernocta,
      });
      if (res.ok) {
        toast.success(`Vuelos combinados: #${flight.folio} ♻ #${sel.folio}`);
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudieron combinar los vuelos");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowsRightLeftIcon className="h-5 w-5 text-teal-600" />
            Combinar vuelo #{flight.folio} (pernocta)
          </DialogTitle>
          <DialogDescription>
            Aprovecha un avión de la casa que ya duerme en el destino de tu
            ferry de ida: se cancelan los dos tramos vacíos y este vuelo sale
            en ese avión. Los precios de ambos clientes NO cambian.
          </DialogDescription>
        </DialogHeader>

        {candidatos === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Buscando aviones que pernoctan…
          </p>
        ) : candidatos.length === 0 ? (
          <div className="py-6 text-center space-y-3">
            <div className="flex justify-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <MoonIcon className="h-6 w-6 text-muted-foreground" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground px-4">
              {loadError ??
                "No hay vuelos cuyo avión pernocte en el destino de tu ferry de ida (ventana: hasta 3 días antes). El otro vuelo debe tener su ferry de regreso vivo."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {candidatos.map((c) => {
                const activo =
                  seleccionado?.tramo_ferry_anfitrion_id ===
                    c.tramo_ferry_anfitrion_id &&
                  seleccionado?.tramo_ferry_id === c.tramo_ferry_id;
                return (
                  <button
                    key={`${c.vuelo_id}-${c.tramo_ferry_id}-${c.tramo_ferry_anfitrion_id}`}
                    type="button"
                    onClick={() => setSeleccionado(c)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      activo
                        ? "border-teal-500 bg-teal-500/10"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <p className="text-sm font-medium">
                      <span className="font-mono">#{c.folio}</span>
                      {c.cliente_nombre ? ` · ${c.cliente_nombre}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      deja el avión en{" "}
                      <span className="font-mono">{c.aeropuerto}</span> el{" "}
                      {fmtDateOnly(c.fecha)}
                      {c.noches != null
                        ? ` · ${c.noches} ${c.noches === 1 ? "noche" : "noches"}`
                        : ""}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">
                    Asignar también el piloto que pernocta
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    El piloto del vuelo anfitrión vuela también este vuelo.
                  </p>
                </div>
                <Switch
                  checked={aplicarPiloto}
                  onCheckedChange={(c) => setAplicarPiloto(c)}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">
                    Marcar pernocta operativa en el vuelo anfitrión
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Solo operativa (viáticos del piloto): no toca precios.
                  </p>
                </div>
                <Switch
                  checked={marcarPernocta}
                  onCheckedChange={(c) => setMarcarPernocta(c)}
                />
              </div>
            </div>

            {seleccionado && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-300">
                Se cancelará el ferry de ida de este vuelo y el ferry de
                regreso de <span className="font-mono">#{seleccionado.folio}</span>;
                este vuelo quedará en el avión de{" "}
                <span className="font-mono">#{seleccionado.folio}</span>. Los
                precios de ambos clientes NO cambian.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Volver
          </Button>
          {candidatos !== null && candidatos.length > 0 && (
            <Button
              onClick={handleCombinar}
              disabled={saving || !seleccionado}
              className="bg-teal-600 hover:bg-teal-600/90 text-white"
              title={
                seleccionado
                  ? undefined
                  : "Elige primero el vuelo anfitrión de la lista"
              }
            >
              {saving ? "Combinando…" : "Combinar vuelos"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
