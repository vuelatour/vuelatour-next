"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MonedaSelect } from "@/components/admin/quotes/moneda-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  cubrirExternoAction,
  revertirExternoAction,
} from "@/app/admin/flights/actions";
import type { FlightListItem } from "@/types/flights";

interface AircraftOption {
  id: string;
  matricula: string;
  modelo: string;
}

interface CubrirExternoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flight: FlightListItem;
  /** Aviones propios ACTIVOS: al regresar a vuelo propio un externo SIN
      avión de referencia (p. ej. #214) hay que elegir cuál lo volará. */
  aircraft: AircraftOption[];
}

/**
 * Cubre el vuelo con un operador EXTERNO (Itzy): suelta avión, piloto y
 * tacómetros — la cotización del cliente no cambia; solo se registra quién lo
 * vuela y cuánto nos cobra ese apoyo. Sobre un vuelo ya externo, edita
 * operador/costo.
 */
export function CubrirExternoDialog({
  open,
  onOpenChange,
  flight,
  aircraft,
}: CubrirExternoDialogProps) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const yaExterno = flight.es_externo;
  const [operador, setOperador] = useState(flight.operador_externo ?? "");
  // Ficha del avión AJENO, prellenada para editarla en su lugar. Semántica
  // del API: '' explícito = BORRAR la ficha; clave omitida = conservar.
  const [modelo, setModelo] = useState(flight.avion_externo_modelo ?? "");
  const [matricula, setMatricula] = useState(
    flight.avion_externo_matricula ?? "",
  );
  // Costo NATIVO del operador (29-ago: puede ser MXN). Filas del API previo
  // solo traen el USD derivado: se cae a él con moneda USD.
  const [costo, setCosto] = useState(() => {
    const nativo = Number(flight.costo_externo_monto);
    if (nativo > 0) return String(flight.costo_externo_monto);
    return Number(flight.costo_externo_usd) > 0
      ? String(flight.costo_externo_usd)
      : "";
  });
  const [moneda, setMoneda] = useState<"USD" | "MXN">(
    flight.costo_externo_moneda === "MXN" ? "MXN" : "USD",
  );
  // TC pactado: con costo en MXN es OBLIGATORIO (deriva el USD del costo);
  // además, sin él un vuelo cotizado en USD no se puede facturar.
  const [tc, setTc] = useState(
    Number(flight.costo_externo_tc) > 0 ? String(flight.costo_externo_tc) : "",
  );
  const costoMxnSinTc =
    moneda === "MXN" && Number(costo) > 0 && !(Number(tc) > 0);
  // Regreso a vuelo propio: paso de confirmación inline (acción significativa).
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [reverting, startRevert] = useTransition();
  // Externo SIN avión de referencia: el API exige elegir el avión propio que
  // volará el vuelo (con referencia, ese avión se conserva).
  const necesitaAvion = yaExterno && !flight.aeronave_id;
  const [aeronaveRevert, setAeronaveRevert] = useState("");
  const aircraftOptions = aircraft.map((a) => ({
    value: a.id,
    label: `${a.matricula} — ${a.modelo}`,
  }));

  const handleRevert = () => {
    if (necesitaAvion && !aeronaveRevert) {
      toast.error("Elige el avión propio que volará este vuelo");
      return;
    }
    startRevert(async () => {
      const res = await revertirExternoAction(
        flight.id,
        necesitaAvion ? { aeronave_id: aeronaveRevert } : undefined,
      );
      if (res.ok) {
        const avionId = necesitaAvion ? aeronaveRevert : flight.aeronave_id;
        const matriculaPropia =
          aircraft.find((a) => a.id === avionId)?.matricula ?? null;
        toast.success(
          matriculaPropia
            ? `Vuelo #${flight.folio} regresó a vuelo propio con ${matriculaPropia}; asigna piloto`
            : `Vuelo #${flight.folio} regresó a vuelo propio: asigna avión y piloto.`,
        );
        setConfirmRevert(false);
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo regresar a vuelo propio");
      }
    });
  };

  const handleSave = () => {
    if (operador.trim().length < 2) {
      toast.error("Indica el nombre del operador externo");
      return;
    }
    // Invariante de dinero: un costo MXN sin TC no puede derivar su USD — se
    // rechaza en captura (el API respondería 400), nunca se persiste a medias.
    if (costoMxnSinTc) {
      toast.error(
        "El costo va en MXN: captura el tipo de cambio para derivar el USD.",
      );
      return;
    }
    startSaving(async () => {
      const res = await cubrirExternoAction(flight.id, {
        operador_externo: operador.trim(),
        costo_externo_monto: Math.max(0, Number(costo) || 0),
        costo_externo_moneda: moneda,
        tc_usd_mxn: Number(tc) > 0 ? Number(tc) : undefined,
        // Campo vaciado = '' explícito = BORRAR la ficha; el mínimo de 2
        // caracteres del DTO solo aplica a valores no vacíos (1 char se
        // omite: conserva la actual).
        avion_externo_modelo:
          modelo.trim().length >= 2
            ? modelo.trim()
            : modelo.trim() === ""
              ? ""
              : undefined,
        avion_externo_matricula:
          matricula.trim().length >= 2
            ? matricula.trim()
            : matricula.trim() === ""
              ? ""
              : undefined,
      });
      if (res.ok) {
        toast.success(
          yaExterno
            ? "Datos del operador externo actualizados"
            : `Vuelo #${flight.folio} cubierto con ${operador.trim()}`,
        );
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo cubrir con externo");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PaperAirplaneIcon className="h-5 w-5 text-amber-600" />
            {yaExterno
              ? "Editar operador externo"
              : `Cubrir vuelo #${flight.folio} con externo`}
          </DialogTitle>
          <DialogDescription>
            {yaExterno
              ? "Actualiza quién vuela y cuánto nos cobra ese apoyo."
              : "Otro operador vuela por nosotros: se sueltan avión, piloto y tacómetros. La cotización del cliente NO cambia — si el precio al cliente cambia por el operador, revisa después la cotización y captura ahí el precio pactado."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Operador externo <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="Ej. Aerocharter del Caribe"
              value={operador}
              onChange={(e) => setOperador(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Modelo del avión (opcional)
              </Label>
              <Input
                placeholder="HAWKER 400 A"
                maxLength={80}
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Matrícula (opcional)</Label>
              <Input
                placeholder="XA-REG"
                maxLength={20}
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
              />
            </div>
            <p className="col-span-2 -mt-1 text-xs text-muted-foreground">
              Ficha del avión ajeno: sale en el PDF y en el detalle del vuelo.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Lo que cobra el operador externo (costo)
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.01"
                min={0}
                placeholder="0.00"
                value={costo}
                onChange={(e) => setCosto(e.target.value)}
              />
              <MonedaSelect value={moneda} onChange={setMoneda} />
            </div>
            <p className="text-xs text-muted-foreground">
              Lo que nos cobra el operador por cubrir el vuelo, en su moneda
              (costo interno; no aparece al cliente).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Tipo de cambio (MXN por USD)
              {moneda === "MXN" && Number(costo) > 0 && (
                <span className="text-destructive"> *</span>
              )}
            </Label>
            <Input
              type="number"
              step="0.0001"
              min={0}
              placeholder="Ej. 18.50"
              value={tc}
              onChange={(e) => setTc(e.target.value)}
            />
            {moneda === "MXN" && Number(costo) > 0 ? (
              <p
                className={
                  costoMxnSinTc
                    ? "text-xs font-medium text-amber-600 dark:text-amber-400"
                    : "text-xs text-muted-foreground"
                }
              >
                Obligatorio con costo en MXN: con este TC se deriva el USD del
                costo (los reportes comparan todo en dólares).
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Opcional: sin TC el vuelo no se puede facturar (el CFDI se
                emite en MXN); también se puede capturar al emitir la factura.
              </p>
            )}
          </div>
          {!yaExterno && (flight.aeronave_id || flight.piloto_id) && (
            <p className="text-xs text-amber-600">
              El avión y el piloto asignados quedarán libres; el estado del
              vuelo pasará a marcarse a mano (Iniciar / Cerrar).
            </p>
          )}
          {yaExterno && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-sm font-medium">
                ¿Al final sí sale con avión de la casa?
              </p>
              {confirmRevert ? (
                <div className="space-y-2">
                  <p className="text-xs text-amber-600">
                    Se quita al operador {flight.operador_externo ?? "externo"} y
                    su costo; el vuelo queda listo para asignar{" "}
                    {necesitaAvion ? "avión y piloto propios" : "piloto propio"}{" "}
                    (tacómetros y gastos vuelven a aplicar). La cotización del
                    cliente no cambia.
                  </p>
                  {necesitaAvion && (
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">
                        Avión propio que volará el vuelo{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <SearchableSelect
                        options={aircraftOptions}
                        value={aeronaveRevert}
                        onChange={setAeronaveRevert}
                        placeholder="Selecciona aeronave"
                        emptyText="Sin aviones activos"
                        disabled={reverting}
                      />
                      <p className="text-xs text-muted-foreground">
                        Este vuelo externo no tenía avión de referencia: la
                        cotización se queda igual; el avión solo define quién
                        opera y captura tacómetros.
                      </p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmRevert(false)}
                      disabled={reverting}
                    >
                      No, sigue cubierto
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleRevert}
                      disabled={reverting || (necesitaAvion && !aeronaveRevert)}
                      className="bg-emerald-600 hover:bg-emerald-600/90 text-white"
                    >
                      {reverting ? "Regresando…" : "Sí, regresar a vuelo propio"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmRevert(true)}
                  disabled={saving || reverting}
                >
                  Regresar a vuelo propio
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Volver
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || operador.trim().length < 2}
            className="bg-amber-600 hover:bg-amber-600/90 text-white"
          >
            {saving
              ? "Guardando…"
              : yaExterno
                ? "Guardar cambios"
                : "Cubrir con externo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
