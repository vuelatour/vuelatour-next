"use client";

import { useState, useTransition } from "react";
import { Cog6ToothIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UbicacionesDialog } from "@/components/admin/inventory/ubicaciones-dialog";
import { crearUbicacionAction, listarUbicacionesAction } from "@/app/admin/inventory/actions";
import {
  ETIQUETA_ADMINISTRAR_UBICACIONES,
  ETIQUETA_OPCION_AGREGAR,
  MARCA_INACTIVA,
  NOMBRE_UBICACION_MAX,
  PLACEHOLDER_NUEVA_UBICACION,
  VALOR_AGREGAR_UBICACION,
  opcionesSelectorUbicacion,
  reemplazarUbicacion,
  limpiarNombreUbicacion,
  resolverAltaRapidaUbicacion,
  textoErrorUbicacion,
  textoUbicacionAgregada,
  textoUbicacionYaExistia,
  ubicacionSigueElegible,
  ubicacionTrasVaciar,
} from "@/lib/admin/inventario-ubicacion";
import { cn } from "@/lib/utils";
import type { InventarioUbicacion } from "@/types/inventory";

/**
 * Copia LOCAL del catálogo de ubicaciones que manda el server (patrón
 * base/lista del diálogo «Ubicaciones»): el selector se actualiza al instante
 * con lo que se agregó, renombró o eliminó —sin recargar la página ni cerrar
 * el formulario— y, cuando el server manda un catálogo nuevo
 * (`router.refresh()` / `revalidatePath`), manda el del server.
 */
export function useCatalogoUbicaciones(
  ubicaciones: InventarioUbicacion[] | null | undefined,
): [InventarioUbicacion[], (lista: InventarioUbicacion[]) => void] {
  const [lista, setLista] = useState<InventarioUbicacion[]>(ubicaciones ?? []);
  const [base, setBase] = useState(ubicaciones);
  if (base !== ubicaciones) {
    setBase(ubicaciones);
    setLista(ubicaciones ?? []);
  }
  return [lista, setLista];
}

interface UbicacionSelectorProps {
  /** Lo pone `Field` (clona a su único hijo) para ligar la etiqueta al control. */
  id?: string;
  /** "" = la opción vacía (`etiquetaVacia`). */
  value: string;
  onChange: (valor: string) => void;
  /** Catálogo COMPLETO (con inactivas), la copia local de `useCatalogoUbicaciones`. */
  ubicaciones: InventarioUbicacion[];
  /** Tras agregar/renombrar/eliminar/reordenar: el catálogo nuevo. */
  onCatalogoCambio?: (lista: InventarioUbicacion[]) => void;
  /** La ubicación que el producto YA tiene (se ofrece aunque esté inactiva). */
  actualId?: string | null;
  /** Texto de la opción vacía: «Sin ubicación» (producto) o «Elige la ubicación…» («Mover a…»). */
  etiquetaVacia: string;
  /**
   * ADMIN/MECANICO (roles de POST/PATCH/DELETE `ubicaciones` del API):
   * «＋ Agregar ubicación…» dentro del selector y el engrane «Administrar
   * ubicaciones». Los demás ven el selector de siempre.
   */
  puedeAdministrar?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  /**
   * El nombre tecleado en «＋ Agregar ubicación…» que AÚN no se guarda (null =
   * nada pendiente). El formulario que contiene al selector lo usa para NO
   * guardar con la ubicación anterior mientras haya un nombre a medias
   * (`textoAltaUbicacionPendiente`). Pasar un setter de `useState` (estable).
   */
  onAltaPendiente?: (nombre: string | null) => void;
}

/**
 * Selector de UBICACIÓN con alta y administración en el MISMO lugar
 * (28-sep-2026, pedido del cliente: «una forma rápida y ágil para poder
 * editar, borrar o agregar opciones a este listado de lugares»):
 *
 *  - «＋ Agregar ubicación…» es la última opción: cambia el selector por un
 *    campo de nombre (Enter guarda, Esc cancela), la crea y la deja
 *    SELECCIONADA. Si lo tecleado ya existe (sin acentos ni mayúsculas) se
 *    elige esa en vez de duplicarla.
 *  - El engrane abre el diálogo «Ubicaciones» EXISTENTE (renombrar, ▲▼,
 *    eliminar, desactivar) ENCIMA del formulario: Base UI 1.4 anida diálogos
 *    (el hijo se registra en el árbol del padre: Esc y el clic fuera cierran
 *    solo el de arriba) y el formulario sigue montado con todo lo capturado.
 *
 * Tras cualquier cambio el catálogo se relee (`listarUbicacionesAction`) y el
 * selector se actualiza sin recargar; si la ubicación elegida se eliminó o se
 * desactivó, vuelve a la opción vacía.
 */
export function UbicacionSelector({
  id,
  value,
  onChange,
  ubicaciones,
  onCatalogoCambio,
  actualId = null,
  etiquetaVacia,
  puedeAdministrar = false,
  disabled = false,
  ariaLabel,
  onAltaPendiente,
}: UbicacionSelectorProps) {
  const [pending, startTransition] = useTransition();
  const [agregando, setAgregando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const [administrar, setAdministrar] = useState(false);

  const opciones = opcionesSelectorUbicacion(ubicaciones, actualId);
  const alta = nombre.trim() ? resolverAltaRapidaUbicacion(nombre, ubicaciones) : null;
  const errorLocal =
    alta && (alta.tipo === "INVALIDO" || alta.tipo === "INACTIVA") ? alta.error : null;
  const error = errorLocal ?? errorApi;

  /** Catálogo nuevo: se publica y, si lo elegido ya no vale, se suelta. */
  const aplicarCatalogo = (lista: InventarioUbicacion[]) => {
    onCatalogoCambio?.(lista);
    if (!ubicacionSigueElegible(lista, value, actualId)) onChange("");
  };

  const cancelar = () => {
    setAgregando(false);
    setNombre("");
    setErrorApi(null);
    onAltaPendiente?.(null);
  };

  const guardar = () => {
    if (pending || !alta) return;
    if (alta.tipo === "EXISTE") {
      onChange(alta.ubicacion.id);
      toast.success(textoUbicacionYaExistia(alta.ubicacion.nombre));
      cancelar();
      return;
    }
    if (alta.tipo !== "NUEVA") return;
    startTransition(async () => {
      const res = await crearUbicacionAction(alta.nombre);
      if (res.ok && res.data) {
        const nueva = res.data;
        // Primero el catálogo (para que la opción exista) y luego la
        // selección: así el select nunca apunta a un valor sin opción.
        onCatalogoCambio?.(reemplazarUbicacion(ubicaciones, nueva));
        onChange(nueva.id);
        cancelar();
        toast.success(textoUbicacionAgregada(nueva.nombre));
        // Relectura autoritativa (orden y conteos del server); si falla,
        // basta con la fila que devolvió el alta.
        const r = await listarUbicacionesAction();
        if (r.ok && r.data && r.data.some((u) => u.id === nueva.id)) {
          onCatalogoCambio?.(r.data);
        }
        return;
      }
      // Carrera con otra alta del mismo nombre: el 409 trae la que ganó.
      const dup = (res.details as { id?: string } | undefined)?.id;
      if (res.code === "UBICACION_DUPLICADA" && dup) {
        const r = await listarUbicacionesAction();
        const lista = r.ok && r.data ? r.data : ubicaciones;
        const existente = lista.find((u) => u.id === dup && u.activo);
        if (existente) {
          onCatalogoCambio?.(lista);
          onChange(existente.id);
          toast.success(textoUbicacionYaExistia(existente.nombre));
          cancelar();
          return;
        }
      }
      setErrorApi(textoErrorUbicacion("agregar", res));
    });
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        {agregando ? (
          <>
            <Input
              id={id}
              value={nombre}
              autoFocus
              maxLength={NOMBRE_UBICACION_MAX + 10}
              placeholder={PLACEHOLDER_NUEVA_UBICACION}
              aria-label={PLACEHOLDER_NUEVA_UBICACION}
              aria-invalid={error ? true : undefined}
              disabled={pending}
              onChange={(e) => {
                setNombre(e.target.value);
                setErrorApi(null);
                onAltaPendiente?.(limpiarNombreUbicacion(e.target.value) || null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  // Sin esto el Enter ENVÍA el formulario del producto.
                  e.preventDefault();
                  e.stopPropagation();
                  guardar();
                }
                if (e.key === "Escape") {
                  // Esc cancela el alta, NO cierra el diálogo del producto.
                  e.preventDefault();
                  e.stopPropagation();
                  cancelar();
                }
              }}
              className="h-9"
            />
            <Button
              type="button"
              size="sm"
              className="h-9 shrink-0 cursor-pointer"
              onClick={guardar}
              disabled={pending || !alta || !!errorLocal}
            >
              {pending ? "Guardando…" : "Guardar"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-9 w-9 shrink-0 cursor-pointer p-0"
              aria-label="Cancelar"
              title="Cancelar (Esc)"
              onClick={cancelar}
              disabled={pending}
            >
              <XMarkIcon className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <select
              id={id}
              value={value}
              aria-label={ariaLabel}
              disabled={disabled}
              onChange={(e) => {
                if (e.target.value === VALOR_AGREGAR_UBICACION) {
                  // La opción centinela NO se elige: abre el alta en línea
                  // (el valor anterior se conserva si se cancela).
                  setAgregando(true);
                  setNombre("");
                  setErrorApi(null);
                  return;
                }
                onChange(e.target.value);
              }}
              className="h-9 w-full min-w-0 cursor-pointer rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default dark:bg-input/30"
            >
              <option value="">{etiquetaVacia}</option>
              {opciones.map((u) => (
                <option key={u.id} value={u.id} disabled={!u.activo}>
                  {u.activo ? u.nombre : `${u.nombre} ${MARCA_INACTIVA}`}
                </option>
              ))}
              {puedeAdministrar && (
                <option value={VALOR_AGREGAR_UBICACION}>{ETIQUETA_OPCION_AGREGAR}</option>
              )}
            </select>
            {puedeAdministrar && (
              <button
                type="button"
                onClick={() => setAdministrar(true)}
                disabled={disabled}
                aria-label={ETIQUETA_ADMINISTRAR_UBICACIONES}
                title={ETIQUETA_ADMINISTRAR_UBICACIONES}
                className={cn(
                  "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-input text-muted-foreground",
                  "hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  "disabled:cursor-default disabled:opacity-40",
                )}
              >
                <Cog6ToothIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </div>
      {agregando && error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {puedeAdministrar && (
        <UbicacionesDialog
          open={administrar}
          onOpenChange={setAdministrar}
          ubicaciones={ubicaciones}
          onCatalogoCambio={aplicarCatalogo}
          onProductosMovidos={(desdeId, haciaId) => {
            const siguiente = ubicacionTrasVaciar(value, desdeId, haciaId);
            if (siguiente !== value) onChange(siguiente);
          }}
        />
      )}
    </>
  );
}
