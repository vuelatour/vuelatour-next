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
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import { importarItemsAction } from "@/app/admin/inventory/actions";
import type { ImportarItemEstado, ImportarItemsFila, ImportarItemsResultado } from "@/types/inventory";

const LIMITE_MB = 5;
const PLANTILLA_PATH = "/v1/inventory/items/plantilla.xlsx";
const PLANTILLA_FILENAME = "plantilla-inventario.xlsx";

type Paso = "archivo" | "previa" | "resultado";

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

const num = (n: unknown) =>
  n == null || n === "" || Number.isNaN(Number(n))
    ? "—"
    : Number(n).toLocaleString("es-MX", { maximumFractionDigits: 3 });

const ESTADO_STYLE: Record<ImportarItemEstado, { label: string; cls: string }> = {
  OK: { label: "Lista", cls: "border-emerald-500/50 text-emerald-600" },
  ERROR: { label: "Error", cls: "border-red-500/50 text-red-600" },
  DUPLICADO: { label: "Ya existe", cls: "border-amber-500/50 text-amber-600" },
};

function conteos(filas: ImportarItemsFila[]) {
  return {
    total: filas.length,
    ok: filas.filter((f) => f.estado === "OK").length,
    error: filas.filter((f) => f.estado === "ERROR").length,
    duplicado: filas.filter((f) => f.estado === "DUPLICADO").length,
  };
}

/**
 * Alta masiva de ítems de inventario desde la plantilla de Excel, en 3 pasos:
 * subir archivo → vista previa fila por fila (solo valida, no escribe) →
 * «Importar N» crea SOLO las filas listas (ítem + empaque + entrada inicial).
 * El API es idempotente: reintentar el mismo archivo marca «Ya existe» en
 * vez de duplicar.
 */
export function ItemBulkUploadDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paso, setPaso] = useState<Paso>("archivo");
  const [analizando, setAnalizando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [archivo, setArchivo] = useState<{ base64: string; filename: string } | null>(null);
  const [preview, setPreview] = useState<ImportarItemsResultado | null>(null);
  const [resultado, setResultado] = useState<ImportarItemsResultado | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPaso("archivo");
    setPreview(null);
    setResultado(null);
    setArchivo(null);
    setArrastrando(false);
  };

  const cerrar = () => {
    // Si ya se crearon ítems, la tabla debe reflejarlos al cerrar.
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
      const res = await importarItemsAction({
        archivo_base64,
        filename: file.name,
        confirmar: false,
      }).catch((err: unknown) => ({
        ok: false as const,
        data: undefined,
        error: err instanceof Error ? err.message : "No se pudo enviar el archivo",
      }));
      if (!res.ok || !res.data) {
        toast.error(res.error ?? "No se pudo analizar el archivo");
        return;
      }
      if (res.data.total === 0 || res.data.filas.length === 0) {
        toast.warning(
          "El archivo no tiene filas con datos. Llena la plantilla (una fila por producto) y vuelve a subirla.",
        );
        return;
      }
      setArchivo({ base64: archivo_base64, filename: file.name });
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
    if (!preview || !archivo) return;
    const c = conteos(preview.filas);
    if (c.ok === 0) return;
    startTransition(async () => {
      const res = await importarItemsAction({
        archivo_base64: archivo.base64,
        filename: archivo.filename,
        confirmar: true,
      }).catch((err: unknown) => ({
        ok: false as const,
        data: undefined,
        error: err instanceof Error ? err.message : "No se pudo enviar la importación",
      }));
      if (!res.ok || !res.data) {
        toast.error(res.error ?? "No se pudieron importar las filas");
        return;
      }
      setResultado(res.data);
      setPaso("resultado");
      const creados = res.data.creados ?? conteos(res.data.filas).ok;
      if (creados > 0) {
        toast.success(`Se dieron de alta ${creados} ${creados === 1 ? "ítem" : "ítems"}`);
      } else {
        toast.error("No se pudo dar de alta ninguna fila");
      }
    });
  };

  const c = preview ? conteos(preview.filas) : null;

  const descripcionPaso: Record<Paso, string> = {
    archivo: "Paso 1 de 3 · Descarga la plantilla, llénala y súbela.",
    previa: "Paso 2 de 3 · Revisa las filas antes de darlas de alta.",
    resultado: "Paso 3 de 3 · Resultado de la importación.",
  };

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <ArrowUpTrayIcon className="h-4 w-4" />
        Alta masiva
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
            <DialogTitle>Alta masiva de inventario</DialogTitle>
            <DialogDescription>{descripcionPaso[paso]}</DialogDescription>
          </DialogHeader>

          {paso === "archivo" && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Una fila por producto: nombre, categoría, código de barras, existencia inicial
                con su costo y, si se maneja por caja, el empaque con su código.{" "}
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

          {paso === "previa" && preview && c && (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {archivo?.filename && (
                    <span className="font-mono text-xs mr-2">{archivo.filename}</span>
                  )}
                  {c.total} fila{c.total === 1 ? "" : "s"}: {c.ok} lista{c.ok === 1 ? "" : "s"} ·{" "}
                  <span className={cn(c.error > 0 && "text-red-600")}>{c.error} con error</span>{" "}
                  ·{" "}
                  <span className={cn(c.duplicado > 0 && "text-amber-600")}>
                    {c.duplicado} ya existe{c.duplicado === 1 ? "" : "n"}
                  </span>
                </p>
                {c.error > 0 && (
                  <p className="text-xs text-red-600">
                    Las filas con error NO se darán de alta. Corrígelas en el archivo y vuelve a
                    subirlo, o importa solo las filas listas.
                  </p>
                )}
                {c.duplicado > 0 && (
                  <p className="text-xs text-amber-600">
                    Las filas «Ya existe» (mismo código o mismo nombre + número de parte) se
                    omiten: no se duplican.
                  </p>
                )}
              </div>

              <FilasTabla filas={preview.filas} />
            </div>
          )}

          {paso === "resultado" && resultado && (
            <ResultadoPaso resultado={resultado} />
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
                    setArchivo(null);
                    setPaso("archivo");
                  }}
                  disabled={pending}
                >
                  Elegir otro archivo
                </Button>
                <Button onClick={confirmar} disabled={pending || !c || c.ok === 0}>
                  {pending
                    ? "Importando…"
                    : `Importar ${c?.ok ?? 0} ${c?.ok === 1 ? "ítem" : "ítems"}`}
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

function FilasTabla({ filas }: { filas: ImportarItemsFila[] }) {
  return (
    <div className="rounded-lg border border-border max-h-80 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Nombre</th>
            <th className="px-3 py-2">Categoría</th>
            <th className="px-3 py-2">Código</th>
            <th className="px-3 py-2">Empaque</th>
            <th className="px-3 py-2 text-right">Existencia</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const st = ESTADO_STYLE[f.estado] ?? ESTADO_STYLE.ERROR;
            const emp = f.crear?.empaque ?? null;
            const ent = f.crear?.entrada_inicial ?? null;
            return (
              <tr key={f.fila} className="border-t border-border">
                <td className="px-3 py-1.5 text-muted-foreground tabular-nums">{f.fila}</td>
                <td className="px-3 py-1.5 max-w-[220px]">
                  <span className="block truncate">{f.nombre || f.crear?.item?.nombre || "—"}</span>
                  {f.crear?.item?.marca && (
                    <span className="block text-xs text-muted-foreground truncate">
                      {f.crear.item.marca}
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                  {f.crear?.item?.categoria ?? "—"}
                </td>
                <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap">
                  {f.codigo || f.crear?.item?.codigo || "—"}
                </td>
                <td className="px-3 py-1.5 text-xs whitespace-nowrap">
                  {emp ? (
                    <>
                      {emp.nombre} · {num(emp.factor)} u
                      {emp.codigo && (
                        <span className="block font-mono text-muted-foreground">{emp.codigo}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                  {ent && ent.cantidad != null && ent.cantidad > 0 ? (
                    <>
                      {num(ent.cantidad)}
                      <span className="block text-[11px] text-muted-foreground">
                        {ent.moneda === "USD"
                          ? `$${num(ent.costo_unitario_usd)} USD c/u`
                          : `$${num(ent.costo_unitario_mxn)} MXN c/u`}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <Badge variant="outline" className={cn("text-[10px]", st.cls)}>
                    {st.label}
                  </Badge>
                </td>
                <td className="px-3 py-1.5 text-xs max-w-[320px]">
                  {f.mensajes.length > 0 ? (
                    <p
                      className={cn(
                        f.estado === "ERROR" && "text-red-600",
                        f.estado === "DUPLICADO" && "text-amber-600",
                        f.estado === "OK" && "text-muted-foreground",
                      )}
                    >
                      {f.mensajes.join("; ")}
                    </p>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ResultadoPaso({ resultado }: { resultado: ImportarItemsResultado }) {
  const c = conteos(resultado.filas);
  const creados = resultado.creados ?? c.ok;
  const fallidas = resultado.filas.filter((f) => f.estado !== "OK");
  return (
    <div className="space-y-3 py-2">
      <div className="flex items-center gap-2">
        <CheckCircleIcon
          className={cn("h-6 w-6", creados > 0 ? "text-emerald-600" : "text-muted-foreground")}
        />
        <p className="text-sm font-medium">
          Se {creados === 1 ? "dio" : "dieron"} de alta {creados} {creados === 1 ? "ítem" : "ítems"}
          {creados > 0 && " con su existencia inicial y empaques."}
        </p>
      </div>
      {fallidas.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            {fallidas.length} fila{fallidas.length === 1 ? " no se dio" : "s no se dieron"} de
            alta:
          </p>
          <ul className="text-xs space-y-0.5">
            {fallidas.map((f) => (
              <li key={f.fila} className={f.estado === "ERROR" ? "text-red-600" : "text-amber-700 dark:text-amber-400"}>
                Fila {f.fila}
                {f.nombre ? ` (${f.nombre})` : ""}: {ESTADO_STYLE[f.estado]?.label ?? f.estado}
                {f.mensajes.length > 0 ? ` — ${f.mensajes.join("; ")}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
