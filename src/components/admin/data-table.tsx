"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Tabla de LISTA unificada del panel (fuente única): paginado con selector
 * de filas por página (10/20/50/100), búsqueda rápida instantánea opcional y
 * encabezados fijos al hacer scroll (vienen del <Table> base).
 *
 * Uso: las páginas (server) arman filas serializables y las pasan a un
 * componente cliente delgado que define las columnas. Las tablas de RESUMEN
 * (matrices con totales, reportes) no son listas: esas siguen usando los
 * primitivos de ui/table.
 */
export interface DataTableColumn<T> {
  /** Identificador estable de la columna. */
  key: string;
  header: React.ReactNode;
  headClassName?: string;
  cellClassName?: string;
  cell: (row: T) => React.ReactNode;
  /** true = esta celda NO se envuelve en el link de fila (acciones/botones). */
  noLink?: boolean;
}

export const PAGE_SIZES = [10, 20, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

interface DataTableProps<T> {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  /** Texto por fila para la búsqueda rápida; si se da, aparece el buscador. */
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  /** Link de fila: envuelve el contenido de cada celda (salvo noLink). */
  rowHref?: (row: T) => string;
  rowClassName?: (row: T) => string | undefined;
  defaultPageSize?: PageSize;
  /**
   * Prefijo de los query params que persisten búsqueda (`${syncId}q`) y
   * página (`${syncId}p`) en la URL, para que al volver de un detalle la
   * tabla quede como estaba. Si una página tiene DOS tablas, cada una debe
   * pasar un syncId distinto.
   */
  syncId?: string;
}

/** Búsqueda insensible a acentos y mayúsculas (nombres es-MX). */
function normaliza(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Preferencia global del panel (localStorage): cuántas filas por página
 * quiere ver el user. Como store externo para hidratar sin mismatch (el
 * server siempre pinta el default) y sincronizar todas las tablas abiertas.
 */
const PAGE_SIZE_STORAGE_KEY = "vt-tabla-filas-por-pagina";
const PAGE_SIZE_EVENT = "vt-tabla-filas-por-pagina-cambio";

const pageSizeStore = {
  subscribe(cb: () => void) {
    window.addEventListener("storage", cb);
    window.addEventListener(PAGE_SIZE_EVENT, cb);
    return () => {
      window.removeEventListener("storage", cb);
      window.removeEventListener(PAGE_SIZE_EVENT, cb);
    };
  },
  get(): PageSize | null {
    const v = Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
    return (PAGE_SIZES as readonly number[]).includes(v) ? (v as PageSize) : null;
  },
  set(n: PageSize) {
    localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(n));
    window.dispatchEvent(new Event(PAGE_SIZE_EVENT));
  },
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  searchText,
  searchPlaceholder = "Buscar en la tabla…",
  rowHref,
  rowClassName,
  defaultPageSize = 20,
  syncId = "t",
}: DataTableProps<T>) {
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);

  // ── Persistencia en la URL (query params ${syncId}q / ${syncId}p) ──
  // El server no conoce la URL, así que el estado arranca vacío y un efecto
  // post-mount aplica los params UNA vez: así la hidratación no truena
  // (server y cliente pintan lo mismo) y al volver de un detalle con
  // router.back() la tabla restaura búsqueda y página.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get(`${syncId}q`);
    const p = Number(params.get(`${syncId}p`));
    // Restaurar DESDE la URL (sistema externo) una sola vez al montar es el
    // caso legítimo que el linter no distingue de un efecto en cascada.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (q) setBusqueda(q);
    if (Number.isInteger(p) && p > 1) setPagina(p);
  }, [syncId]);

  // Escribe el estado a la URL SIN recargar ni ensuciar el historial
  // (replaceState, integrado con el router de Next). Conserva el resto de
  // params (filtros del server como aeronave_id no se tocan).
  const escribirUrl = useCallback(
    (q: string, p: number) => {
      const url = new URL(window.location.href);
      if (q.trim()) url.searchParams.set(`${syncId}q`, q);
      else url.searchParams.delete(`${syncId}q`);
      if (p > 1) url.searchParams.set(`${syncId}p`, String(p));
      else url.searchParams.delete(`${syncId}p`);
      window.history.replaceState(null, "", url.toString());
    },
    [syncId],
  );

  // Debounce de la búsqueda (~300ms) para no reescribir la URL por tecla.
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      // Al desmontar (p. ej. navegar al detalle) se cancela cualquier
      // escritura pendiente para no pisar la URL de la página nueva.
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, []);

  const cambiarBusqueda = (q: string) => {
    setBusqueda(q);
    setPagina(1); // nueva búsqueda = de vuelta a la página 1
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      escribirUrl(q, 1);
    }, 300);
  };

  const cambiarPagina = (p: number) => {
    setPagina(p);
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    escribirUrl(busqueda, p);
  };

  const guardado = useSyncExternalStore(
    pageSizeStore.subscribe,
    pageSizeStore.get,
    () => null,
  );
  const pageSize = guardado ?? defaultPageSize;

  const cambiarPageSize = (n: PageSize) => {
    cambiarPagina(1);
    pageSizeStore.set(n);
  };

  const filtradas = useMemo(() => {
    if (!searchText || !busqueda.trim()) return rows;
    const q = normaliza(busqueda.trim());
    return rows.filter((r) => normaliza(searchText(r)).includes(q));
  }, [rows, busqueda, searchText]);

  // Página segura DERIVADA: si el filtro o un refetch encogen la lista, no
  // se queda apuntando a una página que ya no existe.
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / pageSize));
  const paginaActual = Math.min(pagina, totalPaginas);
  const desde = (paginaActual - 1) * pageSize;
  const visibles = filtradas.slice(desde, desde + pageSize);

  const conBuscador = !!searchText && rows.length > 0;
  // Sin suficientes filas no hay nada que paginar: la barra solo estorba.
  const conBarra = filtradas.length > PAGE_SIZES[0] || rows.length > pageSize;

  return (
    <div>
      {conBuscador && (
        <div className="border-b border-border p-3">
          <div className="relative max-w-xs">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => cambiarBusqueda(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 pl-8 text-sm"
              aria-label="Buscar en la tabla"
            />
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.key} className={c.headClassName}>
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibles.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="py-8 text-center text-sm text-muted-foreground whitespace-normal"
              >
                Sin resultados para &ldquo;{busqueda.trim()}&rdquo;.{" "}
                <button
                  type="button"
                  onClick={() => cambiarBusqueda("")}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Limpiar búsqueda
                </button>
              </TableCell>
            </TableRow>
          ) : (
            visibles.map((row) => {
              const href = rowHref?.(row);
              return (
                <TableRow
                  key={rowKey(row)}
                  className={
                    (href ? "cursor-pointer hover:bg-muted/40 " : "") +
                    (rowClassName?.(row) ?? "")
                  }
                >
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.cellClassName}>
                      {href && !c.noLink ? (
                        <Link href={href} className="block">
                          {c.cell(row)}
                        </Link>
                      ) : (
                        c.cell(row)
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {conBarra && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-3">
          <p className="text-xs text-muted-foreground">
            {filtradas.length === 0
              ? "0 resultados"
              : `${desde + 1}–${Math.min(desde + pageSize, filtradas.length)} de ${filtradas.length}`}
            {filtradas.length !== rows.length && (
              <span> (filtrados de {rows.length})</span>
            )}
          </p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Filas por página
              <select
                value={pageSize}
                onChange={(e) => cambiarPageSize(Number(e.target.value) as PageSize)}
                className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => cambiarPagina(paginaActual - 1)}
                disabled={paginaActual <= 1}
                aria-label="Página anterior"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Página {paginaActual} de {totalPaginas}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => cambiarPagina(paginaActual + 1)}
                disabled={paginaActual >= totalPaginas}
                aria-label="Página siguiente"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
