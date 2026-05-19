import {
  BanknotesIcon,
  CreditCardIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
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
import { BankMovementActions } from "@/components/admin/treasury/bank-movement-actions";
import { BankMovementCreateButton } from "@/components/admin/treasury/bank-movement-create-button";
import { TreasuryFilterBar } from "@/components/admin/treasury/treasury-filter-bar";
import { getTreasuryDashboard, listBankMovements } from "@/lib/api/treasury-server";
import { listBankAccounts } from "@/lib/api/bank-accounts-server";
import { listExpenses } from "@/lib/api/expenses-server";
import { fmtDecimal } from "@/lib/format";
import { CATEGORIA_OPTIONS, labelOf } from "../expenses/schema";

export const dynamic = "force-dynamic";

interface TreasuryPageProps {
  searchParams: Promise<{
    cuenta_bancaria_id?: string;
    conciliado?: string;
    desde?: string;
    hasta?: string;
  }>;
}

export default async function TreasuryPage({ searchParams }: TreasuryPageProps) {
  const sp = await searchParams;
  const conciliado =
    sp.conciliado === "true" ? true : sp.conciliado === "false" ? false : undefined;

  const [dashboard, movsRes, accountsRes, gastosRes] = await Promise.all([
    getTreasuryDashboard(),
    listBankMovements({
      cuenta_bancaria_id: sp.cuenta_bancaria_id || undefined,
      conciliado,
      desde: sp.desde || undefined,
      hasta: sp.hasta || undefined,
      limit: 300,
    }),
    listBankAccounts({ limit: 50 }),
    listExpenses({ conciliado: false, limit: 300 }),
  ]);

  const accountsById = new Map(accountsRes.data.map((a) => [a.id, a]));
  const bankAccountOpts = accountsRes.data.map((a) => ({
    id: a.id,
    alias: a.alias,
    banco: a.banco,
  }));
  const gastoOpts = gastosRes.data.map((g) => ({
    value: g.id,
    label: `${labelOf(CATEGORIA_OPTIONS, g.categoria)} · ${fmtDecimal(g.monto)} ${g.moneda}`,
    description: g.fecha_gasto,
  }));

  const movs = movsRes.data;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Tesorería</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Bancos y conciliación
        </h1>
      </div>

      {/* Saldos por cuenta */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {dashboard.cuentas.map((c) => (
          <Card key={c.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{c.alias}</p>
                  <p className="text-[11px] text-muted-foreground">{c.banco}</p>
                </div>
                {c.pendientes_conciliar > 0 && (
                  <Badge
                    variant="outline"
                    className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] shrink-0"
                  >
                    {c.pendientes_conciliar} x conciliar
                  </Badge>
                )}
              </div>
              <p className="text-xl font-semibold mt-2 font-mono">
                {fmtDecimal(c.saldo)}{" "}
                <span className="text-xs text-muted-foreground">{c.moneda}</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {c.saldo_es_estimado ? "Flujo neto registrado" : "Saldo del estado de cuenta"}
              </p>
            </CardContent>
          </Card>
        ))}
        {dashboard.cuentas.length === 0 && (
          <Card className="sm:col-span-2 lg:col-span-4">
            <CardHeader className="text-center py-8">
              <div className="flex justify-center mb-2">
                <BanknotesIcon className="h-7 w-7 text-muted-foreground" />
              </div>
              <CardDescription>
                No hay cuentas bancarias activas. Créalas en Cuentas bancarias.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>

      {/* Gastos por tarjeta */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCardIcon className="h-5 w-5" />
            Gastos por tarjeta — mes en curso
          </CardTitle>
          <CardDescription>
            Del {dashboard.periodo_tarjetas.desde} al {dashboard.periodo_tarjetas.hasta}.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {dashboard.gastos_por_tarjeta.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Sin gastos con tarjeta corporativa este mes.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarjeta</TableHead>
                  <TableHead>Titular</TableHead>
                  <TableHead className="text-right">Movimientos</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.gastos_por_tarjeta.map((t) => (
                  <TableRow key={t.terminacion}>
                    <TableCell className="font-mono text-sm">····{t.terminacion}</TableCell>
                    <TableCell className="text-sm">{t.titular ?? "—"}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {t.count}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmtDecimal(t.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Movimientos bancarios */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Movimientos bancarios</h2>
          <p className="text-sm text-muted-foreground">
            {movs.length} {movs.length === 1 ? "movimiento" : "movimientos"} en el rango.
          </p>
        </div>
        <BankMovementCreateButton bankAccounts={bankAccountOpts} />
      </div>

      <TreasuryFilterBar
        bankAccounts={accountsRes.data.map((a) => ({ id: a.id, alias: a.alias }))}
        initial={{
          cuenta_bancaria_id: sp.cuenta_bancaria_id ?? "",
          conciliado: sp.conciliado ?? "",
          desde: sp.desde ?? "",
          hasta: sp.hasta ?? "",
        }}
      />

      {movs.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <BanknotesIcon className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-lg">Sin movimientos en el rango</CardTitle>
            <CardDescription>
              Registra un movimiento o ajusta los filtros. La importación masiva desde
              estados de cuenta llegará con el microservicio Python.
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
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Cargo</TableHead>
                  <TableHead className="text-right">Abono</TableHead>
                  <TableHead className="text-center">Conciliado</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movs.map((m) => {
                  const cuenta = accountsById.get(m.cuenta_bancaria_id);
                  const monto = fmtDecimal(m.monto);
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(`${m.fecha}T00:00:00`).toLocaleDateString("es-MX", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-xs">{cuenta?.alias ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {m.descripcion ?? <span className="text-muted-foreground">—</span>}
                        {m.referencia && (
                          <span className="text-[10px] text-muted-foreground">
                            {" "}
                            · {m.referencia}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-destructive">
                        {m.tipo === "CARGO" ? monto : ""}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-green-600 dark:text-green-400">
                        {m.tipo === "ABONO" ? monto : ""}
                      </TableCell>
                      <TableCell className="text-center">
                        {m.conciliado ? (
                          <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20">
                            Sí
                          </Badge>
                        ) : (
                          <span
                            title="Pendiente de conciliar"
                            className="inline-flex items-center text-amber-600 dark:text-amber-400"
                          >
                            <ExclamationTriangleIcon className="h-4 w-4" />
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <BankMovementActions
                          movement={m}
                          bankAccounts={bankAccountOpts}
                          gastos={gastoOpts}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
