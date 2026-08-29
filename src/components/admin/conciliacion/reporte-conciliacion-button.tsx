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

/** Mismas 4 pestañas de la página de conciliación. */
export type EstadoReporteConciliacion =
  | "todos"
  | "pendientes"
  | "conciliados"
  | "sin_banco";

const ESTADOS: { value: EstadoReporteConciliacion; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "pendientes", label: "Pendientes" },
  { value: "conciliados", label: "Conciliados" },
  { value: "sin_banco", label: "Gastos sin banco" },
];

/**
 * Reporte de conciliación en Excel: el estado de cuenta con la matrícula de
 * cada línea, su estatus (Conciliado/PENDIENTE), con qué se cruzó y los
 * montos sin conciliar en naranja. El filtro de estado replica las pestañas
 * de la página; "Gastos sin banco" exporta esa pestaña (no usa cuenta).
 */
export function ReporteConciliacionButton({
  cuentas,
  filtroActivo = "todos",
}: {
  cuentas: { id: string; label: string }[];
  /** Pestaña activa de la página: preselecciona el filtro del reporte. */
  filtroActivo?: EstadoReporteConciliacion;
}) {
  const [open, setOpen] = useState(false);
  const [cuentaId, setCuentaId] = useState("");
  const [estado, setEstado] = useState<EstadoReporteConciliacion>(filtroActivo);
  const [desde, setDesde] = useState(() => `${hoyCancun().slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(hoyCancun);
  const [loading, setLoading] = useState(false);

  const sinBanco = estado === "sin_banco";

  const abrir = () => {
    // Preselecciona la pestaña activa cada vez que se abre el diálogo.
    setEstado(filtroActivo);
    setOpen(true);
  };

  const descargar = async () => {
    if (!desde || !hasta) {
      toast.error("El rango de fechas es obligatorio");
      return;
    }
    if (desde > hasta) {
      toast.error("«Desde» no puede ser posterior a «Hasta»");
      return;
    }
    if (!sinBanco && !cuentaId) {
      toast.error("Selecciona la cuenta bancaria");
      return;
    }
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const params = new URLSearchParams({ desde, hasta, estado });
      // "Gastos sin banco" lista gastos, no movimientos de una cuenta.
      if (!sinBanco) params.set("cuenta_bancaria_id", cuentaId);
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
      const sufijoEstado =
        estado !== "todos" ? `-${estado.replace(/_/g, "-")}` : "";
      a.download = `conciliacion${sufijoEstado}-${desde}-a-${hasta}.xlsx`;
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
        onClick={abrir}
        title="Excel del estado de cuenta con la matrícula y el estatus de cada línea (Conciliado/PENDIENTE), con qué se cruzó y los montos sin conciliar en naranja."
      >
        <TableCellsIcon className="h-4 w-4" />
        Reporte (Excel)
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reporte de conciliación</DialogTitle>
            <DialogDescription>
              El estado de cuenta tal cual, con la matrícula de cada línea, su
              estatus (Conciliado o PENDIENTE), con qué gasto o cobro se cruzó
              y los montos sin conciliar en naranja.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="rep-conc-estado" className="text-sm font-medium">
                Qué incluir
              </label>
              <select
                id="rep-conc-estado"
                className={inputCls}
                value={estado}
                onChange={(e) =>
                  setEstado(e.target.value as EstadoReporteConciliacion)
                }
              >
                {ESTADOS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Cuenta bancaria</p>
              <SearchableSelect
                options={cuentas.map((c) => ({ value: c.id, label: c.label }))}
                value={cuentaId}
                onChange={setCuentaId}
                placeholder="Selecciona la cuenta"
                disabled={sinBanco}
              />
              {sinBanco && (
                <p className="text-xs text-muted-foreground">
                  «Gastos sin banco» lista gastos del sistema, no movimientos
                  de una cuenta: no necesita cuenta bancaria.
                </p>
              )}
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
                  required
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
                  required
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
