import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ImagePreview } from "@/components/admin/image-preview";
import { ExpenseActions } from "@/components/admin/expenses/expense-actions";
import { ExpenseCreateDialog } from "@/components/admin/expenses/expense-create-dialog";
import { fmtDateOnly } from "@/lib/datetime";
import type { Gasto } from "@/types/expenses";

const ESTATUS_STYLE: Record<string, string> = {
  FACTURA: "border-emerald-500/50 text-emerald-600",
  VALE: "border-amber-500/50 text-amber-600",
  SIN_COMPROBANTE: "border-navy-400/50 text-muted-foreground",
};

const ORIGEN_BADGE: Record<string, { label: string; cls: string }> = {
  OFICINA: { label: "Oficina", cls: "border-sky-500/50 text-sky-600" },
  SISTEMA: { label: "Sistema", cls: "border-violet-500/50 text-violet-600" },
};

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
}: {
  gastos: Gasto[];
  fotoUrls: Record<string, string>;
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
  /** Para capturar un gasto YA ligado a este vuelo (ej. honorario del piloto externo). */
  vueloId?: string;
  vueloFolio?: number;
  aeronaveId?: string | null;
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Desglose / notas</TableHead>
                  <TableHead>Capturó</TableHead>
                  <TableHead>Comp.</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gastos.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="whitespace-nowrap align-top">
                      {fmtDateOnly(g.fecha_gasto)}
                    </TableCell>
                    <TableCell className="align-top">
                      {g.categoria}
                      {g.lugar ? (
                        <p className="text-[11px] text-muted-foreground font-mono">{g.lugar}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap align-top">
                      {fmtMoney(g.monto, g.moneda)}
                    </TableCell>
                    <TableCell className="align-top max-w-md">
                      {g.notas ? (
                        <p className="text-xs text-muted-foreground whitespace-pre-line">
                          {g.notas}
                        </p>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {g.captura?.nombre ?? "—"}
                        {g.origen && ORIGEN_BADGE[g.origen] && (
                          <Badge variant="outline" className={ORIGEN_BADGE[g.origen].cls}>
                            {ORIGEN_BADGE[g.origen].label}
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex items-center gap-2">
                        {g.foto_url && fotoUrls[g.foto_url] && (
                          <ImagePreview
                            src={fotoUrls[g.foto_url]}
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
                    </TableCell>
                    <TableCell className="align-top">
                      {/* Mismas acciones que en Gastos: verificar/editar,
                          corregir el vuelo y eliminar, sin salir del vuelo. */}
                      <ExpenseActions
                        gasto={g}
                        aircraft={aircraft}
                        providers={providers}
                        fotoUrl={g.foto_url ? fotoUrls[g.foto_url] : undefined}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
