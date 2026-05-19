import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
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
import { MovementResolve } from "@/components/admin/cash-funds/movement-resolve";
import { getCashFund, listFundMovements } from "@/lib/api/cash-funds-server";
import { listUsers } from "@/lib/api/users-server";
import { isApiError } from "@/lib/api/errors";
import { fmtDecimal } from "@/lib/format";
import {
  labelOf,
  MEDIO_PAGO_FONDO_OPTIONS,
  TIPO_MOVIMIENTO_FONDO_OPTIONS,
} from "../schema";
import type { EstadoMovimientoFondo } from "@/types/cash-funds";

export const dynamic = "force-dynamic";

const ESTADO_STYLES: Record<EstadoMovimientoFondo, string> = {
  SOLICITADO: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  AUTORIZADO: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  RECHAZADO: "bg-destructive/15 text-destructive border-destructive/30",
};

const ESTADO_LABELS: Record<EstadoMovimientoFondo, string> = {
  SOLICITADO: "Solicitado",
  AUTORIZADO: "Autorizado",
  RECHAZADO: "Rechazado",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CashFundDetailPage({ params }: PageProps) {
  const { id } = await params;

  let fund;
  try {
    fund = await getCashFund(id);
  } catch (err) {
    if (isApiError(err) && err.status === 404) notFound();
    throw err;
  }

  const [movsRes, usersRes] = await Promise.all([
    listFundMovements({ fondo_id: id, limit: 200 }),
    listUsers({ limit: 200 }),
  ]);

  const usersById = new Map(usersRes.data.map((u) => [u.id, u]));
  const userOpts = usersRes.data.map((u) => ({
    id: u.id,
    nombre: u.nombre,
    email: u.email,
  }));
  const holder = usersById.get(fund.usuario_id);
  const esFijo = fund.tipo === "FIJO";

  return (
    <div className="space-y-6">
      <Link
        href="/admin/cash-funds"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Caja chica
      </Link>

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            {holder?.nombre ?? "Fondo"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {esFijo ? "Fondo fijo" : "Reintegro"} ·{" "}
            {labelOf(MEDIO_PAGO_FONDO_OPTIONS, fund.medio_pago_asociado)}
            {!fund.activo && (
              <Badge variant="secondary" className="ml-1.5 text-[10px]">
                Inactivo
              </Badge>
            )}
          </p>
        </div>
        <FundActions fund={fund} users={userOpts} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={esFijo ? "Saldo disponible" : "Se le debe a la persona"}
          value={`${fmtDecimal(fund.saldo)} ${fund.moneda}`}
          accent={
            esFijo
              ? fund.saldo < 0
                ? "text-destructive"
                : undefined
              : fund.saldo > 0
                ? "text-amber-600 dark:text-amber-400"
                : undefined
          }
          hint={esFijo ? `Asignado: ${fmtDecimal(fund.monto_asignado)}` : undefined}
        />
        <StatCard label="Total gastado" value={fmtDecimal(fund.total_gastado)} />
        <StatCard
          label={esFijo ? "Total repuesto" : "Total reintegrado"}
          value={fmtDecimal(fund.total_repuesto)}
          hint={
            fund.pendiente_autorizar > 0
              ? `${fmtDecimal(fund.pendiente_autorizar)} pendiente`
              : undefined
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Movimientos del fondo</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {movsRes.data.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Sin reposiciones ni reintegros registrados.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Solicitó</TableHead>
                  <TableHead>Autorizó</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movsRes.data.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(`${m.fecha}T00:00:00`).toLocaleDateString("es-MX", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-xs">
                      {labelOf(TIPO_MOVIMIENTO_FONDO_OPTIONS, m.tipo)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmtDecimal(m.monto)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {usersById.get(m.solicitado_por)?.nombre ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {m.autorizado_por
                        ? (usersById.get(m.autorizado_por)?.nombre ?? "—")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={ESTADO_STYLES[m.estado]}>
                        {ESTADO_LABELS[m.estado]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {m.estado === "SOLICITADO" && (
                        <MovementResolve movementId={m.id} fondoId={fund.id} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
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
