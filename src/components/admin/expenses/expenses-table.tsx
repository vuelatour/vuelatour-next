"use client";

import { useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { marcarFacturadoAction } from "@/app/admin/expenses/actions";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { ComprobantePreview } from "@/components/admin/comprobante-preview";
import { ExpenseActions } from "@/components/admin/expenses/expense-actions";
import { fmtDateOnly } from "@/lib/datetime";
import type { Gasto } from "@/types/expenses";

const fmtMoney = (monto: string, moneda: string) =>
  Number(monto).toLocaleString("es-MX", { style: "currency", currency: moneda });

const ESTATUS_STYLE: Record<string, string> = {
  FACTURA: "border-emerald-500/50 text-emerald-600",
  VALE: "border-amber-500/50 text-amber-600",
  SIN_COMPROBANTE: "border-navy-400/50 text-muted-foreground",
};

// Distintivo pedido por el cliente: los gastos que sube administración (o que
// genera el sistema, p.ej. pistas) se distinguen de los capturados en campo.
const ORIGEN_BADGE: Record<string, { label: string; cls: string }> = {
  OFICINA: { label: "Oficina", cls: "border-sky-500/50 text-sky-600" },
  SISTEMA: { label: "Sistema", cls: "border-violet-500/50 text-violet-600" },
};

export function ExpensesTable({
  gastos,
  aircraft,
  providers,
  fotoUrls,
}: {
  gastos: Gasto[];
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
  fotoUrls: Record<string, string>;
}) {
  const columns = useMemo<Array<DataTableColumn<Gasto>>>(
    () => [
      {
        key: "fecha",
        header: "Fecha",
        cellClassName: "whitespace-nowrap",
        cell: (g) => fmtDateOnly(g.fecha_gasto),
      },
      {
        key: "categoria",
        header: "Categoría",
        cell: (g) => (
          <span className="inline-flex items-center gap-1.5">
            {g.categoria}
            {g.duplicado_sospechado && (
              <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                Duplicado?
              </Badge>
            )}
            {g.requiere_visto_bueno === true && (
              <Badge
                variant="outline"
                className="border-sky-500/50 text-sky-600"
                title="Prellenado con IA desde la app: pendiente del visto bueno de administración (menú ⋯ → Dar visto bueno)."
              >
                Visto bueno
              </Badge>
            )}
          </span>
        ),
      },
      {
        key: "monto",
        header: "Monto",
        headClassName: "text-right",
        cellClassName: "text-right tabular-nums whitespace-nowrap",
        // El monto ES el total pagado (ticket + propina): lo que llega al
        // banco. La propina solo se anota como sub-línea informativa.
        cell: (g) => (
          <>
            {fmtMoney(g.monto, g.moneda)}
            {Number(g.propina ?? 0) > 0 && (
              <p className="text-[10px] text-muted-foreground">
                incl. propina {fmtMoney(g.propina!, g.moneda)}
              </p>
            )}
          </>
        ),
      },
      {
        key: "pago",
        header: "Pago",
        cellClassName: "whitespace-nowrap",
        cell: (g) => (
          <div className="space-y-0.5">
            <span className="text-xs">
              {MEDIO_PAGO_LABELS[g.medio_pago] ?? g.medio_pago}
            </span>
            {/* Efectivo: ¿ya se facturó el ticket? Toggle de un clic. */}
            {g.medio_pago === "EFECTIVO" && <FacturadoToggle gasto={g} />}
          </div>
        ),
      },
      {
        key: "avion",
        header: "Avión",
        cell: (g) =>
          g.aeronave?.matricula ? (
            <span className="font-mono">{g.aeronave.matricula}</span>
          ) : (
            <Badge variant="outline" className="border-amber-500/50 text-amber-600">
              Pendiente
            </Badge>
          ),
      },
      {
        key: "vuelo",
        header: "Vuelo",
        cell: (g) =>
          g.vuelo_id ? (
            <Link
              href={`/admin/flights/${g.vuelo_id}`}
              className="font-mono text-brand-600 hover:underline"
            >
              #{g.vuelo?.folio ?? "ver"}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "capturo",
        header: "Capturó",
        cellClassName: "text-muted-foreground",
        cell: (g) => (
          <span className="inline-flex items-center gap-1.5">
            {g.captura?.nombre ?? "—"}
            {g.origen && ORIGEN_BADGE[g.origen] && (
              <Badge variant="outline" className={ORIGEN_BADGE[g.origen].cls}>
                {ORIGEN_BADGE[g.origen].label}
              </Badge>
            )}
          </span>
        ),
      },
      {
        key: "comprobante",
        header: "Comp.",
        cell: (g) => (
          <div className="flex items-center gap-2">
            {g.foto_url && fotoUrls[g.foto_url] && (
              <ComprobantePreview
                path={g.foto_url}
                url={fotoUrls[g.foto_url]}
                alt={`Comprobante · ${g.categoria}`}
              />
            )}
            <Badge
              variant="outline"
              className={ESTATUS_STYLE[g.estatus_comprobante] ?? ""}
            >
              {g.estatus_comprobante === "SIN_COMPROBANTE"
                ? "Sin comp."
                : g.estatus_comprobante === "VALE"
                  ? "Vale"
                  : "Factura"}
            </Badge>
          </div>
        ),
      },
      {
        key: "acciones",
        header: "",
        headClassName: "w-10",
        cell: (g) => (
          <ExpenseActions
            gasto={g}
            aircraft={aircraft}
            providers={providers}
            fotoUrl={g.foto_url ? fotoUrls[g.foto_url] : undefined}
          />
        ),
      },
    ],
    [aircraft, providers, fotoUrls],
  );

  return (
    <DataTable
      columns={columns}
      rows={gastos}
      rowKey={(g) => g.id}
      searchText={(g) =>
        [
          g.categoria,
          g.proveedor?.nombre ?? "",
          g.aeronave?.matricula ?? "",
          g.lugar ?? "",
          g.vuelo?.folio ?? "",
          g.captura?.nombre ?? "",
        ].join(" ")
      }
      searchPlaceholder="Buscar gasto (proveedor, categoría, matrícula, lugar)…"
    />
  );
}

const MEDIO_PAGO_LABELS: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_CORP: "Tarjeta corporativa",
  TRANSFERENCIA: "Transferencia",
  PERSONAL_PABLO: "Personal Pablo",
  PERSONAL_ALE: "Personal Ale",
  BODEGA: "Bodega",
};

/**
 * ¿El ticket en EFECTIVO ya se facturó? Un clic alterna facturado ↔ por
 * facturar (FACTURA ↔ VALE en estatus_comprobante — VALE es, por definición
 * del enum, "efectivo sin factura"). No pide confirmación: no es destructivo
 * y el mismo botón lo revierte.
 */
function FacturadoToggle({ gasto }: { gasto: Gasto }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const facturado = gasto.estatus_comprobante === "FACTURA";

  const toggle = () =>
    startTransition(async () => {
      const res = await marcarFacturadoAction(gasto.id, !facturado);
      if (res.ok) {
        toast.success(
          !facturado
            ? "Marcado como facturado"
            : "Marcado como por facturar",
        );
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo actualizar");
      }
    });

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={
        facturado
          ? "Ticket ya facturado. Clic para regresarlo a «por facturar»."
          : "Ticket en efectivo SIN facturar. Clic para marcarlo como facturado."
      }
      className={
        "block rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50 " +
        (facturado
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400")
      }
    >
      {pending ? "…" : facturado ? "Facturado" : "Por facturar"}
    </button>
  );
}
