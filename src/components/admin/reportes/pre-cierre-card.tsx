import Link from "next/link";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiServer } from "@/lib/api/server";

interface PreCierreVuelo {
  id: string;
  folio: number;
  estado?: string;
  saldo_usd?: number;
}

interface PreCierreItem {
  clave: string;
  titulo: string;
  detalle: string;
  count: number;
  monto_usd?: number;
  monto_mxn?: number;
  monto?: number;
  vuelos?: PreCierreVuelo[];
}

interface PreCierre {
  periodo: { desde: string; hasta: string };
  listo: boolean;
  items: PreCierreItem[];
}

/** A dónde ir a resolver cada pendiente del checklist. */
// Links "Resolver" en función del PERIODO del checklist: sin el rango, la
// lista destino mezclaba pendientes de todos los tiempos y el conteo no
// cuadraba con el "· N" del item.
const LINK_POR_CLAVE: Record<
  string,
  (p: { desde: string; hasta: string }) => string
> = {
  // Vuelos sin completar: la lista del periodo (externos incluidos — esos
  // se completan a mano en su detalle y NO aparecen en taco-live).
  vuelos_sin_completar: (p) =>
    `/admin/flights?desde=${p.desde}&hasta=${p.hasta}`,
  tacos_en_revision: () => "/admin/taco-live",
  cobros_pendientes: (p) =>
    `/admin/flights?cobro=POR_COBRAR&desde=${p.desde}&hasta=${p.hasta}`,
  gastos_sin_avion: () => "/admin/expenses",
  gastos_sin_tc: () => "/admin/expenses",
  // Directo a Gastos filtrado a "sin facturar" (pendiente + solicitada) DEL
  // PERIODO: ahí está el semáforo para irlos resolviendo uno por uno.
  gastos_sin_comprobante: (p) =>
    `/admin/expenses?facturacion=NO_FACTURADA&desde=${p.desde}&hasta=${p.hasta}`,
  // Cuotas de aeródromo sin provisionar: Gastos → "Pistas por pagar".
  pistas_sin_gasto: () => "/admin/expenses",
  // El honorario del piloto externo se captura como gasto del vuelo (los
  // folios del item llevan directo a cada vuelo).
  externos_sin_honorario: () => "/admin/expenses",
  sin_conciliar: () => "/admin/conciliacion",
};

function fmtMonto(item: PreCierreItem): string | null {
  if (item.monto_usd != null && item.monto_usd > 0)
    return `$${item.monto_usd.toLocaleString("en-US")} USD`;
  if (item.monto_mxn != null && item.monto_mxn > 0)
    return `$${item.monto_mxn.toLocaleString("en-US")} MXN`;
  if (item.monto != null && item.monto > 0)
    return `$${item.monto.toLocaleString("en-US")}`;
  return null;
}

/**
 * Checklist de pre-cierre: el sistema caza los huecos del periodo (vuelos sin
 * completar, tacos amarillos, gastos sin TC…) para que el empleado solo
 * supervise. Verde = se puede cerrar con números completos.
 */
export async function PreCierreCard({
  desde,
  hasta,
}: {
  desde: string;
  hasta: string;
}) {
  let data: PreCierre | null = null;
  try {
    data = await apiServer<PreCierre>("/v1/profit-sharing/pre-cierre", {
      searchParams: { desde, hasta },
      cache: "no-store",
    });
  } catch {
    // data queda null: abajo se muestra la card de error.
  }
  // Si la verificación FALLA, el checklist no puede desaparecer en silencio:
  // el operador generaría el cierre creyendo que no había pendientes.
  if (!data) {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-destructive" />
            Pre-cierre del periodo
          </CardTitle>
          <CardDescription>
            No se pudo verificar el pre-cierre (falló la consulta al servidor).
            No generes el cierre hasta que este checklist cargue: sin él no hay
            garantía de que el periodo esté completo. Recarga la página para
            reintentar.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const pendientes = data.items.filter((i) => i.count > 0);

  return (
    <Card
      className={
        data.listo
          ? "border-emerald-500/40"
          : "border-amber-500/40"
      }
    >
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {data.listo ? (
            <CheckCircleIcon className="h-5 w-5 text-emerald-500" />
          ) : (
            <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" />
          )}
          Pre-cierre del periodo
        </CardTitle>
        <CardDescription>
          {data.listo
            ? "Todo en orden: los números del periodo están completos para generar el cierre."
            : "El sistema encontró pendientes que dejarían el cierre incompleto. Resuélvelos antes de generar los reportes."}
        </CardDescription>
      </CardHeader>
      {pendientes.length > 0 && (
        <CardContent className="space-y-3">
          {pendientes.map((item) => {
            const monto = fmtMonto(item);
            const href = LINK_POR_CLAVE[item.clave]?.({ desde, hasta });
            return (
              <div
                key={item.clave}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {item.titulo}{" "}
                    <span className="text-amber-600 font-semibold">
                      · {item.count}
                    </span>
                    {monto && (
                      <span className="text-muted-foreground"> · {monto}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.detalle}
                  </p>
                  {item.vuelos && item.vuelos.length > 0 && (
                    <p className="text-xs mt-1 flex flex-wrap gap-1.5">
                      {item.vuelos.slice(0, 8).map((v) => (
                        <Link
                          key={v.id}
                          href={`/admin/flights/${v.id}`}
                          className="underline underline-offset-2 hover:text-foreground text-muted-foreground"
                        >
                          #{v.folio}
                          {v.saldo_usd != null
                            ? ` ($${v.saldo_usd.toLocaleString("en-US")})`
                            : v.estado
                              ? ` (${v.estado})`
                              : ""}
                        </Link>
                      ))}
                      {item.vuelos.length > 8 && (
                        <span className="text-muted-foreground">
                          y {item.vuelos.length - 8} más…
                        </span>
                      )}
                    </p>
                  )}
                </div>
                {href && (
                  <Link
                    href={href}
                    className="text-xs font-medium underline underline-offset-2 shrink-0"
                  >
                    Resolver →
                  </Link>
                )}
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
