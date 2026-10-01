"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cancunInputToIso, TZ_LABEL } from "@/lib/datetime";
import { createOperationalLegAction } from "@/app/admin/flights/actions";
import {
  AYUDA_TRAMO_OPERATIVO,
  avisoTramoNuevo,
  mensajeTramoAgregado,
} from "@/lib/admin/tramo-operativo";
import type { EstadoVuelo } from "@/types/quotes-persisted";
import type { FlightEscala } from "@/types/flights";

interface AirportOption {
  iata: string;
  nombre: string;
}

const MOTIVO_MAX = 300;

/**
 * Alta de un tramo en la ruta REAL del vuelo («Agregar tramo» de Asignación
 * por tramo). No recalcula la cotización. Desde el API 0.0.46 (#364,
 * 30-sep-2026) el API decide (`tramo-agregado.util.ts`):
 * - ferry o parada técnica SIN pasajeros ⇒ tramo OPERATIVO: no se cotiza;
 * - con pasajeros (o sin ferry) ⇒ tramo DEL CLIENTE: la cotización muestra
 *   que la operación difiere y ofrece adoptarlo; salvo que vaya después de un
 *   operativo que ya voló o sale antes (freno de cronología del API): queda
 *   operativo y el API lo avisa.
 * El aviso informativo al pie dice cuál será ANTES de guardar
 * (`avisoTramoNuevo`, espejo de `ubicarTramoAgregado` con las escalas del
 * vuelo) y el toast dice cuál quedó, leído de la RESPUESTA
 * (`mensajeTramoAgregado`). Lo ve operaciones, el piloto y el calendario.
 *
 * Vuelo COMPLETADO (regla del cliente): el cliente pidió ir a otro lado al
 * terminar la ruta y se considera parte del MISMO vuelo. El API exige motivo
 * y regresa el vuelo a EN_VUELO hasta que el piloto capture la llegada.
 */
export function OperationalLegSheet({
  open,
  onOpenChange,
  flightId,
  estado,
  airports,
  escalas,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flightId: string;
  estado: EstadoVuelo;
  airports: AirportOption[];
  /** Escalas del vuelo (todas): el pie anticipa el freno de cronología. */
  escalas?: ReadonlyArray<FlightEscala>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const vueloCompletado = estado === "COMPLETADO";
  // Motivo del tramo extra: obligatorio solo en vuelo COMPLETADO.
  const [motivo, setMotivo] = useState("");
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [esFerry, setEsFerry] = useState(true);
  const [esSobrevuelo, setEsSobrevuelo] = useState(false);
  const [pasajeros, setPasajeros] = useState("");
  // Manifiesto del tramo: un nombre por línea (un ferry vuela vacío).
  const [nombres, setNombres] = useState("");
  const [requierePernocta, setRequierePernocta] = useState(false);
  const [esServicio, setEsServicio] = useState(false);
  const [servicioNotas, setServicioNotas] = useState("");
  const [fecha, setFecha] = useState("");
  const [notas, setNotas] = useState("");

  // Lo que se MANDA como pasajeros (un ferry vuela vacío).
  const paxAEnviar = esFerry ? 0 : Number(pasajeros) || 0;
  const fechaIso = fecha ? cancunInputToIso(fecha) : "";
  // Espejo de la regla del API: ¿este tramo será del cliente u operativo?
  // Mismos insumos que viajan en el POST (pax, servicio, fecha) + las
  // escalas del vuelo para el freno de cronología.
  const aviso = avisoTramoNuevo({
    esFerry,
    esServicio,
    pasajeros: paxAEnviar,
    fechaSalidaPlan: fechaIso || null,
    existentes: escalas,
  });

  const airportOptions = airports.map((a) => ({
    value: a.iata,
    label: a.iata,
    description: a.nombre,
  }));

  const handleSave = () => {
    if (origen.length < 3 || destino.length < 3) {
      toast.error("Captura origen y destino (IATA)");
      return;
    }
    // Un sobrevuelo PUEDE salir y regresar al mismo punto; en un traslado
    // normal la igualdad es un error de captura (misma regla del alta).
    if (origen.toUpperCase() === destino.toUpperCase() && !esSobrevuelo) {
      toast.error(
        "Origen y destino no pueden ser iguales (salvo sobrevuelo)",
      );
      return;
    }
    const motivoLimpio = motivo.trim();
    if (vueloCompletado && motivoLimpio.length === 0) {
      toast.error(
        "Indica el motivo del tramo extra: el vuelo ya estaba completado",
      );
      return;
    }
    const nombresLista = esFerry
      ? []
      : nombres
          .split("\n")
          .map((n) => n.trim())
          .filter((n) => n.length > 0);
    startTransition(async () => {
      const res = await createOperationalLegAction(flightId, {
        origen_iata: origen.toUpperCase(),
        destino_iata: destino.toUpperCase(),
        es_ferry: esFerry,
        es_sobrevuelo: esSobrevuelo,
        pasajeros: paxAEnviar,
        pasajeros_nombres: nombresLista.length > 0 ? nombresLista : undefined,
        requiere_pernocta: requierePernocta,
        tipo_parada: esServicio ? "SERVICIO" : "NORMAL",
        servicio_notas: esServicio ? servicioNotas.trim() || undefined : undefined,
        fecha_salida_plan: fechaIso || undefined,
        notas: notas.trim() || undefined,
        motivo: vueloCompletado ? motivoLimpio : undefined,
      });
      if (res.ok) {
        const m = mensajeTramoAgregado(res.data ?? {}, vueloCompletado);
        const opts = m.descripcion ? { description: m.descripcion } : undefined;
        // Un tramo del cliente que quedó OPERATIVO (freno de cronología) se
        // avisa en ámbar y con más tiempo: la oficina tiene que cobrarlo.
        if (m.advertencia) {
          toast.warning(m.titulo, { ...opts, duration: 12_000 });
        } else {
          toast.success(m.titulo, opts);
        }
        setMotivo("");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo agregar el tramo");
      }
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next, details) => {
        if (
          !next &&
          (details?.reason === "outside-press" ||
            details?.reason === "escape-key" ||
            details?.reason === "focus-out")
        ) {
          return;
        }
        onOpenChange(next);
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-md sm:w-[480px] flex flex-col p-0">
        <SheetHeader className="border-b border-border">
          <SheetTitle>Agregar tramo</SheetTitle>
          <SheetDescription>
            Tramo de la ruta real del vuelo. Si es ferry o parada técnica sin
            pasajeros, es operativo y no se cobra; si no, es un tramo del
            cliente. Lo ven operaciones, el piloto y el calendario; la
            cotización no se recalcula sola.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {vueloCompletado && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-3">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                El vuelo ya está completado: al agregar el tramo vuelve a{" "}
                <strong>EN VUELO</strong> hasta que el piloto capture la
                llegada; la cotización no cambia — revísala después si se
                cobra.
              </p>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Motivo <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  rows={2}
                  maxLength={MOTIVO_MAX}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej. El cliente pidió continuar a Holbox al terminar la ruta."
                />
                <p className="text-xs text-muted-foreground">
                  ¿Por qué se agrega un tramo a un vuelo ya cerrado? Queda en
                  la bitácora. {motivo.length}/{MOTIVO_MAX}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Origen</Label>
              <SearchableSelect
                options={airportOptions}
                value={origen}
                onChange={setOrigen}
                placeholder="IATA"
              />
            </div>
            <span className="text-muted-foreground mb-2">→</span>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Destino</Label>
              <SearchableSelect
                options={airportOptions}
                value={destino}
                onChange={setDestino}
                placeholder="IATA"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label className="text-sm font-medium">Ferry (sin pasajeros)</Label>
              <p className="text-xs text-muted-foreground">
                Movimiento vacío de la aeronave.
              </p>
            </div>
            <Switch checked={esFerry} onCheckedChange={setEsFerry} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label className="text-sm font-medium">Sobrevuelo</Label>
              <p className="text-xs text-muted-foreground">
                El avión realiza un sobrevuelo (recorrido/reconocimiento) en
                este tramo. No cambia origen ni destino.
              </p>
            </div>
            {/* SEMÁNTICA 2-sep-2026: el switch SOLO prende/apaga la bandera —
                jamás toca el campo Destino. */}
            <Switch checked={esSobrevuelo} onCheckedChange={setEsSobrevuelo} />
          </div>

          {!esFerry && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Pasajeros en este tramo</Label>
              <Input
                type="number"
                min={0}
                value={pasajeros}
                onChange={(e) => setPasajeros(e.target.value)}
                placeholder="0"
                className="w-24"
              />
            </div>
          )}

          {!esFerry && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Nombres de pasajeros (opcional)
              </Label>
              <Textarea
                rows={3}
                value={nombres}
                onChange={(e) => setNombres(e.target.value)}
                placeholder={"Uno por línea (puede ir vacío)\nJuan Pérez\nMaría López"}
              />
              <p className="text-xs text-muted-foreground">
                Específico de este tramo. Útil para permisos; puede ir vacío.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Fecha y hora del tramo</Label>
            <Input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            <p className="text-xs text-muted-foreground">{TZ_LABEL}</p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label className="text-sm font-medium">Pernocta en el destino</Label>
            <Switch checked={requierePernocta} onCheckedChange={setRequierePernocta} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label className="text-sm font-medium">Parada técnica / de servicio</Label>
              <p className="text-xs text-muted-foreground">
                Ej. cambiar llanta, revisión, carga de material.
              </p>
            </div>
            <Switch checked={esServicio} onCheckedChange={setEsServicio} />
          </div>
          {esServicio && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Detalle de la parada</Label>
              <Input
                value={servicioNotas}
                onChange={(e) => setServicioNotas(e.target.value)}
                placeholder="Ej. Cambio de llanta en Toledo"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Instrucción / justificación para el piloto</Label>
            <Textarea
              rows={3}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej. Regreso ferry; cargar turbosina aprovechando la escala."
            />
          </div>
        </div>

        {/* Aviso INFORMATIVO, siempre a la vista: cambia en vivo con ferry,
            parada técnica, pasajeros y fecha (misma regla que el API). */}
        <div
          className={
            aviso.tipo === "COMERCIAL"
              ? "border-t border-sky-500/30 bg-sky-500/10 px-4 py-2.5 text-xs text-sky-700 dark:text-sky-300"
              : aviso.tipo === "CLIENTE_OPERATIVO"
                ? "border-t border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300"
                : "border-t border-slate-500/30 bg-slate-500/10 px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300"
          }
          role="status"
          data-aviso-tramo={
            aviso.tipo === "COMERCIAL"
              ? "comercial"
              : aviso.tipo === "CLIENTE_OPERATIVO"
                ? "cliente-operativo"
                : "operativo"
          }
          title={aviso.tipo === "OPERATIVO" ? AYUDA_TRAMO_OPERATIVO : undefined}
        >
          {aviso.texto}.
        </div>

        <SheetFooter className="border-t border-border flex-row justify-end gap-2 mt-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Agregando…" : "Agregar tramo"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
