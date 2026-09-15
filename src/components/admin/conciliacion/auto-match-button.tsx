"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  autoMatchAction,
  importJobStatusAction,
  type ActionResult,
  type ImportJobStatus,
} from "@/app/admin/conciliacion/actions";
import {
  diaMas,
  resumenAutoMatch,
  type ResumenAutoMatch,
} from "@/lib/admin/conciliacion-auto";
import { todayCancun } from "@/lib/datetime";
import type { AutoMatchResultado } from "@/types/conciliacion";

/** Días hacia atrás por default cuando la vista no trae rango. */
const DIAS_DEFAULT = 30;

export interface CuentaOption {
  id: string;
  label: string;
}

interface AutoMatchButtonProps {
  cuentas: CuentaOption[];
  /** Filtros de la vista (se prellenan; el operador los puede cambiar). */
  cuentaId?: string;
  desde?: string;
  hasta?: string;
}

/**
 * «Cruzar pendientes» (15-sep-2026).
 *
 * Pedido del cliente: «no se están conciliando los gastos, salen como
 * pendiente». El cruce automático SOLO corría dentro de la importación: si
 * falló (o el gasto se capturó después del estado de cuenta), esos
 * movimientos quedaban pendientes para siempre porque re-importar el archivo
 * responde «duplicados» y no reintenta nada.
 *
 * Este botón vuelve a correr el MISMO cruce del API sobre los pendientes del
 * rango y canta el resultado POR RESULTADO (conciliados, ambiguos, sin
 * candidato, con error). Nunca liga lo ambiguo: eso se vincula a mano o con
 * la sugerencia de la IA.
 */
export function AutoMatchButton({ cuentas, cuentaId, desde, hasta }: AutoMatchButtonProps) {
  const router = useRouter();
  const hoy = todayCancun();
  const [open, setOpen] = useState(false);
  const [cuenta, setCuenta] = useState(cuentaId ?? "");
  const [ini, setIni] = useState(desde ?? diaMas(hoy, -DIAS_DEFAULT));
  const [fin, setFin] = useState(hasta ?? hoy);
  const [corriendo, setCorriendo] = useState(false);
  const [paso, setPaso] = useState<string | null>(null);
  const [resumen, setResumen] = useState<ResumenAutoMatch | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };
  useEffect(() => stopPolling, []);

  const abrir = () => {
    setResumen(null);
    setPaso(null);
    setCuenta(cuentaId ?? "");
    setIni(desde ?? diaMas(hoy, -DIAS_DEFAULT));
    setFin(hasta ?? hoy);
    setOpen(true);
  };

  /** Pinta el resultado (venga del POST o del job) y refresca la bandeja. */
  const terminar = (r: AutoMatchResultado | ImportJobStatus) => {
    // El job de re-cruce reusa la tabla de la importación: sus conteos se
    // llaman distinto (`conciliados_auto`, `total_movimientos`).
    const esJob = "estado" in r;
    const res = resumenAutoMatch(
      esJob
        ? {
            revisados: (r as ImportJobStatus).total_movimientos,
            conciliados: (r as ImportJobStatus).conciliados_auto ?? 0,
            ambiguos: (r as ImportJobStatus).ambiguos ?? 0,
            sin_candidato: (r as ImportJobStatus).sin_candidato ?? 0,
            traspasos: (r as ImportJobStatus).traspasos ?? 0,
            rechazados: (r as ImportJobStatus).rechazados ?? 0,
            errores: (r as ImportJobStatus).errores ?? 0,
            por_criterio: (r as ImportJobStatus).por_criterio ?? null,
          }
        : (r as AutoMatchResultado),
    );
    setResumen(res);
    setCorriendo(false);
    setPaso(null);
    if (res.conciliados > 0) {
      toast.success(res.titulo, res.descripcion ? { description: res.descripcion } : undefined);
    } else {
      toast.info(res.titulo, res.descripcion ? { description: res.descripcion } : undefined);
    }
    router.refresh();
  };

  const correr = () => {
    if (ini && fin && ini > fin) {
      toast.error("La fecha «desde» no puede ser posterior a «hasta»");
      return;
    }
    setCorriendo(true);
    setResumen(null);
    setPaso("Revisando los movimientos pendientes…");
    void (async () => {
      // La action captura los errores del API; un fallo de TRANSPORTE (red,
      // función de Vercel cortada) rechazaría la promesa sin avisar.
      const r: ActionResult<AutoMatchResultado> = await autoMatchAction({
        ...(cuenta ? { cuenta_bancaria_id: cuenta } : {}),
        ...(ini ? { desde: ini } : {}),
        ...(fin ? { hasta: fin } : {}),
      }).catch((err: unknown) => ({
        ok: false,
        error: err instanceof Error ? err.message : "No se pudo cruzar",
      }));
      if (!r.ok || !r.data) {
        setCorriendo(false);
        setPaso(null);
        // 404 = API sin desplegar: se dice tal cual, sin inventar que corrió.
        toast.error(r.error ?? "No se pudo volver a cruzar los pendientes", {
          description:
            r.status === 404
              ? "El servidor todavía no tiene «Cruzar pendientes» (falta desplegar el API)."
              : undefined,
        });
        return;
      }
      // El API puede responder de una o correrlo como JOB (mismo job de la
      // importación): si mandó job_id, se consulta el avance.
      const jobId = r.data.job_id;
      if (!jobId) {
        terminar(r.data);
        return;
      }
      pollRef.current = setInterval(async () => {
        const st = await importJobStatusAction(jobId);
        if (!st.ok || !st.data) return; // reintenta en el siguiente tick
        setPaso(st.data.paso ?? "Cruzando…");
        if (st.data.estado === "PROCESANDO") return;
        stopPolling();
        if (st.data.estado === "ERROR") {
          setCorriendo(false);
          setPaso(null);
          toast.error(st.data.error ?? "El cruce se interrumpió", {
            description: "Lo que sí se cruzó quedó guardado: puedes volver a intentarlo.",
          });
          router.refresh();
          return;
        }
        terminar(st.data);
      }, 1200);
    })();
  };

  const opcionesCuenta = [
    { value: "", label: "Todas las cuentas" },
    ...cuentas.map((c) => ({ value: c.id, label: c.label })),
  ];

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={abrir}>
        <ArrowPathIcon className="h-4 w-4" />
        Cruzar pendientes
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o && corriendo) return; // no cerrar a media corrida
          if (!o) {
            stopPolling();
            setResumen(null);
          }
          setOpen(o);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Volver a cruzar los pendientes</DialogTitle>
            <DialogDescription>
              Vuelve a intentar el cruce automático de los movimientos que siguen
              pendientes en el rango: por monto y fecha, terminación de tarjeta y
              descripción del banco. Lo que tenga más de un candidato NO se liga
              solo: se queda para vincular a mano.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Cuenta</Label>
              <SearchableSelect
                options={opcionesCuenta}
                value={cuenta}
                onChange={setCuenta}
                placeholder="Todas las cuentas"
                disabled={corriendo}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="auto-match-desde" className="text-sm font-medium">
                  Desde
                </Label>
                <Input
                  id="auto-match-desde"
                  type="date"
                  value={ini}
                  onChange={(e) => setIni(e.target.value)}
                  disabled={corriendo}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="auto-match-hasta" className="text-sm font-medium">
                  Hasta
                </Label>
                <Input
                  id="auto-match-hasta"
                  type="date"
                  value={fin}
                  onChange={(e) => setFin(e.target.value)}
                  disabled={corriendo}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Fechas del movimiento en el banco (día de pared, hora de Cancún).
            </p>

            {corriendo && (
              <p className="text-sm text-muted-foreground">{paso ?? "Cruzando…"}</p>
            )}

            {resumen && (
              <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1">
                <p className="text-sm font-medium">{resumen.titulo}</p>
                {resumen.lineas.length > 0 && (
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {resumen.lineas.map((l) => (
                      <li key={l}>· {l}</li>
                    ))}
                  </ul>
                )}
                {resumen.hayErrores && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Los movimientos con error no detuvieron el resto: vuelve a
                    intentarlo o vincúlalos a mano.
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Los que siguen pendientes dicen por qué en la columna
                  «Conciliación» (sin candidato, ambiguo entre N…).
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={corriendo}>
              {resumen ? "Cerrar" : "Cancelar"}
            </Button>
            <Button onClick={correr} disabled={corriendo}>
              {corriendo ? "Cruzando…" : resumen ? "Volver a cruzar" : "Cruzar pendientes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
