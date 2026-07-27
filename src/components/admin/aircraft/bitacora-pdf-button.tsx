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
 * Imprime la tira de bitácora de tacómetros del avión (PDF, formato
 * monomotor de la plantilla del equipo): una fila por vuelo con fecha,
 * tacómetro inicial, horas, tacómetro final y ruta — para recortar y pegar
 * en la bitácora física.
 */
export function BitacoraPdfButton({
  aircraftId,
  matricula,
}: {
  aircraftId: string;
  matricula: string;
}) {
  const [open, setOpen] = useState(false);
  const [desde, setDesde] = useState(() => `${hoyCancun().slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(hoyCancun);
  const [loading, setLoading] = useState(false);

  const descargar = async () => {
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const params = new URLSearchParams();
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
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
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Bitácora de tacómetro · {matricula}</DialogTitle>
            <DialogDescription>
              Una fila por vuelo (fecha, tacómetro inicial, horas, tacómetro
              final y ruta), lista para imprimir, recortar y pegar en el libro.
              Deja las fechas vacías para todo el histórico.
            </DialogDescription>
          </DialogHeader>
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
