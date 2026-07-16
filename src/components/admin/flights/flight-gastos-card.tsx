import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ExpenseCreateDialog } from "@/components/admin/expenses/expense-create-dialog";
import { FlightGastosTable } from "@/components/admin/flights/flight-gastos-table";
import type { Gasto } from "@/types/expenses";

const fmtMoney = (monto: string, moneda: string) =>
  Number(monto).toLocaleString("es-MX", { style: "currency", currency: moneda });

/**
 * Todos los gastos del vuelo con su desglose (notas): la vista detallada que
 * pidió el cliente — el piloto solo captura el total; oficina ve aquí el
 * detalle completo (Operación / FBO con IVA, combustible, viáticos...).
 */
export function FlightGastosCard({
  gastos,
  fotoUrls,
  aircraft,
  providers,
  vueloId,
  vueloFolio,
  aeronaveId,
  pilotoNombre,
}: {
  gastos: Gasto[];
  fotoUrls: Record<string, string>;
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
  /** Para capturar un gasto YA ligado a este vuelo (ej. honorario del piloto externo). */
  vueloId?: string;
  vueloFolio?: number;
  aeronaveId?: string | null;
  /** Piloto del vuelo (para "simular como piloto"). null = sin piloto. */
  pilotoNombre?: string | null;
}) {
  // Totales por moneda (no se mezclan MXN y USD).
  const totales = new Map<string, number>();
  for (const g of gastos) {
    totales.set(g.moneda, (totales.get(g.moneda) ?? 0) + Number(g.monto));
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Gastos del vuelo</CardTitle>
            <CardDescription>
              Operativos y generales, con su desglose. Se administran en{" "}
              <Link href="/admin/expenses" className="text-brand-600 hover:underline">
                Gastos
              </Link>
              .
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            {vueloId && (
              <ExpenseCreateDialog
                aircraft={aircraft}
                providers={providers}
                defaultVueloId={vueloId}
                defaultVueloFolio={vueloFolio}
                defaultAeronaveId={aeronaveId ?? undefined}
                defaultPilotoNombre={pilotoNombre ?? null}
              />
            )}
          {gastos.length > 0 && (
            <div className="text-right">
              {[...totales.entries()].map(([moneda, total]) => (
                <p key={moneda} className="text-sm font-semibold tabular-nums">
                  {fmtMoney(String(total), moneda)}
                </p>
              ))}
              <p className="text-[11px] text-muted-foreground">
                {gastos.length} gasto{gastos.length === 1 ? "" : "s"}
              </p>
            </div>
          )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {gastos.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            Sin gastos ligados a este vuelo todavía.
          </p>
        ) : (
          <FlightGastosTable
            gastos={gastos}
            fotoUrls={fotoUrls}
            aircraft={aircraft}
            providers={providers}
          />
        )}
      </CardContent>
    </Card>
  );
}
