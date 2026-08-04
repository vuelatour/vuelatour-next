"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Input } from "@/components/ui/input";

const MEDIOS = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TARJETA_CORP", label: "Tarjeta corporativa" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "PERSONAL_PABLO", label: "Personal Pablo" },
  { value: "PERSONAL_ALE", label: "Personal Ale" },
];

/**
 * Filtros de Gastos (pedido de oficina, ago 2026): tipo de pago, quién lo
 * capturó y fechas de corte. Van por querystring (server component recarga con
 * el filtro aplicado) y el botón "Exportar Excel" hereda LOS MISMOS filtros —
 * así el reporte de efectivos por piloto sale con dos clics.
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
  const hayFiltros = !!(medio || piloto || desde || hasta);

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
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">Desde</p>
        <Input
          type="date"
          value={desde}
          onChange={(e) => set({ desde: e.target.value })}
          className="h-9 w-36"
        />
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">Hasta</p>
        <Input
          type="date"
          value={hasta}
          onChange={(e) => set({ hasta: e.target.value })}
          className="h-9 w-36"
        />
      </div>
      {hayFiltros && (
        <button
          type="button"
          onClick={() =>
            set({ medio: null, piloto: null, desde: null, hasta: null })
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
