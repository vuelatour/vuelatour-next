"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancunInputToIso, TZ_LABEL } from "@/lib/datetime";
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
import { createReservaAction } from "@/app/admin/flights/actions";
import { Field } from "@/components/admin/form-field";

interface ClientOption {
  id: string;
  nombre: string;
  rfc: string | null;
}

interface AirportOption {
  iata: string;
  nombre: string;
}

interface AircraftOption {
  id: string;
  matricula: string;
  modelo: string;
}

interface PilotOption {
  id: string;
  nombre: string;
  /** Freelance sin app (doc 3.7): la oficina captura sus tacos y gastos. */
  es_piloto_externo?: boolean;
}

/**
 * Tramo del itinerario de OPERACIÓN: la ruta real que vuela el avión y ve el
 * piloto. NO es la ruta comercial de la cotización (esa siempre abre y cierra
 * en Cancún y se arma después en el cotizador).
 */
interface LegRow {
  origen: string;
  destino: string;
  hora: string; // datetime-local; el 1er tramo usa "Fecha y hora" si va vacío
  esFerry: boolean;
  pasajeros: string;
  notas: string;
}

const emptyLeg = (origen = ""): LegRow => ({
  origen,
  destino: "",
  hora: "",
  esFerry: false,
  pasajeros: "",
  notas: "",
});

interface ReservaFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: ClientOption[];
  airports: AirportOption[];
  aircraft: AircraftOption[];
  pilots: PilotOption[];
}

/**
 * Creación rápida de vuelo, en el orden pedido por el cliente:
 * avión → itinerario de OPERACIÓN → piloto → hora → cliente → opcionales.
 * La cotización (ruta comercial CUN→…→CUN, precio) es opcional y se arma
 * después desde el detalle del vuelo; los vuelos "salen de la nada" y esto
 * captura lo mínimo operable en segundos.
 */
export function ReservaFormSheet({
  open,
  onOpenChange,
  clients,
  airports,
  aircraft,
  pilots,
}: ReservaFormSheetProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [aeronaveId, setAeronaveId] = useState("");
  const [legs, setLegs] = useState<LegRow[]>([emptyLeg("CUN")]);
  const [pilotoId, setPilotoId] = useState("");
  const [fechaVuelo, setFechaVuelo] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [cotizacionAbierta, setCotizacionAbierta] = useState(false);
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);

  const airportOptions = airports.map((a) => ({
    value: a.iata,
    label: a.iata,
    description: a.nombre,
  }));

  const updateLeg = (i: number, patch: Partial<LegRow>) =>
    setLegs((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const addLeg = () =>
    setLegs((prev) => [...prev, emptyLeg(prev[prev.length - 1]?.destino ?? "")]);

  const removeLeg = (i: number) =>
    setLegs((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const submit = () => {
    setError(null);
    if (!aeronaveId) return setError("Elige el avión.");
    if (legs.some((l) => !l.origen || !l.destino))
      return setError("Cada tramo necesita origen y destino.");
    if (legs.some((l) => l.origen === l.destino))
      return setError("Un tramo no puede tener el mismo origen y destino.");
    if (!pilotoId) return setError("Elige el piloto.");
    if (!fechaVuelo) return setError("Captura la fecha y hora de salida.");
    if (!clienteId) return setError("Elige el cliente (responsable del vuelo).");

    startTransition(async () => {
      const res = await createReservaAction({
        cliente_id: clienteId,
        aeronave_id: aeronaveId,
        piloto_id: pilotoId,
        fecha_vuelo: cancunInputToIso(fechaVuelo),
        cotizacion_abierta: cotizacionAbierta,
        notas: notas.trim() || undefined,
        escalas_operacion: legs.map((l, idx) => ({
          origen_iata: l.origen,
          destino_iata: l.destino,
          // El tramo 1 siempre sale a la fecha/hora general del vuelo.
          hora_salida: l.hora && idx > 0 ? cancunInputToIso(l.hora) : undefined,
          es_ferry: l.esFerry,
          pasajeros: l.esFerry ? undefined : Number(l.pasajeros) || undefined,
          notas: l.notas.trim() || undefined,
        })),
      });
      if (res.ok && res.data) {
        toast.success(`Operación guardada · vuelo #${res.data.folio}. Usa "Cotizar" cuando quieras ponerle precio.`);
        onOpenChange(false);
        router.push(`/admin/flights/${res.data.id}`);
      } else {
        setError(res.error ?? "Error al crear el vuelo");
      }
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen, details) => {
        if (
          !nextOpen &&
          (details.reason === "outside-press" ||
            details.reason === "escape-key" ||
            details.reason === "focus-out")
        ) {
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <SheetContent
        side="right"
        // El Sheet base trae data-[side=right]:sm:max-w-sm (384px): hay que
        // sobreescribir con el MISMO prefijo de variante o gana el base.
        className="data-[side=right]:w-full data-[side=right]:sm:w-[50vw] data-[side=right]:sm:max-w-[880px] flex flex-col p-0"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>Nueva cotización · paso 1: operación</SheetTitle>
          <SheetDescription>
            Captura la OPERACIÓN real — de dónde sale el avión y sus escalas;
            es lo que ve el piloto y lo que aparta el espacio. El precio al
            cliente (CUN → … → CUN) es el paso 2: botón &ldquo;Cotizar&rdquo; en el
            detalle, cuando gustes.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* 1. Avión */}
          <Field label="Avión" required>
            <SearchableSelect
              options={aircraft.map((a) => ({
                value: a.id,
                label: a.matricula,
                description: a.modelo,
              }))}
              value={aeronaveId}
              onChange={setAeronaveId}
              placeholder="Matrícula"
            />
          </Field>

          {/* 2. Ruta de operación */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                Ruta de operación <span className="text-destructive">*</span>
              </Label>
              <Button type="button" size="sm" variant="outline" onClick={addLeg} className="gap-1">
                <PlusIcon className="h-3.5 w-3.5" />
                Tramo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              La ruta real del avión (puede salir de otra base). Marca como
              ferry los tramos sin pasajeros: el piloto los ve, el cliente no.
            </p>
            <div className="space-y-2">
              {legs.map((leg, i) => (
                <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="grid grid-cols-[1fr_auto_1fr_auto] items-end gap-2">
                    <Field label={i === 0 ? "Sale de" : "Origen"}>
                      <SearchableSelect
                        options={airportOptions}
                        value={leg.origen}
                        onChange={(v) => updateLeg(i, { origen: v })}
                        placeholder="IATA"
                      />
                    </Field>
                    <span className="text-muted-foreground mb-2">→</span>
                    <Field label="Destino">
                      <SearchableSelect
                        options={airportOptions}
                        value={leg.destino}
                        onChange={(v) => {
                          updateLeg(i, { destino: v });
                          // Encadena el origen del siguiente tramo si está vacío.
                          setLegs((prev) =>
                            prev.map((l, idx) =>
                              idx === i + 1 && !l.origen ? { ...l, origen: v } : l,
                            ),
                          );
                        }}
                        placeholder="IATA"
                      />
                    </Field>
                    {legs.length > 1 ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="mb-1 h-8 w-8 text-muted-foreground"
                        onClick={() => removeLeg(i)}
                        title="Quitar tramo"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    ) : (
                      <span className="w-8" />
                    )}
                  </div>
                  <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-3">
                    <label className="flex items-center gap-2 text-xs">
                      <Switch
                        checked={leg.esFerry}
                        onCheckedChange={(c) =>
                          updateLeg(i, { esFerry: c, pasajeros: c ? "" : leg.pasajeros })
                        }
                      />
                      Ferry (vacío)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="Pax"
                      disabled={leg.esFerry}
                      value={leg.pasajeros}
                      onChange={(e) => updateLeg(i, { pasajeros: e.target.value })}
                    />
                    {i === 0 ? (
                      <Input
                        value="Usa la fecha y hora general"
                        disabled
                        readOnly
                        className="text-muted-foreground text-xs"
                        title="El primer tramo sale a la fecha y hora general del vuelo (se captura abajo)."
                      />
                    ) : (
                      <Input
                        type="datetime-local"
                        disabled={!fechaVuelo}
                        title={
                          !fechaVuelo
                            ? "Primero captura la fecha y hora general (abajo)."
                            : "Hora del tramo (opcional). Si sale otro día, se marca pernocta."
                        }
                        value={leg.hora}
                        // Precarga desde el tramo anterior o la fecha general para
                        // que el selector nunca arranque en "ahora".
                        onFocus={() => {
                          if (leg.hora) return;
                          const base =
                            [...legs.slice(0, i)].reverse().find((l) => l.hora)?.hora ||
                            fechaVuelo;
                          if (base) updateLeg(i, { hora: base });
                        }}
                        onChange={(e) => updateLeg(i, { hora: e.target.value })}
                      />
                    )}
                  </div>
                  <Input
                    placeholder='Nota del tramo (opcional) · ej. "ellos pagan sus TUAs"'
                    value={leg.notas}
                    onChange={(e) => updateLeg(i, { notas: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 3. Piloto */}
          <Field label="Piloto" required>
            <SearchableSelect
              options={pilots.map((p) => ({
                value: p.id,
                label: p.es_piloto_externo ? `${p.nombre} · externo` : p.nombre,
              }))}
              value={pilotoId}
              onChange={setPilotoId}
              placeholder="Selecciona piloto"
            />
          </Field>

          {/* 4. Hora */}
          <Field label="Fecha y hora de salida" hint={TZ_LABEL} required>
            <Input
              type="datetime-local"
              value={fechaVuelo}
              onChange={(e) => setFechaVuelo(e.target.value)}
            />
          </Field>

          {/* 5. Cliente (responsable del vuelo) */}
          <Field label="Cliente (responsable del vuelo)" required>
            <SearchableSelect
              options={clients.map((c) => ({
                value: c.id,
                label: c.nombre,
                description: c.rfc ?? undefined,
              }))}
              value={clienteId}
              onChange={setClienteId}
              placeholder="Selecciona cliente"
              emptyText="Sin clientes activos"
            />
          </Field>

          {/* Opcionales */}
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Cotización abierta</Label>
              <p className="text-xs text-muted-foreground">
                &ldquo;Llévame y de ahí vemos&rdquo;: el piloto registra tramos en el
                camino y el precio se cierra al final.
              </p>
            </div>
            <Switch checked={cotizacionAbierta} onCheckedChange={setCotizacionAbierta} />
          </div>

          <Field label="Notas internas">
            <Textarea
              rows={2}
              placeholder='Opcional · ej. "va a pagar con BillPocket"'
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </Field>

          {error && (
            <p className="text-sm font-medium text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <SheetFooter className="border-t border-border flex-row justify-end gap-2 mt-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Creando…" : "Crear vuelo"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
