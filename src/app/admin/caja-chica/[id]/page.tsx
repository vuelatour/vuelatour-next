import { fmtDateOnly } from "@/lib/datetime";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/admin/back-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isApiError } from "@/lib/api/errors";
import { getFondo } from "@/lib/api/caja-chica-server";
import { listUsers } from "@/lib/api/users-server";
import { listGastos, signFuelPhotos } from "@/lib/api/expenses-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listProviders } from "@/lib/api/providers-server";
import { MovimientoButton } from "@/components/admin/caja-chica/movimiento-button";
import { FondoMontoButton } from "@/components/admin/caja-chica/fondo-monto-button";
import {
  FondoHistorialTable,
  type MovimientoFondoRow,
} from "@/components/admin/caja-chica/fondo-historial-table";
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

  // Filas-viewmodel serializables para la tabla cliente (nada de Maps ni
  // funciones cruzando la frontera server→cliente).
  const historial: MovimientoFondoRow[] = fondo.historial.map((e) => {
    const gasto = e.origen === "gasto" ? (gastosById.get(e.id) ?? null) : null;
    return {
      key: `${e.origen}-${e.id}`,
      fechaFmt: fmtDate(e.fecha),
      tipoLabel: CONCEPTO[e.tipo] ?? e.tipo,
      esGasto: e.origen === "gasto",
      descripcion: e.descripcion,
      vueloId: e.vuelo_id ?? null,
      vueloFolio: e.vuelo_folio ?? null,
      negativo: e.monto < 0,
      montoAbsFmt: money(Math.abs(e.monto)).replace(/^-/, ""),
      saldoFmt: money(e.saldo),
      gasto,
      fotoUrl: gasto?.foto_url ? fotoUrls[gasto.foto_url] : undefined,
    };
  });

  return (
    <div className="space-y-6">
      <BackLink
        href="/admin/caja-chica"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        iconClassName="h-4 w-4"
      >
        Caja chica
      </BackLink>

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

      {/* Métricas del fondo (pedido oficina 14-ago): saldo + fondo total +
          por reponer + última reposición, de un vistazo. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="py-6">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {fondo.es_acumulada ? "Por reponer (caja acumulada)" : "Saldo actual"}
            </p>
            <p
              className={`text-3xl font-semibold tabular-nums mt-1 ${
                fondo.es_acumulada
                  ? fondo.saldo > 0
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-emerald-600"
                  : fondo.saldo < 0
                    ? "text-destructive"
                    : "text-emerald-600"
              }`}
            >
              {money(fondo.saldo)}
            </p>
            {fondo.es_acumulada && (
              <p className="text-xs text-muted-foreground mt-1">
                Sube con cada gasto en efectivo; una REPOSICIÓN por este monto lo deja en cero.
              </p>
            )}
          </CardContent>
        </Card>

        {!fondo.es_acumulada && (
          <Card>
            <CardContent className="py-6">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Fondo total
              </p>
              <p className="text-3xl font-semibold tabular-nums mt-1">
                {fondo.monto_fondo != null ? (
                  money(Number(fondo.monto_fondo))
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </p>
              <div className="mt-1">
                <FondoMontoButton
                  fondoId={fondo.id}
                  montoActual={
                    fondo.monto_fondo != null ? Number(fondo.monto_fondo) : null
                  }
                  persona={fondo.usuario?.nombre ?? "esta persona"}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {!fondo.es_acumulada && fondo.monto_fondo != null && (
          <Card>
            <CardContent className="py-6">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Por reponer
              </p>
              {(() => {
                const porReponer =
                  Math.round((Number(fondo.monto_fondo) - fondo.saldo) * 100) /
                  100;
                return (
                  <p
                    className={`text-3xl font-semibold tabular-nums mt-1 ${
                      porReponer > 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-emerald-600"
                    }`}
                  >
                    {money(porReponer)}
                  </p>
                );
              })()}
              <p className="text-xs text-muted-foreground mt-1">
                Fondo total − saldo actual.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="py-6">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Última reposición
            </p>
            {fondo.ultima_reposicion ? (
              <>
                <p className="text-3xl font-semibold tabular-nums mt-1">
                  {money(fondo.ultima_reposicion.monto)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {fmtDateOnly(fondo.ultima_reposicion.fecha)}
                </p>
              </>
            ) : (
              <p className="text-3xl font-semibold mt-1 text-muted-foreground">
                —
              </p>
            )}
          </CardContent>
        </Card>
      </div>

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
            <FondoHistorialTable
              movimientos={historial}
              aircraft={aircraft}
              providers={providers}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
