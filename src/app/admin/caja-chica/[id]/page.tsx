import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isApiError } from "@/lib/api/errors";
import { getFondo } from "@/lib/api/caja-chica-server";
import { listUsers } from "@/lib/api/users-server";
import { MovimientoButton } from "@/components/admin/caja-chica/movimiento-button";
import type { CajaFondoDetail } from "@/types/caja-chica";

export const dynamic = "force-dynamic";

const CONCEPTO: Record<string, string> = {
  REPOSICION: "Reposición",
  REINTEGRO: "Reintegro a dirección",
  AJUSTE: "Ajuste",
  GASTO: "Gasto en efectivo",
};

const fmtDate = (s: string) =>
  new Date(`${s}T00:00:00`).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export default async function CajaFondoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let fondo: CajaFondoDetail;
  let usuarios: { id: string; nombre: string }[];
  try {
    const [fondoRes, usersRes] = await Promise.all([getFondo(id), listUsers({ limit: 200 })]);
    fondo = fondoRes;
    usuarios = usersRes.data.map((u) => ({ id: u.id, nombre: u.nombre }));
  } catch (err) {
    if (isApiError(err) && err.status === 404) notFound();
    throw err;
  }

  const money = (n: number) =>
    n.toLocaleString("es-MX", { style: "currency", currency: fondo.moneda, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <Link
        href="/admin/caja-chica"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Caja chica
      </Link>

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">
            {fondo.usuario?.rol ?? ""} · {fondo.moneda}
            {!fondo.activo && " · Inactivo"}
          </p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            {fondo.usuario?.nombre ?? "Fondo"}
          </h1>
        </div>
        <MovimientoButton
          fondoId={fondo.id}
          persona={fondo.usuario?.nombre ?? "Fondo"}
          moneda={fondo.moneda}
          usuarios={usuarios}
        />
      </div>

      <Card>
        <CardContent className="py-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Saldo actual</p>
          <p
            className={`text-3xl font-semibold tabular-nums mt-1 ${fondo.saldo < 0 ? "text-destructive" : "text-emerald-600"}`}
          >
            {money(fondo.saldo)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {fondo.historial.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              Sin movimientos. Registra una reposición para fondear la caja.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fondo.historial.map((e) => (
                  <TableRow key={`${e.origen}-${e.id}`}>
                    <TableCell className="whitespace-nowrap">{fmtDate(e.fecha)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="inline-flex items-center gap-1.5">
                          {CONCEPTO[e.tipo] ?? e.tipo}
                          {e.origen === "gasto" && (
                            <Badge variant="outline" className="text-muted-foreground">
                              gasto
                            </Badge>
                          )}
                        </span>
                        {e.descripcion && (
                          <span className="text-xs text-muted-foreground">{e.descripcion}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${e.monto < 0 ? "text-destructive" : "text-emerald-600"}`}
                    >
                      {e.monto < 0 ? "−" : "+"}
                      {money(Math.abs(e.monto)).replace(/^-/, "")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {money(e.saldo)}
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
