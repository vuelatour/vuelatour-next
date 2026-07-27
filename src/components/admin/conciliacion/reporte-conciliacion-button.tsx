"use client";

import { useState } from "react";
import { TableCellsIcon } from "@heroicons/react/24/outline";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { env } from "@/lib/env";

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Día de HOY en hora Cancún (UTC−5 fijo) como YYYY-MM-DD. */
function hoyCancun(): string {
  return new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Reporte de conciliación en Excel: el estado de cuenta con columna de
 * estatus (Conciliado/PENDIENTE) y con qué se cruzó cada línea. Para
 * revisar/imprimir el cierre de la cuenta en el periodo.
 */
export function ReporteConciliacionButton({
  cuentas,
}: {
  cuentas: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [cuentaId, setCuentaId] = useState("");
  const [desde, setDesde] = useState(() => `${hoyCancun().slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(hoyCancun);
  const [loading, setLoading] = useState(false);

  const descargar = async () => {
    if (!cuentaId) {
      toast.error("Selecciona la cuenta bancaria");
      return;
    }
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const params = new URLSearchParams({ cuenta_bancaria_id: cuentaId });
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
      const res = await fetch(
        `${env.API_URL}/v1/conciliacion/reporte.xlsx?${params.toString()}`,
        {
          headers: session
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        },
      );
      if (!res.ok) {
        toast.error("No se pudo generar el reporte");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `conciliacion${desde ? `-${desde}` : ""}${hasta ? `-a-${hasta}` : ""}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setOpen(false);
    } catch {
      toast.error("No se pudo generar el reporte");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        className="gap-2"
        onClick={() => setOpen(true)}
        title="Excel del estado de cuenta con el estatus de cada línea (Conciliado/PENDIENTE) y con qué se cruzó. Listo para revisar e imprimir."
      >
        <TableCellsIcon className="h-4 w-4" />
        Reporte (Excel)
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reporte de conciliación</DialogTitle>
            <DialogDescription>
              El estado de cuenta tal cual, con una columna de estatus por
              línea (Conciliado o PENDIENTE) y con qué gasto o cobro se cruzó.
              Deja las fechas vacías para todo el histórico de la cuenta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Cuenta bancaria</p>
              <SearchableSelect
                options={cuentas.map((c) => ({ value: c.id, label: c.label }))}
                value={cuentaId}
                onChange={setCuentaId}
                placeholder="Selecciona la cuenta"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="rep-conc-desde" className="text-sm font-medium">
                  Desde
                </label>
                <input
                  id="rep-conc-desde"
                  type="date"
                  className={inputCls}
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="rep-conc-hasta" className="text-sm font-medium">
                  Hasta
                </label>
                <input
                  id="rep-conc-hasta"
                  type="date"
                  className={inputCls}
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                />
              </div>
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
              <TableCellsIcon className="h-4 w-4" />
              {loading ? "Generando…" : "Descargar Excel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
