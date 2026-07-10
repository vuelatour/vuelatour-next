import Link from "next/link";
import { fmtDateOnly } from "@/lib/datetime";
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
import { listGastos, signFuelPhotos } from "@/lib/api/expenses-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listProviders } from "@/lib/api/providers-server";
import { MovimientoButton } from "@/components/admin/caja-chica/movimiento-button";
import { ExpenseActions } from "@/components/admin/expenses/expense-actions";
import type { CajaFondoDetail } from "@/types/caja-chica";
import type { Gasto } from "@/types/expenses";

export const dynamic = "force-dynamic";

const CONCEPTO: Record<string, string> = {
  REPOSICION: "Reposición",
  REINTEGRO: "Reintegro a dirección",
  AJUSTE: "Ajuste",
  GASTO: "Gasto en efectivo",
};

const fmtDate = fmtDateOnly;

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

  // Los gastos en efectivo del historial son EDITABLES aquí mismo (pedido de
  // oficina): si el piloto capturó mal el medio de pago (era tarjeta), al
  // corregirlo el movimiento sale solo del fondo — el saldo es en vivo.
  const [gastosRes, aircraftRes, providersRes] = await Promise.all([
    listGastos({
      usuario_captura_id: fondo.usuario_id,
      medio_pago: "EFECTIVO",
      limit: 200,
    }).catch(() => ({ data: [] as Gasto[], count: 0, limit: 0, offset: 0 })),
    listAircraft({ limit: 100 }).catch(() => ({ data: [] })),
    listProviders({ limit: 200 }).catch(() => ({ data: [] })),
  ]);
  const gastosById = new Map(gastosRes.data.map((g) => [g.id, g]));
  const fotoUrls = await signFuelPhotos(
    gastosRes.data.map((g) => g.foto_url).filter((p): p is string => !!p),
  ).catch(() => ({}) as Record<string, string>);
  const aircraft = aircraftRes.data.map((a) => ({ id: a.id, matricula: a.matricula }));
  const providers = providersRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));

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
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fondo.historial.map((e) => (
                  <TableRow key={`${e.origen}-${e.id}`}>
                    <TableCell className="whitespace-nowrap align-top">{fmtDate(e.fecha)}</TableCell>
                    {/* La descripción (desglose del gasto) ENVUELVE con sus
                        saltos de línea en vez de alargar la tabla: todo se lee
                        sin scroll horizontal. */}
                    <TableCell className="align-top max-w-xl">
                      <div className="flex flex-col gap-0.5">
                        <span className="inline-flex items-center gap-1.5">
                          {CONCEPTO[e.tipo] ?? e.tipo}
                          {e.origen === "gasto" && (
                            <Badge variant="outline" className="text-muted-foreground">
                              gasto
                            </Badge>
                          )}
                        </span>
                        {e.descripcion && (
                          <span className="text-xs text-muted-foreground whitespace-pre-line break-words">
                            {e.descripcion}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums whitespace-nowrap align-top ${e.monto < 0 ? "text-destructive" : "text-emerald-600"}`}
                    >
                      {e.monto < 0 ? "−" : "+"}
                      {money(Math.abs(e.monto)).replace(/^-/, "")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap align-top text-muted-foreground">
                      {money(e.saldo)}
                    </TableCell>
                    <TableCell>
                      {/* Editar/eliminar el gasto sin salir de caja chica; al
                          cambiar el medio de pago (p.ej. era tarjeta), el
                          movimiento desaparece del fondo automáticamente. */}
                      {e.origen === "gasto" && gastosById.has(e.id) && (
                        <ExpenseActions
                          gasto={gastosById.get(e.id)!}
                          aircraft={aircraft}
                          providers={providers}
                          fotoUrl={
                            gastosById.get(e.id)!.foto_url
                              ? fotoUrls[gastosById.get(e.id)!.foto_url!]
                              : undefined
                          }
                        />
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
