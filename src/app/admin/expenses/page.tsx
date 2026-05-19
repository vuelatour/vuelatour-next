import {
  BanknotesIcon,
  ExclamationTriangleIcon,
  CheckBadgeIcon,
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
import { ExpenseActions } from "@/components/admin/expenses/expense-actions";
import { ExpenseCreateButton } from "@/components/admin/expenses/expense-create-button";
import { ExpensesFilterBar } from "@/components/admin/expenses/expenses-filter-bar";
import { listExpenses } from "@/lib/api/expenses-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listProviders } from "@/lib/api/providers-server";
import { listFlights } from "@/lib/api/flights-server";
import { fmtDecimal } from "@/lib/format";
import {
  CATEGORIA_OPTIONS,
  ESTATUS_COMPROBANTE_OPTIONS,
  MEDIO_PAGO_OPTIONS,
  labelOf,
} from "./schema";
import type { EstatusComprobante } from "@/types/expenses";

export const dynamic = "force-dynamic";

const ESTATUS_STYLES: Record<EstatusComprobante, string> = {
  FACTURA: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  VALE: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  SIN_COMPROBANTE: "bg-muted text-muted-foreground border-border",
};

interface ExpensesPageProps {
  searchParams: Promise<{
    categoria?: string;
    medio_pago?: string;
    estatus_comprobante?: string;
    aeronave_id?: string;
    sin_aeronave?: string;
    desde?: string;
    hasta?: string;
  }>;
}

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  const sp = await searchParams;

  const [expensesRes, aircraftRes, providersRes, flightsRes] = await Promise.all([
    listExpenses({
      categoria: sp.categoria || undefined,
      medio_pago: sp.medio_pago || undefined,
      estatus_comprobante: sp.estatus_comprobante || undefined,
      aeronave_id: sp.aeronave_id || undefined,
      sin_aeronave: sp.sin_aeronave === "1" || undefined,
      desde: sp.desde || undefined,
      hasta: sp.hasta || undefined,
      limit: 200,
    }),
    listAircraft({ limit: 100, activa: true }),
    listProviders({ limit: 200, activo: true }),
    listFlights({ limit: 200 }),
  ]);

  const expenses = expensesRes.data;
  const aircraftById = new Map(aircraftRes.data.map((a) => [a.id, a]));
  const providersById = new Map(providersRes.data.map((p) => [p.id, p]));
  const flightsById = new Map(flightsRes.data.map((f) => [f.id, f]));

  const aircraftOpts = aircraftRes.data.map((a) => ({
    id: a.id,
    matricula: a.matricula,
    modelo: a.modelo,
  }));
  const providerOpts = providersRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));
  const flightOpts = flightsRes.data.map((f) => ({
    id: f.id,
    folio: f.folio,
    origen_iata: f.origen_iata,
    destino_iata: f.destino_iata,
  }));

  const pendientes = expenses.filter((e) => !e.aeronave_id).length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Finanzas</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Gastos operativos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {expenses.length} {expenses.length === 1 ? "gasto" : "gastos"} en el rango
            {pendientes > 0 && (
              <>
                {" · "}
                <span className="text-amber-600 dark:text-amber-400">
                  {pendientes} sin aeronave
                </span>
              </>
            )}
            .
          </p>
        </div>
        <ExpenseCreateButton
          aircraft={aircraftOpts}
          providers={providerOpts}
          flights={flightOpts}
        />
      </div>

      <ExpensesFilterBar
        aircraft={aircraftRes.data.map((a) => ({ id: a.id, matricula: a.matricula }))}
        initial={{
          categoria: sp.categoria ?? "",
          medio_pago: sp.medio_pago ?? "",
          estatus_comprobante: sp.estatus_comprobante ?? "",
          aeronave_id: sp.aeronave_id ?? "",
          sin_aeronave: sp.sin_aeronave ?? "",
          desde: sp.desde ?? "",
          hasta: sp.hasta ?? "",
        }}
      />

      {expenses.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <BanknotesIcon className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-lg">Sin gastos en el rango</CardTitle>
            <CardDescription>
              Registra el primer gasto operativo o ajusta los filtros.
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
                  <TableHead>Categoría</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Medio</TableHead>
                  <TableHead>Aeronave / Vuelo</TableHead>
                  <TableHead className="text-center">Comprobante</TableHead>
                  <TableHead></TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e) => {
                  const ac = e.aeronave_id ? aircraftById.get(e.aeronave_id) : null;
                  const prov = e.proveedor_id ? providersById.get(e.proveedor_id) : null;
                  const fl = e.vuelo_id ? flightsById.get(e.vuelo_id) : null;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(`${e.fecha_gasto}T00:00:00`).toLocaleDateString("es-MX", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-sm">
                        {labelOf(CATEGORIA_OPTIONS, e.categoria)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {prov?.nombre ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm whitespace-nowrap">
                        {fmtDecimal(e.monto)}{" "}
                        <span className="text-[10px] text-muted-foreground">{e.moneda}</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {labelOf(MEDIO_PAGO_OPTIONS, e.medio_pago)}
                        {e.tarjeta_terminacion && (
                          <span className="font-mono text-muted-foreground">
                            {" "}
                            ····{e.tarjeta_terminacion}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {ac ? (
                          <span className="font-mono">{ac.matricula}</span>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px]"
                          >
                            Pendiente
                          </Badge>
                        )}
                        {fl && (
                          <div className="font-mono text-[10px] text-muted-foreground">
                            #{fl.folio} {fl.origen_iata}→{fl.destino_iata}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={ESTATUS_STYLES[e.estatus_comprobante]}>
                          {labelOf(ESTATUS_COMPROBANTE_OPTIONS, e.estatus_comprobante)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {e.duplicado_sospechado && (
                            <span
                              title="Posible duplicado: mismo proveedor, monto y fecha cercana"
                              className="inline-flex items-center text-amber-600 dark:text-amber-400"
                            >
                              <ExclamationTriangleIcon className="h-4 w-4" />
                            </span>
                          )}
                          {e.conciliado && (
                            <span
                              title="Conciliado con estado de cuenta"
                              className="inline-flex items-center text-green-600 dark:text-green-400"
                            >
                              <CheckBadgeIcon className="h-4 w-4" />
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <ExpenseActions
                          expense={e}
                          aircraft={aircraftOpts}
                          providers={providerOpts}
                          flights={flightOpts}
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
