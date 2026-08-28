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
import type { EstadoVuelo } from "@/types/quotes-persisted";

interface AirportOption {
  iata: string;
  nombre: string;
}

const MOTIVO_MAX = 300;

/**
 * Alta de un tramo OPERATIVO interno (ruta real): ferry, parada técnica,
 * movimiento interno, pernocta operativa. No se cotiza ni se cobra ni se
 * muestra al cliente; no cambia el precio. Lo ve operaciones, el piloto y el
 * calendario.
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flightId: string;
  estado: EstadoVuelo;
  airports: AirportOption[];
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
        pasajeros: esFerry ? 0 : Number(pasajeros) || 0,
        pasajeros_nombres: nombresLista.length > 0 ? nombresLista : undefined,
        requiere_pernocta: requierePernocta,
        tipo_parada: esServicio ? "SERVICIO" : "NORMAL",
        servicio_notas: esServicio ? servicioNotas.trim() || undefined : undefined,
        fecha_salida_plan: fecha ? cancunInputToIso(fecha) : undefined,
        notas: notas.trim() || undefined,
        motivo: vueloCompletado ? motivoLimpio : undefined,
      });
      if (res.ok) {
        toast.success(
          vueloCompletado
            ? "Tramo agregado; el vuelo vuelve a EN VUELO"
            : "Tramo operativo agregado a la ruta real",
        );
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
          <SheetTitle>Agregar tramo operativo</SheetTitle>
          <SheetDescription>
            Movimiento real de la aeronave que NO se cobra al cliente (ferry,
            parada técnica, pernocta operativa). No cambia la cotización; lo ven
            operaciones, el piloto y el calendario.
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
                onChange={(v) => {
                  setOrigen(v);
                  // Sobrevuelo: el destino sigue al origen (mismo punto).
                  if (esSobrevuelo) setDestino(v);
                }}
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
                El avión sobrevuela una zona (recorrido/reconocimiento) en vez
                de un traslado normal. Regresa al mismo punto: el destino se
                iguala al origen.
              </p>
            </div>
            <Switch
              checked={esSobrevuelo}
              onCheckedChange={(c) => {
                setEsSobrevuelo(c);
                // Sobrevuelo: sale y regresa al mismo punto.
                if (c && origen) setDestino(origen);
              }}
            />
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
