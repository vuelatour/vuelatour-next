"use client";

/**
 * COMPONENTES CON VIDA LÍMITE del avión (17-nov-2026, API 0.0.140). Pedido del
 * cliente: «la lista de componentes del avión y su seguimiento… saber cuánto
 * tiempo le queda a un foco, a una llanta» y «subir uno o varios documentos
 * por componente para comprobar el cambio de componente».
 *
 * Vive DENTRO de la card «Mantenimiento» (sección Componentes), debajo de
 * Motores y Hélices. Lo que le queda a cada pieza lo calcula el API (`vida`);
 * aquí solo se pinta, con los textos de `lib/admin/componentes-aeronave.ts`.
 * Reemplazar, retirar y eliminar CONFIRMAN.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ArrowPathIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
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
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/admin/form-field";
import {
  AdjuntosDestino,
  SubirAdjuntosDialog,
  useAdjuntosIngenieria,
} from "@/components/admin/aircraft/adjuntos-ingenieria";
import {
  actualizarComponenteAeronave,
  crearComponenteAeronave,
  eliminarComponenteAeronave,
  listComponentesAeronave,
  reemplazarComponenteAeronave,
  retirarComponenteAeronave,
} from "@/lib/api/engineering";
import {
  CATEGORIAS_COMPONENTE,
  CLASE_BADGE_TONO_VIDA,
  CLASE_BARRA_TONO_VIDA,
  CLASE_TEXTO_TONO_VIDA,
  ETIQUETA_ESTADO_VIDA,
  POSICIONES_COMPONENTE,
  SUGERENCIAS_NOMBRE_COMPONENTE,
  TEXTO_COMPONENTES_NO_CARGARON,
  etiquetaLimite,
  lineasRestante,
  mensajeErrorComponente,
  payloadComponente,
  payloadReemplazo,
  payloadRetiro,
  porcentajeVidaUsada,
  textoConfirmarEliminar,
  textoConfirmarReemplazo,
  textoConfirmarRetiro,
  textoEnServicio,
  textoIdentificacion,
  textoInstalacion,
  textoRetiro,
  textoSustitucion,
  tituloComponente,
  tonoVida,
  validarComponente,
  validarReemplazo,
  validarRetiro,
  valoresComponente,
  valoresReemplazo,
  valoresRetiro,
  type ErroresFormulario,
  type ValoresComponente,
  type ValoresReemplazo,
  type ValoresRetiro,
} from "@/lib/admin/componentes-aeronave";
import {
  TEXTO_NO_DISPONIBLE,
  errorIngenieriaDe,
  estadoDeError,
  estadoDeRespuesta,
  type EstadoCarga,
} from "@/lib/admin/ingenieria-errores";
import type {
  ComponenteAeronave,
  ComponentesAeronaveRespuesta,
} from "@/types/engineering";

/** Lo que sabe el expediente de los componentes en un momento dado. */
export interface EstadoComponentes {
  estado: EstadoCarga;
  datos: ComponentesAeronaveRespuesta | null;
}

/**
 * Carga los componentes del avión. Vive en un hook porque lo comparten la
 * lista y el mosaico del resumen de mantenimiento. `inicial` evita la carga
 * (pruebas).
 */
export function useComponentesAeronave(
  aircraftId: string,
  inicial?: EstadoComponentes,
): EstadoComponentes & { recargar: () => Promise<void> } {
  const [st, setSt] = useState<EstadoComponentes>(
    inicial ?? { estado: "cargando", datos: null },
  );

  const recargar = useCallback(async () => {
    try {
      const r = await listComponentesAeronave(aircraftId);
      setSt({ estado: estadoDeRespuesta(r), datos: r });
    } catch (e) {
      setSt({ estado: estadoDeError(e), datos: null });
    }
  }, [aircraftId]);

  useEffect(() => {
    if (inicial) return;
    let activo = true;
    listComponentesAeronave(aircraftId)
      .then((r) => {
        if (activo) setSt({ estado: estadoDeRespuesta(r), datos: r });
      })
      .catch((e: unknown) => {
        if (activo) setSt({ estado: estadoDeError(e), datos: null });
      });
    return () => {
      activo = false;
    };
  }, [aircraftId, inicial]);

  return { ...st, recargar };
}

export const TITULO_COMPONENTES_VIDA = "Componentes con vida límite";
export const AYUDA_COMPONENTES_VIDA =
  "Llantas, focos, batería, ELT, extintor, filtros… Registra cuándo se instaló cada pieza y cada cuándo se cambia; el sistema dice cuánto le queda.";

export function AircraftComponentes({
  aircraftId,
  estado,
  datos,
  recargar,
  puedeEditar = true,
}: EstadoComponentes & {
  aircraftId: string;
  recargar: () => Promise<void>;
  /** Alta, edición y bajas (el API lo vuelve a decidir por rol). */
  puedeEditar?: boolean;
}) {
  const adjuntos = useAdjuntosIngenieria();
  const [reintentando, setReintentando] = useState(false);
  const [formulario, setFormulario] = useState<{ componente?: ComponenteAeronave } | null>(null);
  const [reemplazando, setReemplazando] = useState<ComponenteAeronave | null>(null);
  const [retirando, setRetirando] = useState<ComponenteAeronave | null>(null);
  const [eliminando, setEliminando] = useState<ComponenteAeronave | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Tras un cambio de componente: se ofrece subir la factura de la pieza nueva.
  const [ofrecerDocumento, setOfrecerDocumento] = useState<ComponenteAeronave | null>(null);
  const [subirPara, setSubirPara] = useState<ComponenteAeronave | null>(null);

  const contexto = { horasAeronave: datos?.horas_aeronave ?? null, hoy: datos?.hoy ?? null };

  const confirmarEliminar = async () => {
    if (!eliminando) return;
    setOcupado(true);
    try {
      await eliminarComponenteAeronave(eliminando.id);
      toast.success("Componente eliminado");
      setEliminando(null);
      await recargar();
    } catch (e) {
      toast.error(mensajeErrorComponente(errorIngenieriaDe(e)));
    } finally {
      setOcupado(false);
    }
  };

  const textoEliminar = eliminando ? textoConfirmarEliminar(eliminando) : null;

  return (
    <div className="space-y-3" data-componentes-vida={estado}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <h4 className="text-sm font-medium">{TITULO_COMPONENTES_VIDA}</h4>
          <p className="text-xs text-muted-foreground">{AYUDA_COMPONENTES_VIDA}</p>
        </div>
        {estado === "listo" && puedeEditar && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 gap-1.5"
            onClick={() => setFormulario({})}
            data-accion="agregar-componente"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Agregar componente
          </Button>
        )}
      </div>

      {estado === "cargando" && (
        <p className="text-sm text-muted-foreground">Cargando componentes…</p>
      )}

      {estado === "no_disponible" && (
        <p className="text-sm text-muted-foreground" data-componentes="no-disponible">
          {TEXTO_NO_DISPONIBLE}
        </p>
      )}

      {estado === "error" && (
        <p
          className="flex flex-wrap items-center gap-2 text-sm text-amber-600 dark:text-amber-400"
          data-componentes="error"
        >
          {TEXTO_COMPONENTES_NO_CARGARON}
          <Button
            type="button"
            size="sm"
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
      )}

      {estado === "listo" && datos && (
        <>
          <ComponentesLista
            componentes={datos.componentes}
            puedeEditar={puedeEditar}
            onEditar={(c) => setFormulario({ componente: c })}
            onReemplazar={setReemplazando}
            onRetirar={setRetirando}
            onEliminar={setEliminando}
          />
          <ComponentesRetirados retirados={datos.retirados} puedeEditar={puedeEditar} />
        </>
      )}

      {formulario && (
        <ComponenteFormDialog
          key={formulario.componente?.id ?? "nuevo"}
          aircraftId={aircraftId}
          componente={formulario.componente}
          contexto={contexto}
          onOpenChange={(v) => !v && setFormulario(null)}
          onGuardado={recargar}
        />
      )}

      {reemplazando && (
        <ReemplazarDialog
          key={reemplazando.id}
          componente={reemplazando}
          contexto={contexto}
          onOpenChange={(v) => !v && setReemplazando(null)}
          onHecho={async (nuevo) => {
            await recargar();
            // Los documentos solo se ofrecen si el API ya los maneja.
            if (adjuntos.estado === "listo") setOfrecerDocumento(nuevo);
          }}
        />
      )}

      {retirando && (
        <RetirarDialog
          key={retirando.id}
          componente={retirando}
          contexto={contexto}
          onOpenChange={(v) => !v && setRetirando(null)}
          onHecho={recargar}
        />
      )}

      {/* Eliminar confirma (regla permanente: toda acción destructiva confirma). */}
      <AlertDialog open={!!eliminando} onOpenChange={(v) => !v && setEliminando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{textoEliminar?.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{textoEliminar?.descripcion}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmarEliminar();
              }}
              disabled={ocupado}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {ocupado ? "Eliminando…" : textoEliminar?.boton}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tras el cambio: ¿subes ya la factura o el certificado de la nueva? */}
      <AlertDialog
        open={!!ofrecerDocumento}
        onOpenChange={(v) => !v && setOfrecerDocumento(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Componente cambiado</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Subes ahora la factura o el certificado de la pieza nueva? También puedes
              hacerlo después, en «Documentos» del componente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ahora no</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setSubirPara(ofrecerDocumento);
                setOfrecerDocumento(null);
              }}
            >
              Subir documento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {subirPara && (
        <SubirAdjuntosDialog
          destino="COMPONENTE"
          destinoId={subirPara.id}
          onOpenChange={(v) => !v && setSubirPara(null)}
          onSubido={adjuntos.recargar}
        />
      )}
    </div>
  );
}

/** Barra de vida usada (solo cuando hay límite y datos para calcularla). */
function BarraVida({ componente }: { componente: ComponenteAeronave }) {
  const pct = porcentajeVidaUsada(componente.vida);
  if (pct == null) return null;
  const tono = tonoVida(componente.vida.estado);
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-border"
      role="img"
      aria-label={`Vida usada: ${pct} %`}
      title={`Vida usada: ${pct} %`}
    >
      <div
        className={`h-full rounded-full ${CLASE_BARRA_TONO_VIDA[tono]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * La lista PINTADA de componentes instalados (sin red): qué es, cada cuándo
 * se cambia, cuánto lleva, cuánto le queda y sus documentos.
 */
export function ComponentesLista({
  componentes,
  puedeEditar,
  onEditar,
  onReemplazar,
  onRetirar,
  onEliminar,
}: {
  componentes: ComponenteAeronave[];
  puedeEditar: boolean;
  onEditar: (c: ComponenteAeronave) => void;
  onReemplazar: (c: ComponenteAeronave) => void;
  onRetirar: (c: ComponenteAeronave) => void;
  onEliminar: (c: ComponenteAeronave) => void;
}) {
  if (componentes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin componentes registrados. Agrega los que quieras vigilar.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {componentes.map((c) => {
        const tono = tonoVida(c.vida.estado);
        const identificacion = textoIdentificacion(c);
        const enServicio = textoEnServicio(c.vida);
        return (
          <li
            key={c.id}
            className="space-y-2 rounded-lg border border-border bg-muted/20 p-3"
            data-componente={c.id}
            data-estado-vida={c.vida.estado}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium">{tituloComponente(c)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {[c.categoria, identificacion].filter(Boolean).join(" · ") ||
                    "Sin número de parte ni de serie"}
                </p>
                <p className="text-[11px] text-muted-foreground">{textoInstalacion(c)}</p>
              </div>
              <Badge variant="outline" className={`shrink-0 ${CLASE_BADGE_TONO_VIDA[tono]}`}>
                {ETIQUETA_ESTADO_VIDA[c.vida.estado]}
              </Badge>
            </div>

            <div className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">Se cambia</p>
                <p className="font-medium">{etiquetaLimite(c)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Le queda</p>
                {lineasRestante(c.vida).map((l) => (
                  <p
                    key={l.texto}
                    className={
                      l.falta
                        ? CLASE_TEXTO_TONO_VIDA.ambar
                        : l.decide
                          ? `font-semibold ${CLASE_TEXTO_TONO_VIDA[tono]}`
                          : "font-medium"
                    }
                  >
                    {l.texto}
                  </p>
                ))}
              </div>
            </div>

            <BarraVida componente={c} />
            {enServicio && (
              <p className="text-[11px] text-muted-foreground">{enServicio}</p>
            )}
            {c.notas && (
              <p className="whitespace-pre-wrap text-[11px] text-muted-foreground">
                {c.notas}
              </p>
            )}

            <AdjuntosDestino
              destino="COMPONENTE"
              destinoId={c.id}
              puedeEditar={puedeEditar}
              className="border-t border-border pt-2"
            />

            {puedeEditar && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  className="gap-1"
                  onClick={() => onReemplazar(c)}
                  title="Se cambió por una pieza nueva"
                >
                  <ArrowPathIcon className="h-3 w-3" aria-hidden />
                  Reemplazar
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="gap-1"
                  onClick={() => onEditar(c)}
                >
                  <PencilSquareIcon className="h-3 w-3" aria-hidden />
                  Editar
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => onRetirar(c)}
                  title="Se quitó del avión sin poner otro"
                >
                  Retirar
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="ml-auto gap-1 text-destructive hover:text-destructive"
                  onClick={() => onEliminar(c)}
                  title="Solo si se capturó por error"
                >
                  <TrashIcon className="h-3 w-3" aria-hidden />
                  Eliminar
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Historial plegable. `<details>` nativo: el contenido NO se desmonta al
 * cerrarlo (los documentos de una pieza retirada siguen cargados).
 */
export function ComponentesRetirados({
  retirados,
  puedeEditar,
}: {
  retirados: ComponenteAeronave[];
  puedeEditar: boolean;
}) {
  if (retirados.length === 0) return null;
  return (
    <details
      className="rounded-lg border border-dashed border-border/70 p-3"
      data-componentes="retirados"
    >
      <summary className="cursor-pointer text-xs text-muted-foreground">
        Historial de componentes retirados ({retirados.length})
      </summary>
      <ul className="mt-2 space-y-2">
        {retirados.map((c) => (
          <li key={c.id} className="space-y-1 rounded-md border border-border p-2 text-xs">
            <p className="font-medium">{tituloComponente(c)}</p>
            <p className="text-[11px] text-muted-foreground">
              {[textoIdentificacion(c), textoInstalacion(c)].filter(Boolean).join(" · ")}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {textoRetiro(c)} · {textoSustitucion(c)}
            </p>
            {c.motivo_retiro && (
              <p className="text-[11px] text-muted-foreground">Motivo: {c.motivo_retiro}</p>
            )}
            <AdjuntosDestino
              destino="COMPONENTE"
              destinoId={c.id}
              puedeEditar={puedeEditar}
            />
          </li>
        ))}
      </ul>
    </details>
  );
}

// ── Diálogos ────────────────────────────────────────────────────────────────

type Contexto = { horasAeronave: number | null; hoy: string | null };

/** Alta / edición de un componente. */
function ComponenteFormDialog({
  aircraftId,
  componente,
  contexto,
  onOpenChange,
  onGuardado,
}: {
  aircraftId: string;
  componente?: ComponenteAeronave;
  contexto: Contexto;
  onOpenChange: (v: boolean) => void;
  onGuardado: () => Promise<void>;
}) {
  const edicion = !!componente;
  const [v, setV] = useState<ValoresComponente>(() => valoresComponente(componente, contexto));
  const [errores, setErrores] = useState<ErroresFormulario<ValoresComponente>>({});
  const [guardando, setGuardando] = useState(false);
  const campo =
    (k: keyof ValoresComponente) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((prev) => ({ ...prev, [k]: e.target.value }));

  const guardar = async () => {
    const errs = validarComponente(v);
    setErrores(errs);
    if (Object.keys(errs).length > 0) return;
    setGuardando(true);
    try {
      if (componente) {
        await actualizarComponenteAeronave(componente.id, payloadComponente(v, "edicion"));
        toast.success("Componente actualizado");
      } else {
        await crearComponenteAeronave(aircraftId, payloadComponente(v, "alta"));
        toast.success("Componente agregado");
      }
      await onGuardado();
      onOpenChange(false);
    } catch (e) {
      toast.error(mensajeErrorComponente(errorIngenieriaDe(e)));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(abierto) => !guardando && onOpenChange(abierto)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{edicion ? "Editar componente" : "Agregar componente"}</DialogTitle>
          <DialogDescription>
            Solo el nombre es obligatorio. Con la fecha de instalación, el Hobbs y cada
            cuándo se cambia, el sistema dice cuánto le queda.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" required error={errores.nombre}>
              <Input
                value={v.nombre}
                onChange={campo("nombre")}
                list="sugerencias-componente"
                placeholder="Llanta principal, batería, foco de aterrizaje…"
                maxLength={120}
                autoFocus
              />
            </Field>
            <Field label="Posición" hint="Dónde va: izquierda, derecha, nariz…">
              <Input
                value={v.posicion}
                onChange={campo("posicion")}
                list="posiciones-componente"
                maxLength={80}
              />
            </Field>
            <Field label="Categoría">
              <Input
                value={v.categoria}
                onChange={campo("categoria")}
                list="categorias-componente"
                maxLength={80}
              />
            </Field>
            <Field label="Fabricante">
              <Input value={v.fabricante} onChange={campo("fabricante")} maxLength={120} />
            </Field>
            <Field label="Número de parte (P/N)">
              <Input value={v.numero_parte} onChange={campo("numero_parte")} maxLength={80} />
            </Field>
            <Field label="Número de serie (S/N)">
              <Input value={v.numero_serie} onChange={campo("numero_serie")} maxLength={80} />
            </Field>
          </div>
          <datalist id="sugerencias-componente">
            {SUGERENCIAS_NOMBRE_COMPONENTE.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <datalist id="categorias-componente">
            {CATEGORIAS_COMPONENTE.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <datalist id="posiciones-componente">
            {POSICIONES_COMPONENTE.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>

          <fieldset className="space-y-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium">¿Cuándo se instaló?</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Fecha de instalación" error={errores.fecha_instalacion}>
                <Input
                  type="date"
                  value={v.fecha_instalacion}
                  onChange={campo("fecha_instalacion")}
                />
              </Field>
              <Field
                label="Hobbs del avión al instalar"
                hint={
                  contexto.horasAeronave != null
                    ? `El avión va en ${contexto.horasAeronave} h`
                    : undefined
                }
                error={errores.horas_aeronave_instalacion}
              >
                <Input
                  inputMode="decimal"
                  value={v.horas_aeronave_instalacion}
                  onChange={campo("horas_aeronave_instalacion")}
                />
              </Field>
              <Field
                label="Horas que ya traía"
                hint="Solo si la pieza era usada; nueva = vacío"
                error={errores.horas_previas}
              >
                <Input
                  inputMode="decimal"
                  value={v.horas_previas}
                  onChange={campo("horas_previas")}
                  placeholder="0"
                />
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium">¿Cada cuándo se cambia?</legend>
            <p className="text-xs text-muted-foreground">
              Llena lo que aplique (puede ser por horas, por tiempo o los dos: cuenta lo que
              pase primero). Si lo dejas vacío, la pieza queda «a condición»: se cambia cuando
              haga falta y solo se lleva la cuenta de cuánto lleva puesta.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Cada cuántas horas" error={errores.limite_horas}>
                <Input
                  inputMode="decimal"
                  value={v.limite_horas}
                  onChange={campo("limite_horas")}
                  placeholder="Ej. 500"
                />
              </Field>
              <Field label="Cada cuántos meses" error={errores.limite_meses}>
                <Input
                  inputMode="numeric"
                  value={v.limite_meses}
                  onChange={campo("limite_meses")}
                  placeholder="Ej. 12"
                />
              </Field>
              <Field
                label="O vence en fecha exacta"
                hint="La que trae la etiqueta (batería del ELT, extintor)"
                error={errores.fecha_vencimiento}
              >
                <Input
                  type="date"
                  value={v.fecha_vencimiento}
                  onChange={campo("fecha_vencimiento")}
                />
              </Field>
            </div>
            <details className="rounded-md border border-dashed border-border/70 p-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Cuándo avisar (opcional)
              </summary>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <Field
                  label="Avisar cuando falten (horas)"
                  hint="Vacío = 10 h"
                  error={errores.aviso_horas}
                >
                  <Input
                    inputMode="decimal"
                    value={v.aviso_horas}
                    onChange={campo("aviso_horas")}
                    placeholder="10"
                  />
                </Field>
                <Field
                  label="Avisar cuando falten (días)"
                  hint="Vacío = 30 días"
                  error={errores.aviso_dias}
                >
                  <Input
                    inputMode="numeric"
                    value={v.aviso_dias}
                    onChange={campo("aviso_dias")}
                    placeholder="30"
                  />
                </Field>
              </div>
            </details>
          </fieldset>

          <Field label="Notas">
            <Textarea value={v.notas} onChange={campo("notas")} maxLength={1000} rows={2} />
          </Field>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={guardando}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={guardando} onClick={() => void guardar()}>
            {guardando ? "Guardando…" : edicion ? "Guardar cambios" : "Agregar componente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Cambio de componente en DOS pasos: datos del cambio y de la pieza nueva →
 * confirmación (la pieza vieja pasa al historial y eso no se deshace).
 */
function ReemplazarDialog({
  componente,
  contexto,
  onOpenChange,
  onHecho,
}: {
  componente: ComponenteAeronave;
  contexto: Contexto;
  onOpenChange: (v: boolean) => void;
  onHecho: (nuevo: ComponenteAeronave) => Promise<void>;
}) {
  const [v, setV] = useState<ValoresReemplazo>(() => valoresReemplazo(componente, contexto));
  const [errores, setErrores] = useState<ErroresFormulario<ValoresReemplazo>>({});
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const campo =
    (k: keyof ValoresReemplazo) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((prev) => ({ ...prev, [k]: e.target.value }));
  const confirmar = textoConfirmarReemplazo(componente);

  const continuar = () => {
    const errs = validarReemplazo(v);
    setErrores(errs);
    if (Object.keys(errs).length === 0) setConfirmando(true);
  };

  const reemplazar = async () => {
    setGuardando(true);
    try {
      const r = await reemplazarComponenteAeronave(componente.id, payloadReemplazo(v));
      toast.success("Componente cambiado: la pieza nueva ya está en la lista");
      onOpenChange(false);
      await onHecho(r.nuevo);
    } catch (e) {
      toast.error(mensajeErrorComponente(errorIngenieriaDe(e)));
      setConfirmando(false);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(abierto) => !guardando && onOpenChange(abierto)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {confirmando ? confirmar.titulo : `Reemplazar: ${tituloComponente(componente)}`}
          </DialogTitle>
          <DialogDescription>
            {confirmando
              ? confirmar.descripcion
              : "Registra el cambio: la pieza que sale pasa al historial y la nueva empieza a contar desde hoy."}
          </DialogDescription>
        </DialogHeader>

        {!confirmando && (
          <div className="space-y-4">
            <fieldset className="space-y-3 rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-medium">El cambio</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Fecha del cambio" required error={errores.fecha}>
                  <Input type="date" value={v.fecha} onChange={campo("fecha")} />
                </Field>
                <Field
                  label="Hobbs del avión al cambio"
                  hint="Vacío = el Hobbs actual del avión"
                  error={errores.horas_aeronave}
                >
                  <Input
                    inputMode="decimal"
                    value={v.horas_aeronave}
                    onChange={campo("horas_aeronave")}
                  />
                </Field>
              </div>
              <Field label="Motivo del cambio" error={errores.motivo}>
                <Input
                  value={v.motivo}
                  onChange={campo("motivo")}
                  maxLength={300}
                  placeholder="Desgaste, se fundió, cumplió su vida…"
                />
              </Field>
            </fieldset>

            <fieldset className="space-y-3 rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-medium">La pieza nueva</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Número de parte (P/N)">
                  <Input value={v.numero_parte} onChange={campo("numero_parte")} maxLength={80} />
                </Field>
                <Field label="Número de serie (S/N)">
                  <Input value={v.numero_serie} onChange={campo("numero_serie")} maxLength={80} />
                </Field>
                <Field label="Fabricante">
                  <Input value={v.fabricante} onChange={campo("fabricante")} maxLength={120} />
                </Field>
                <Field label="Cada cuántas horas" error={errores.limite_horas}>
                  <Input
                    inputMode="decimal"
                    value={v.limite_horas}
                    onChange={campo("limite_horas")}
                  />
                </Field>
                <Field label="Cada cuántos meses" error={errores.limite_meses}>
                  <Input
                    inputMode="numeric"
                    value={v.limite_meses}
                    onChange={campo("limite_meses")}
                  />
                </Field>
                <Field label="O vence en fecha exacta" error={errores.fecha_vencimiento}>
                  <Input
                    type="date"
                    value={v.fecha_vencimiento}
                    onChange={campo("fecha_vencimiento")}
                  />
                </Field>
                <Field
                  label="Horas que ya traía"
                  hint="Nueva = vacío"
                  error={errores.horas_previas}
                >
                  <Input
                    inputMode="decimal"
                    value={v.horas_previas}
                    onChange={campo("horas_previas")}
                    placeholder="0"
                  />
                </Field>
              </div>
              <Field label="Notas de la pieza nueva">
                <Textarea value={v.notas} onChange={campo("notas")} maxLength={1000} rows={2} />
              </Field>
            </fieldset>
          </div>
        )}

        <DialogFooter>
          {confirmando ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={guardando}
                onClick={() => setConfirmando(false)}
              >
                Volver
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={guardando}
                onClick={() => void reemplazar()}
              >
                {guardando ? "Guardando…" : confirmar.boton}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={continuar}>
                Continuar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Retiro sin sustituto: el diálogo ES la confirmación (dice qué pasa y lo pide en rojo). */
function RetirarDialog({
  componente,
  contexto,
  onOpenChange,
  onHecho,
}: {
  componente: ComponenteAeronave;
  contexto: Contexto;
  onOpenChange: (v: boolean) => void;
  onHecho: () => Promise<void>;
}) {
  const [v, setV] = useState<ValoresRetiro>(() => valoresRetiro(contexto));
  const [errores, setErrores] = useState<ErroresFormulario<ValoresRetiro>>({});
  const [guardando, setGuardando] = useState(false);
  const texto = textoConfirmarRetiro(componente);
  const campo =
    (k: keyof ValoresRetiro) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setV((prev) => ({ ...prev, [k]: e.target.value }));

  const retirar = async () => {
    const errs = validarRetiro(v);
    setErrores(errs);
    if (Object.keys(errs).length > 0) return;
    setGuardando(true);
    try {
      await retirarComponenteAeronave(componente.id, payloadRetiro(v));
      toast.success("Componente retirado: quedó en el historial");
      onOpenChange(false);
      await onHecho();
    } catch (e) {
      toast.error(mensajeErrorComponente(errorIngenieriaDe(e)));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(abierto) => !guardando && onOpenChange(abierto)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{texto.titulo}</DialogTitle>
          <DialogDescription>{texto.descripcion}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Fecha del retiro" required error={errores.fecha}>
              <Input type="date" value={v.fecha} onChange={campo("fecha")} />
            </Field>
            <Field
              label="Hobbs del avión al retirar"
              hint="Vacío = el Hobbs actual del avión"
              error={errores.horas_aeronave}
            >
              <Input
                inputMode="decimal"
                value={v.horas_aeronave}
                onChange={campo("horas_aeronave")}
              />
            </Field>
          </div>
          <Field label="Motivo" error={errores.motivo}>
            <Input value={v.motivo} onChange={campo("motivo")} maxLength={300} />
          </Field>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={guardando}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={guardando}
            onClick={() => void retirar()}
          >
            {guardando ? "Retirando…" : texto.boton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
