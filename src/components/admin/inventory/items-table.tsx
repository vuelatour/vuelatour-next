"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowsRightLeftIcon,
  ExclamationTriangleIcon,
  MapPinIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableOrden,
} from "@/components/admin/data-table";
import { ItemActions } from "@/components/admin/inventory/item-actions";
import { MoverUbicacionDialog } from "@/components/admin/inventory/mover-ubicacion-dialog";
import { UbicacionesDialog } from "@/components/admin/inventory/ubicaciones-dialog";
import { cn } from "@/lib/utils";
import {
  ATAJOS_ORDEN_INVENTARIO,
  ORDEN_INVENTARIO_DEFAULT,
  direccionDeColumna,
  ordenAlPulsarColumna,
  ordenInventarioDeUrl,
  ordenarInventario,
  resolverOrdenInventario,
  type ColumnaInventario,
  type EleccionOrden,
  type OrdenInventario,
} from "@/lib/admin/inventario-orden";
import {
  ETIQUETA_FILTRO_TODAS,
  ETIQUETA_MOVER,
  ETIQUETA_UBICACION,
  MARCA_ANTERIOR,
  TITULO_ANTERIOR,
  TITULO_DIALOGO_UBICACIONES,
  filtrarPorUbicacion,
  filtroUbicacionDeUrl,
  mapaOrdenUbicacion,
  opcionesFiltroUbicacion,
  resolverFiltroUbicacion,
  textoUbicacion,
  ubicacionesActivas,
  type EleccionFiltroUbicacion,
  type FiltroUbicacion,
} from "@/lib/admin/inventario-ubicacion";
import {
  ETIQUETA_UTILIDAD,
  avisoUtilidad,
  partesUtilidad,
  tituloUtilidad,
  utilidadDeItem,
} from "@/lib/admin/inventario-utilidad";
import type { InventarioItemWithStock, InventarioUbicacion } from "@/types/inventory";

const num = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 3 });

interface ItemsTableProps {
  items: InventarioItemWithStock[];
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
  categorias: string[];
  /**
   * `?orden=` ya validado por la página (server). Solo RESPALDO cuando no hay
   * router (tests): en el panel manda la URL viva (`useSearchParams`).
   */
  ordenInicial?: OrdenInventario;
  /**
   * Catálogo de ubicaciones (incluye inactivas). `null`/ausente = API previo,
   * migración sin aplicar o lectura fallida: la columna pinta `ubicacion` tal
   * cual y NO se ofrecen filtro, «Mover a…» ni «Ubicaciones».
   */
  ubicaciones?: InventarioUbicacion[] | null;
  /** Margen vigente de la tienda (solo para TEXTOS; el número lo decide el API). */
  margenVentaPct?: number | null;
  /** ADMIN/MECANICO: «Mover a…» y administrar el catálogo (roles del API). */
  puedeAdministrarUbicaciones?: boolean;
  /** `?ubic=` de respaldo sin router (tests). */
  filtroUbicacionInicial?: FiltroUbicacion;
}

/** Key de columna de la tabla → columna del orden (la de producto ordena por nombre). */
const COLUMNA_DE_KEY: Record<string, ColumnaInventario> = {
  producto: "nombre",
  categoria: "categoria",
  stock: "stock",
  utilidad: "utilidad",
  ubicacion: "ubicacion",
};

/**
 * Escribe un parámetro de la URL SIN recargar ni ensuciar el historial
 * (mismo mecanismo que la búsqueda/página de DataTable). El default no se
 * escribe: la URL limpia es la de siempre. Conserva los demás parámetros.
 */
function escribirParamEnUrl(clave: string, valor: string | null) {
  const url = new URL(window.location.href);
  if (valor == null) url.searchParams.delete(clave);
  else url.searchParams.set(clave, valor);
  // Un filtro nuevo regresa la tabla a la página 1 (como la búsqueda).
  if (clave === "ubic") url.searchParams.delete("tp");
  window.history.replaceState(null, "", url.toString());
}

/**
 * Tabla principal de Inventario — Producto · Categoría · Stock · Utilidad ·
 * Ubicación · ⋯ (pedido del cliente 25-sep-2026). La fila abre el detalle
 * del producto (compras, ventas y resumen por día).
 *
 * UTILIDAD: la manda el API (fuente única `ventaDeSalida`, la misma del
 * Balance general). Desde el 0.0.36 cuenta en PESOS (ventas en dólares al
 * T.C. oficial de su día; el dólar original va en el tooltip); solo filas
 * que sigan sin T.C. traen una línea aparte en dólares. Aquí solo se pinta,
 * una línea por moneda, jamás sumadas.
 *
 * UBICACIÓN: el nombre del catálogo o, si el producto aún no tiene la nueva,
 * su texto anterior con «(anterior)» en ámbar. Filtro por ubicación y «Mover
 * a…» en lote sobre lo que el operador está viendo (filtro + búsqueda).
 *
 * Orden (24-sep-2026): encabezados clicables ↑/↓ y atajos «A–Z · Se están
 * acabando primero · Más stock» sobre la bodega COMPLETA (ya filtrada por
 * ubicación), antes de la búsqueda y del paginado. Lógica en
 * `lib/admin/inventario-orden.ts`; el valor viaja en `?orden=`.
 */
export function ItemsTable({
  items,
  aircraft,
  providers,
  categorias,
  ordenInicial = ORDEN_INVENTARIO_DEFAULT,
  ubicaciones = null,
  margenVentaPct = null,
  puedeAdministrarUbicaciones = false,
  filtroUbicacionInicial = null,
}: ItemsTableProps) {
  // La URL VIVA manda (revisión 24-sep-2026). Al volver del detalle con
  // «Inventario» (BackLink = router.back()) Next REUSA el payload ya pintado
  // de esta página: su `ordenInicial` es el de la PRIMERA carga, no el que el
  // operador eligió después con clics (solo se escribió con replaceState).
  const sp = useSearchParams();
  const ordenUrl = sp ? ordenInventarioDeUrl(sp.get("orden")) : ordenInicial;
  // Clic = respuesta INMEDIATA: la elección local gana mientras la URL siga
  // en el valor sobre el que se tomó (ver `resolverOrdenInventario`).
  const [eleccion, setEleccion] = useState<EleccionOrden | null>(null);
  const resuelto = resolverOrdenInventario(eleccion, ordenUrl);
  if (resuelto.eleccion !== eleccion) setEleccion(resuelto.eleccion);
  const orden = resuelto.orden;

  // Filtro por UBICACIÓN (`?ubic=`), mismo contrato de URL viva. Solo con el
  // catálogo disponible: sin él no hay nada que filtrar.
  const catalogo = useMemo(() => ubicaciones ?? [], [ubicaciones]);
  const conCatalogo = ubicaciones != null;
  const filtroUrl: FiltroUbicacion = !conCatalogo
    ? null
    : sp
      ? filtroUbicacionDeUrl(sp.get("ubic"), catalogo)
      : filtroUbicacionInicial;
  const [eleccionUbic, setEleccionUbic] = useState<EleccionFiltroUbicacion | null>(null);
  const resueltoUbic = resolverFiltroUbicacion(eleccionUbic, filtroUrl);
  if (resueltoUbic.eleccion !== eleccionUbic) setEleccionUbic(resueltoUbic.eleccion);
  const filtroUbic = resueltoUbic.filtro;

  const ordenUbicacion = useMemo(() => mapaOrdenUbicacion(catalogo), [catalogo]);
  const opcionesUbic = useMemo(
    () => (conCatalogo ? opcionesFiltroUbicacion(items, catalogo) : []),
    [conCatalogo, items, catalogo],
  );
  const destinos = useMemo(() => ubicacionesActivas(catalogo), [catalogo]);

  const ordenados = useMemo(
    () => ordenarInventario(filtrarPorUbicacion(items, filtroUbic), orden, { ordenUbicacion }),
    [items, filtroUbic, orden, ordenUbicacion],
  );

  // Filas que el operador está VIENDO (filtro + búsqueda rápida, todas las
  // páginas): sobre ellas actúa «Mover a…». DataTable avisa sus ids; las
  // filas se toman de `ordenados` (datos frescos tras un refresh, y nunca un
  // producto que el filtro ya sacó de la vista).
  const [idsVistos, setIdsVistos] = useState<ReadonlySet<string>>(() => new Set());
  const avisarVistas = useMemo(
    () => (filas: InventarioItemWithStock[]) => setIdsVistos(new Set(filas.map((x) => x.id))),
    [],
  );
  const filasMover = ordenados.filter((x) => idsVistos.has(x.id));

  const [abrirMover, setAbrirMover] = useState(false);
  const [abrirUbicaciones, setAbrirUbicaciones] = useState(false);

  const cambiarOrden = (nuevo: OrdenInventario) => {
    setEleccion({ base: ordenUrl, valor: nuevo });
    escribirParamEnUrl("orden", nuevo === ORDEN_INVENTARIO_DEFAULT ? null : nuevo);
  };

  const cambiarFiltroUbic = (nuevo: FiltroUbicacion) => {
    setEleccionUbic({ base: filtroUrl, valor: nuevo });
    escribirParamEnUrl("ubic", nuevo);
  };

  const ordenTabla: DataTableOrden = {
    direccion: (key) => {
      const col = COLUMNA_DE_KEY[key];
      return col ? direccionDeColumna(col, orden) : null;
    },
    alPulsarColumna: (key) => {
      const col = COLUMNA_DE_KEY[key];
      if (col) cambiarOrden(ordenAlPulsarColumna(col, orden));
    },
    atajos: ATAJOS_ORDEN_INVENTARIO,
    atajoActivo: orden,
    alElegirAtajo: (valor) => cambiarOrden(ordenInventarioDeUrl(valor)),
  };

  const columns: Array<DataTableColumn<InventarioItemWithStock>> = [
    {
      key: "producto",
      header: "Producto",
      ordenable: true,
      cell: (it) => (
        <div className="flex items-center gap-2.5">
          {it.foto_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={it.foto_url}
              alt={it.nombre}
              className="h-9 w-9 shrink-0 rounded-md object-cover ring-1 ring-border"
            />
          )}
          <div className="min-w-0">
            <span className="font-medium">{it.nombre}</span>
            {(it.marca || it.numero_parte || it.codigo) && (
              <span className="block text-xs text-muted-foreground">
                {it.marca && <span>{it.marca}</span>}
                {it.marca && (it.numero_parte || it.codigo) && " · "}
                {(it.numero_parte || it.codigo) && (
                  <span className="font-mono">
                    {[it.numero_parte, it.codigo].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
            )}
            {(it.empaques ?? []).some((e) => e.activo) && (
              <span className="block text-[11px] text-muted-foreground">
                {(it.empaques ?? [])
                  .filter((e) => e.activo)
                  .map((e) => `${e.nombre} (${e.factor})`)
                  .join(" · ")}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "categoria",
      header: "Categoría",
      ordenable: true,
      cellClassName: "text-muted-foreground",
      cell: (it) => it.categoria,
    },
    {
      key: "stock",
      header: "Stock",
      ordenable: true,
      headClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      cell: (it) => (
        <span className="inline-flex items-center gap-1.5">
          {num(it.stock)}
          {it.unidad && (
            <span className="ml-1 text-xs text-muted-foreground">{it.unidad}</span>
          )}
          {it.bajo_stock && (
            <Badge variant="outline" className="border-amber-500/50 text-amber-600">
              Bajo
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: "utilidad",
      header: ETIQUETA_UTILIDAD,
      ordenable: true,
      headClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      cell: (it) => <UtilidadCell item={it} margenVentaPct={margenVentaPct} />,
    },
    {
      key: "ubicacion",
      header: ETIQUETA_UBICACION,
      ordenable: true,
      cell: (it) => <UbicacionCell item={it} />,
    },
    {
      key: "acciones",
      header: "",
      headClassName: "w-10",
      noLink: true,
      cell: (it) => (
        <ItemActions
          item={it}
          aircraft={aircraft}
          providers={providers}
          categorias={categorias}
          ubicaciones={ubicaciones}
          margenVentaPct={margenVentaPct}
        />
      ),
    },
  ];

  const nombreFiltro =
    filtroUbic != null ? opcionesUbic.find((o) => o.valor === filtroUbic)?.etiqueta : null;

  return (
    <div>
      {conCatalogo && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPinIcon className="h-4 w-4" aria-hidden="true" />
            {ETIQUETA_UBICACION}:
            <select
              value={filtroUbic ?? ""}
              onChange={(e) => cambiarFiltroUbic(e.target.value || null)}
              aria-label="Filtrar por ubicación"
              className="h-8 max-w-[16rem] cursor-pointer rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">
                {ETIQUETA_FILTRO_TODAS} ({items.length})
              </option>
              {opcionesUbic.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.etiqueta} ({o.conteo})
                </option>
              ))}
            </select>
          </label>
          {puedeAdministrarUbicaciones && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={filasMover.length === 0 || destinos.length === 0}
                title={
                  destinos.length === 0
                    ? "Primero agrega una ubicación en «Ubicaciones»"
                    : filasMover.length === 0
                      ? "No hay productos en la vista"
                      : `Mover los ${filasMover.length} productos que estás viendo`
                }
                onClick={() => setAbrirMover(true)}
              >
                <ArrowsRightLeftIcon className="h-4 w-4" />
                {ETIQUETA_MOVER}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="gap-1.5"
                onClick={() => setAbrirUbicaciones(true)}
              >
                <MapPinIcon className="h-4 w-4" />
                {TITULO_DIALOGO_UBICACIONES}
              </Button>
            </div>
          )}
        </div>
      )}

      {ordenados.length === 0 && items.length > 0 ? (
        // El filtro dejó la vista vacía: se DICE cuál y se ofrece quitarlo
        // (la tabla vacía diría «Sin resultados para “”», que no explica nada).
        <div className="px-6 py-10 text-center text-sm text-muted-foreground">
          No hay productos en «{nombreFiltro ?? "esta ubicación"}».{" "}
          <button
            type="button"
            onClick={() => cambiarFiltroUbic(null)}
            className="cursor-pointer underline underline-offset-2 hover:text-foreground"
          >
            Ver todas las ubicaciones
          </button>
        </div>
      ) : (
        <DataTable
          // Otro filtro de ubicación = otra lista: se remonta para volver a la
          // página 1 (la búsqueda `tq` se restaura sola desde la URL).
          key={filtroUbic ?? "todas"}
          columns={columns}
          rows={ordenados}
          orden={ordenTabla}
          rowKey={(it) => it.id}
          rowHref={(it) => `/admin/inventory/${it.id}`}
          alCambiarFiltradas={conCatalogo && puedeAdministrarUbicaciones ? avisarVistas : undefined}
          searchText={(it) =>
            [
              it.nombre,
              it.marca,
              it.numero_parte,
              it.codigo,
              it.categoria,
              textoUbicacion(it).texto,
              ...(it.empaques ?? []).flatMap((e) => [e.nombre, e.codigo]),
            ]
              .filter(Boolean)
              .join(" ")
          }
          searchPlaceholder="Buscar producto (nombre, marca, parte, código, categoría, ubicación)…"
        />
      )}

      {conCatalogo && puedeAdministrarUbicaciones && (
        <>
          <MoverUbicacionDialog
            open={abrirMover}
            onOpenChange={setAbrirMover}
            productos={filasMover.map((x) => ({
              id: x.id,
              nombre: x.nombre,
              ubicacion_id: x.ubicacion_id ?? null,
            }))}
            destinos={destinos}
          />
          <UbicacionesDialog
            open={abrirUbicaciones}
            onOpenChange={setAbrirUbicaciones}
            ubicaciones={catalogo}
          />
        </>
      )}
    </div>
  );
}

/**
 * Utilidad del producto: una línea por moneda (verde si ganó, rojo si
 * perdió, neutro en 0), «—» si nunca vendió con utilidad. Tooltip: cuántas
 * unidades se cargaron a aviones y el margen vigente. Triángulo ámbar solo
 * cuando la cifra no es de fiar (entradas a $0, ventas no calculables).
 */
function UtilidadCell({
  item,
  margenVentaPct,
}: {
  item: InventarioItemWithStock;
  margenVentaPct: number | null;
}) {
  const partes = partesUtilidad(utilidadDeItem(item));
  const aviso = avisoUtilidad(item);
  const titulo = tituloUtilidad(item, margenVentaPct);
  const tituloCompleto = aviso ? `${titulo}. ${aviso}` : titulo;
  if (partes.length === 0) {
    return (
      <span
        className="inline-flex items-center justify-end gap-1.5 text-muted-foreground"
        title={tituloCompleto}
      >
        —
        {aviso && <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-amber-500" aria-label={aviso} />}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-end gap-1.5" title={tituloCompleto}>
      <span className="flex flex-col items-end leading-tight">
        {partes.map((p) => (
          <span
            key={p.moneda}
            className={cn(
              "font-medium whitespace-nowrap",
              p.tono === "positivo"
                ? "text-emerald-600 dark:text-emerald-400"
                : p.tono === "negativo"
                  ? "text-red-600"
                  : "text-muted-foreground",
            )}
          >
            {p.texto}
          </span>
        ))}
      </span>
      {aviso && (
        <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-amber-500" aria-label={aviso} />
      )}
    </span>
  );
}

/**
 * Ubicación: nombre del catálogo · texto anterior con «(anterior)» en ámbar
 * (tooltip «Elige la ubicación nueva») · «Sin ubicación» tenue. Con un API
 * previo, el texto tal cual (nada es «anterior»).
 */
function UbicacionCell({ item }: { item: InventarioItemWithStock }) {
  const { texto, tipo } = textoUbicacion(item);
  if (tipo === "LEGADO") {
    return (
      <span className="text-amber-700 dark:text-amber-400" title={TITULO_ANTERIOR}>
        {texto} <span className="text-xs font-medium">{MARCA_ANTERIOR}</span>
      </span>
    );
  }
  if (tipo === "VACIA") {
    return <span className="text-xs text-muted-foreground/70">{texto}</span>;
  }
  return <span className="text-muted-foreground">{texto}</span>;
}
