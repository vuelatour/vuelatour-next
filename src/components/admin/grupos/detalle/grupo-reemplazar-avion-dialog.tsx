"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowPathIcon, ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SquawkAltaDialog } from "@/components/admin/flights/squawk-alta-dialog";
import { reemplazarAvionAction } from "@/app/admin/quotes/grupo/actions";
import { toastAvisos } from "@/lib/admin/avisos";
import { mensajeErrorGrupo } from "@/lib/admin/grupos-ui";
import { cn } from "@/lib/utils";
import type {
  AvionGrupoDetalle,
  GrupoDetalle,
  ModoReemplazoAvion,
  ReemplazarAvionInput,
  SquawkAltaDetails,
} from "@/types/grupos";

export interface AeronaveOpcion {
  id: string;
  matricula: string;
  modelo: string;
  asientos: number | null;
}

export interface PilotoOpcion {
  id: string;
  nombre: string;
}

/**
 * Reemplazar el avión de UN hijo del grupo. Dos caminos (misma regla que
 * «Cambiar aeronave» del vuelo): SIMPLE = mismo vuelo, solo cambia la
 * matrícula; ULTIMO_MINUTO = clon del vuelo (el original queda cancelado
 * con sus gastos). `recotizar` re-precia con la tarifa/velocidad del avión
 * nuevo (solo si el precio no está congelado; si no, queda marcado como
 * desactualizado). Squawk ALTA → confirmación y reintento con la bandera.
 */
export function GrupoReemplazarAvionDialog({
  grupo,
  avion,
  aircraft,
  pilots,
  onClose,
}: {
  grupo: GrupoDetalle;
  /** null = cerrado. */
  avion: AvionGrupoDetalle | null;
  aircraft: AeronaveOpcion[];
  pilots: PilotoOpcion[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Estado inicial derivado del avión abierto: el padre remonta este
  // componente con `key={vuelo_id}` al cambiar de avión, así el formulario
  // arranca limpio sin efectos que sincronicen estado.
  const [aeronaveId, setAeronaveId] = useState("");
  const [pilotoId, setPilotoId] = useState(() => avion?.piloto?.id ?? "");
  const [modo, setModo] = useState<ModoReemplazoAvion>("SIMPLE");
  const [recotizar, setRecotizar] = useState(() => !avion?.congelado);
  const [motivo, setMotivo] = useState("");
  const [squawk, setSquawk] = useState<{ lista: string[]; payload: ReemplazarAvionInput } | null>(
    null,
  );

  const congelado = avion?.congelado ?? null;

  const pax = avion?.pax ?? avion?.pasajeros ?? 0;
  const nuevo = aircraft.find((a) => a.id === aeronaveId) ?? null;
  const rotaciones = avion?.rotaciones ?? 1;
  // Aviso informativo (el API valida capacidad al recotizar): asientos ×
  // vueltas del avión nuevo vs pax de este avión.
  const noCabe =
    nuevo?.asientos != null && pax > 0 && nuevo.asientos * Math.max(1, rotaciones) < pax;

  const ejecutar = (payload: ReemplazarAvionInput, aceptarSquawk: boolean) => {
    if (!avion) return;
    startTransition(async () => {
      const res = await reemplazarAvionAction(
        grupo.id,
        avion.vuelo_id,
        aceptarSquawk ? { ...payload, aceptar_discrepancia_alta: true } : payload,
      );
      if (res.ok) {
        toast.success(
          `Avión ${avion.posicion ?? ""} del grupo ${grupo.folio_texto}: ahora vuela ${nuevo?.matricula ?? "el avión nuevo"}${
            aceptarSquawk ? " — se avisó al mecánico de las discrepancias abiertas" : ""
          }`,
        );
        const previos = new Set(grupo.avisos ?? []);
        toastAvisos((res.data.avisos ?? []).filter((a) => !previos.has(a)));
        setSquawk(null);
        onClose();
        router.refresh();
        return;
      }
      // Candado de squawk ALTA (409 estructurado): confirmar y reintentar.
      if (!aceptarSquawk && res.error.error === "SQUAWK_ALTA_SIN_RESOLVER") {
        const d = res.error.details as Partial<SquawkAltaDetails> | undefined;
        const lista = (d?.discrepancias ?? [])
          .map((x) => x.descripcion)
          .filter((x): x is string => !!x);
        setSquawk({ lista: lista.length ? lista : [res.error.message], payload });
        return;
      }
      setSquawk(null);
      toast.error(mensajeErrorGrupo(res.error));
    });
  };

  const handle = () => {
    if (!aeronaveId) {
      toast.error("Elige el avión nuevo");
      return;
    }
    ejecutar(
      {
        aeronave_id: aeronaveId,
        ...(pilotoId && pilotoId !== (avion?.piloto?.id ?? "") ? { piloto_id: pilotoId } : {}),
        modo,
        recotizar: congelado ? false : recotizar,
        ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
      },
      false,
    );
  };

  return (
    <>
      <Dialog open={avion !== null} onOpenChange={(o) => !o && !pending && onClose()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Reemplazar el avión {avion?.posicion ?? ""}
              {avion?.aeronave ? ` · ${avion.aeronave.matricula}` : ""} (vuelo #{avion?.folio})
            </DialogTitle>
            <DialogDescription>
              {pax} {pax === 1 ? "pasajero" : "pasajeros"}
              {rotaciones > 1 ? ` en ${rotaciones} vueltas` : ""} de este avión. Los demás
              aviones del grupo no cambian.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Avión nuevo</Label>
              <SearchableSelect
                options={aircraft
                  .filter((a) => a.id !== avion?.aeronave?.id)
                  .map((a) => ({
                    value: a.id,
                    label: `${a.matricula} — ${a.modelo}`,
                    description: a.asientos != null ? `${a.asientos} asientos` : undefined,
                  }))}
                value={aeronaveId}
                onChange={setAeronaveId}
                placeholder="Selecciona la matrícula que sí vuela"
              />
              {noCabe && (
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  El {nuevo?.matricula} tiene {nuevo?.asientos} asientos
                  {rotaciones > 1 ? ` × ${rotaciones} vueltas` : ""} y este avión lleva {pax}{" "}
                  pasajeros: al recotizar el sistema lo rechazará. Reparte pasajeros con
                  «Revisar» o elige otro avión.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Piloto</Label>
              <SearchableSelect
                options={[
                  { value: "", label: "Sin cambio (conservar el actual)" },
                  ...pilots.map((p) => ({ value: p.id, label: p.nombre })),
                ]}
                value={pilotoId}
                onChange={setPilotoId}
                placeholder="Conservar el piloto actual"
              />
            </div>

            {/* Modo: dos opciones claras, cada una con su explicación en una línea. */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Cómo se hace el cambio</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={modo === "SIMPLE"}
                  onClick={() => setModo("SIMPLE")}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors hover:bg-accent",
                    modo === "SIMPLE" ? "border-primary bg-accent/60" : "border-border",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <ArrowPathIcon className="h-4 w-4 shrink-0 text-primary" />
                    Solo cambiar el avión
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Mismo vuelo #{avion?.folio}: cobros y gastos se quedan donde están.
                  </span>
                </button>
                <button
                  type="button"
                  aria-pressed={modo === "ULTIMO_MINUTO"}
                  onClick={() => setModo("ULTIMO_MINUTO")}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors hover:bg-accent",
                    modo === "ULTIMO_MINUTO" ? "border-destructive/60 bg-accent/60" : "border-border",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <ArrowsRightLeftIcon className="h-4 w-4 shrink-0 text-destructive" />
                    Cambio de último minuto
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Vuelo nuevo con la otra matrícula; el #{avion?.folio} queda cancelado con sus
                    gastos.
                  </span>
                </button>
              </div>
            </div>

            {modo === "ULTIMO_MINUTO" && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                El vuelo #{avion?.folio} queda <strong>CANCELADO</strong> conservando sus
                gastos (factura de operación, combustible…) y se crea un vuelo nuevo con la
                otra matrícula que hereda cotización, tramos, piloto y la liga con el grupo.
                No se puede deshacer desde el panel.
              </div>
            )}

            <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
              <Switch
                checked={congelado ? false : recotizar}
                disabled={!!congelado}
                onCheckedChange={setRecotizar}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Recotizar con el avión nuevo</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {congelado
                    ? `El precio está congelado (${congelado}): se conserva tal cual y el avión queda marcado con precio desactualizado.`
                    : recotizar
                      ? "El precio de este avión se recalcula con la tarifa y velocidad del avión nuevo; el total del grupo cambia."
                      : "El precio se conserva y el avión queda marcado con precio desactualizado hasta que revises el grupo."}
                </span>
              </span>
            </label>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Motivo (opcional)</Label>
              <Textarea
                rows={2}
                placeholder="Ej. falla en el arranque; se usa el Séneca"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={500}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={pending}>
              Volver
            </Button>
            <Button
              onClick={handle}
              disabled={pending || !aeronaveId}
              variant={modo === "ULTIMO_MINUTO" ? "destructive" : "default"}
            >
              {pending
                ? "Cambiando…"
                : modo === "ULTIMO_MINUTO"
                  ? "Cambiar de último minuto"
                  : "Reemplazar avión"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SquawkAltaDialog
        lista={squawk?.lista ?? null}
        pending={pending}
        onCancel={() => setSquawk(null)}
        onConfirm={() => squawk && ejecutar(squawk.payload, true)}
      />
    </>
  );
}
