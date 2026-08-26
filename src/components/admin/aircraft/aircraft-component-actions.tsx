"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ArrowPathIcon,
  ArrowsRightLeftIcon,
  BookOpenIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Field } from "@/components/admin/form-field";
import {
  componentEventosAction,
  overhaulComponentAction,
  transplantComponentAction,
  type TipoComponente,
} from "@/app/admin/aircraft/actions";
import type { ComponenteEvento } from "@/types/aircraft";
import { fmtDateOnly, fmtDate, todayCancun } from "@/lib/datetime";
import { fmtDecimal } from "@/lib/format";

/** Aeronave candidata a destino de un traslado (activa). */
export interface AeronaveDestinoOption {
  id: string;
  matricula: string;
  modelo: string;
}

/** Lo mínimo del componente para operar los diálogos. */
export interface ComponenteAccion {
  id: string;
  tipo: TipoComponente;
  posicion: string;
  numero_serie: string;
  /** Horas de vida vivas (para el resumen del traslado). */
  horas_actuales: number | null;
}

const NOMBRE: Record<TipoComponente, { bajo: string; alto: string; articulo: string }> = {
  MOTOR: { bajo: "motor", alto: "Motor", articulo: "El" },
  HELICE: { bajo: "hélice", alto: "Hélice", articulo: "La" },
};

const POSICIONES_MOTOR = [
  { value: "UNICO", label: "Único" },
  { value: "IZQUIERDO", label: "Izquierdo" },
  { value: "DERECHO", label: "Derecho" },
];
const POSICIONES_HELICE = [
  { value: "UNICA", label: "Única" },
  { value: "IZQUIERDA", label: "Izquierda" },
  { value: "DERECHA", label: "Derecha" },
];

/**
 * Acciones de bitácora del componente rotable (motores Y hélices): ver la
 * bitácora (componente_evento), trasladarlo a otro avión y registrar un
 * overhaul. Complementa a los botones editar/eliminar de la card.
 */
export function ComponentActions({
  aircraftId,
  matricula,
  modelo,
  componente,
  aviones,
}: {
  aircraftId: string;
  /** Matrícula y modelo del avión ACTUAL (para el resumen y la advertencia). */
  matricula: string;
  modelo: string;
  componente: ComponenteAccion;
  aviones: AeronaveDestinoOption[];
}) {
  const [bitacoraOpen, setBitacoraOpen] = useState(false);
  const [trasladoOpen, setTrasladoOpen] = useState(false);
  const [overhaulOpen, setOverhaulOpen] = useState(false);
  const n = NOMBRE[componente.tipo];

  return (
    <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border">
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1 px-2 text-xs"
        onClick={() => setBitacoraOpen(true)}
      >
        <BookOpenIcon className="h-3.5 w-3.5" />
        Bitácora
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1 px-2 text-xs"
        onClick={() => setTrasladoOpen(true)}
      >
        <ArrowsRightLeftIcon className="h-3.5 w-3.5" />
        Trasladar
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1 px-2 text-xs"
        onClick={() => setOverhaulOpen(true)}
      >
        <ArrowPathIcon className="h-3.5 w-3.5" />
        Registrar overhaul
      </Button>

      {bitacoraOpen && (
        <BitacoraDialog
          open
          onOpenChange={setBitacoraOpen}
          componente={componente}
        />
      )}
      {trasladoOpen && (
        <TrasladoDialog
          key={`traslado-${componente.id}`}
          open
          onOpenChange={setTrasladoOpen}
          aircraftId={aircraftId}
          matricula={matricula}
          modelo={modelo}
          componente={componente}
          aviones={aviones}
        />
      )}
      {overhaulOpen && (
        <OverhaulDialog
          key={`overhaul-${componente.id}`}
          open
          onOpenChange={setOverhaulOpen}
          aircraftId={aircraftId}
          componente={componente}
        />
      )}
      <span className="sr-only">{n.alto} — acciones de bitácora</span>
    </div>
  );
}

// ===== Bitácora =====

const EVENTO_BADGE: Record<
  ComponenteEvento["tipo_evento"],
  { label: string; cls: string }
> = {
  INSTALACION: {
    label: "Instalación",
    cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  },
  TRASLADO: {
    label: "Traslado",
    cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  },
  OVERHAUL: {
    label: "Overhaul",
    cls: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  },
  AJUSTE: {
    label: "Ajuste",
    cls: "text-muted-foreground",
  },
};

function BitacoraDialog({
  open,
  onOpenChange,
  componente,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  componente: ComponenteAccion;
}) {
  const [eventos, setEventos] = useState<ComponenteEvento[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const n = NOMBRE[componente.tipo];

  useEffect(() => {
    let active = true;
    componentEventosAction(componente.tipo, componente.id).then((res) => {
      if (!active) return;
      if (res.ok && res.data) setEventos(res.data);
      else setError(res.error ?? "No se pudo cargar la bitácora");
    });
    return () => {
      active = false;
    };
  }, [componente.tipo, componente.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Bitácora · {n.alto} S/N {componente.numero_serie}
          </DialogTitle>
          <DialogDescription>
            Instalaciones, traslados, overhauls y ajustes registrados (como la
            bitácora física, del más reciente al más antiguo).
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : eventos == null ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : eventos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin eventos registrados. Aquí quedarán las instalaciones, traslados
            y overhauls de este componente.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Fecha</th>
                  <th className="px-3 py-2 text-left">Evento</th>
                  <th className="px-3 py-2 text-right">Taco avión</th>
                  <th className="px-3 py-2 text-right">Hrs componente</th>
                  <th className="px-3 py-2 text-right">Desde OVH</th>
                  <th className="px-3 py-2 text-left">Motivo</th>
                  <th className="px-3 py-2 text-left">Quién</th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((e) => {
                  const badge = EVENTO_BADGE[e.tipo_evento] ?? {
                    label: e.tipo_evento,
                    cls: "",
                  };
                  return (
                    <tr key={e.id} className="border-t border-border align-top">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {e.fecha ? fmtDateOnly(e.fecha) : fmtDate(e.created_at)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="outline" className={`w-fit ${badge.cls}`}>
                            {badge.label}
                          </Badge>
                          {e.tipo_evento === "TRASLADO" ? (
                            <span className="font-mono text-xs text-muted-foreground">
                              {e.aeronave_origen?.matricula ?? "—"} →{" "}
                              {e.aeronave?.matricula ?? "—"}
                            </span>
                          ) : (
                            e.aeronave?.matricula && (
                              <span className="font-mono text-xs text-muted-foreground">
                                {e.aeronave.matricula}
                                {e.posicion ? ` · ${e.posicion}` : ""}
                              </span>
                            )
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {e.hobbs_avion != null ? fmtDecimal(e.hobbs_avion, 1) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {e.horas_componente != null
                          ? fmtDecimal(e.horas_componente, 1)
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {e.horas_desde_overhaul != null
                          ? fmtDecimal(e.horas_desde_overhaul, 1)
                          : "—"}
                      </td>
                      <td className="px-3 py-2 max-w-56">
                        <span className="line-clamp-3 whitespace-pre-wrap text-xs">
                          {e.motivo ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {e.realizado?.nombre ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== Traslado =====

function TrasladoDialog({
  open,
  onOpenChange,
  aircraftId,
  matricula,
  modelo,
  componente,
  aviones,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  aircraftId: string;
  matricula: string;
  modelo: string;
  componente: ComponenteAccion;
  aviones: AeronaveDestinoOption[];
}) {
  const n = NOMBRE[componente.tipo];
  const [destinoId, setDestinoId] = useState("");
  const [posicion, setPosicion] = useState(
    componente.tipo === "MOTOR" ? "UNICO" : "UNICA",
  );
  const [motivo, setMotivo] = useState("");
  const [paso, setPaso] = useState<"form" | "confirm">("form");
  const [pending, startTransition] = useTransition();

  const candidatos = aviones.filter((a) => a.id !== aircraftId);
  const destino = candidatos.find((a) => a.id === destinoId) ?? null;
  const modeloDistinto = destino != null && destino.modelo !== modelo;
  const posiciones =
    componente.tipo === "MOTOR" ? POSICIONES_MOTOR : POSICIONES_HELICE;

  const continuar = () => {
    if (!destino) {
      toast.error("Selecciona la aeronave destino");
      return;
    }
    if (motivo.trim().length < 3) {
      toast.error("Describe el motivo del traslado (mínimo 3 caracteres)");
      return;
    }
    setPaso("confirm");
  };

  const confirmar = () =>
    startTransition(async () => {
      const res = await transplantComponentAction(
        aircraftId,
        componente.tipo,
        componente.id,
        {
          aeronave_destino_id: destinoId,
          posicion_destino: posicion,
          motivo: motivo.trim(),
        },
      );
      if (res.ok) {
        toast.success(
          `${n.alto} S/N ${componente.numero_serie} ${componente.tipo === "HELICE" ? "trasladada" : "trasladado"} a ${destino?.matricula ?? "la aeronave destino"}`,
        );
        onOpenChange(false);
      } else if (res.status === 409) {
        // Posición ocupada en el destino: mensaje operable, no el crudo del API.
        toast.error("La posición destino ya tiene un componente — muévelo primero.");
        setPaso("form");
      } else {
        toast.error(res.error ?? "No se pudo trasladar");
        setPaso("form");
      }
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Trasladar {n.bajo} S/N {componente.numero_serie}
          </DialogTitle>
          <DialogDescription>
            El componente conserva sus horas de vida y su TSO; el movimiento
            queda en la bitácora de ambos aviones.
          </DialogDescription>
        </DialogHeader>

        {paso === "form" ? (
          <div className="space-y-4">
            <Field label="Aeronave destino" required>
              <SearchableSelect
                options={candidatos.map((a) => ({
                  value: a.id,
                  label: a.matricula,
                  description: a.modelo,
                }))}
                value={destinoId}
                onChange={setDestinoId}
                placeholder="Selecciona la aeronave"
              />
            </Field>
            {modeloDistinto && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
                <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
                <span>
                  Verifica compatibilidad: los componentes solo deben rotarse
                  entre aeronaves del mismo tipo. Este avión es {modelo};{" "}
                  {destino?.matricula} es {destino?.modelo}.
                </span>
              </p>
            )}
            <Field label="Posición destino" required>
              <SearchableSelect
                options={posiciones}
                value={posicion}
                onChange={setPosicion}
                placeholder="Posición"
              />
            </Field>
            <Field label="Motivo" required hint="Queda en la bitácora del componente.">
              <Input
                placeholder="Ej. Rotación por servicio mayor"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={500}
              />
            </Field>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={continuar}>Continuar</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              {n.articulo} {n.bajo} S/N{" "}
              <span className="font-mono">{componente.numero_serie}</span> se
              moverá de <span className="font-mono font-medium">{matricula}</span>{" "}
              a{" "}
              <span className="font-mono font-medium">{destino?.matricula}</span>
              {componente.horas_actuales != null && (
                <>
                  {" "}conservando{" "}
                  <span className="font-medium">
                    {fmtDecimal(componente.horas_actuales, 1)} hrs
                  </span>{" "}
                  de vida
                </>
              )}
              .
            </p>
            <p className="text-xs text-muted-foreground">Motivo: {motivo.trim()}</p>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setPaso("form")}
                disabled={pending}
              >
                Volver
              </Button>
              <Button onClick={confirmar} disabled={pending}>
                {pending ? "Trasladando…" : "Confirmar traslado"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ===== Overhaul =====

function OverhaulDialog({
  open,
  onOpenChange,
  aircraftId,
  componente,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  aircraftId: string;
  componente: ComponenteAccion;
}) {
  const n = NOMBRE[componente.tipo];
  const [fecha, setFecha] = useState(todayCancun());
  const [motivo, setMotivo] = useState("");
  const [tboHoras, setTboHoras] = useState("");
  const [tboFecha, setTboFecha] = useState("");
  const [paso, setPaso] = useState<"form" | "confirm">("form");
  const [pending, startTransition] = useTransition();

  const continuar = () => {
    if (tboHoras.trim() !== "" && !(Number(tboHoras) > 0)) {
      toast.error("El nuevo TBO debe ser un número mayor a 0 (o déjalo vacío)");
      return;
    }
    setPaso("confirm");
  };

  const confirmar = () =>
    startTransition(async () => {
      const res = await overhaulComponentAction(
        aircraftId,
        componente.tipo,
        componente.id,
        {
          fecha,
          motivo,
          tbo_horas: tboHoras,
          tbo_fecha: tboFecha,
        },
      );
      if (res.ok) {
        toast.success("Overhaul registrado: TSO en 0, horas de vida intactas");
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "No se pudo registrar el overhaul");
        setPaso("form");
      }
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Registrar overhaul · {n.alto} S/N {componente.numero_serie}
          </DialogTitle>
          <DialogDescription>
            Las horas desde overhaul (TSO) vuelven a 0; las horas de vida se
            conservan. Queda registrado en la bitácora.
          </DialogDescription>
        </DialogHeader>

        {paso === "form" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha del overhaul">
                <Input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </Field>
              <Field label="Nuevo TBO (hrs)" hint="Opcional: solo si cambió.">
                <Input
                  type="number"
                  step="0.1"
                  min={1}
                  placeholder="Ej. 2000"
                  value={tboHoras}
                  onChange={(e) => setTboHoras(e.target.value)}
                />
              </Field>
            </div>
            <Field
              label="Nuevo límite calendario"
              hint="Opcional: fecha en la que vence el overhaul por tiempo (ej. 12 años)."
            >
              <Input
                type="date"
                value={tboFecha}
                onChange={(e) => setTboFecha(e.target.value)}
              />
            </Field>
            <Field label="Notas / taller" hint="Opcional: taller, orden de trabajo, referencia.">
              <Textarea
                rows={2}
                placeholder="Ej. Overhaul en Aeromotors, OT 4521"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={500}
              />
            </Field>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={continuar}>Continuar</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              Se registrará el overhaul de {n.bajo === "motor" ? "el motor" : "la hélice"}{" "}
              S/N <span className="font-mono">{componente.numero_serie}</span> con
              fecha <span className="font-medium">{fecha}</span>
              {tboHoras.trim() !== "" && (
                <>
                  {" "}y nuevo TBO de{" "}
                  <span className="font-medium">{fmtDecimal(tboHoras, 1)} hrs</span>
                </>
              )}
              . El TSO vuelve a 0 y las horas de vida se conservan.
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setPaso("form")}
                disabled={pending}
              >
                Volver
              </Button>
              <Button onClick={confirmar} disabled={pending}>
                {pending ? "Registrando…" : "Registrar overhaul"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
