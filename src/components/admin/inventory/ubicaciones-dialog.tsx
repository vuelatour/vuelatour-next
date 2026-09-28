"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
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
import {
  actualizarUbicacionAction,
  crearUbicacionAction,
  eliminarUbicacionAction,
  listarUbicacionesAction,
  moverUbicacionAction,
  productosDeUbicacionAction,
  reordenarUbicacionesAction,
} from "@/app/admin/inventory/actions";
import {
  ETIQUETA_AGREGAR_UBICACION,
  ETIQUETA_ELIMINAR,
  MARCA_INACTIVA,
  NOMBRE_UBICACION_MAX,
  TITULO_DIALOGO_UBICACIONES,
  destinosParaVaciar,
  errorNombreUbicacion,
  intercambioOrden,
  limpiarNombreUbicacion,
  ordenSinRutaNueva,
  ordenTrasMover,
  ordenarCatalogo,
  reemplazarUbicacion,
  textoBotonMover,
  textoConfirmarActivo,
  textoConfirmarEliminar,
  textoEliminarConProductos,
  textoErrorUbicacion,
  textoProductos,
  textoResultadoMover,
  textoUbicacionEliminada,
  tituloNoDesactivable,
} from "@/lib/admin/inventario-ubicacion";
import { cn } from "@/lib/utils";
import type { InventarioUbicacion } from "@/types/inventory";

interface UbicacionesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Catálogo COMPLETO (con inactivas), tal como lo manda el API. */
  ubicaciones: InventarioUbicacion[];
  /**
   * Tras cada cambio, el catálogo nuevo: el selector que abrió este diálogo
   * (formulario del producto, «Mover a…») se actualiza SIN recargar la página.
   */
  onCatalogoCambio?: (lista: InventarioUbicacion[]) => void;
  /**
   * Tras «Mover N productos» (vaciar una ubicación antes de eliminarla): de
   * dónde a dónde se movieron. El selector que abrió el diálogo lo usa para
   * seguir a su producto (`ubicacionTrasVaciar`).
   */
  onProductosMovidos?: (desdeId: string, haciaId: string) => void;
}

/**
 * Administrar el catálogo de ubicaciones (ADMIN/MECANICO; 25-sep-2026,
 * ampliado el 28-sep-2026 con «rápido y ágil»):
 *  - agregar (Enter), renombrar EN LÍNEA con clic en el nombre o el lápiz
 *    (Enter guarda, Esc cancela sin cerrar el diálogo; el nombre nuevo se ve
 *    en todos sus productos);
 *  - ▲▼ en UNA llamada (`PUT ubicaciones/orden`; con un API previo, los dos
 *    PATCH de siempre);
 *  - «Eliminar» CONFIRMA: sin productos se borra de verdad; con productos se
 *    explica y se ofrece moverlos a otra ubicación ahí mismo (el API es el
 *    candado real: 409 `UBICACION_EN_USO`, también por los dados de baja);
 *  - «Desactivar»/«Activar» sigue para las que tienen historial.
 * Se abre desde la lista de inventario y, ENCIMA del formulario del producto,
 * desde el engrane del selector (Base UI anida diálogos).
 */
export function UbicacionesDialog({
  open,
  onOpenChange,
  ubicaciones,
  onCatalogoCambio,
  onProductosMovidos,
}: UbicacionesDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Copia local para responder al instante; cuando el server manda un
  // catálogo nuevo (router.refresh) manda el del server.
  const [lista, setLista] = useState(ubicaciones);
  const [base, setBase] = useState(ubicaciones);
  if (base !== ubicaciones) {
    setBase(ubicaciones);
    setLista(ubicaciones);
  }
  const ordenada = ordenarCatalogo(lista);

  const [nuevo, setNuevo] = useState("");
  const [editando, setEditando] = useState<{ id: string; nombre: string } | null>(null);
  const [confirmando, setConfirmando] = useState<{ id: string; activar: boolean } | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [destinoVaciar, setDestinoVaciar] = useState("");
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null);

  const errorNuevo = nuevo.trim() ? errorNombreUbicacion(nuevo, lista) : null;
  const errorEdicion = editando ? errorNombreUbicacion(editando.nombre, lista, editando.id) : null;

  /** Publica un catálogo nuevo (aquí y en el selector que abrió el diálogo). */
  const aplicar = (nueva: InventarioUbicacion[]) => {
    setLista(nueva);
    onCatalogoCambio?.(nueva);
  };

  /**
   * Relee el catálogo del server (conteos y orden autoritativos) y repinta la
   * página (filtro y columna de la tabla). Si la relectura falla, `respaldo`.
   */
  const refrescar = async (respaldo: InventarioUbicacion[]) => {
    const r = await listarUbicacionesAction();
    aplicar(r.ok && r.data ? r.data : respaldo);
    router.refresh();
  };

  const cerrarPaneles = () => {
    setEditando(null);
    setConfirmando(null);
    setBorrando(null);
    setDestinoVaciar("");
    setErrorBorrar(null);
  };

  const agregar = () => {
    if (!nuevo.trim() || errorNuevo || pending) return;
    startTransition(async () => {
      const res = await crearUbicacionAction(nuevo);
      if (res.ok && res.data) {
        setNuevo("");
        toast.success(`Ubicación «${res.data.nombre}» agregada.`);
        await refrescar(reemplazarUbicacion(lista, res.data));
      } else {
        toast.error(textoErrorUbicacion("agregar", res));
      }
    });
  };

  const renombrar = () => {
    if (!editando || errorEdicion || pending) return;
    const actual = lista.find((u) => u.id === editando.id);
    if (actual && actual.nombre === limpiarNombreUbicacion(editando.nombre)) {
      setEditando(null);
      return;
    }
    startTransition(async () => {
      const res = await actualizarUbicacionAction(editando.id, { nombre: editando.nombre });
      if (res.ok && res.data) {
        setEditando(null);
        toast.success(`Ahora se llama «${res.data.nombre}» (también en sus productos).`);
        await refrescar(reemplazarUbicacion(lista, res.data));
      } else {
        toast.error(textoErrorUbicacion("renombrar", res));
      }
    });
  };

  const mover = (id: string, direccion: "arriba" | "abajo") => {
    const ids = ordenTrasMover(lista, id, direccion);
    if (!ids || pending) return;
    const antes = lista;
    // Optimista: la fila sube/baja al instante; si el API dice que no, se
    // relee el catálogo.
    const porId = new Map(lista.map((u) => [u.id, u]));
    setLista(ids.map((x, i) => ({ ...(porId.get(x) as InventarioUbicacion), orden: i + 1 })));
    startTransition(async () => {
      const res = await reordenarUbicacionesAction(ids);
      if (res.ok && res.data) {
        aplicar(res.data);
        router.refresh();
        return;
      }
      if (ordenSinRutaNueva(res)) {
        // API previo al 0.0.38: los dos PATCH de siempre.
        let actual = antes;
        for (const c of intercambioOrden(antes, id, direccion) ?? []) {
          const r = await actualizarUbicacionAction(c.id, { orden: c.orden });
          if (!r.ok || !r.data) {
            toast.error(textoErrorUbicacion("ordenar", r));
            await refrescar(antes);
            return;
          }
          actual = reemplazarUbicacion(actual, r.data);
        }
        aplicar(actual);
        router.refresh();
        return;
      }
      toast.error(textoErrorUbicacion("ordenar", res));
      await refrescar(antes);
    });
  };

  const aplicarActivo = () => {
    if (!confirmando || pending) return;
    const { id, activar } = confirmando;
    startTransition(async () => {
      const res = await actualizarUbicacionAction(id, { activo: activar });
      if (res.ok && res.data) {
        cerrarPaneles();
        toast.success(activar ? "Ubicación activada." : "Ubicación desactivada.");
        await refrescar(reemplazarUbicacion(lista, res.data));
      } else {
        toast.error(textoErrorUbicacion("activar", res));
      }
    });
  };

  const eliminar = (u: InventarioUbicacion) => {
    if (pending) return;
    startTransition(async () => {
      const res = await eliminarUbicacionAction(u.id);
      if (res.ok || res.code === "UBICACION_NO_EXISTE") {
        cerrarPaneles();
        toast.success(textoUbicacionEliminada(u.nombre));
        await refrescar(lista.filter((x) => x.id !== u.id));
        return;
      }
      // 409 UBICACION_EN_USO (p. ej. solo la usan productos dados de baja):
      // el mensaje del API dice qué hacer; el conteo pudo cambiar.
      setErrorBorrar(textoErrorUbicacion("eliminar", res));
      await refrescar(lista);
    });
  };

  /** «Muévelos primero»: todos sus productos activos a otra ubicación. */
  const vaciar = (u: InventarioUbicacion) => {
    const destino = lista.find((x) => x.id === destinoVaciar && x.activo);
    if (!destino || pending) return;
    startTransition(async () => {
      const prods = await productosDeUbicacionAction(u.id);
      if (!prods.ok || !prods.data) {
        toast.error(textoErrorUbicacion("mover", prods));
        return;
      }
      if (prods.data.length > 0) {
        const res = await moverUbicacionAction(
          prods.data.map((p) => p.id),
          destino.id,
        );
        if (!res.ok || !res.data) {
          toast.error(textoErrorUbicacion("mover", res));
          return;
        }
        const { titulo, detalle } = textoResultadoMover(res.data);
        toast.success(titulo, detalle ? { description: detalle } : undefined);
        // ANTES de publicar el catálogo: el selector que abrió el diálogo
        // sigue a su producto al destino (si no, al eliminar la vacía caería
        // a «Sin ubicación» y «Guardar» le quitaría la ubicación).
        onProductosMovidos?.(u.id, destino.id);
      }
      setDestinoVaciar("");
      setErrorBorrar(null);
      // Con 0 productos el panel pasa solo a «¿Eliminar para siempre?».
      await refrescar(lista);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{TITULO_DIALOGO_UBICACIONES}</DialogTitle>
          <DialogDescription>
            Dónde se guardan los productos de bodega. El orden de esta lista es el de los
            selectores y del filtro. Clic en un nombre para renombrarlo. Para eliminar una
            ubicación con productos, primero muévelos a otra.
          </DialogDescription>
        </DialogHeader>

        <ul className="divide-y divide-border rounded-lg border border-border">
          {ordenada.length === 0 && (
            <li className="px-3 py-4 text-sm text-muted-foreground">
              Sin ubicaciones todavía: agrega la primera abajo.
            </li>
          )}
          {ordenada.map((u, i) => {
            const enEdicion = editando?.id === u.id;
            const pidiendo = confirmando?.id === u.id;
            const eliminando = borrando === u.id;
            const productos = Number(u.productos) || 0;
            const destinos = eliminando ? destinosParaVaciar(lista, u.id) : [];
            return (
              <li key={u.id} className="space-y-2 px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => mover(u.id, "arriba")}
                      disabled={pending || i === 0}
                      aria-label={`Subir «${u.nombre}»`}
                      title="Subir"
                      className="cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-30"
                    >
                      <ArrowUpIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => mover(u.id, "abajo")}
                      disabled={pending || i === ordenada.length - 1}
                      aria-label={`Bajar «${u.nombre}»`}
                      title="Bajar"
                      className="cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-30"
                    >
                      <ArrowDownIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    {enEdicion ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={editando.nombre}
                          maxLength={NOMBRE_UBICACION_MAX + 10}
                          autoFocus
                          aria-label="Nuevo nombre de la ubicación"
                          onChange={(e) => setEditando({ id: u.id, nombre: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              renombrar();
                            }
                            if (e.key === "Escape") {
                              // Esc cancela el renombre, NO cierra el diálogo.
                              e.preventDefault();
                              e.stopPropagation();
                              setEditando(null);
                            }
                          }}
                          className="h-8"
                          disabled={pending}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 cursor-pointer p-0"
                          aria-label="Guardar nombre"
                          onClick={renombrar}
                          disabled={pending || !!errorEdicion}
                        >
                          <CheckIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 cursor-pointer p-0"
                          aria-label="Cancelar"
                          onClick={() => setEditando(null)}
                          disabled={pending}
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex min-w-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            cerrarPaneles();
                            setEditando({ id: u.id, nombre: u.nombre });
                          }}
                          disabled={pending}
                          title="Clic para renombrar"
                          className={cn(
                            "min-w-0 cursor-pointer truncate rounded text-left text-sm font-medium hover:underline hover:underline-offset-2 disabled:cursor-default",
                            !u.activo && "text-muted-foreground line-through decoration-muted-foreground/40",
                          )}
                        >
                          {u.nombre}
                        </button>
                        {!u.activo && (
                          <span className="shrink-0 text-xs text-muted-foreground">{MARCA_INACTIVA}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            cerrarPaneles();
                            setEditando({ id: u.id, nombre: u.nombre });
                          }}
                          disabled={pending}
                          aria-label={`Renombrar «${u.nombre}»`}
                          title="Renombrar"
                          className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-40"
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    {enEdicion && errorEdicion && (
                      <p className="mt-1 text-xs text-destructive">{errorEdicion}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{textoProductos(productos)}</p>
                  </div>

                  <div className="flex shrink-0 items-center">
                    {u.activo ? (
                      <span title={productos > 0 ? tituloNoDesactivable(productos) : undefined}>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="cursor-pointer text-muted-foreground hover:text-foreground"
                          disabled={pending || productos > 0}
                          onClick={() => {
                            cerrarPaneles();
                            setConfirmando({ id: u.id, activar: false });
                          }}
                        >
                          Desactivar
                        </Button>
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="cursor-pointer"
                        disabled={pending}
                        onClick={() => {
                          cerrarPaneles();
                          setConfirmando({ id: u.id, activar: true });
                        }}
                      >
                        Activar
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="cursor-pointer gap-1 text-muted-foreground hover:text-destructive"
                      disabled={pending}
                      aria-label={`${ETIQUETA_ELIMINAR} «${u.nombre}»`}
                      title={ETIQUETA_ELIMINAR}
                      onClick={() => {
                        cerrarPaneles();
                        setBorrando(u.id);
                      }}
                    >
                      <TrashIcon className="h-4 w-4" />
                      <span className="sr-only sm:not-sr-only">{ETIQUETA_ELIMINAR}</span>
                    </Button>
                  </div>
                </div>

                {pidiendo && (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs">
                    <span className="text-amber-800 dark:text-amber-300">
                      {textoConfirmarActivo(u.nombre, confirmando.activar)}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant={confirmando.activar ? "default" : "destructive"}
                      className="h-7 cursor-pointer"
                      onClick={aplicarActivo}
                      disabled={pending}
                    >
                      {confirmando.activar ? "Sí, activar" : "Sí, desactivar"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 cursor-pointer"
                      onClick={() => setConfirmando(null)}
                      disabled={pending}
                    >
                      Cancelar
                    </Button>
                  </div>
                )}

                {eliminando && productos > 0 && (
                  // Con productos NO se borra: se explica y se ofrece moverlos.
                  <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs">
                    <p className="text-amber-800 dark:text-amber-300">
                      {textoEliminarConProductos(u.nombre, productos)}
                    </p>
                    {destinos.length === 0 ? (
                      <p className="text-amber-800 dark:text-amber-300">
                        No hay otra ubicación activa: agrega una abajo primero.
                      </p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={destinoVaciar}
                          onChange={(e) => setDestinoVaciar(e.target.value)}
                          disabled={pending}
                          aria-label={`Mover los productos de «${u.nombre}» a`}
                          className="h-7 min-w-0 flex-1 cursor-pointer rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="">Elige a dónde…</option>
                          {destinos.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.nombre}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 cursor-pointer"
                          onClick={() => vaciar(u)}
                          disabled={pending || !destinoVaciar}
                        >
                          {pending ? "Moviendo…" : textoBotonMover(productos)}
                        </Button>
                      </div>
                    )}
                    <p className="text-muted-foreground">
                      No mueve stock ni dinero. Después podrás eliminarla.{" "}
                      <button
                        type="button"
                        className="cursor-pointer underline underline-offset-2 hover:text-foreground"
                        onClick={() => setBorrando(null)}
                        disabled={pending}
                      >
                        Cancelar
                      </button>
                    </p>
                  </div>
                )}

                {eliminando && productos === 0 && (
                  <div className="space-y-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-foreground">{textoConfirmarEliminar(u.nombre)}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="h-7 cursor-pointer"
                        onClick={() => eliminar(u)}
                        disabled={pending}
                      >
                        {pending ? "Eliminando…" : "Sí, eliminar"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 cursor-pointer"
                        onClick={() => {
                          setBorrando(null);
                          setErrorBorrar(null);
                        }}
                        disabled={pending}
                      >
                        Cancelar
                      </Button>
                    </div>
                    {errorBorrar && (
                      <div className="flex flex-wrap items-center gap-2">
                        <p role="alert" className="text-destructive">
                          {errorBorrar}
                        </p>
                        {u.activo && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 cursor-pointer"
                            onClick={() => {
                              cerrarPaneles();
                              setConfirmando({ id: u.id, activar: false });
                            }}
                            disabled={pending}
                          >
                            Desactivarla
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Input
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  agregar();
                }
              }}
              placeholder="Ej. Hangar Cancún"
              maxLength={NOMBRE_UBICACION_MAX + 10}
              aria-label="Nombre de la ubicación nueva"
              disabled={pending}
            />
            <Button
              type="button"
              className="shrink-0 cursor-pointer gap-1.5"
              onClick={agregar}
              disabled={pending || !nuevo.trim() || !!errorNuevo}
            >
              <PlusIcon className="h-4 w-4" />
              {ETIQUETA_AGREGAR_UBICACION}
            </Button>
          </div>
          {errorNuevo && <p className="text-xs text-destructive">{errorNuevo}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
