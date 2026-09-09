"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  importarMovimientosAsyncAction,
  importJobStatusAction,
  parseEstadoCuentaAction,
  type ImportJobStatus,
} from "@/app/admin/conciliacion/actions";
import type { MapeoColumnasPaywise, ParsedStatement } from "@/types/conciliacion";

/** Cuenta del selector; `tipo` PASARELA = Paywise (bruto/comisión/neto). */
export interface CuentaImportOption {
  id: string;
  label: string;
  tipo?: "BANCO" | "PASARELA" | null;
}

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cuentas: CuentaImportOption[];
}

/** Campos del mapeo manual de columnas Paywise, en el orden del formulario. */
const CAMPOS_MAPEO: { key: keyof MapeoColumnasPaywise; label: string; required?: boolean }[] = [
  { key: "fecha", label: "Fecha de la operación", required: true },
  { key: "bruto", label: "Monto bruto (lo que pagó el cliente)" },
  { key: "comision", label: "Comisión de Paywise" },
  { key: "neto", label: "Neto depositado" },
  { key: "referencia", label: "Referencia / ID de operación" },
  { key: "descripcion", label: "Descripción / concepto" },
  { key: "estatus", label: "Estatus (aprobada, rechazada…)" },
];

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

export function ImportDialog({ open, onOpenChange, cuentas }: ImportDialogProps) {
  const router = useRouter();
  const [cuentaId, setCuentaId] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedStatement | null>(null);
  // Archivo original (nombre + base64): al importar se manda también para que
  // el API lo archive y se pueda consultar/descargar después.
  const [archivo, setArchivo] = useState<{ filename: string; base64: string } | null>(null);
  // Job de importación en el SERVIDOR: aquí solo se consulta el avance. Si el
  // navegador se cierra a medias, la importación termina igual en el backend.
  const [job, setJob] = useState<ImportJobStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const importing = job != null && job.estado === "PROCESANDO";
  // Mapeo MANUAL de columnas Paywise (respaldo cuando la detección por
  // encabezados no reconoce el archivo): se ofrece si el archivo es tabular
  // (trae `columnas`) y NO se leyó como Paywise.
  const [mapeoAbierto, setMapeoAbierto] = useState(false);
  const [mapeo, setMapeo] = useState<Partial<MapeoColumnasPaywise>>({});
  const cuentaSel = cuentas.find((c) => c.id === cuentaId) ?? null;
  const esPasarela = cuentaSel?.tipo === "PASARELA";
  const esPaywise = parsed?.formato === "paywise";
  const columnas = parsed?.columnas ?? [];
  const puedeMapear = !!parsed && !esPaywise && columnas.length > 0;

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };
  useEffect(() => stopPolling, []);

  const reset = () => {
    setCuentaId("");
    setParsed(null);
    setArchivo(null);
    setJob(null);
    setMapeoAbierto(false);
    setMapeo({});
    stopPolling();
  };

  /** Etiqueta del formato para el toast/preview. */
  const formatoTexto = (f: string) => (f === "paywise" ? "Paywise" : f);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    // Limpia el intento anterior: si este parse falla, no debe quedar el
    // archivo viejo precargado con el nombre del nuevo en pantalla.
    setParsed(null);
    setArchivo(null);
    setMapeoAbierto(false);
    setMapeo({});
    setParsing(true);
    try {
      const b64 = await readBase64(file);
      const res = await parseEstadoCuentaAction(file.name, b64);
      if (!res.ok || !res.data) {
        toast.error(res.error ?? "No se pudo leer el estado de cuenta");
        return;
      }
      setParsed(res.data);
      setArchivo({ filename: file.name, base64: b64 });
      if (res.data.total === 0) {
        toast.warning(res.data.notas || "No se reconocieron movimientos");
      } else {
        toast.success(
          `${res.data.total} movimientos detectados (${formatoTexto(res.data.formato)})`,
        );
      }
      // Cuenta Paywise pero el archivo se leyó como banco genérico: abre el
      // mapeo manual de una vez (el operador solo señala las columnas).
      if (esPasarela && res.data.formato !== "paywise" && (res.data.columnas?.length ?? 0) > 0) {
        setMapeoAbierto(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al leer el archivo");
    } finally {
      setParsing(false);
    }
  };

  /** Vuelve a leer el archivo forzando el parser Paywise con el mapeo. */
  const releerConMapeo = async () => {
    if (!archivo) return;
    if (!mapeo.fecha) {
      toast.error("Señala la columna de fecha");
      return;
    }
    if (!mapeo.bruto && !mapeo.neto) {
      toast.error("Señala la columna del monto bruto o la del neto depositado");
      return;
    }
    const limpio: MapeoColumnasPaywise = { fecha: mapeo.fecha };
    for (const c of CAMPOS_MAPEO) {
      if (c.key === "fecha") continue;
      const v = mapeo[c.key];
      if (v) limpio[c.key] = v;
    }
    setParsing(true);
    try {
      const res = await parseEstadoCuentaAction(archivo.filename, archivo.base64, limpio);
      if (!res.ok || !res.data) {
        toast.error(res.error ?? "No se pudo leer el archivo con ese mapeo");
        return;
      }
      setParsed(res.data);
      if (res.data.total === 0) {
        toast.warning(res.data.notas || "No se reconocieron operaciones con ese mapeo");
      } else {
        toast.success(`${res.data.total} operaciones de Paywise detectadas`);
        setMapeoAbierto(false);
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
        // Paywise: bruto y comisión del movimiento (el API los guarda y la
        // auditoría los coteja contra el cobro).
        monto_bruto: m.monto_bruto != null && m.monto_bruto > 0 ? m.monto_bruto : undefined,
        comision_monto: m.comision != null && m.comision >= 0 ? m.comision : undefined,
      }));
    if (movimientos.length === 0) {
      toast.error("No hay movimientos con fecha para importar");
      return;
    }
    void (async () => {
      // La action captura errores del API, pero un fallo de transporte (red,
      // body sobre el límite) rechazaría la promesa sin aviso al usuario.
      const res = await importarMovimientosAsyncAction({
        cuenta_bancaria_id: cuentaId,
        movimientos,
        // Archivo original: queda archivado para consultarlo después.
        filename: archivo?.filename,
        file_base64: archivo?.base64,
      }).catch((err: unknown) => ({
        ok: false as const,
        data: undefined,
        error: err instanceof Error ? err.message : "No se pudo enviar la importación",
      }));
      if (!res.ok || !res.data) {
        toast.error(res.error ?? "Error al importar");
        return;
      }
      const jobId = res.data.job_id;
      setJob({
        id: jobId,
        estado: "PROCESANDO",
        progreso: 0,
        paso: "Preparando importación…",
        total_movimientos: movimientos.length,
        importados: null,
        conciliados_auto: null,
        duplicados_omitidos: null,
        error: null,
      });
      // Polling del avance: el trabajo corre en el servidor.
      pollRef.current = setInterval(async () => {
        const st = await importJobStatusAction(jobId);
        if (!st.ok || !st.data) return; // reintenta en el siguiente tick
        setJob(st.data);
        if (st.data.estado === "PROCESANDO") return;
        stopPolling();
        if (st.data.estado === "ERROR") {
          toast.error(st.data.error ?? "Error al importar");
          return;
        }
        const dups = st.data.duplicados_omitidos ?? 0;
        if ((st.data.importados ?? 0) === 0 && dups > 0) {
          // Re-importación del mismo estado de cuenta: nada nuevo, sin duplicar.
          toast.info(
            `Los ${dups} movimientos ya estaban importados: no se duplicó nada. El archivo quedó archivado.`,
            { duration: 8000 },
          );
        } else {
          toast.success(
            `Importados ${st.data.importados ?? 0} · conciliados automáticamente ${st.data.conciliados_auto ?? 0}` +
              (dups > 0 ? ` · ${dups} ya existían (omitidos)` : ""),
          );
        }
        reset();
        onOpenChange(false);
        router.refresh();
      }, 1200);
    })();
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
            mismo monto y fecha; los abonos con los cobros. En la cuenta Paywise se leen bruto,
            comisión y neto por operación.
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
            {esPasarela && (
              <p className="text-xs text-muted-foreground">
                Cuenta Paywise: sube el reporte de operaciones exportado de Paywise (CSV/Excel).
                Se lee bruto, comisión y neto por operación y los abonos se cruzan con los cobros
                registrados con método Paywise (±5 días). Después, en «Auditoría Paywise» ves qué
                coincide y qué no.
              </p>
            )}
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

          {/* Barra de progreso del job (corre en el servidor: cerrar esta
              ventana o el navegador NO corta la importación). */}
          {job && (
            <div className="space-y-1.5 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {job.estado === "ERROR"
                    ? "La importación falló"
                    : job.estado === "LISTO"
                      ? "Importación terminada"
                      : (job.paso ?? "Importando…")}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {job.progreso}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    job.estado === "ERROR" ? "bg-destructive" : "bg-brand-600"
                  }`}
                  style={{ width: `${Math.max(2, job.progreso)}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                La importación corre en el servidor: puedes cerrar esta ventana
                y terminará igual.
              </p>
            </div>
          )}

          {/* Archivo leído como banco genérico en una cuenta Paywise (o el
              operador quiere forzarlo): mapeo manual de columnas. */}
          {puedeMapear && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {esPasarela
                    ? "No se reconocieron las columnas de Paywise (bruto / comisión / neto)."
                    : "Este archivo se leyó como estado de cuenta de banco."}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setMapeoAbierto((v) => !v)}
                  disabled={parsing || importing}
                >
                  {mapeoAbierto ? "Ocultar mapeo" : "Leer como Paywise (mapear columnas)"}
                </Button>
              </div>
              {parsed?.notas && <p className="text-muted-foreground">{parsed.notas}</p>}
              {mapeoAbierto && (
                <div className="space-y-2 pt-1">
                  <p className="text-muted-foreground">
                    Señala qué columna del archivo es cada dato (encabezados detectados:{" "}
                    {columnas.length}). Fecha y bruto o neto son obligatorios; si falta el neto se
                    calcula bruto − comisión.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {CAMPOS_MAPEO.map((c) => (
                      <div key={c.key} className="space-y-1">
                        <Label className="text-xs font-medium">
                          {c.label}
                          {c.required && <span className="text-destructive ml-0.5">*</span>}
                        </Label>
                        <SearchableSelect
                          options={[
                            { value: "", label: "— sin columna —" },
                            ...columnas.map((col) => ({ value: col, label: col })),
                          ]}
                          value={mapeo[c.key] ?? ""}
                          onChange={(v) => setMapeo((prev) => ({ ...prev, [c.key]: v || undefined }))}
                          placeholder="Columna"
                          searchPlaceholder="Buscar columna…"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      onClick={releerConMapeo}
                      disabled={parsing || importing}
                    >
                      {parsing ? "Leyendo…" : "Leer con este mapeo"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {parsed && parsed.movimientos.length > 0 && (
            <div className="rounded-lg border max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="text-left px-3 py-2">Fecha</th>
                    <th className="text-left px-3 py-2">Descripción</th>
                    <th className="text-left px-3 py-2">Tipo</th>
                    {esPaywise && <th className="text-right px-3 py-2">Bruto</th>}
                    {esPaywise && <th className="text-right px-3 py-2">Comisión</th>}
                    <th className="text-right px-3 py-2">{esPaywise ? "Neto" : "Monto"}</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.movimientos.slice(0, 100).map((m, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-1.5 whitespace-nowrap">{m.fecha ?? "—"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[260px]">
                        {[m.referencia, m.descripcion].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-3 py-1.5">{m.tipo === "CARGO" ? "Cargo" : "Abono"}</td>
                      {esPaywise && (
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {m.monto_bruto != null ? money(m.monto_bruto) : "—"}
                        </td>
                      )}
                      {esPaywise && (
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                          {m.comision != null ? money(m.comision) : "—"}
                        </td>
                      )}
                      <td className="px-3 py-1.5 text-right tabular-nums">{money(m.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              // Mismo comportamiento que ESC/overlay: cancelar descarta el
              // archivo parseado (no debe quedar precargado al reabrir).
              reset();
              onOpenChange(false);
            }}
            disabled={importing}
          >
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
