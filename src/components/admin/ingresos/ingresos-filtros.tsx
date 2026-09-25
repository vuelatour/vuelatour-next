"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlassIcon, TableCellsIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CATEGORIAS_INGRESO, etiquetaCategoriaIngreso } from "@/lib/admin/categorias-ingreso";
import {
  ETIQUETA_FILTRO_CONCILIACION,
  hrefIngresos,
  nombreExportIngresos,
  periodosRapidos,
  rutaExportIngresos,
  type ClaveUrlIngresos,
  type FiltroConciliacion,
  type FiltrosIngresos,
} from "@/lib/admin/ingresos-ui";
import { descargarArchivoDelPanel } from "@/lib/descargar-archivo";
import { cn } from "@/lib/utils";

/**
 * Barra de filtros de Ingresos (24-sep-2026): todo vive en la URL (la página
 * server los VALIDA con `filtrosIngresosDeUrl`) y cada pestaña muestra solo
 * los filtros que su lista entiende — el API corre con `forbidNonWhitelisted`.
 */
export function IngresosFiltros({
  filtros,
  cuentas,
  hoy,
}: {
  filtros: FiltrosIngresos;
  cuentas: { id: string; label: string }[];
  hoy: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(filtros.q ?? "");
  const tab = filtros.tab;
  const ir = (cambios: Partial<Record<ClaveUrlIngresos, string | null>>) =>
    router.push(hrefIngresos({ ...filtros, ingreso: undefined }, cambios));

  const conCategoria = tab === "todos" || tab === "otros";
  const conCuenta = tab === "otros" || tab === "anticipos" || tab === "por-conciliar";
  const conMoneda = tab !== "por-conciliar";
  const conConciliacion = tab !== "por-conciliar";
  const conBusqueda = tab !== "por-conciliar";
  const conciliaciones: FiltroConciliacion[] =
    tab === "todos" || tab === "cobros"
      ? ["conciliado", "sin_conciliar", "no_bancario", "via_anticipo"]
      : ["conciliado", "sin_conciliar", "no_bancario"];
  const periodoIgnorado = tab === "anticipos" && filtros.saldo !== "todos";
  const hayFiltros = !!(
    filtros.periodoExplicito ||
    filtros.moneda ||
    filtros.categoria ||
    filtros.cuenta ||
    filtros.conciliacion ||
    filtros.q ||
    filtros.bajas
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Desde</p>
          <Input
            type="date"
            value={filtros.desde}
            max={hoy}
            onChange={(e) => e.target.value && ir({ desde: e.target.value, hasta: filtros.hasta })}
            className="h-9 w-36 cursor-pointer"
            title="Fecha en que entró el dinero (día de Cancún)"
          />
        </div>
        <div>
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Hasta</p>
          <Input
            type="date"
            value={filtros.hasta}
            onChange={(e) => e.target.value && ir({ desde: filtros.desde, hasta: e.target.value })}
            className="h-9 w-36 cursor-pointer"
            title="Fecha en que entró el dinero (día de Cancún)"
          />
        </div>
        <div className="flex flex-wrap gap-1 pb-0.5">
          {periodosRapidos(hoy).map((p) => {
            const activo = p.desde === filtros.desde && p.hasta === filtros.hasta;
            return (
              <button
                key={p.clave}
                type="button"
                onClick={() => ir({ desde: p.desde, hasta: p.hasta })}
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center rounded-lg px-2.5 text-xs font-medium transition-colors",
                  activo ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {p.etiqueta}
              </button>
            );
          })}
        </div>
        {conMoneda && (
          <div className="w-32">
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">Moneda</p>
            <SearchableSelect
              options={[
                { value: "", label: "Todas" },
                { value: "MXN", label: "MXN" },
                { value: "USD", label: "USD" },
              ]}
              value={filtros.moneda ?? ""}
              onChange={(v) => ir({ moneda: v || null })}
              placeholder="Todas"
            />
          </div>
        )}
        {conCategoria && (
          <div className="w-56">
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">Categoría</p>
            <SearchableSelect
              options={[
                { value: "", label: "Todas" },
                ...CATEGORIAS_INGRESO.filter((c) => tab !== "otros" || c !== "ANTICIPO_CLIENTE").map((c) => ({
                  value: c,
                  label: etiquetaCategoriaIngreso(c),
                })),
              ]}
              value={filtros.categoria ?? ""}
              onChange={(v) => ir({ categoria: v || null })}
              placeholder="Todas"
            />
          </div>
        )}
        {conCuenta && cuentas.length > 0 && (
          <div className="w-56">
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">Cuenta</p>
            <SearchableSelect
              options={[{ value: "", label: "Todas las cuentas" }, ...cuentas.map((c) => ({ value: c.id, label: c.label }))]}
              value={filtros.cuenta ?? ""}
              onChange={(v) => ir({ cuenta: v || null })}
              placeholder="Todas las cuentas"
            />
          </div>
        )}
        {conConciliacion && (
          <div className="w-52">
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">Conciliación</p>
            <SearchableSelect
              options={[
                { value: "", label: "Todas" },
                ...conciliaciones.map((c) => ({ value: c, label: ETIQUETA_FILTRO_CONCILIACION[c] })),
              ]}
              value={filtros.conciliacion ?? ""}
              onChange={(v) => ir({ conciliacion: v || null })}
              placeholder="Todas"
            />
          </div>
        )}
        {tab === "otros" && (
          <div className="w-48">
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">Dados de baja</p>
            <SearchableSelect
              options={[
                { value: "", label: "No mostrar" },
                { value: "incluir", label: "Ver dados de baja también" },
                { value: "solo", label: "Solo dados de baja" },
              ]}
              value={filtros.bajas ?? ""}
              onChange={(v) => ir({ bajas: v || null })}
              placeholder="No mostrar"
            />
          </div>
        )}
        {conBusqueda && (
          <form
            className="flex items-end gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              ir({ q: q.trim() || null });
            }}
          >
            <div>
              <p className="mb-1 text-[11px] font-medium text-muted-foreground">Buscar</p>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Folio, ING-n, cliente, concepto…"
                maxLength={80}
                className="h-9 w-56"
              />
            </div>
            <Button type="submit" variant="outline" size="icon" className="h-9 w-9" title="Buscar">
              <MagnifyingGlassIcon className="h-4 w-4" />
            </Button>
          </form>
        )}
        {hayFiltros && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              router.push(hrefIngresos(
                { tab, desde: filtros.desde, hasta: filtros.hasta, periodoExplicito: false },
                {},
              ));
            }}
            className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <XMarkIcon className="h-3.5 w-3.5" />
            Limpiar
          </button>
        )}
      </div>
      {periodoIgnorado && (
        <p className="text-[11px] text-muted-foreground">
          «Con saldo» muestra TODOS los anticipos con saldo por aplicar, de cualquier fecha (el periodo
          aplica a «Todos» y a los depósitos de abajo).
        </p>
      )}
    </div>
  );
}

/** «Descargar Excel» con los MISMOS filtros de la vista (proxy del panel, nunca blob a pestaña). */
export function DescargarExcelIngresos({ filtros }: { filtros: FiltrosIngresos }) {
  const [cargando, setCargando] = useState(false);
  return (
    <Button
      variant="outline"
      className="gap-2"
      disabled={cargando}
      onClick={async () => {
        setCargando(true);
        const err = await descargarArchivoDelPanel(rutaExportIngresos(filtros), {
          respaldo: nombreExportIngresos(filtros.desde, filtros.hasta),
        });
        setCargando(false);
        if (err) toast.error("No se pudo descargar el Excel", { description: err });
      }}
    >
      <TableCellsIcon className="h-4 w-4" />
      {cargando ? "Generando…" : "Descargar Excel"}
    </Button>
  );
}
