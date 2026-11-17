"use client";

/**
 * EVIDENCIAS Y DOCUMENTOS de ingeniería en el expediente del avión
 * (17-nov-2026, API 0.0.140). El sticker que entrega el taller al terminar un
 * mantenimiento, la factura de una pieza, el certificado de un motor: se
 * suben (foto o PDF, uno o varios) y después se ven o se descargan.
 *
 *  - `AdjuntosIngenieriaProvider` carga UNA vez todos los archivos del avión y
 *    los reparte por destino (orden, componente, motor, hélice).
 *  - `AdjuntosDestino` pinta los de UN destino y deja subir / ver / descargar /
 *    quitar (quitar confirma).
 *  - `AvisoAdjuntos` dice, una sola vez por sección, si los archivos todavía
 *    no están disponibles (API previo o migración sin aplicar) o si no se
 *    pudieron leer — jamás se pinta «sin archivos» cuando la carga falló.
 *
 * Textos y reglas: `lib/admin/adjuntos-ingenieria.ts` (fuente única, pura).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  DocumentTextIcon,
  EyeIcon,
  PaperClipIcon,
  PhotoIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
import { Field } from "@/components/admin/form-field";
import {
  listAdjuntosIngenieria,
  quitarAdjuntoIngenieria,
  registrarAdjuntoIngenieria,
  urlAdjuntoIngenieria,
} from "@/lib/api/engineering";
import {
  deleteDocumentoFlota,
  uploadDocumentoFlota,
} from "@/lib/storage/documentos-flota";
import {
  ACCEPT_ADJUNTO,
  AYUDA_FORMATOS_ADJUNTO,
  ETIQUETAS_ADJUNTO,
  TEXTO_ADJUNTOS_NO_CARGARON,
  TEXTO_INVITA_STICKER,
  TOPE_NOTA_ADJUNTO,
  adjuntosDeDestino,
  etiquetaAdjunto,
  etiquetaPorDefecto,
  mensajeErrorAdjunto,
  subirAdjuntos,
  tamanoLegible,
  textoAvanceSubida,
  textoConfirmarQuitarAdjunto,
  textoContadorAdjuntos,
  textoMetaAdjunto,
  textoResultadoSubida,
  textoSubirAdjunto,
  tipoArchivo,
  tituloAdjuntos,
  tituloSubirAdjunto,
  validarArchivoAdjunto,
} from "@/lib/admin/adjuntos-ingenieria";
import {
  TEXTO_NO_DISPONIBLE,
  errorIngenieriaDe,
  estadoDeError,
  estadoDeRespuesta,
  type EstadoCarga,
} from "@/lib/admin/ingenieria-errores";
import type {
  AdjuntoIngenieria,
  DestinoAdjunto,
  EtiquetaAdjunto,
} from "@/types/engineering";

/** Lo que sabe el expediente de sus archivos en un momento dado. */
export interface EstadoAdjuntos {
  estado: EstadoCarga;
  adjuntos: AdjuntoIngenieria[];
}

interface ContextoAdjuntos extends EstadoAdjuntos {
  recargar: () => Promise<void>;
}

/** Fuera del provider no hay archivos que ofrecer: lo nuevo se esconde. */
const SIN_PROVIDER: ContextoAdjuntos = {
  estado: "no_disponible",
  adjuntos: [],
  recargar: async () => {},
};

const AdjuntosContext = createContext<ContextoAdjuntos>(SIN_PROVIDER);

export function useAdjuntosIngenieria(): ContextoAdjuntos {
  return useContext(AdjuntosContext);
}

/**
 * Carga UNA vez los archivos de ingeniería del avión y los comparte con todo
 * lo que tenga adentro (también con las piezas que la página arma en el
 * servidor y entran como slots). `inicial` evita la carga (pruebas).
 */
export function AdjuntosIngenieriaProvider({
  aircraftId,
  inicial,
  children,
}: {
  aircraftId: string;
  inicial?: EstadoAdjuntos;
  children: React.ReactNode;
}) {
  const [datos, setDatos] = useState<EstadoAdjuntos>(
    inicial ?? { estado: "cargando", adjuntos: [] },
  );

  const recargar = useCallback(async () => {
    try {
      const r = await listAdjuntosIngenieria(aircraftId);
      setDatos({ estado: estadoDeRespuesta(r), adjuntos: r.adjuntos ?? [] });
    } catch (e) {
      setDatos({ estado: estadoDeError(e), adjuntos: [] });
    }
  }, [aircraftId]);

  useEffect(() => {
    if (inicial) return;
    let activo = true;
    listAdjuntosIngenieria(aircraftId)
      .then((r) => {
        if (activo) {
          setDatos({ estado: estadoDeRespuesta(r), adjuntos: r.adjuntos ?? [] });
        }
      })
      .catch((e: unknown) => {
        if (activo) setDatos({ estado: estadoDeError(e), adjuntos: [] });
      });
    return () => {
      activo = false;
    };
  }, [aircraftId, inicial]);

  const valor = useMemo(() => ({ ...datos, recargar }), [datos, recargar]);
  return <AdjuntosContext.Provider value={valor}>{children}</AdjuntosContext.Provider>;
}

/**
 * Aviso ÚNICO por sección: los archivos todavía no están disponibles (gris)
 * o no se pudieron leer (con «Reintentar»). Con los archivos cargados no
 * pinta nada.
 */
export function AvisoAdjuntos({ destino }: { destino: DestinoAdjunto }) {
  const { estado, recargar } = useAdjuntosIngenieria();
  const [reintentando, setReintentando] = useState(false);
  if (estado === "no_disponible") {
    return (
      <p className="text-xs text-muted-foreground" data-adjuntos="no-disponible">
        {tituloAdjuntos(destino)}: {TEXTO_NO_DISPONIBLE}
      </p>
    );
  }
  if (estado === "error") {
    return (
      <p
        className="flex flex-wrap items-center gap-2 text-xs text-amber-600 dark:text-amber-400"
        data-adjuntos="error"
      >
        {TEXTO_ADJUNTOS_NO_CARGARON}
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={reintentando}
          onClick={() => {
            setReintentando(true);
            void recargar().finally(() => setReintentando(false));
          }}
        >
          {reintentando ? "Reintentando…" : "Reintentar"}
        </Button>
      </p>
    );
  }
  return null;
}

/**
 * Archivos de UN destino. Con los archivos sin cargar, sin disponibilidad o
 * con la carga fallida no pinta nada (lo dice `AvisoAdjuntos`, una vez).
 */
export function AdjuntosDestino({
  destino,
  destinoId,
  puedeEditar = true,
  invitar = false,
  className,
}: {
  destino: DestinoAdjunto;
  destinoId: string;
  /** Subir y quitar (el API lo vuelve a decidir por rol). */
  puedeEditar?: boolean;
  /** Orden COMPLETADA sin evidencia: invita a subir el sticker. */
  invitar?: boolean;
  className?: string;
}) {
  const { estado, adjuntos, recargar } = useAdjuntosIngenieria();
  const [subirAbierto, setSubirAbierto] = useState(false);
  const [quitando, setQuitando] = useState<AdjuntoIngenieria | null>(null);
  const [ocupado, setOcupado] = useState(false);

  if (estado !== "listo") return null;
  const lista = adjuntosDeDestino(adjuntos, destino, destinoId);

  const abrir = async (a: AdjuntoIngenieria, descargar: boolean) => {
    try {
      const r = await urlAdjuntoIngenieria(a.id, descargar);
      if (descargar) {
        // Enlace real (URL firmada) con el nombre original: el navegador lo
        // baja sin salir de la página y sin armar el archivo en memoria.
        const enlace = document.createElement("a");
        enlace.href = r.url;
        enlace.rel = "noopener";
        enlace.target = "_blank";
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
      } else {
        window.open(r.url, "_blank", "noopener");
      }
    } catch (e) {
      toast.error(mensajeErrorAdjunto(errorIngenieriaDe(e)));
    }
  };

  const confirmarQuitar = async () => {
    if (!quitando) return;
    setOcupado(true);
    try {
      await quitarAdjuntoIngenieria(quitando.id);
      toast.success("Archivo quitado");
      setQuitando(null);
      await recargar();
    } catch (e) {
      toast.error(mensajeErrorAdjunto(errorIngenieriaDe(e)));
    } finally {
      setOcupado(false);
    }
  };

  const textoQuitar = quitando ? textoConfirmarQuitarAdjunto(quitando.nombre) : null;

  return (
    <div className={className}>
      <AdjuntosVista
        destino={destino}
        lista={lista}
        puedeEditar={puedeEditar}
        invitar={invitar}
        onSubir={() => setSubirAbierto(true)}
        onVer={(a) => void abrir(a, false)}
        onDescargar={(a) => void abrir(a, true)}
        onQuitar={setQuitando}
      />

      {subirAbierto && (
        <SubirAdjuntosDialog
          destino={destino}
          destinoId={destinoId}
          onOpenChange={setSubirAbierto}
          onSubido={recargar}
        />
      )}

      {/* Quitar confirma (regla permanente: toda acción destructiva confirma). */}
      <AlertDialog open={!!quitando} onOpenChange={(v) => !v && setQuitando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{textoQuitar?.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{textoQuitar?.descripcion}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmarQuitar();
              }}
              disabled={ocupado}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {ocupado ? "Quitando…" : textoQuitar?.boton}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Ícono según el tipo de archivo. */
function IconoArchivo({ mime }: { mime: string }) {
  const Icono = tipoArchivo(mime) === "imagen" ? PhotoIcon : DocumentTextIcon;
  return <Icono className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
}

/**
 * La lista PINTADA (sin estado ni red): contador, botón de subir y un renglón
 * por archivo con Ver / Descargar / Quitar.
 */
export function AdjuntosVista({
  destino,
  lista,
  puedeEditar,
  invitar = false,
  onSubir,
  onVer,
  onDescargar,
  onQuitar,
}: {
  destino: DestinoAdjunto;
  lista: AdjuntoIngenieria[];
  puedeEditar: boolean;
  invitar?: boolean;
  onSubir: () => void;
  onVer: (a: AdjuntoIngenieria) => void;
  onDescargar: (a: AdjuntoIngenieria) => void;
  onQuitar: (a: AdjuntoIngenieria) => void;
}) {
  return (
    <div className="space-y-1.5" data-adjuntos={destino} data-total={lista.length}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <PaperClipIcon className="h-3.5 w-3.5" aria-hidden />
          {textoContadorAdjuntos(lista.length, destino)}
        </span>
        {puedeEditar && (
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="gap-1"
            onClick={onSubir}
            data-accion="subir-adjunto"
          >
            <ArrowUpTrayIcon className="h-3 w-3" aria-hidden />
            {textoSubirAdjunto(destino)}
          </Button>
        )}
      </div>

      {invitar && lista.length === 0 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          {TEXTO_INVITA_STICKER}
        </p>
      )}

      {lista.length > 0 && (
        <ul className="space-y-1">
          {lista.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-2 py-1.5"
            >
              <IconoArchivo mime={a.mime} />
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className="block max-w-full truncate text-left text-xs font-medium hover:underline"
                  title={a.nota ? `${a.nombre} — ${a.nota}` : a.nombre}
                  onClick={() => onVer(a)}
                >
                  {a.nombre}
                </button>
                <p className="truncate text-[10px] text-muted-foreground">
                  {textoMetaAdjunto(a)}
                  {a.nota ? ` · ${a.nota}` : ""}
                </p>
              </div>
              <Badge variant="outline" className="hidden shrink-0 text-[10px] sm:inline-flex">
                {etiquetaAdjunto(a.etiqueta)}
              </Badge>
              <div className="flex shrink-0 items-center">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  title="Ver"
                  aria-label={`Ver ${a.nombre}`}
                  onClick={() => onVer(a)}
                >
                  <EyeIcon className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  title="Descargar"
                  aria-label={`Descargar ${a.nombre}`}
                  onClick={() => onDescargar(a)}
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                </Button>
                {puedeEditar && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    title="Quitar"
                    aria-label={`Quitar ${a.nombre}`}
                    onClick={() => onQuitar(a)}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Diálogo de subida: tipo de documento, nota opcional y uno o VARIOS
 * archivos. Sube uno por uno y dice cuántos subieron y cuáles no.
 */
export function SubirAdjuntosDialog({
  destino,
  destinoId,
  onOpenChange,
  onSubido,
}: {
  destino: DestinoAdjunto;
  destinoId: string;
  onOpenChange: (v: boolean) => void;
  onSubido: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [etiqueta, setEtiqueta] = useState<EtiquetaAdjunto>(etiquetaPorDefecto(destino));
  const [nota, setNota] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [avance, setAvance] = useState<{ hechos: number; total: number } | null>(null);
  const [fallidos, setFallidos] = useState<{ nombre: string; motivo: string }[]>([]);
  const subiendo = avance !== null;
  const validos = archivos.filter((f) => validarArchivoAdjunto(f) === null);

  const elegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nuevos = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (nuevos.length === 0) return;
    setFallidos([]);
    setArchivos((prev) => [...prev, ...nuevos]);
  };

  const subir = async () => {
    if (validos.length === 0) return;
    setAvance({ hechos: 0, total: validos.length });
    const notaLimpia = nota.trim();
    const res = await subirAdjuntos(validos, {
      subir: uploadDocumentoFlota,
      registrar: (ruta, f) =>
        registrarAdjuntoIngenieria({
          destino,
          destino_id: destinoId,
          storage_path: ruta,
          nombre: f.name.slice(0, 200),
          mime: f.type,
          bytes: f.size,
          etiqueta,
          ...(notaLimpia ? { nota: notaLimpia } : {}),
        }),
      // Registro fallido ⇒ el objeto recién subido se retira del bucket.
      limpiar: deleteDocumentoFlota,
      alAvanzar: (hechos, total) => setAvance({ hechos, total }),
    });
    setAvance(null);
    const resultado = textoResultadoSubida(res);
    if (resultado.tipo === "exito") toast.success(resultado.texto);
    else if (resultado.tipo === "parcial") toast.warning(resultado.texto);
    else toast.error(resultado.texto);
    if (res.subidos.length > 0) await onSubido();
    if (res.fallidos.length === 0) {
      onOpenChange(false);
      return;
    }
    // Se quedan en pantalla solo los que fallaron, con su motivo.
    const nombresFallidos = new Set(res.fallidos.map((f) => f.nombre));
    setArchivos((prev) => prev.filter((f) => nombresFallidos.has(f.name)));
    setFallidos(res.fallidos);
  };

  return (
    <Dialog open onOpenChange={(v) => !subiendo && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tituloSubirAdjunto(destino)}</DialogTitle>
          <DialogDescription>{AYUDA_FORMATOS_ADJUNTO}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">¿Qué documento es?</p>
            <div className="flex flex-wrap gap-1.5">
              {ETIQUETAS_ADJUNTO.map((op) => (
                <Button
                  key={op.value}
                  type="button"
                  size="sm"
                  variant={etiqueta === op.value ? "default" : "outline"}
                  aria-pressed={etiqueta === op.value}
                  title={op.ayuda}
                  disabled={subiendo}
                  onClick={() => setEtiqueta(op.value)}
                >
                  {op.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Archivos</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT_ADJUNTO}
              className="hidden"
              onChange={elegir}
            />
            <button
              type="button"
              disabled={subiendo}
              onClick={() => inputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground transition-colors hover:border-ring hover:bg-muted/40 disabled:opacity-60"
            >
              <ArrowUpTrayIcon className="h-4 w-4" aria-hidden />
              {archivos.length === 0 ? "Elegir uno o varios archivos" : "Agregar más archivos"}
            </button>
            {archivos.length > 0 && (
              <ul className="space-y-1">
                {archivos.map((f, i) => {
                  const invalido = validarArchivoAdjunto(f);
                  const fallo = fallidos.find((x) => x.nombre === f.name)?.motivo;
                  const problema = invalido ?? fallo;
                  return (
                    <li
                      key={`${f.name}-${f.size}-${i}`}
                      className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs"
                    >
                      <IconoArchivo mime={f.type} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium" title={f.name}>
                          {f.name}
                        </p>
                        <p
                          className={
                            problema
                              ? "text-[11px] text-destructive"
                              : "text-[11px] text-muted-foreground"
                          }
                        >
                          {problema ? `No se sube: ${problema}` : tamanoLegible(f.size)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        aria-label={`Quitar ${f.name} de la lista`}
                        disabled={subiendo}
                        onClick={() =>
                          setArchivos((prev) => prev.filter((_, j) => j !== i))
                        }
                      >
                        <XMarkIcon className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Field label="Nota (opcional)" hint="Por ejemplo: «Sticker de las 100 hrs, taller Toledo».">
            <Input
              value={nota}
              maxLength={TOPE_NOTA_ADJUNTO}
              disabled={subiendo}
              onChange={(e) => setNota(e.target.value)}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={subiendo}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={subiendo || validos.length === 0}
            onClick={() => void subir()}
          >
            {avance
              ? textoAvanceSubida(avance.hechos, avance.total)
              : validos.length <= 1
                ? "Subir"
                : `Subir ${validos.length} archivos`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
