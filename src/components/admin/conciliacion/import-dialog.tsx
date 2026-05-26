"use client";

import { useState, useTransition } from "react";
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
  importarMovimientosAction,
  parseEstadoCuentaAction,
} from "@/app/admin/conciliacion/actions";
import type { ParsedStatement } from "@/types/conciliacion";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cuentas: { id: string; label: string }[];
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

export function ImportDialog({ open, onOpenChange, cuentas }: ImportDialogProps) {
  const [cuentaId, setCuentaId] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, startImport] = useTransition();
  const [parsed, setParsed] = useState<ParsedStatement | null>(null);

  const reset = () => {
    setCuentaId("");
    setParsed(null);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setParsing(true);
    try {
      const b64 = await readBase64(file);
      const res = await parseEstadoCuentaAction(file.name, b64);
      if (!res.ok || !res.data) {
        toast.error(res.error ?? "No se pudo leer el estado de cuenta");
        return;
      }
      setParsed(res.data);
      if (res.data.total === 0) {
        toast.warning(res.data.notas || "No se reconocieron movimientos");
      } else {
        toast.success(`${res.data.total} movimientos detectados (${res.data.formato})`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al leer el archivo");
    } finally {
      setParsing(false);
    }
  };

  const onImport = () => {
    if (!cuentaId) {
      toast.error("Selecciona la cuenta bancaria");
      return;
    }
    const movimientos = (parsed?.movimientos ?? [])
      .filter((m) => m.fecha)
      .map((m) => ({
        fecha: m.fecha!,
        descripcion: m.descripcion ?? undefined,
        monto: m.monto,
        tipo: m.tipo,
        referencia: m.referencia ?? undefined,
      }));
    if (movimientos.length === 0) {
      toast.error("No hay movimientos con fecha para importar");
      return;
    }
    startImport(async () => {
      const res = await importarMovimientosAction({ cuenta_bancaria_id: cuentaId, movimientos });
      if (res.ok && res.data) {
        toast.success(
          `Importados ${res.data.importados} · conciliados automáticamente ${res.data.conciliados_auto}`,
        );
        reset();
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "Error al importar");
      }
    });
  };

  const money = (n: number) => n.toLocaleString("es-MX", { minimumFractionDigits: 2 });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar estado de cuenta</DialogTitle>
          <DialogDescription>
            CSV o Excel (preferido) o PDF. Los cargos se cruzan automáticamente con los gastos del
            mismo monto y fecha.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Cuenta bancaria</Label>
            <SearchableSelect
              options={cuentas.map((c) => ({ value: c.id, label: c.label }))}
              value={cuentaId}
              onChange={setCuentaId}
              placeholder="Selecciona la cuenta"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Archivo (CSV / Excel / PDF)</Label>
            <Input
              type="file"
              accept=".csv,.xlsx,.xls,application/pdf"
              disabled={parsing}
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            {parsing && <p className="text-xs text-muted-foreground">Leyendo el estado de cuenta…</p>}
          </div>

          {parsed && parsed.movimientos.length > 0 && (
            <div className="rounded-lg border max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="text-left px-3 py-2">Fecha</th>
                    <th className="text-left px-3 py-2">Descripción</th>
                    <th className="text-left px-3 py-2">Tipo</th>
                    <th className="text-right px-3 py-2">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.movimientos.slice(0, 100).map((m, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-1.5 whitespace-nowrap">{m.fecha ?? "—"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[260px]">
                        {m.descripcion ?? "—"}
                      </td>
                      <td className="px-3 py-1.5">{m.tipo === "CARGO" ? "Cargo" : "Abono"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{money(m.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={onImport}
            disabled={importing || !parsed || parsed.total === 0}
          >
            {importing ? "Importando…" : "Importar y conciliar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
