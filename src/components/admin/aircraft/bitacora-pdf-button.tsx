"use client";

import { useState } from "react";
import { PrinterIcon } from "@heroicons/react/24/outline";
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
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { env } from "@/lib/env";

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Día de HOY en hora Cancún (UTC−5 fijo) como YYYY-MM-DD. */
function hoyCancun(): string {
  return new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Imprime la tira de bitácora de tacómetros del avión (PDF, réplica de la
 * plantilla del equipo): una fila por vuelo con fecha, tacómetro inicial,
 * horas, tacómetro final y ruta — para recortar y pegar en la bitácora
 * física. En bimotor (formato Motor–Hélice) agrega los tiempos de hélice:
 * el del primer renglón lo teclea la oficina (el sistema aún no lleva horas
 * de vida de hélice) y el resto se deriva solo.
 */
export function BitacoraPdfButton({
  aircraftId,
  matricula,
  numMotores,
}: {
  aircraftId: string;
  matricula: string;
  numMotores: number;
}) {
  const [open, setOpen] = useState(false);
  const [desde, setDesde] = useState(() => `${hoyCancun().slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(hoyCancun);
  const [formato, setFormato] = useState<"PLANEADOR" | "MOTOR_HELICE">(
    numMotores > 1 ? "MOTOR_HELICE" : "PLANEADOR",
  );
  const [heliceBase, setHeliceBase] = useState("");
  const [loading, setLoading] = useState(false);

  const esBimotor = formato === "MOTOR_HELICE";

  const descargar = async () => {
    if (esBimotor && heliceBase.trim() !== "" && !Number.isFinite(Number(heliceBase))) {
      toast.error("El tiempo de hélice inicial no es un número válido");
      return;
    }
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const params = new URLSearchParams();
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
      if (esBimotor) {
        params.set("formato", "MOTOR_HELICE");
        if (heliceBase.trim() !== "") params.set("helice_base", heliceBase.trim());
      }
      const qs = params.size ? `?${params.toString()}` : "";
      const res = await fetch(
        `${env.API_URL}/v1/aircraft/${aircraftId}/bitacora.pdf${qs}`,
        {
          headers: session
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        },
      );
      if (!res.ok) {
        toast.error("No se pudo generar la bitácora");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `bitacora-${matricula}${desde ? `-${desde}` : ""}${hasta ? `-a-${hasta}` : ""}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setOpen(false);
    } catch {
      toast.error("No se pudo generar la bitácora");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="gap-2 shrink-0"
        onClick={() => setOpen(true)}
        title="PDF con una fila por vuelo (fecha, tacómetro inicial, horas, tacómetro final y ruta) para recortar y pegar en la bitácora física."
      >
        <PrinterIcon className="h-4 w-4" />
        Imprimir bitácora (PDF)
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bitácora de tacómetro · {matricula}</DialogTitle>
            <DialogDescription>
              Una fila por vuelo, lista para imprimir, recortar y pegar en el
              libro. Deja las fechas vacías para todo el histórico.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="bitacora-desde" className="text-sm font-medium">
                  Desde
                </label>
                <input
                  id="bitacora-desde"
                  type="date"
                  className={inputCls}
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="bitacora-hasta" className="text-sm font-medium">
                  Hasta
                </label>
                <input
                  id="bitacora-hasta"
                  type="date"
                  className={inputCls}
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                />
              </div>
            </div>

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Formato</legend>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="bitacora-formato"
                    checked={formato === "PLANEADOR"}
                    onChange={() => setFormato("PLANEADOR")}
                  />
                  Planeador (monomotor)
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="bitacora-formato"
                    checked={esBimotor}
                    onChange={() => setFormato("MOTOR_HELICE")}
                  />
                  Motor–Hélice (bimotor)
                </label>
              </div>
            </fieldset>

            {esBimotor && (
              <div className="space-y-1.5">
                <label htmlFor="bitacora-helice" className="text-sm font-medium">
                  Tiempo de hélice del primer renglón
                </label>
                <input
                  id="bitacora-helice"
                  inputMode="decimal"
                  className={inputCls}
                  value={heliceBase}
                  onChange={(e) => setHeliceBase(e.target.value)}
                  placeholder="Ej. 1395.2 (del libro)"
                />
                <p className="text-[11px] text-muted-foreground">
                  Cópialo del libro físico: es el tiempo de hélice que
                  corresponde al primer vuelo del rango. Los demás renglones se
                  calculan solos (avanzan igual que el tacómetro). Vacío = las
                  columnas de hélice salen con «—» para llenarlas a mano.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button onClick={descargar} disabled={loading} className="gap-2">
              <PrinterIcon className="h-4 w-4" />
              {loading ? "Generando…" : "Generar PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
