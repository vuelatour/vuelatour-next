"use client";

import { useEffect, useState } from "react";
import { ArrowPathIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listGastosCandidatosCompraAction } from "@/app/admin/inventory/compras/actions";
import { todayCancun } from "@/lib/datetime";
import {
  HINT_CANDIDATOS,
  PLACEHOLDER_BUSCAR_CANDIDATO,
  TEXTO_CANDIDATOS_TRUNCADOS,
  TEXTO_SIN_CANDIDATOS,
  lineaCandidato,
} from "@/lib/admin/compras-estado";
import { cn } from "@/lib/utils";
import type { GastoCandidatoCompra } from "@/types/compras";

/** Ventana inicial del selector: 120 días hacia atrás (la del API). */
const DIAS_VENTANA = 120;

function restarDias(dia: string, dias: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/**
 * «Vincular gasto ya registrado» (21-oct-2026, invariante 101 del API): el
 * selector de gastos SIN compra, con búsqueda libre y rango de fechas; los
 * candidatos los filtra el API (`GET /v1/compras/gastos-candidatos`). Lo usan
 * la compra (cualquier rol) y la ENTRADA de inventario (solo mercancía). Una
 * lectura por cambio de filtros con turno: una respuesta vieja no pisa a la
 * nueva. Si la lectura falla se dice con «Reintentar», jamás «no hay gastos».
 */
export function GastoCandidatoSelector({
  value,
  onChange,
  soloMercancia = false,
  proveedorId,
  id,
}: {
  /** id del gasto elegido ("" = ninguno). */
  value: string;
  onChange: (gasto: GastoCandidatoCompra | null) => void;
  /** Solo gastos que pueden ser la factura de MERCANCÍA (entrada de inventario). */
  soloMercancia?: boolean;
  /** Acota al proveedor de la compra (opcional). */
  proveedorId?: string | null;
  id?: string;
}) {
  const hoy = todayCancun();
  const [q, setQ] = useState("");
  const [desde, setDesde] = useState(restarDias(hoy, DIAS_VENTANA));
  const [hasta, setHasta] = useState(hoy);
  const [intento, setIntento] = useState(0);
  const [carga, setCarga] = useState<{
    clave: string;
    lista: GastoCandidatoCompra[] | null;
    truncado: boolean;
    fallo: boolean;
  }>({ clave: "", lista: null, truncado: false, fallo: false });

  const clave = JSON.stringify({ q: q.trim(), desde, hasta, soloMercancia, proveedorId: proveedorId ?? null, intento });

  useEffect(() => {
    let vivo = true;
    const timer = setTimeout(() => {
      void listGastosCandidatosCompraAction({
        ...(q.trim() ? { q: q.trim() } : {}),
        ...(/^\d{4}-\d{2}-\d{2}$/.test(desde) ? { desde } : {}),
        ...(/^\d{4}-\d{2}-\d{2}$/.test(hasta) ? { hasta } : {}),
        ...(proveedorId ? { proveedor_id: proveedorId } : {}),
        ...(soloMercancia ? { solo_mercancia: true } : {}),
        limite: 100,
      })
        .then((r) => {
          if (!vivo) return;
          if (r.ok && r.data) setCarga({ clave, lista: r.data.data, truncado: r.data.truncado, fallo: false });
          else setCarga({ clave, lista: null, truncado: false, fallo: true });
        })
        .catch(() => {
          if (vivo) setCarga({ clave, lista: null, truncado: false, fallo: true });
        });
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
    // La clave resume todos los filtros (y el intento de «Reintentar»).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const cargando = carga.clave !== clave;
  const lista = carga.lista ?? [];

  return (
    <div id={id} className="space-y-2" data-selector-candidatos={soloMercancia ? "mercancia" : "todos"}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={PLACEHOLDER_BUSCAR_CANDIDATO}
            className="pl-8"
            aria-label="Buscar gasto"
          />
        </div>
        <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" className="w-40" />
        <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" className="w-40" />
      </div>
      <p className="text-xs text-muted-foreground">{HINT_CANDIDATOS}</p>
      {!cargando && carga.fallo ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
          <span>No se pudieron cargar los gastos.</span>
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1" onClick={() => setIntento((n) => n + 1)}>
            <ArrowPathIcon className="h-3.5 w-3.5" />
            Reintentar
          </Button>
        </div>
      ) : (
        <div
          role="radiogroup"
          aria-label="Gastos candidatos"
          aria-busy={cargando}
          className={cn("max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-1", cargando && "opacity-60")}
        >
          {cargando && carga.lista === null ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">Cargando gastos…</p>
          ) : lista.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">{TEXTO_SIN_CANDIDATOS}</p>
          ) : (
            lista.map((g) => {
              const l = lineaCandidato(g);
              const elegido = g.id === value;
              return (
                <button
                  key={g.id}
                  type="button"
                  role="radio"
                  aria-checked={elegido}
                  onClick={() => onChange(elegido ? null : g)}
                  className={cn(
                    "block w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                    elegido && "bg-brand-600/10 ring-1 ring-brand-600/50",
                  )}
                  data-candidato={g.id}
                >
                  <span className="block font-medium">{l.titulo}</span>
                  {l.detalle && <span className="block text-xs text-muted-foreground">{l.detalle}</span>}
                </button>
              );
            })
          )}
        </div>
      )}
      {carga.truncado && !cargando && (
        <p className="text-xs text-amber-700 dark:text-amber-400">{TEXTO_CANDIDATOS_TRUNCADOS}</p>
      )}
    </div>
  );
}
