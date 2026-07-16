import Link from "next/link";
import { BanknotesIcon } from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ExpensesTable } from "@/components/admin/expenses/expenses-table";
import {
  listGastos,
  signFuelPhotos,
  type ListGastosQuery,
} from "@/lib/api/expenses-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listProviders } from "@/lib/api/providers-server";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import { SuggestAssignmentsButton } from "@/components/admin/expenses/suggest-assignments-button";
import { ExpenseCreateDialog } from "@/components/admin/expenses/expense-create-dialog";
import { PistasDialog } from "@/components/admin/expenses/pistas-dialog";

export const dynamic = "force-dynamic";

type Filtro = "todos" | "pendientes" | "duplicados";

// Vista general en dos columnas (pedido del cliente): gastos OPERATIVOS
// (ligados a operar el vuelo: combustible, pistas, TUAS, FBO, permisos) vs
// GENERALES (viáticos, refacciones, fijos...). El desglose completo de cada
// vuelo vive en su detalle (/admin/flights/{id}).
const CATEGORIAS_OPERATIVAS = new Set([
  "GAS",
  "OPERACIONES",
  "ATERRIZAJE",
  "TUAS",
  "FBO",
  "PERMISO",
  // Honorario del piloto externo: es costo de operar el vuelo.
  "PILOTO_EXTERNO",
]);

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
        <div className="flex gap-2 flex-wrap">
          <ExpenseCreateDialog aircraft={aircraft} providers={providers} />
          <PistasDialog />
          <SuggestAssignmentsButton pendientes={pendientesRes.count} />
          <ExcelExportButton path="/v1/expenses/export" filename="gastos.xlsx" label="Exportar Excel" />
        </div>
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
        // Vista general en dos columnas; el desglose completo por vuelo está
        // en el detalle del vuelo (link en la columna Vuelo).
        <div className="grid gap-6 xl:grid-cols-2 items-start">
          <GastosCard
            titulo="Gastos generales"
            descripcion="Viáticos, refacciones, fijos y otros."
            gastos={gastos.filter((g) => !CATEGORIAS_OPERATIVAS.has(g.categoria))}
            aircraft={aircraft}
            providers={providers}
            fotoUrls={fotoUrls}
          />
          <GastosCard
            titulo="Gastos operativos"
            descripcion="Combustible, pistas/aterrizajes, TUAS, FBO, permisos y piloto externo."
            gastos={gastos.filter((g) => CATEGORIAS_OPERATIVAS.has(g.categoria))}
            aircraft={aircraft}
            providers={providers}
            fotoUrls={fotoUrls}
          />
        </div>
      )}
    </div>
  );
}

function GastosCard({
  titulo,
  descripcion,
  gastos,
  aircraft,
  providers,
  fotoUrls,
}: {
  titulo: string;
  descripcion: string;
  gastos: Awaited<ReturnType<typeof listGastos>>["data"];
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
  fotoUrls: Record<string, string>;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {titulo}{" "}
          <span className="text-sm font-normal text-muted-foreground">({gastos.length})</span>
        </CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {gastos.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Sin gastos en esta vista.</p>
        ) : (
          <ExpensesTable
            gastos={gastos}
            aircraft={aircraft}
            providers={providers}
            fotoUrls={fotoUrls}
          />
        )}
      </CardContent>
    </Card>
  );
}
