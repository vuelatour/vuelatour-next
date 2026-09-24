"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SIN_EMISORA, type FiltrosFacturas } from "@/lib/admin/facturas-emitidas";

const ESTATUS = [
  { value: "", label: "Todas" },
  { value: "VIGENTE", label: "Vigentes" },
  { value: "CANCELADA", label: "Canceladas" },
];

const ALERTAS = [
  { value: "", label: "Todas" },
  { value: "duplicado_vuelo", label: "Vuelo con 2 facturas" },
  { value: "sin_pdf", label: "Sin PDF" },
  { value: "sin_vuelo", label: "Sin vuelo" },
  { value: "vuelo_cancelado", label: "Vuelo cancelado" },
];

/**
 * Barra de filtros del REGISTRO de facturas emitidas (24-sep-2026). Todo vive
 * en la URL (`router.replace`) para que un enlace o el «atrás» del navegador
 * conserven la vista; la página valida los parámetros antes de hablar con el
 * API. Los textos libres (buscar, serie) esperan 300 ms antes de filtrar.
 */
export function RegistroFacturasFiltros({
  filtros,
  clientes,
  emisoras,
}: {
  /** Filtros YA validados por la página. */
  filtros: FiltrosFacturas;
  clientes: { id: string; nombre: string }[];
  emisoras: { id: string; razon_social: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState(filtros.q ?? "");
  const [serie, setSerie] = useState(filtros.serie ?? "");
  const relojRef = useRef<number | null>(null);

  const pushQuery = useCallback(
    (next: Record<string, string>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v) sp.set(k, v);
        else sp.delete(k);
      }
      // Un cambio de filtro ya no apunta a la fila resaltada ni a la página
      // de la tabla.
      sp.delete("resaltar");
      sp.delete("fep");
      const qs = sp.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [params, pathname, router],
  );

  const conDebounce = (next: Record<string, string>) => {
    if (relojRef.current !== null) window.clearTimeout(relojRef.current);
    relojRef.current = window.setTimeout(() => {
      relojRef.current = null;
      pushQuery(next);
    }, 300);
  };

  useEffect(
    () => () => {
      if (relojRef.current !== null) window.clearTimeout(relojRef.current);
    },
    [],
  );

  const hayFiltros = !!(
    filtros.q ||
    filtros.desde ||
    filtros.hasta ||
    filtros.cliente_id ||
    filtros.emisora_id ||
    filtros.serie ||
    filtros.estatus ||
    filtros.alerta ||
    filtros.vuelo_id
  );

  const limpiar = () => {
    setQ("");
    setSerie("");
    pushQuery({
      q: "",
      desde: "",
      hasta: "",
      cliente_id: "",
      emisora_id: "",
      serie: "",
      estatus: "",
      alerta: "",
      vuelo_id: "",
    });
  };

  return (
    <Card>
      <CardContent className="grid items-end gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs font-medium">Buscar</Label>
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                conDebounce({ q: e.target.value.trim() });
              }}
              placeholder="Serie-folio, UUID, cliente, RFC o #vuelo"
              aria-label="Buscar factura"
              className="pl-8"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Emitidas desde</Label>
          <Input
            // `key`: «Limpiar filtros» vacía la URL y el input se reinicia.
            key={`desde-${filtros.desde ?? ""}`}
            type="date"
            defaultValue={filtros.desde ?? ""}
            className="cursor-pointer"
            aria-label="Emitidas desde"
            onChange={(e) => pushQuery({ desde: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Hasta</Label>
          <Input
            key={`hasta-${filtros.hasta ?? ""}`}
            type="date"
            defaultValue={filtros.hasta ?? ""}
            className="cursor-pointer"
            aria-label="Emitidas hasta"
            onChange={(e) => pushQuery({ hasta: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Cliente</Label>
          <SearchableSelect
            options={[
              { value: "", label: "Todos" },
              ...clientes.map((c) => ({ value: c.id, label: c.nombre })),
            ]}
            value={filtros.cliente_id ?? ""}
            onChange={(v) => pushQuery({ cliente_id: v })}
            placeholder="Todos"
          />
        </div>
        {emisoras.length >= 2 && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Emisor</Label>
            <SearchableSelect
              options={[
                { value: "", label: "Todas" },
                ...emisoras.map((e) => ({ value: e.id, label: e.razon_social })),
                { value: SIN_EMISORA, label: "Sin emisor" },
              ]}
              value={filtros.emisora_id ?? ""}
              onChange={(v) => pushQuery({ emisora_id: v })}
              placeholder="Todas"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Serie</Label>
          <Input
            value={serie}
            onChange={(e) => {
              const v = e.target.value.toUpperCase();
              setSerie(v);
              conDebounce({ serie: v.trim() });
            }}
            placeholder="Ej. A"
            aria-label="Serie"
            maxLength={25}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Estatus</Label>
          <SearchableSelect
            options={ESTATUS}
            value={filtros.estatus ?? ""}
            onChange={(v) => pushQuery({ estatus: v })}
            placeholder="Todas"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Alerta</Label>
            {hayFiltros && (
              <button
                type="button"
                onClick={limpiar}
                className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <XMarkIcon className="h-3 w-3" />
                Limpiar filtros
              </button>
            )}
          </div>
          <SearchableSelect
            options={ALERTAS}
            value={filtros.alerta ?? ""}
            onChange={(v) => pushQuery({ alerta: v })}
            placeholder="Todas"
          />
        </div>
      </CardContent>
    </Card>
  );
}
