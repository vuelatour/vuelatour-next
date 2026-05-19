import Link from "next/link";
import { BanknotesIcon } from "@heroicons/react/24/outline";
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
import { FundActions } from "@/components/admin/cash-funds/fund-actions";
import { FundCreateButton } from "@/components/admin/cash-funds/fund-create-button";
import { listCashFunds } from "@/lib/api/cash-funds-server";
import { listUsers } from "@/lib/api/users-server";
import { fmtDecimal } from "@/lib/format";
import { labelOf, MEDIO_PAGO_FONDO_OPTIONS } from "./schema";

export const dynamic = "force-dynamic";

export default async function CashFundsPage() {
  const [fundsRes, usersRes] = await Promise.all([
    listCashFunds({ limit: 200 }),
    listUsers({ limit: 200 }),
  ]);

  const funds = fundsRes.data;
  const usersById = new Map(usersRes.data.map((u) => [u.id, u]));
  const userOpts = usersRes.data.map((u) => ({
    id: u.id,
    nombre: u.nombre,
    email: u.email,
  }));

  const pendientes = funds.reduce((acc, f) => acc + f.pendiente_autorizar, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Finanzas</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Caja chica</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {funds.length} {funds.length === 1 ? "fondo" : "fondos"}
            {pendientes > 0 && (
              <>
                {" · "}
                <span className="text-amber-600 dark:text-amber-400">
                  {fmtDecimal(pendientes)} pendiente de autorizar
                </span>
              </>
            )}
            .
          </p>
        </div>
        <FundCreateButton users={userOpts} />
      </div>

      {funds.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <BanknotesIcon className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-lg">Sin fondos de caja chica</CardTitle>
            <CardDescription>
              Crea el primer fondo para empezar a controlar el efectivo.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Medio</TableHead>
                  <TableHead className="text-right">Asignado</TableHead>
                  <TableHead className="text-right">Gastado</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {funds.map((f) => {
                  const user = usersById.get(f.usuario_id);
                  const esFijo = f.tipo === "FIJO";
                  return (
                    <TableRow key={f.id}>
                      <TableCell>
                        <Link href={`/admin/cash-funds/${f.id}`} className="block">
                          <p className="text-sm font-medium">
                            {user?.nombre ?? "—"}
                          </p>
                          {!f.activo && (
                            <Badge variant="secondary" className="text-[10px]">
                              Inactivo
                            </Badge>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            esFijo
                              ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30"
                              : "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30"
                          }
                        >
                          {esFijo ? "Fijo" : "Reintegro"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {labelOf(MEDIO_PAGO_FONDO_OPTIONS, f.medio_pago_asociado)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {esFijo ? fmtDecimal(f.monto_asignado) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtDecimal(f.total_gastado)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <span
                          className={
                            esFijo
                              ? f.saldo < 0
                                ? "text-destructive"
                                : ""
                              : f.saldo > 0
                                ? "text-amber-600 dark:text-amber-400"
                                : ""
                          }
                        >
                          {fmtDecimal(f.saldo)} {f.moneda}
                        </span>
                        <div className="text-[10px] text-muted-foreground">
                          {esFijo ? "disponible" : "se le debe"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <FundActions fund={f} users={userOpts} />
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
