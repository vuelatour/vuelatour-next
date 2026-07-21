"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpTrayIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fmtDateOnly } from "@/lib/datetime";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import {
  confirmCargaCombustiblesAction,
  previewCargaCombustiblesAction,
  type CargaCombustiblePreview,
  type CargaCombustibleResultado,
} from "@/app/admin/expenses/actions";

const LIMITE_MB = 5;
const PLANTILLA_PATH = "/v1/expenses/combustibles/plantilla.xlsx";
const PLANTILLA_FILENAME = "plantilla-combustibles.xlsx";

type Paso = "archivo" | "previa" | "resultado";

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

const fmtNum = (n: unknown, dec: number): string => {
  if (n == null || n === "" || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("es-MX", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
};

/**
 * Carga masiva de cargas de combustible desde la plantilla de Excel, en 3
 * pasos claros para la oficina: subir archivo → revisar la vista previa
 * (fila por fila, con errores y advertencias) → confirmar y ver el resultado.
 * Las filas con error NUNCA se cargan; la vista previa es la confirmación.
 */
export function FuelBulkUploadDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paso, setPaso] = useState<Paso>("archivo");
  const [analizando, setAnalizando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [filename, setFilename] = useState("");
  const [preview, setPreview] = useState<CargaCombustiblePreview | null>(null);
  const [resultado, setResultado] = useState<CargaCombustibleResultado | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPaso("archivo");
    setPreview(null);
    setResultado(null);
    setFilename("");
    setArrastrando(false);
  };

  const cerrar = () => {
    // Si ya se crearon cargas, la tabla de abajo debe reflejarlas al cerrar.
    if (resultado) router.refresh();
    reset();
    setOpen(false);
  };

  const onFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      toast.error("Solo se aceptan archivos .xlsx o .csv. Usa la plantilla de Excel.");
      return;
    }
    if (file.size > LIMITE_MB * 1024 * 1024) {
      toast.error(
        `El archivo pesa más de ${LIMITE_MB} MB. Quita hojas o imágenes extra, o divídelo en archivos más pequeños.`,
      );
      return;
    }
    setPreview(null);
    setAnalizando(true);
    try {
      const archivo_base64 = await readBase64(file);
      // .catch: un fallo de transporte (red, body sobre el límite) rechazaría
      // la promesa de la action sin aviso al usuario.
      const res = await previewCargaCombustiblesAction({
        archivo_base64,
        filename: file.name,
      }).catch((err: unknown) => ({
        ok: false as const,
        data: undefined,
        error: err instanceof Error ? err.message : "No se pudo enviar el archivo",
      }));
      if (!res.ok || !res.data) {
        toast.error(res.error ?? "No se pudo analizar el archivo");
        return;
      }
      if (res.data.resumen.total === 0) {
        toast.warning(
          "El archivo no tiene filas con datos. Llena la plantilla (una fila por carga) y vuelve a subirla.",
        );
        return;
      }
      setFilename(file.name);
      setPreview(res.data);
      setPaso("previa");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al leer el archivo");
    } finally {
      setAnalizando(false);
      // Permite volver a elegir el mismo archivo (p. ej. ya corregido).
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const confirmar = () => {
    if (!preview) return;
    const filasOk = preview.filas.filter((f) => f.ok).map((f) => f.datos);
    if (filasOk.length === 0) return;
    startTransition(async () => {
      const res = await confirmCargaCombustiblesAction(filasOk).catch((err: unknown) => ({
        ok: false as const,
        data: undefined,
        error: err instanceof Error ? err.message : "No se pudo enviar la carga",
      }));
      if (!res.ok || !res.data) {
        toast.error(res.error ?? "No se pudieron cargar las filas");
        return;
      }
      setResultado(res.data);
      setPaso("resultado");
      if (res.data.creados > 0) {
        toast.success(
          `Se cargaron ${res.data.creados} carga${res.data.creados === 1 ? "" : "s"} de combustible`,
        );
      } else {
        toast.error("No se pudo cargar ninguna fila");
      }
    });
  };

  const validas = preview?.resumen.validas ?? 0;

  const descripcionPaso: Record<Paso, string> = {
    archivo: "Paso 1 de 3 · Sube el archivo con las cargas.",
    previa: "Paso 2 de 3 · Revisa las filas antes de cargarlas.",
    resultado: "Paso 3 de 3 · Resultado de la carga.",
  };

  return (
    <>
      <Button className="gap-2" onClick={() => setOpen(true)}>
        <ArrowUpTrayIcon className="h-4 w-4" />
        Carga masiva
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (o) {
            setOpen(true);
            return;
          }
          // No cerrar a media operación (ESC/overlay): confundiría al operador.
          if (analizando || pending) return;
          cerrar();
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Carga masiva de combustibles</DialogTitle>
            <DialogDescription>{descripcionPaso[paso]}</DialogDescription>
          </DialogHeader>

          {paso === "archivo" && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Descarga la plantilla, llénala (una fila por carga) y súbela aquí.{" "}
                <ExcelExportButton
                  path={PLANTILLA_PATH}
                  filename={PLANTILLA_FILENAME}
                  label="Descargar la plantilla"
                  variant="link"
                  className="gap-1 px-0 h-auto align-baseline"
                />
              </div>

              <label
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors",
                  arrastrando
                    ? "border-brand-600 bg-brand-600/5"
                    : "border-border hover:bg-muted/50",
                  analizando && "pointer-events-none opacity-60",
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setArrastrando(true);
                }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setArrastrando(false);
                  onFile(e.dataTransfer.files?.[0]);
                }}
              >
                <ArrowUpTrayIcon className="h-8 w-8 text-muted-foreground" />
                {analizando ? (
                  <p className="text-sm font-medium">Analizando archivo…</p>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      Arrastra el archivo aquí o haz clic para elegirlo
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Excel (.xlsx) o CSV · máximo {LIMITE_MB} MB
                    </p>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.csv"
                  className="sr-only"
                  disabled={analizando}
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
              </label>
            </div>
          )}

          {paso === "previa" && preview && (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {filename && <span className="font-mono text-xs mr-2">{filename}</span>}
                  {preview.resumen.total} fila{preview.resumen.total === 1 ? "" : "s"}:{" "}
                  {preview.resumen.validas} lista{preview.resumen.validas === 1 ? "" : "s"} ·{" "}
                  <span className={cn(preview.resumen.con_error > 0 && "text-red-600")}>
                    {preview.resumen.con_error} con error
                  </span>{" "}
                  ·{" "}
                  <span className={cn(preview.resumen.con_advertencia > 0 && "text-amber-600")}>
                    {preview.resumen.con_advertencia} con advertencia
                  </span>
                </p>
                {preview.resumen.con_error > 0 && (
                  <p className="text-xs text-red-600">
                    Las filas con error NO se cargarán. Corrígelas en el archivo y vuelve a
                    subirlo, o carga solo las filas listas.
                  </p>
                )}
                {preview.resumen.con_advertencia > 0 && (
                  <p className="text-xs text-amber-600">
                    Las filas con advertencia sí se cargan; revisa el motivo antes de confirmar.
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-border max-h-80 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Matrícula</th>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2 text-right">Litros</th>
                      <th className="px-3 py-2 text-right">Monto</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.filas.map((f) => (
                      <tr key={f.fila} className="border-t border-border">
                        <td className="px-3 py-1.5 text-muted-foreground tabular-nums">
                          {f.fila}
                        </td>
                        <td className="px-3 py-1.5 font-mono whitespace-nowrap">
                          {f.datos.matricula || "—"}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          {fmtDateOnly(f.datos.fecha)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {fmtNum(f.datos.litros, 1)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                          {fmtNum(f.datos.monto, 2)}
                          {f.datos.moneda ? ` ${f.datos.moneda}` : ""}
                        </td>
                        <td className="px-3 py-1.5">
                          {!f.ok ? (
                            <Badge
                              variant="outline"
                              className="border-red-500/50 text-red-600 text-[10px]"
                            >
                              Error
                            </Badge>
                          ) : f.advertencias.length > 0 ? (
                            <Badge
                              variant="outline"
                              className="border-amber-500/50 text-amber-600 text-[10px]"
                            >
                              Advertencia
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/50 text-emerald-600 text-[10px]"
                            >
                              Lista
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-xs max-w-[320px]">
                          {f.errores.length > 0 && (
                            <p className="text-red-600">{f.errores.join("; ")}</p>
                          )}
                          {f.advertencias.length > 0 && (
                            <p className="text-amber-600">{f.advertencias.join("; ")}</p>
                          )}
                          {f.errores.length === 0 && f.advertencias.length === 0 && (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {paso === "resultado" && resultado && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2">
                <CheckCircleIcon
                  className={cn(
                    "h-6 w-6",
                    resultado.creados > 0 ? "text-emerald-600" : "text-muted-foreground",
                  )}
                />
                <p className="text-sm font-medium">
                  Se {resultado.creados === 1 ? "cargó" : "cargaron"} {resultado.creados} carga
                  {resultado.creados === 1 ? "" : "s"} de combustible.
                </p>
              </div>
              {resultado.errores.length > 0 && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-1">
                  <p className="text-xs font-medium text-red-600">
                    {resultado.errores.length} fila
                    {resultado.errores.length === 1 ? " no se pudo" : "s no se pudieron"} cargar:
                  </p>
                  <ul className="text-xs text-red-600 space-y-0.5">
                    {resultado.errores.map((e) => (
                      <li key={e.fila}>
                        Fila {e.fila}: {e.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {paso === "archivo" && (
              <Button variant="outline" onClick={cerrar} disabled={analizando}>
                Cancelar
              </Button>
            )}
            {paso === "previa" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPreview(null);
                    setFilename("");
                    setPaso("archivo");
                  }}
                  disabled={pending}
                >
                  Elegir otro archivo
                </Button>
                <Button onClick={confirmar} disabled={pending || validas === 0}>
                  {pending
                    ? "Cargando…"
                    : `Cargar ${validas} fila${validas === 1 ? "" : "s"}`}
                </Button>
              </>
            )}
            {paso === "resultado" && <Button onClick={cerrar}>Cerrar</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
