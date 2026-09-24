"use client";

import { useEffect, useRef, useState } from "react";
import { MagnifyingGlassIcon, PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { folioTexto } from "@/lib/admin/grupos-ui";
import { fmtDate } from "@/lib/datetime";
import { fmtMonto } from "@/lib/format";
import { buscarVuelosCandidatos } from "@/lib/api/facturas-emitidas-browser";
import type {
  GrupoDeVueloFactura,
  TotalVuelo,
  VueloCandidatoFactura,
} from "@/types/facturas-emitidas";

/** Vuelo elegido en el diálogo (lo mínimo para pintar su chip). */
export interface VueloSeleccionado {
  id: string;
  folio: number;
  fecha_vuelo: string | null;
  cliente_id?: string | null;
  cliente_nombre?: string | null;
  estado?: string;
  total?: TotalVuelo;
  /** `undefined` = no se sabe todavía (se hidrata con `ids`). */
  grupo?: GrupoDeVueloFactura | null;
  facturas_vigentes?: string[];
}

export function vueloDeCandidato(v: VueloCandidatoFactura): VueloSeleccionado {
  return {
    id: v.id,
    folio: v.folio,
    fecha_vuelo: v.fecha_vuelo,
    cliente_id: v.cliente_id,
    cliente_nombre: v.cliente_nombre,
    estado: v.estado,
    total: v.total,
    grupo: v.grupo,
    facturas_vigentes: v.facturas_vigentes,
  };
}

/** «#341 · 27 sep 2026 · Maqar · $8,050.40 USD». */
function textoCandidato(v: VueloCandidatoFactura): string {
  return [
    `#${v.folio}`,
    v.fecha_vuelo ? fmtDate(v.fecha_vuelo) : "sin fecha",
    v.cliente_nombre ?? null,
    v.total?.usd ? fmtMonto(v.total.usd, "USD") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function ChipMini({ children, tono }: { children: React.ReactNode; tono: "ambar" | "gris" | "rojo" | "fucsia" }) {
  const cls = {
    ambar: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    gris: "border-border bg-muted/40 text-muted-foreground",
    rojo: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
    fucsia: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
  }[tono];
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

/**
 * Selector de VUELOS de una factura (varios; una factura puede cubrir un
 * grupo o anticipo + finiquito de varios vuelos). Busca en el API por
 * #folio, día (`2026-09-27` o `27/09`) o cliente; sin texto propone primero
 * los que están «por facturar». Los cancelados salen marcados: el cargo por
 * cancelación también se factura.
 */
export function SelectorVuelosFactura({
  seleccionados,
  onChange,
  disabled = false,
}: {
  seleccionados: VueloSeleccionado[];
  onChange: (v: VueloSeleccionado[]) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<VueloCandidatoFactura[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [agregandoGrupo, setAgregandoGrupo] = useState(false);
  const pedidoRef = useRef(0);
  const hidratadoRef = useRef(false);
  // Lo elegido AHORA: la hidratación responde después de un `await` y, si
  // Mari agregó o quitó un vuelo mientras tanto, se aplica sobre la lista
  // vigente (con la capturada al pedir, ese cambio se perdía en silencio).
  const seleccionadosRef = useRef(seleccionados);
  useEffect(() => {
    seleccionadosRef.current = seleccionados;
  }, [seleccionados]);

  // Búsqueda con debounce de 300 ms (solo con la lista abierta).
  useEffect(() => {
    if (!abierto) return;
    const turno = ++pedidoRef.current;
    const reloj = window.setTimeout(async () => {
      setBuscando(true);
      const res = await buscarVuelosCandidatos(q);
      if (turno !== pedidoRef.current) return;
      setBuscando(false);
      if (res.ok) {
        setResultados(res.data);
        setError(null);
      } else {
        setResultados([]);
        setError(res.error);
      }
    }, 300);
    return () => window.clearTimeout(reloj);
  }, [q, abierto]);

  // Hidrata el grupo de los vuelos que llegaron sin él (edición): así se
  // ofrece «Agregar los N del grupo» también al editar.
  useEffect(() => {
    if (hidratadoRef.current) return;
    const faltan = seleccionados.filter((v) => v.grupo === undefined).map((v) => v.id);
    if (faltan.length === 0) return;
    hidratadoRef.current = true;
    void buscarVuelosCandidatos("", { ids: faltan }).then((res) => {
      if (!res.ok) return;
      const porId = new Map(res.data.map((v) => [v.id, v]));
      onChange(
        seleccionadosRef.current.map((v) => {
          const h = porId.get(v.id);
          return h ? { ...vueloDeCandidato(h), ...v, grupo: h.grupo } : { ...v, grupo: v.grupo ?? null };
        }),
      );
    });
  }, [seleccionados, onChange]);

  const idsElegidos = new Set(seleccionados.map((v) => v.id));

  const agregar = (v: VueloCandidatoFactura) => {
    if (idsElegidos.has(v.id)) return;
    onChange([...seleccionados, vueloDeCandidato(v)]);
  };

  const quitar = (id: string) => onChange(seleccionados.filter((v) => v.id !== id));

  // Grupos con aviones que faltan por agregar.
  const gruposIncompletos = (() => {
    const porGrupo = new Map<string, { grupo: GrupoDeVueloFactura; elegidos: number }>();
    for (const v of seleccionados) {
      if (!v.grupo || v.grupo.total_aviones <= 1) continue;
      const g = porGrupo.get(v.grupo.id) ?? { grupo: v.grupo, elegidos: 0 };
      g.elegidos += 1;
      porGrupo.set(v.grupo.id, g);
    }
    return [...porGrupo.values()].filter((g) => g.elegidos < g.grupo.total_aviones);
  })();

  const agregarGrupo = async (grupo: GrupoDeVueloFactura) => {
    setAgregandoGrupo(true);
    const res = await buscarVuelosCandidatos("", { grupo_id: grupo.id });
    setAgregandoGrupo(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // Sobre lo elegido AHORA (la respuesta llega después de un `await`).
    const actuales = seleccionadosRef.current;
    const ya = new Set(actuales.map((v) => v.id));
    const nuevos = res.data.filter((v) => !ya.has(v.id)).map(vueloDeCandidato);
    onChange([...actuales, ...nuevos]);
  };

  return (
    <div className="space-y-2">
      {seleccionados.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {seleccionados.map((v) => (
            <span
              key={v.id}
              className="inline-flex items-center gap-1 rounded-full border border-brand-600/30 bg-brand-600/10 py-0.5 pl-2 pr-0.5 text-xs"
            >
              <span className="font-mono">#{v.folio}</span>
              {v.fecha_vuelo && (
                <span className="text-muted-foreground">· {fmtDate(v.fecha_vuelo)}</span>
              )}
              {v.estado === "CANCELADO" && <ChipMini tono="rojo">Cancelado</ChipMini>}
              <button
                type="button"
                onClick={() => quitar(v.id)}
                disabled={disabled}
                className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed"
                aria-label={`Quitar el vuelo #${v.folio}`}
                title={`Quitar el vuelo #${v.folio}`}
              >
                <XMarkIcon className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {gruposIncompletos.map(({ grupo }) => (
        <Button
          key={grupo.id}
          type="button"
          size="sm"
          variant="outline"
          className="gap-1"
          disabled={disabled || agregandoGrupo}
          onClick={() => void agregarGrupo(grupo)}
          title={`La factura cubre el grupo ${folioTexto(grupo.folio)}: agrega a los demás aviones`}
        >
          <PlusIcon className="h-3.5 w-3.5" />
          {agregandoGrupo ? "Agregando…" : `Agregar los ${grupo.total_aviones} del grupo`}
        </Button>
      ))}

      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          placeholder="Buscar vuelo por #folio, cliente o fecha"
          aria-label="Buscar vuelo por #folio, cliente o fecha"
          className="pl-8"
          disabled={disabled}
        />
      </div>

      {abierto && (
        <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
          <div className="sticky top-0 flex items-center justify-between border-b border-border bg-popover px-3 py-1">
            <span className="text-[11px] text-muted-foreground">
              {buscando ? "Buscando…" : "Toca un vuelo para agregarlo"}
            </span>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="cursor-pointer text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Ocultar
            </button>
          </div>
          {buscando && resultados === null ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>
          ) : error ? (
            <p className="px-3 py-2 text-xs text-destructive">{error}</p>
          ) : resultados && resultados.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {q.trim() ? "Ningún vuelo coincide." : "Escribe el #folio, el cliente o la fecha del vuelo."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {(resultados ?? []).map((v) => {
                const ya = idsElegidos.has(v.id);
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      disabled={disabled || ya}
                      onClick={() => agregar(v)}
                      className="flex w-full cursor-pointer flex-wrap items-center gap-1.5 px-3 py-2 text-left text-xs hover:bg-muted/60 disabled:cursor-default disabled:opacity-60"
                    >
                      <span className="font-medium">{textoCandidato(v)}</span>
                      {v.solicitud && <ChipMini tono="ambar">Por facturar</ChipMini>}
                      {v.facturas_vigentes.length > 0 && (
                        <ChipMini tono="gris">Ya tiene {v.facturas_vigentes.join(", ")}</ChipMini>
                      )}
                      {v.estado === "CANCELADO" && <ChipMini tono="rojo">Cancelado</ChipMini>}
                      {v.grupo && v.grupo.total_aviones > 1 && (
                        <ChipMini tono="fucsia">
                          {folioTexto(v.grupo.folio)} · {v.grupo.total_aviones} aviones
                        </ChipMini>
                      )}
                      {ya && <span className="text-muted-foreground">· ya elegido</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
