import Link from "next/link";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
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
import { cn } from "@/lib/utils";
import { ImportButton } from "@/components/admin/conciliacion/import-button";
import { MovimientoActions } from "@/components/admin/conciliacion/movimiento-actions";
import {
  listMovimientosBancarios,
  type ListConciliacionQuery,
} from "@/lib/api/conciliacion-server";
import { listBankAccounts } from "@/lib/api/bank-accounts-server";
import { listGastos } from "@/lib/api/expenses-server";

export const dynamic = "force-dynamic";

type Filtro = "todos" | "pendientes" | "conciliados";

const fmtMoney = (monto: string) =>
  Number(monto).toLocaleString("es-MX", { minimumFractionDigits: 2 });
const fmtDate = (s: string | null) =>
  s ? new Date(`${s}T00:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default async function ConciliacionPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const sp = await searchParams;
  const filtro: Filtro = sp.f === "pendientes" || sp.f === "conciliados" ? sp.f : "todos";

  const query: ListConciliacionQuery = { limit: 300 };
  if (filtro === "pendientes") query.conciliado = false;
  if (filtro === "conciliados") query.conciliado = true;

  const [{ data: movs }, cuentasRes, gastosRes] = await Promise.all([
    listMovimientosBancarios(query),
    listBankAccounts({ limit: 100 }),
    listGastos({ limit: 200 }),
  ]);

  const cuentas = cuentasRes.data.map((c) => ({
    id: c.id,
    label: `${c.alias} · ${c.banco} (${c.moneda})`,
  }));
  const gastosOpts = gastosRes.data.map((g) => ({
    value: g.id,
    label: `${g.categoria} · $${fmtMoney(g.monto)} · ${fmtDate(g.fecha_gasto)}${
      g.proveedor?.nombre ? ` · ${g.proveedor.nombre}` : ""
    }`,
  }));

  const tabs: { key: Filtro; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "pendientes", label: "Pendientes" },
    { key: "conciliados", label: "Conciliados" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Tesorería</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Conciliación</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sube el estado de cuenta: los cargos se cruzan automáticamente con los gastos por monto
            y fecha. Los ambiguos se vinculan a mano.
          </p>
        </div>
        <ImportButton cuentas={cuentas} />
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "todos" ? "/admin/conciliacion" : `/admin/conciliacion?f=${t.key}`}
            className={cn(
              "inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              filtro === t.key
                ? "bg-brand-600 text-white"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {movs.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <ArrowsRightLeftIcon className="h-12 w-12 text-muted-foreground" />
            </div>
            <CardTitle>Sin movimientos</CardTitle>
            <CardDescription>
              Importa un estado de cuenta para cruzar los movimientos con los gastos capturados.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Conciliación</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movs.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap">{fmtDate(m.fecha)}</TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[280px]">
                      {m.descripcion ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          m.tipo === "CARGO"
                            ? "border-brand-600/50 text-brand-600"
                            : "border-emerald-500/50 text-emerald-600"
                        }
                      >
                        {m.tipo === "CARGO" ? "Cargo" : "Abono"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(m.monto)}</TableCell>
                    <TableCell>
                      {m.conciliado && m.gasto ? (
                        <span className="text-sm text-emerald-600">
                          {m.gasto.categoria} · ${fmtMoney(m.gasto.monto)}
                        </span>
                      ) : m.tipo === "ABONO" ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                          Pendiente
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {m.tipo === "CARGO" && <MovimientoActions movimiento={m} gastos={gastosOpts} />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
