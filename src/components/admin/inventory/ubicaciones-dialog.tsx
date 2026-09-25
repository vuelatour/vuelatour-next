"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  PencilIcon,
  PlusIcon,
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
} from "@/app/admin/inventory/actions";
import {
  ETIQUETA_AGREGAR_UBICACION,
  MARCA_INACTIVA,
  NOMBRE_UBICACION_MAX,
  TITULO_DIALOGO_UBICACIONES,
  errorNombreUbicacion,
  intercambioOrden,
  ordenarCatalogo,
  textoConfirmarActivo,
  textoProductos,
  tituloNoDesactivable,
} from "@/lib/admin/inventario-ubicacion";
import { cn } from "@/lib/utils";
import type { InventarioUbicacion } from "@/types/inventory";

interface UbicacionesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Catálogo COMPLETO (con inactivas), tal como lo manda el API. */
  ubicaciones: InventarioUbicacion[];
}

/**
 * Administrar el catálogo de ubicaciones (ADMIN/MECANICO, 25-sep-2026):
 * agregar, renombrar (el nombre nuevo se ve en todos sus productos),
 * subir/bajar (el orden de los selectores y del filtro) y activar/desactivar
 * — desactivar CONFIRMA y no se ofrece mientras tenga productos (el API y la
 * BD son el candado real: 409 `UBICACION_EN_USO`). No hay borrar: una
 * ubicación se desactiva.
 */
export function UbicacionesDialog({ open, onOpenChange, ubicaciones }: UbicacionesDialogProps) {
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

  const reemplazar = (fila: InventarioUbicacion) =>
    setLista((prev) => {
      const hay = prev.some((u) => u.id === fila.id);
      return hay ? prev.map((u) => (u.id === fila.id ? { ...u, ...fila } : u)) : [...prev, fila];
    });

  const errorNuevo = nuevo.trim() ? errorNombreUbicacion(nuevo, lista) : null;
  const errorEdicion = editando ? errorNombreUbicacion(editando.nombre, lista, editando.id) : null;

  const agregar = () => {
    if (!nuevo.trim() || errorNuevo || pending) return;
    startTransition(async () => {
      const res = await crearUbicacionAction(nuevo);
      if (res.ok && res.data) {
        reemplazar(res.data);
        setNuevo("");
        toast.success(`Ubicación «${res.data.nombre}» agregada.`);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo agregar la ubicación");
      }
    });
  };

  const renombrar = () => {
    if (!editando || errorEdicion || pending) return;
    const actual = lista.find((u) => u.id === editando.id);
    if (actual && actual.nombre === editando.nombre.trim().replace(/\s+/g, " ")) {
      setEditando(null);
      return;
    }
    startTransition(async () => {
      const res = await actualizarUbicacionAction(editando.id, { nombre: editando.nombre });
      if (res.ok && res.data) {
        reemplazar(res.data);
        setEditando(null);
        toast.success(`Ahora se llama «${res.data.nombre}» (también en sus productos).`);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo renombrar");
      }
    });
  };

  const mover = (id: string, direccion: "arriba" | "abajo") => {
    const cambios = intercambioOrden(lista, id, direccion);
    if (!cambios || pending) return;
    startTransition(async () => {
      for (const c of cambios) {
        const res = await actualizarUbicacionAction(c.id, { orden: c.orden });
        if (!res.ok || !res.data) {
          toast.error(res.error ?? "No se pudo cambiar el orden");
          router.refresh();
          return;
        }
        reemplazar(res.data);
      }
      router.refresh();
    });
  };

  const aplicarActivo = () => {
    if (!confirmando || pending) return;
    const { id, activar } = confirmando;
    startTransition(async () => {
      const res = await actualizarUbicacionAction(id, { activo: activar });
      if (res.ok && res.data) {
        reemplazar(res.data);
        setConfirmando(null);
        toast.success(activar ? "Ubicación activada." : "Ubicación desactivada.");
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo guardar el cambio");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{TITULO_DIALOGO_UBICACIONES}</DialogTitle>
          <DialogDescription>
            Dónde se guardan los productos de bodega. El orden de esta lista es el de los
            selectores y del filtro. Una ubicación con productos no se desactiva: primero muévelos
            con «Mover a…».
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
                            if (e.key === "Escape") setEditando(null);
                          }}
                          className="h-8"
                          disabled={pending}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
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
                          className="h-8 w-8 p-0"
                          aria-label="Cancelar"
                          onClick={() => setEditando(null)}
                          disabled={pending}
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "truncate text-sm font-medium",
                            !u.activo && "text-muted-foreground line-through decoration-muted-foreground/40",
                          )}
                        >
                          {u.nombre}
                        </span>
                        {!u.activo && (
                          <span className="text-xs text-muted-foreground">{MARCA_INACTIVA}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmando(null);
                            setEditando({ id: u.id, nombre: u.nombre });
                          }}
                          disabled={pending}
                          aria-label={`Renombrar «${u.nombre}»`}
                          title="Renombrar"
                          className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-40"
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    {enEdicion && errorEdicion && (
                      <p className="mt-1 text-xs text-destructive">{errorEdicion}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {textoProductos(Number(u.productos) || 0)}
                    </p>
                  </div>

                  {u.activo ? (
                    <span title={u.productos > 0 ? tituloNoDesactivable(u.productos) : undefined}>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={pending || u.productos > 0}
                        onClick={() => {
                          setEditando(null);
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
                      disabled={pending}
                      onClick={() => {
                        setEditando(null);
                        setConfirmando({ id: u.id, activar: true });
                      }}
                    >
                      Activar
                    </Button>
                  )}
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
                      className="h-7"
                      onClick={aplicarActivo}
                      disabled={pending}
                    >
                      {confirmando.activar ? "Sí, activar" : "Sí, desactivar"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => setConfirmando(null)}
                      disabled={pending}
                    >
                      Cancelar
                    </Button>
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
              className="shrink-0 gap-1.5"
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
