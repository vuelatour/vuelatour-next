import { WalletIcon } from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/admin/empty-state";
import {
  GastosPersonalesResumen,
  GastosPersonalesTable,
  type GastoPersonalRow,
  type GastosPersonalesResumenMoneda,
} from "@/components/admin/expenses/gastos-personales-table";
import { GastosPersonalesFilterBar } from "@/components/admin/expenses/gastos-personales-filter-bar";
import { ExpenseCreateDialog } from "@/components/admin/expenses/expense-create-dialog";
import {
  listGastosPersonales,
  signFuelPhotos,
} from "@/lib/api/expenses-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listProviders } from "@/lib/api/providers-server";
import { todayCancun } from "@/lib/datetime";
import { getMe } from "@/lib/api/me";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

// Dinero PERSONAL del dueño: solo ADMIN y COORDINADOR (el nav ya esconde el
// link, pero la URL directa también debe cerrarse — fail-closed si /me falla).

/** Rango completo del mes YYYY-MM (fecha_gasto es DATE: sin zonas horarias). */
function rangoDeMes(mes: string): { desde: string; hasta: string } {
  const [anio, mesN] = mes.split("-").map(Number);
  const ultimo = new Date(anio, mesN, 0).getDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

function labelDeMes(mes: string): string {
  const [anio, mesN] = mes.split("-").map(Number);
  return new Date(anio, mesN - 1, 1).toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
  });
}

const num = (v: string | number | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (v: number) => Math.round(v * 100) / 100;

/** MXN primero, luego USD; cualquier otra moneda al final. */
const ordenMoneda = (m: string) => (m === "MXN" ? 0 : m === "USD" ? 1 : 2);

interface PageProps {
  searchParams: Promise<{ mes?: string }>;
}

export default async function GastosPersonalesPage({ searchParams }: PageProps) {
  const me = await getMe().catch(() => null);
  if (!me || (me.rol !== "ADMIN" && me.rol !== "COORDINADOR")) notFound();

  const sp = await searchParams;
  // Mes elegido (default: mes corriente en hora Cancún, eje fecha_gasto).
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "")
    ? (sp.mes as string)
    : todayCancun().slice(0, 7);
  const { desde, hasta } = rangoDeMes(mes);
  const mesLabel = labelDeMes(mes);

  const [{ data: gastos }, aircraftRes, providersRes] = await Promise.all([
    listGastosPersonales({ desde, hasta }),
    // Mismo armado que /admin/expenses para el dialog de alta.
    listAircraft({ limit: 100 }),
    listProviders({ limit: 200 }),
  ]);

  const aircraft = aircraftRes.data.map((a) => ({ id: a.id, matricula: a.matricula }));
  const providers = providersRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));

  // Firma las fotos de los comprobantes (bucket privado) para verlas aquí.
  const fotoPaths = gastos.map((g) => g.foto_url).filter((p): p is string => !!p);
  let fotoUrls: Record<string, string> = {};
  if (fotoPaths.length > 0) {
    try {
      fotoUrls = await signFuelPhotos(fotoPaths);
    } catch {
      fotoUrls = {};
    }
  }

  // Filas planas serializables: el cliente solo pinta.
  const rows: GastoPersonalRow[] = gastos.map((g) => {
    const linea = (g.notas ?? "").split("\n")[0].trim();
    const descripcion =
      [linea || null, g.proveedor?.nombre ?? null].filter(Boolean).join(" · ") ||
      null;
    return {
      id: g.id,
      fecha_gasto: g.fecha_gasto,
      descripcion,
      notas: g.notas,
      monto: num(g.monto),
      moneda: g.moneda,
      medio_pago: g.medio_pago,
      tarjeta_terminacion: g.tarjeta_terminacion ?? null,
      capturo: g.captura?.nombre ?? null,
      foto_path: g.foto_url,
      foto_url: g.foto_url ? (fotoUrls[g.foto_url] ?? null) : null,
    };
  });

  // Resumen del mes POR MONEDA (nunca se mezclan MXN y USD): total, # de
  // gastos y desglose por medio de pago. Sin conversiones entre monedas.
  const porMoneda = new Map<string, GastoPersonalRow[]>();
  for (const r of rows) {
    const lista = porMoneda.get(r.moneda) ?? [];
    lista.push(r);
    porMoneda.set(r.moneda, lista);
  }
  const resumen: GastosPersonalesResumenMoneda[] = [...porMoneda.entries()]
    .map(([moneda, lista]) => {
      const medios = new Map<string, number>();
      for (const g of lista) {
        medios.set(g.medio_pago, (medios.get(g.medio_pago) ?? 0) + g.monto);
      }
      return {
        moneda,
        total: round2(lista.reduce((acc, g) => acc + g.monto, 0)),
        cantidad: lista.length,
        porMedio: [...medios.entries()]
          .map(([medio, total]) => ({ medio, total: round2(total) }))
          .sort((a, b) => b.total - a.total),
      };
    })
    .sort((a, b) => ordenMoneda(a.moneda) - ordenMoneda(b.moneda));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="max-w-2xl">
          <p className="text-sm text-muted-foreground">Operación</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Gastos personales
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Compras que hace el personal para el dueño. No son gastos de la
            empresa ni de los aviones: no entran a balances, reparto ni cierre
            — aquí vive su seguimiento. Para corregir o ver el comprobante,
            búscalo en Gastos (card Gastos generales).
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExpenseCreateDialog
            aircraft={aircraft}
            providers={providers}
            defaultCategoria="PERSONAL_DUENO"
          />
        </div>
      </div>

      <GastosPersonalesFilterBar mes={mes} />

      {rows.length === 0 ? (
        <EmptyState
          icon={WalletIcon}
          title={`Sin gastos personales en ${mesLabel}`}
          description="Aquí aparecen los gastos con categoría Personal del dueño del mes elegido: compras del personal para el dueño, fuera de balances y reparto."
        />
      ) : (
        <>
          <GastosPersonalesResumen resumen={resumen} />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Gastos personales del mes · {mesLabel}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({rows.length})
                </span>
              </CardTitle>
              <CardDescription>
                Seguimiento del dinero personal del dueño: montos con propina
                incluida, sin conversiones entre monedas.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <GastosPersonalesTable gastos={rows} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
