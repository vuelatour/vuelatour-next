import Link from "next/link";
import Image from "next/image";
import { fmtDateOnly } from "@/lib/datetime";
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
import { cn } from "@/lib/utils";
import { ExpenseActions } from "@/components/admin/expenses/expense-actions";
import {
  listGastos,
  signFuelPhotos,
  type ListGastosQuery,
} from "@/lib/api/expenses-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listProviders } from "@/lib/api/providers-server";
import { ExcelExportButton } from "@/components/admin/excel-export-button";

export const dynamic = "force-dynamic";

type Filtro = "todos" | "pendientes" | "duplicados";

const fmtMoney = (monto: string, moneda: string) =>
  Number(monto).toLocaleString("es-MX", { style: "currency", currency: moneda });

const fmtDate = fmtDateOnly;

const ESTATUS_STYLE: Record<string, string> = {
  FACTURA: "border-emerald-500/50 text-emerald-600",
  VALE: "border-amber-500/50 text-amber-600",
  SIN_COMPROBANTE: "border-navy-400/50 text-muted-foreground",
};

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const sp = await searchParams;
  const filtro: Filtro =
    sp.f === "pendientes" || sp.f === "duplicados" ? sp.f : "todos";

  const query: ListGastosQuery = { limit: 200 };
  if (filtro === "pendientes") query.pendientes = true;
  if (filtro === "duplicados") query.duplicados = true;

  const [{ data: gastos }, pendientesRes, duplicadosRes, aircraftRes, providersRes] =
    await Promise.all([
      listGastos(query),
      listGastos({ pendientes: true, limit: 1 }),
      listGastos({ duplicados: true, limit: 1 }),
      listAircraft({ limit: 100 }),
      listProviders({ limit: 200 }),
    ]);

  const aircraft = aircraftRes.data.map((a) => ({ id: a.id, matricula: a.matricula }));
  const providers = providersRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));

  // Firma las fotos de los comprobantes (bucket privado) para verlas en el admin.
  const fotoPaths = gastos.map((g) => g.foto_url).filter((p): p is string => !!p);
  let fotoUrls: Record<string, string> = {};
  if (fotoPaths.length > 0) {
    try {
      fotoUrls = await signFuelPhotos(fotoPaths);
    } catch {
      fotoUrls = {};
    }
  }

  const tabs: { key: Filtro; label: string; count?: number }[] = [
    { key: "todos", label: "Todos" },
    { key: "pendientes", label: "Pendientes", count: pendientesRes.count },
    { key: "duplicados", label: "Duplicados", count: duplicadosRes.count },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Operación</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Gastos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verifica los gastos capturados: asigna avión, confirma comprobante y descarta
            duplicados. La bandeja de pendientes debe quedar siempre vacía.
          </p>
        </div>
        <ExcelExportButton path="/v1/expenses/export" filename="gastos.xlsx" label="Exportar Excel" />
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "todos" ? "/admin/expenses" : `/admin/expenses?f=${t.key}`}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              filtro === t.key
                ? "bg-brand-600 text-white"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs",
                  filtro === t.key ? "bg-white/20" : "bg-amber-500/20 text-amber-600",
                )}
              >
                {t.count}
              </span>
            )}
          </Link>
        ))}
      </div>

      {gastos.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <BanknotesIcon className="h-12 w-12 text-muted-foreground" />
            </div>
            <CardTitle>
              {filtro === "pendientes"
                ? "Sin gastos pendientes"
                : filtro === "duplicados"
                  ? "Sin duplicados sospechosos"
                  : "Sin gastos capturados"}
            </CardTitle>
            <CardDescription>
              {filtro === "pendientes"
                ? "Todos los gastos tienen avión asignado. Bandeja limpia."
                : "Aquí verás los gastos que capturen pilotos y oficina."}
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
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Avión</TableHead>
                  <TableHead>Capturó</TableHead>
                  <TableHead>Comprobante</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gastos.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="whitespace-nowrap">{fmtDate(g.fecha_gasto)}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        {g.categoria}
                        {g.duplicado_sospechado && (
                          <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                            Duplicado?
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtMoney(g.monto, g.moneda)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {g.proveedor?.nombre ?? "—"}
                    </TableCell>
                    <TableCell>
                      {g.aeronave?.matricula ? (
                        <span className="font-mono">{g.aeronave.matricula}</span>
                      ) : (
                        <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                          Pendiente
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {g.captura?.nombre ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {g.foto_url && fotoUrls[g.foto_url] && (
                          <a
                            href={fotoUrls[g.foto_url]}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Ver comprobante"
                          >
                            <Image
                              src={fotoUrls[g.foto_url]}
                              alt="Comprobante"
                              width={32}
                              height={32}
                              unoptimized
                              className="h-8 w-8 rounded-md object-cover ring-1 ring-border hover:ring-brand-500"
                            />
                          </a>
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
                    <TableCell>
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
