"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { toastAvisos } from "@/lib/admin/avisos";
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
import {
  createReservaAction,
  type CreateReservaPayload,
} from "@/app/admin/flights/actions";
import { SquawkAltaDialog, squawkAltaDe } from "./squawk-alta-dialog";
import { QuickClientDialog } from "@/components/admin/clients/quick-client-dialog";
import { Field } from "@/components/admin/form-field";
import { RutaRapidaInput } from "@/components/admin/ruta-rapida-input";
import { AirportQuickCreateButton } from "@/components/admin/airports/airport-quick-create-button";
import { FechaHoraCampo } from "@/components/admin/fecha-hora-campo";
import type { Airport } from "@/types/airports";

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
  /** Tramo de sobrevuelo (recorrido/reconocimiento). SEMÁNTICA 2-sep-2026:
   *  bandera ORTOGONAL al destino — un CUN→CZM puede llevarla igual que un
   *  CUN→CUN; prenderla/apagarla jamás toca origen ni destino. */
  esSobrevuelo: boolean;
  /** El piloto pernocta tras este tramo — SOLO manual (27-ago: se quitó la
   *  derivación automática por salto de fecha; marcaba pernoctas no pedidas). */
  pernocta: boolean;
  /** Parada de servicio/técnica (tipo_parada SERVICIO) + su detalle. */
  servicio: boolean;
  servicioNotas: string;
  pasajeros: string;
  /** Manifiesto: un nombre por línea (colapsado tras "+ nombres de pasajeros"). */
  nombres: string;
  /** UI: el textarea de nombres solo se despliega si se pide (caso común: vacío). */
  showNombres: boolean;
  notas: string;
}

const emptyLeg = (origen = ""): LegRow => ({
  origen,
  destino: "",
  hora: "",
  esFerry: false,
  esSobrevuelo: false,
  pernocta: false,
  servicio: false,
  servicioNotas: "",
  pasajeros: "",
  nombres: "",
  showNombres: false,
  notas: "",
});

/** Textarea "uno por línea" → array de nombres (líneas no vacías). */
const parseNombres = (raw: string): string[] =>
  raw
    .split("\n")
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

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
 * avión → fecha/hora de salida → itinerario de OPERACIÓN → piloto → cliente
 * → opcionales. (Cambio 27-ago: la fecha SUBIÓ antes del itinerario — al
 * final limitaba los tramos: el 1º no tiene campo propio y los demás
 * quedaban deshabilitados hasta capturarla.)
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
  const [copilotoId, setCopilotoId] = useState("");
  const [fechaVuelo, setFechaVuelo] = useState("");
  const [clienteId, setClienteId] = useState("");
  // Alta rápida de cliente sin salir del flujo (solo nombre).
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [extraClients, setExtraClients] = useState<ClientOption[]>([]);
  const [cotizacionAbierta, setCotizacionAbierta] = useState(false);
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Candado de squawk ALTA del avión elegido: guarda el payload rechazado
  // para reintentarlo con la bandera si la oficina confirma en el diálogo.
  const [squawk, setSquawk] = useState<{
    lista: string[];
    payload: CreateReservaPayload;
  } | null>(null);

  // Aeropuertos creados SIN salir del sheet (28-ago): se suman al catálogo
  // que llegó por props y quedan seleccionables al instante (ruta rápida y
  // selects); el router.refresh() de fondo trae el catálogo del servidor
  // (mismo patrón que extraClients).
  const [extraAirports, setExtraAirports] = useState<AirportOption[]>([]);
  const airportsAll = [
    ...airports.filter((a) => !extraAirports.some((e) => e.iata === a.iata)),
    ...extraAirports,
  ].sort((a, b) => a.iata.localeCompare(b.iata));
  const onAeropuertoCreado = (a: Airport) => {
    setExtraAirports((prev) => [
      ...prev.filter((x) => x.iata !== a.iata),
      { iata: a.iata, nombre: a.nombre },
    ]);
    router.refresh();
  };

  const airportOptions = airportsAll.map((a) => ({
    value: a.iata,
    label: a.iata,
    description: a.nombre,
  }));

  const updateLeg = (i: number, patch: Partial<LegRow>) =>
    setLegs((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  /** Cambia el destino de un tramo Y encadena el origen del siguiente si está
   *  vacío (el backend valida esa continuidad). */
  const setDestinoTramo = (i: number, v: string) => {
    updateLeg(i, { destino: v });
    setLegs((prev) =>
      prev.map((l, idx) =>
        idx === i + 1 && !l.origen ? { ...l, origen: v } : l,
      ),
    );
  };

  const addLeg = () =>
    setLegs((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, emptyLeg(last ? last.destino : "")];
    });

  const removeLeg = (i: number) =>
    setLegs((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

  // Ruta rápida: "CUN, HOL, CUN" + Enter arma los tramos de la operación.
  // Solo la CAPTURA cuenta como dato a confirmar; el esqueleto de ruta
  // (origen/destino) se repone con un Enter y el diálogo estorbaría.
  const hayDatosTramos = legs.some(
    (l) =>
      l.hora !== "" ||
      l.pasajeros !== "" ||
      l.nombres.trim() !== "" ||
      l.notas.trim() !== "" ||
      l.servicioNotas.trim() !== "" ||
      l.esFerry ||
      l.pernocta ||
      l.servicio,
  );

  const aplicarRutaRapida = (codigos: string[]) =>
    setLegs(
      codigos.slice(0, -1).map((c, i) => ({
        ...emptyLeg(c),
        destino: codigos[i + 1],
        // Mismo punto seguido = sobrevuelo (sale y regresa); sin la marca,
        // la validación del submit lo rechazaría.
        esSobrevuelo: c === codigos[i + 1],
      })),
    );

  const submit = () => {
    setError(null);
    if (!aeronaveId) return setError("Elige el avión.");
    // SEMÁNTICA 2-sep-2026: el sobrevuelo es ortogonal al destino — origen y
    // destino se capturan SIEMPRE, con o sin la bandera.
    if (legs.some((l) => !l.origen || !l.destino))
      return setError("Cada tramo necesita origen y destino.");
    // Un sobrevuelo PUEDE salir y regresar al mismo punto — la igualdad solo
    // se prohíbe en tramos de traslado normales.
    if (legs.some((l) => l.origen === l.destino && !l.esSobrevuelo))
      return setError(
        "Un tramo no puede tener el mismo origen y destino (salvo sobrevuelo).",
      );
    if (!pilotoId) return setError("Elige el piloto.");
    if (copilotoId && copilotoId === pilotoId)
      return setError("El copiloto debe ser distinto del piloto.");
    if (!fechaVuelo) return setError("Captura la fecha y hora de salida.");
    if (!clienteId) return setError("Elige el cliente (responsable del vuelo).");

    const payload: CreateReservaPayload = {
      cliente_id: clienteId,
      aeronave_id: aeronaveId,
      piloto_id: pilotoId,
      copiloto_id: copilotoId || undefined,
      fecha_vuelo: cancunInputToIso(fechaVuelo),
      cotizacion_abierta: cotizacionAbierta,
      // El campo del form es "Notas internas": va en notas_internas —
      // vuelo.notas es "Notas (visibles en PDF)" y una nota interna
      // (p. ej. cómo va a pagar) no debe salir en el PDF del cliente.
      notas_internas: notas.trim() || undefined,
      escalas_operacion: legs.map((l, idx) => {
        // Un ferry vuela vacío: sin manifiesto de nombres.
        const nombres = l.esFerry ? [] : parseNombres(l.nombres);
        return {
          origen_iata: l.origen,
          // SEMÁNTICA 2-sep-2026: el destino viaja tal cual se capturó — el
          // sobrevuelo es una bandera ortogonal y NUNCA deriva el destino.
          destino_iata: l.destino,
          // El tramo 1 siempre sale a la fecha/hora general del vuelo.
          hora_salida: l.hora && idx > 0 ? cancunInputToIso(l.hora) : undefined,
          es_ferry: l.esFerry,
          es_sobrevuelo: l.esSobrevuelo,
          pasajeros: l.esFerry ? undefined : Number(l.pasajeros) || undefined,
          pasajeros_nombres: nombres.length > 0 ? nombres : undefined,
          requiere_pernocta: l.pernocta || undefined,
          tipo_parada: l.servicio ? ("SERVICIO" as const) : undefined,
          servicio_notas: l.servicio
            ? l.servicioNotas.trim() || undefined
            : undefined,
          notas: l.notas.trim() || undefined,
        };
      }),
    };
    ejecutar(payload, false);
  };

  /** Crea el vuelo; con `aceptarSquawk` reintenta pese al squawk ALTA del
   *  avión (confirmado en el diálogo — el API avisa al mecánico). */
  const ejecutar = (payload: CreateReservaPayload, aceptarSquawk: boolean) => {
    startTransition(async () => {
      const res = await createReservaAction(
        aceptarSquawk ? { ...payload, aceptar_discrepancia_alta: true } : payload,
      );
      if (res.ok && res.data) {
        toast.success(
          aceptarSquawk
            ? `Operación guardada · vuelo #${res.data.folio} — se avisó al mecánico de las discrepancias abiertas del avión.`
            : `Operación guardada · vuelo #${res.data.folio}. Usa "Cotizar" cuando quieras ponerle precio.`,
        );
        // Avisos no bloqueantes del API (capacidad del avión vs pasajeros,
        // doble reserva ese día): el vuelo YA se creó; solo se avisa.
        toastAvisos(res.data.avisos);
        setSquawk(null);
        onOpenChange(false);
        router.push(`/admin/flights/${res.data.id}`);
      } else {
        // Candado de squawk ALTA del avión: se confirma en el diálogo y se
        // reintenta con la bandera (el API avisa al mecánico).
        const lista = aceptarSquawk ? null : squawkAltaDe(res);
        if (lista) {
          setSquawk({ lista, payload });
          return;
        }
        setSquawk(null);
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

          {/* 2. Fecha y hora de salida — arriba del itinerario (27-ago):
              antes iba al final y limitaba los tramos. El tramo 1 la usa tal
              cual; los tramos 2+ la precargan al enfocar su hora. */}
          <Field label="Fecha y hora de salida" hint={TZ_LABEL} required>
            <FechaHoraCampo value={fechaVuelo} onChange={setFechaVuelo} />
          </Field>

          {/* 3. Ruta de operación */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                Ruta de operación <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-2">
                <AirportQuickCreateButton onCreated={onAeropuertoCreado} />
                <Button type="button" size="sm" variant="outline" onClick={addLeg} className="gap-1">
                  <PlusIcon className="h-3.5 w-3.5" />
                  Tramo
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              La ruta real del avión (puede salir de otra base). Marca como
              ferry los tramos sin pasajeros: el piloto los ve, el cliente no.
            </p>
            <RutaRapidaInput
              airports={airportsAll}
              hayDatos={hayDatosTramos}
              onAplicar={aplicarRutaRapida}
              onAeropuertoCreado={onAeropuertoCreado}
            />
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
                      {/* SEMÁNTICA 2-sep-2026: el destino SIEMPRE es editable
                          y el sobrevuelo no lo condiciona en nada. */}
                      <SearchableSelect
                        options={airportOptions}
                        value={leg.destino}
                        onChange={(v) => setDestinoTramo(i, v)}
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
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <label className="flex items-center gap-2 text-xs">
                      <Switch
                        checked={leg.esFerry}
                        onCheckedChange={(c) =>
                          // Ferry vuela vacío: sin pax y sin nombres.
                          updateLeg(i, {
                            esFerry: c,
                            pasajeros: c ? "" : leg.pasajeros,
                            ...(c ? { nombres: "", showNombres: false } : {}),
                          })
                        }
                      />
                      Ferry (vacío)
                    </label>
                    <label
                      className="flex items-center gap-2 text-xs"
                      title="El avión realiza un sobrevuelo (recorrido/reconocimiento) en este tramo. No cambia origen ni destino."
                    >
                      {/* SEMÁNTICA 2-sep-2026: el switch SOLO prende/apaga la
                          bandera — jamás toca el campo Destino. */}
                      <Switch
                        checked={leg.esSobrevuelo}
                        onCheckedChange={(c) => updateLeg(i, { esSobrevuelo: c })}
                      />
                      Sobrevuelo
                    </label>
                    <label
                      className="flex items-center gap-2 text-xs"
                      title="El piloto pernocta tras este tramo — dispara el viático de pernocta en la cotización. SOLO se marca a mano."
                    >
                      <Switch
                        checked={leg.pernocta}
                        onCheckedChange={(c) => updateLeg(i, { pernocta: c })}
                      />
                      Pernocta
                    </label>
                    <label
                      className="flex items-center gap-2 text-xs"
                      title="Parada técnica / de servicio: cambiar llanta, revisión, carga de material."
                    >
                      <Switch
                        checked={leg.servicio}
                        onCheckedChange={(c) => updateLeg(i, { servicio: c })}
                      />
                      Parada de servicio
                    </label>
                  </div>
                  {leg.servicio && (
                    <Input
                      placeholder="Detalle del servicio · ej. aterriza en Toledo a cambiar llanta"
                      value={leg.servicioNotas}
                      onChange={(e) => updateLeg(i, { servicioNotas: e.target.value })}
                    />
                  )}
                  <div className="grid grid-cols-[110px_1fr] items-start gap-3">
                    <Input
                      type="number"
                      min={0}
                      placeholder="Pax"
                      disabled={leg.esFerry}
                      value={leg.pasajeros}
                      onChange={(e) => updateLeg(i, { pasajeros: e.target.value })}
                    />
                    {i === 0 ? (
                      // La fecha del tramo 1 ES la general (28-ago): se
                      // edita AQUÍ mismo y el campo de arriba se actualiza
                      // solo (mismo estado) — antes solo había un letrero
                      // deshabilitado y la fecha quedaba lejos del tramo.
                      <div title="Es la salida general del vuelo — editarla aquí actualiza el campo de arriba.">
                        <FechaHoraCampo
                          value={fechaVuelo}
                          onChange={setFechaVuelo}
                        />
                      </div>
                    ) : (
                      <div
                        title="Hora del tramo (opcional, hora Cancún)."
                        // Precarga desde el tramo anterior o la fecha general
                        // para que el campo nunca arranque vacío (el onFocus
                        // de React burbujea desde los inputs internos).
                        onFocus={() => {
                          if (leg.hora) return;
                          const base =
                            [...legs.slice(0, i)].reverse().find((l) => l.hora)?.hora ||
                            fechaVuelo;
                          if (base) updateLeg(i, { hora: base });
                        }}
                      >
                        <FechaHoraCampo
                          value={leg.hora}
                          onChange={(v) => updateLeg(i, { hora: v })}
                        />
                      </div>
                    )}
                  </div>
                  <Input
                    placeholder='Nota del tramo (opcional) · ej. "ellos pagan sus TUAs"'
                    value={leg.notas}
                    onChange={(e) => updateLeg(i, { notas: e.target.value })}
                  />
                  {/* Manifiesto colapsado: en el caso común va vacío y no
                      alarga el formulario; un ferry vuela sin nombres. */}
                  {!leg.esFerry &&
                    (leg.showNombres ? (
                      <div className="space-y-1">
                        <Textarea
                          rows={3}
                          value={leg.nombres}
                          onChange={(e) => updateLeg(i, { nombres: e.target.value })}
                          placeholder={"Nombres de pasajeros, uno por línea\nJuan Pérez\nMaría López"}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Específico de este tramo. Útil para permisos; puede ir
                          vacío.
                        </p>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => updateLeg(i, { showNombres: true })}
                        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline transition-colors"
                      >
                        + nombres de pasajeros
                      </button>
                    ))}
                </div>
              ))}
            </div>
          </div>

          {(() => {
            // Resumen del VIAJE por día (multi-día): tramo 1 sale a la fecha
            // general; los demás heredan el día del anterior si no traen hora.
            const dias: {
              dia: string;
              tramos: string[];
              pernocta: string | null;
            }[] = [];
            let diaActual = fechaVuelo ? fechaVuelo.slice(0, 10) : null;
            legs.forEach((l, i) => {
              const propio = i > 0 && l.hora ? l.hora.slice(0, 10) : null;
              if (propio) diaActual = propio;
              if (!diaActual || !l.origen || !l.destino) return;
              let b = dias.find((x) => x.dia === diaActual);
              if (!b) {
                b = { dia: diaActual, tramos: [], pernocta: null };
                dias.push(b);
              }
              b.tramos.push(`${l.origen}→${l.destino}`);
              if (l.pernocta) b.pernocta = l.destino;
            });
            if (dias.length <= 1) return null;
            return (
              <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-3 space-y-1.5">
                <p className="text-xs font-semibold">
                  Viaje de {dias.length} días
                </p>
                {dias.map((d, i) => (
                  <p key={d.dia} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Día {i + 1} · {d.dia.split("-").reverse().join("/")}:
                    </span>{" "}
                    {d.tramos.join(" · ")}
                    {d.pernocta && (
                      <span className="text-amber-600">
                        {" "}
                        · pernocta en {d.pernocta}
                      </span>
                    )}
                  </p>
                ))}
                <p className="text-[11px] text-muted-foreground">
                  Todo el viaje queda en UN solo vuelo (un folio, una
                  cotización). La pernocta se marca A MANO en el tramo donde
                  el piloto duerme fuera.
                </p>
                {dias.length > 1 && !legs.some((l) => l.pernocta) && (
                  /* Salto de día sin pernocta: aviso (27-ago) — el sistema
                     ya no la marca solo y olvidarla deja el viático fuera
                     de la cotización. */
                  <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    ⚠ El viaje cruza de día y ningún tramo tiene pernocta
                    marcada — márcala si el piloto dormirá fuera.
                  </p>
                )}
              </div>
            );
          })()}

          {/* 4. Piloto */}
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

          {/* Copiloto opcional (cuando van 2 pilotos, p. ej. Saab + Zamora) */}
          <Field
            label="Copiloto (opcional)"
            hint="Cuando el vuelo va con 2 pilotos. Ve todo el vuelo en su app igual que el piloto."
          >
            <SearchableSelect
              options={[
                { value: "", label: "Sin copiloto" },
                ...pilots
                  .filter((p) => p.id !== pilotoId)
                  .map((p) => ({
                    value: p.id,
                    label: p.es_piloto_externo ? `${p.nombre} · externo` : p.nombre,
                  })),
              ]}
              value={copilotoId}
              onChange={setCopilotoId}
              placeholder="Sin copiloto"
            />
          </Field>

          {/* 5. Cliente (responsable del vuelo) */}
          <Field label="Cliente (responsable del vuelo)" required>
            <SearchableSelect
              options={[...extraClients, ...clients.filter((c) => !extraClients.some((e) => e.id === c.id))].map(
                (c) => ({
                  value: c.id,
                  label: c.nombre,
                  description: c.rfc ?? undefined,
                }),
              )}
              value={clienteId}
              onChange={setClienteId}
              placeholder="Selecciona cliente"
              emptyText="Sin clientes activos"
            />
            <button
              type="button"
              onClick={() => setQuickClientOpen(true)}
              className="mt-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand-500/60 hover:text-brand-600"
            >
              + Nuevo cliente
            </button>
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

      <QuickClientDialog
        open={quickClientOpen}
        onOpenChange={setQuickClientOpen}
        onCreated={(client) => {
          const opt: ClientOption = {
            id: client.id,
            nombre: client.nombre,
            rfc: client.rfc,
          };
          setExtraClients((prev) => [...prev.filter((c) => c.id !== opt.id), opt]);
          // Auto-selecciona al cliente recién creado.
          setClienteId(opt.id);
          router.refresh();
        }}
      />

      {/* Candado de squawk ALTA del avión elegido: confirmar para crear el
          vuelo de todas formas (reintento con la bandera; avisa al mecánico). */}
      <SquawkAltaDialog
        lista={squawk?.lista ?? null}
        pending={pending}
        onCancel={() => setSquawk(null)}
        onConfirm={() => squawk && ejecutar(squawk.payload, true)}
      />
    </Sheet>
  );
}
