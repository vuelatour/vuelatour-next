import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
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
import { MovementButton } from "@/components/admin/inventory/movement-button";
import { getCardex, getInventoryItem } from "@/lib/api/inventory-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listProviders } from "@/lib/api/providers-server";
import { isApiError } from "@/lib/api/errors";
import { fmtDecimal, fmtUsd } from "@/lib/format";
import { labelOf, TIPO_MOVIMIENTO_OPTIONS } from "../schema";
import type { TipoMovimientoInventario } from "@/types/inventory";

export const dynamic = "force-dynamic";

const TIPO_STYLES: Record<TipoMovimientoInventario, string> = {
  ENTRADA: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  SALIDA: "bg-destructive/15 text-destructive border-destructive/30",
  DEVOLUCION: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  AJUSTE: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
};

const TIPO_LABELS: Record<TipoMovimientoInventario, string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  DEVOLUCION: "Devolución",
  AJUSTE: "Ajuste",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InventoryDetailPage({ params }: PageProps) {
  const { id } = await params;

  let item;
  try {
    item = await getInventoryItem(id);
  } catch (err) {
    if (isApiError(err) && err.status === 404) notFound();
    throw err;
  }

  const [cardex, aircraftRes, providersRes] = await Promise.all([
    getCardex(id),
    listAircraft({ limit: 100, activa: true }),
    listProviders({ limit: 300, activo: true }),
  ]);

  const aircraftById = new Map(aircraftRes.data.map((a) => [a.id, a]));
  const providersById = new Map(providersRes.data.map((p) => [p.id, p]));
  const aircraftOpts = aircraftRes.data.map((a) => ({
    id: a.id,
    matricula: a.matricula,
  }));
  const providerOpts = providersRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));

  return (
    <div className="space-y-6">
      <Link
        href="/admin/inventory"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Inventario
      </Link>

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            {item.nombre}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {item.categoria}
            {item.numero_parte && (
              <span className="font-mono"> · {item.numero_parte}</span>
            )}{" "}
            · {item.ubicacion}
            {!item.activo && (
              <Badge variant="secondary" className="ml-1.5 text-[10px]">
                Inactivo
              </Badge>
            )}
          </p>
        </div>
        <MovementButton item={item} aircraft={aircraftOpts} providers={providerOpts} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Stock actual"
          value={fmtDecimal(item.stock_actual)}
          accent={item.bajo_stock ? "text-amber-600 dark:text-amber-400" : undefined}
          hint={
            item.stock_minimo
              ? `Mínimo: ${fmtDecimal(item.stock_minimo)}`
              : "Sin stock mínimo configurado"
          }
        />
        <StatCard label="Valor en bodega (FIFO)" value={fmtUsd(item.valor_usd)} />
        <StatCard label="Movimientos" value={String(cardex.length)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cardex</CardTitle>
          <CardDescription>
            Historial completo de entradas y salidas. Costeo FIFO.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {cardex.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Sin movimientos todavía. Registra una entrada para iniciar el cardex.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Costo unit.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Origen / Destino</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cardex.map((m) => {
                  const cant = Number(m.cantidad);
                  const costo = Number(m.costo_unitario_usd);
                  const ac = m.aeronave_id ? aircraftById.get(m.aeronave_id) : null;
                  const prov = m.proveedor_id
                    ? providersById.get(m.proveedor_id)
                    : null;
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(`${m.fecha_movimiento}T00:00:00`).toLocaleDateString(
                          "es-MX",
                          { day: "2-digit", month: "short", year: "numeric" },
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={TIPO_STYLES[m.tipo]}>
                          {TIPO_LABELS[m.tipo]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtDecimal(cant)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {fmtUsd(costo)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtUsd(cant * costo)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {ac ? (
                          <span className="font-mono">{ac.matricula}</span>
                        ) : prov ? (
                          prov.nombre
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {m.referencia && (
                          <span className="text-muted-foreground"> · {m.referencia}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtDecimal(m.saldo)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {labelOf(TIPO_MOVIMIENTO_OPTIONS, "SALIDA")} y ajustes toman el costo de las
        capas más antiguas (FIFO).
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold mt-1 ${accent ?? ""}`}>{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}
