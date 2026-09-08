"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Input } from "@/components/ui/input";
import { medioPagoLabel } from "@/lib/admin/medios-pago";

// Etiquetas desde la FUENTE ÚNICA (@/lib/admin/medios-pago); aquí solo vive
// el ORDEN del filtro. BODEGA queda fuera a propósito (cargo contable de
// inventario, no un pago que la oficina persiga).
const MEDIOS = [
  "EFECTIVO",
  "TARJETA_CORP",
  "TRANSFERENCIA",
  "PAYWISE",
  "PERSONAL_PABLO",
  "PERSONAL_ALE",
].map((value) => ({ value, label: medioPagoLabel(value) }));

// Semáforo de facturación de oficina; "Sin facturar" agrupa pendiente +
// solicitada (lo que aún falta por resolver, en un solo filtro).
const FACTURACION = [
  { value: "PENDIENTE", label: "🔴 Pendiente" },
  { value: "SOLICITADA", label: "🟡 Solicitada" },
  { value: "FACTURADA", label: "🟢 Facturada" },
  { value: "NO_FACTURADA", label: "Sin facturar (pend. + sol.)" },
];

// Orden del listado (7-sep): por fecha del consumo (default) o por el
// momento real de captura — "lo último que subieron", sin importar la fecha
// del ticket. Lo aplica el API y el Excel sale igual.
const ORDEN = [
  { value: "fecha", label: "Fecha del gasto" },
  { value: "captura", label: "Fecha de captura" },
];

/**
 * Filtros de Gastos (pedido de oficina, ago 2026): tipo de pago, quién lo
 * capturó y fechas de corte. Van por querystring (server component recarga con
 * el filtro aplicado) y el botón "Exportar Excel" hereda LOS MISMOS filtros —
 * así el reporte de efectivos por piloto sale con dos clics.
 *
 * Desde el 7-sep hay DOS ejes de fecha, que no se mezclan: la del GASTO
 * (consumo, `desde`/`hasta`) y la de CAPTURA (cuándo se cargó a la app o al
 * panel, `cap_desde`/`cap_hasta`, día Cancún). El chip "Subidos esta semana"
 * es un atajo del segundo eje: fijar un rango de captura lo apaga.
 */
export function ExpensesFilterBar({
  personas,
}: {
  personas: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const set = (cambios: Record<string, string | null>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v == null || v === "") params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    router.push(qs ? `/admin/expenses?${qs}` : "/admin/expenses");
  };

  const medio = sp.get("medio") ?? "";
  const piloto = sp.get("piloto") ?? "";
  const desde = sp.get("desde") ?? "";
  const hasta = sp.get("hasta") ?? "";
  const facturacion = sp.get("facturacion") ?? "";
  const capDesde = sp.get("cap_desde") ?? "";
  const capHasta = sp.get("cap_hasta") ?? "";
  const orden = sp.get("orden") === "captura" ? "captura" : "fecha";
  const hayFiltros = !!(
    medio ||
    piloto ||
    desde ||
    hasta ||
    facturacion ||
    capDesde ||
    capHasta ||
    orden !== "fecha"
  );

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-44">
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">
          Tipo de pago
        </p>
        <SearchableSelect
          options={MEDIOS}
          value={medio}
          onChange={(v) => set({ medio: v })}
          placeholder="Todos"
        />
      </div>
      <div className="w-44">
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">
          Facturación
        </p>
        <SearchableSelect
          options={FACTURACION}
          value={facturacion}
          onChange={(v) => set({ facturacion: v })}
          placeholder="Todas"
        />
      </div>
      <div className="w-48">
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">
          Capturó
        </p>
        <SearchableSelect
          options={personas.map((p) => ({ value: p.id, label: p.nombre }))}
          value={piloto}
          onChange={(v) => set({ piloto: v })}
          placeholder="Todos"
        />
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">
          Gasto desde
        </p>
        <Input
          type="date"
          value={desde}
          onChange={(e) => set({ desde: e.target.value })}
          className="h-9 w-36"
          title="Fecha del consumo (la del ticket)"
        />
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">
          Gasto hasta
        </p>
        <Input
          type="date"
          value={hasta}
          onChange={(e) => set({ hasta: e.target.value })}
          className="h-9 w-36"
          title="Fecha del consumo (la del ticket)"
        />
      </div>
      {/* Eje de CAPTURA: cuándo se cargó a la app/panel (día Cancún). Al
          fijarlo se apaga el chip "Subidos esta semana" (mismo eje). */}
      <div>
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">
          Capturado desde
        </p>
        <Input
          type="date"
          value={capDesde}
          onChange={(e) => set({ cap_desde: e.target.value, cap: null })}
          className="h-9 w-36"
          title="Cuándo se capturó (cargó a la app o al panel), en hora Cancún — aunque el ticket traiga otra fecha"
        />
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">
          Capturado hasta
        </p>
        <Input
          type="date"
          value={capHasta}
          onChange={(e) => set({ cap_hasta: e.target.value, cap: null })}
          className="h-9 w-36"
          title="Cuándo se capturó (cargó a la app o al panel), en hora Cancún — aunque el ticket traiga otra fecha"
        />
      </div>
      <div className="w-40">
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">
          Ordenar por
        </p>
        <SearchableSelect
          options={ORDEN}
          value={orden}
          onChange={(v) => set({ orden: v === "captura" ? "captura" : null })}
          placeholder="Fecha del gasto"
        />
      </div>
      {hayFiltros && (
        <button
          type="button"
          onClick={() =>
            set({
              medio: null,
              piloto: null,
              desde: null,
              hasta: null,
              facturacion: null,
              cap_desde: null,
              cap_hasta: null,
              orden: null,
            })
          }
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <XMarkIcon className="h-3.5 w-3.5" />
          Limpiar
        </button>
      )}
    </div>
  );
}
