import type { Metadata } from "next";
import Link from "next/link";
import { tituloCajaChica, TITULOS_SECCION } from "@/lib/admin/titulos-pestana";
import { TituloPestana } from "@/components/admin/titulo-pestana";
import { fmtDateOnly } from "@/lib/datetime";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/admin/back-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isApiError } from "@/lib/api/errors";
import { getFondo } from "@/lib/api/caja-chica-server";
import { listUsers } from "@/lib/api/users-server";
import { listGastos, signFuelPhotos } from "@/lib/api/expenses-server";
import { avionCatalogoGasto } from "@/lib/admin/combustibles";
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
import { esUuid } from "@/lib/admin/url-params";
import { Degradaciones } from "@/lib/api/degradar";
import { AvisoDegradado } from "@/components/admin/aviso-degradado";
import { getMe } from "@/lib/api/me";
import { porReponerDeFondo, puedeDescargarExcelCaja } from "@/lib/admin/caja-chica-excel";
import { DescargarPorReponerButton } from "@/components/admin/caja-chica/excel-caja-buttons";
import { puedeAbrirBalances } from "@/lib/admin/balance-vista";
import { detalleGastoFondo } from "@/lib/admin/caja-chica-gasto";
import {
  NOTA_SALDO_LIBRO_COMPLETO,
  TEXTO_LIMPIAR_PERIODO,
  TEXTO_SIN_MOVIMIENTOS_PERIODO,
  cajasParaReponer,
  filtrarHistorialPorRango,
  hayRangoHistorial,
  hrefCajaChica,
  rangoHistorialCaja,
  saldoInicialAlInicio,
  tituloLimpiarPeriodo,
  repuestoADeEntrada,
  textoPeriodoHistorial,
} from "@/lib/admin/caja-chica-madre";
import { HistorialPeriodoFiltro } from "@/components/admin/caja-chica/historial-periodo-filtro";
import { getInicioOficial } from "@/lib/api/inicio-oficial";
import { textoSaldoInicial } from "@/lib/admin/inicio-oficial";
import { AvisoPeriodoAjustado } from "@/components/admin/aviso-inicio-oficial";
import { porPagarDeFondo } from "@/lib/admin/gasto-por-pagar";
import { PorPagarCaja } from "@/components/admin/caja-chica/por-pagar-caja";

export const dynamic = "force-dynamic";

const CONCEPTO: Record<string, string> = {
  REPOSICION: "Reposición",
  REINTEGRO: "Reintegro a dirección",
  AJUSTE: "Ajuste",
  GASTO: "Gasto en efectivo",
};

const fmtDate = fmtDateOnly;

// Pestaña: «Caja chica» mientras carga; «Caja chica · Diego Ramírez» lo pone
// <TituloPestana> con lo que la página ya leyó (el head NO lee el API).
export const metadata: Metadata = { title: TITULOS_SECCION.cajaChica };

export default async function CajaFondoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  // Filtro Desde/Hasta del historial (15-oct-2026): días válidos o nada.
  const sp = await searchParams;
  // Inicio oficial (16-oct-2026, API 0.0.84): sin `?desde` se ve desde el
  // inicio (el libro sigue completo: saldo por fila y tarjetas no cambian).
  const inicio = await getInicioOficial();
  const rango = rangoHistorialCaja(sp.desde, sp.hasta, inicio);
  // Id que no es uuid (enlace viejo, marcador): 404 SIN llamar al API — su
  // 400 de «uuid inválido» tumbaba la pantalla al error boundary (21-sep-2026).
  if (!esUuid(id)) notFound();

  const degradado = new Degradaciones();
  let fondo: CajaFondoDetail;
  let usuarios: { id: string; nombre: string }[];
  try {
    // El FONDO es el dato de la pantalla; el catálogo de «Autorizado por»
    // degrada con aviso (antes su 502 tumbaba el fondo entero).
    const [fondoRes, usersRes] = await Promise.all([
      getFondo(id),
      degradado.opcional("los usuarios", listUsers({ limit: 200 }), {
        data: [] as Awaited<ReturnType<typeof listUsers>>["data"],
      }),
    ]);
    fondo = fondoRes;
    usuarios = usersRes.data.map((u) => ({ id: u.id, nombre: u.nombre }));
  } catch (err) {
    if (isApiError(err) && err.status === 404) notFound();
    throw err;
  }

  // Los gastos en efectivo del historial son EDITABLES aquí mismo (pedido de
  // oficina): si el piloto capturó mal el medio de pago (era tarjeta), al
  // corregirlo el movimiento sale solo del fondo — el saldo es en vivo.
  // Excel de caja chica (24-sep-2026): solo ADMIN/FACTURACION (GESTION del
  // API). Sin `/me` no se ofrece: un botón que responde 403 es peor que nada.
  const me = await getMe().catch(() => null);
  const puedeExcel = puedeDescargarExcelCaja(me?.rol);
  // «Ver en balance…» de cada gasto (15-oct-2026): los libros son de
  // ADMIN/ANALISTA (mismo corte que Conciliación); la línea «en qué hoja del
  // Excel está» la ve cualquiera que vea la fila.
  const abreBalances = puedeAbrirBalances(me?.rol);

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
  const aircraft = aircraftRes.data.map(avionCatalogoGasto);
  const providers = providersRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));

  const money = (n: number) =>
    n.toLocaleString("es-MX", { style: "currency", currency: fondo.moneda, maximumFractionDigits: 2 });

  // Filas-viewmodel serializables para la tabla cliente (nada de Maps ni
  // funciones cruzando la frontera server→cliente).
  // Movimientos de caja por id: la fila 'caja' del historial lleva el
  // movimiento completo para poder corregirlo/eliminarlo (caso Mari 18-ago).
  const movsById = new Map(fondo.movimientos.map((m) => [m.id, m]));
  // Desde/Hasta: se filtran FILAS del libro COMPLETO; el saldo y el por
  // reponer de cada fila siguen siendo los que manda el API (y las tarjetas
  // de arriba leen `fondo`, no esto).
  const entradas = filtrarHistorialPorRango(fondo.historial, rango);
  // «Sin movimientos en el periodo» aplica a CUALQUIER rango (también el de
  // siempre desde el inicio); «Limpiar» solo si el rango no es el de siempre.
  const conRango = hayRangoHistorial(rango);
  const limpiable = hayRangoHistorial(rango, inicio);
  // «Saldo inicial al 1-sep-2026»: la cifra que el API ya calculó con todo lo
  // anterior (última fila antes del inicio). Solo cuando la vista arranca en
  // el inicio; un rango que empieza después no la pinta.
  const saldoInicial =
    inicio && rango.desde === inicio ? saldoInicialAlInicio(fondo.historial, inicio) : null;
  const periodoVisto = textoPeriodoHistorial(rango, entradas.length, fondo.historial.length);
  // Caja MADRE: a quién puede reponer desde «Registrar movimiento».
  const cajasFondeadas = cajasParaReponer(fondo);
  // Gastos por pagar (19-oct-2026, API 0.0.95): la lista ADITIVA del API
  // (no son del libro: no tocan saldos). Sin la llave ⇒ null ⇒ sin bloque.
  const porPagar = porPagarDeFondo(fondo);
  const versionesPorPagar = Object.fromEntries(
    (porPagar?.items ?? []).map((it) => [it.id, gastosById.get(it.id)?.updated_at ?? null]),
  );
  const historial: MovimientoFondoRow[] = entradas.map((e) => {
    const gasto = e.origen === "gasto" ? (gastosById.get(e.id) ?? null) : null;
    const movimiento =
      e.origen === "caja" ? (movsById.get(e.id) ?? null) : null;
    return {
      movimiento,
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
      // Libro, mes y hoja salen SOLO del `balance` del API (invariante 72);
      // `detalleGastoFondo` arma los enlaces con `enlacesBalanceDeGasto`.
      detalleGasto: detalleGastoFondo(e, gasto, { abreBalances }),
      // Espejo de una reposición a otra caja: «Reposición a la caja de X».
      repuestoA: repuestoADeEntrada(e, movimiento),
    };
  });

  return (
    <div className="space-y-6">
      <TituloPestana titulo={tituloCajaChica(fondo.usuario?.nombre)} />
      <BackLink
        href="/admin/caja-chica"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        iconClassName="h-4 w-4"
      >
        Caja chica
      </BackLink>

      <AvisoDegradado faltantes={degradado.faltantes} />

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
        <div className="flex flex-wrap items-center gap-2">
          {/* Pedido del cliente (24-sep-2026): el Excel de lo que se va a
              reponer, para descargarlo ANTES de registrar la reposición. */}
          {puedeExcel && (
            <DescargarPorReponerButton
              fondoId={fondo.id}
              persona={fondo.usuario?.nombre ?? "Fondo"}
            />
          )}
          <MovimientoButton
            fondoId={fondo.id}
            persona={fondo.usuario?.nombre ?? "Fondo"}
            moneda={fondo.moneda}
            usuarios={usuarios}
            cajasFondeadas={cajasFondeadas}
          />
        </div>
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
                // Fuente única del API (la MISMA cifra del Excel «Por
                // reponer» y de la app): ver `porReponerDeFondo`.
                const porReponer = porReponerDeFondo(fondo);
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
                Lo que falta entregar para volver al fondo total (la misma cifra del Excel).
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

      {porPagar && (
        <PorPagarCaja
          items={porPagar.items}
          total={porPagar.total}
          moneda={fondo.moneda}
          versiones={versionesPorPagar}
          // SOCIO ve la caja chica pero no puede marcar pagado (P19).
          rol={me?.rol ?? null}
        />
      )}

      <Card>
        <CardHeader className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Historial</CardTitle>
            {/* Pedido del cliente (15-oct-2026): «filtro de fecha de desde hasta». */}
            {fondo.historial.length > 0 && <HistorialPeriodoFiltro />}
          </div>
          {/* Solo con filas: sin libro no hay control para quitar el filtro. */}
          {periodoVisto && fondo.historial.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {periodoVisto}. {NOTA_SALDO_LIBRO_COMPLETO}
            </p>
          )}
          <AvisoPeriodoAjustado inicio={inicio} ajustado={!!rango.ajustado} />
        </CardHeader>
        <CardContent className="p-0">
          {fondo.historial.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              Sin movimientos. Registra una reposición para fondear la caja.
            </p>
          ) : conRango && historial.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              <p>{TEXTO_SIN_MOVIMIENTOS_PERIODO}</p>
              {limpiable && (
                <Link
                  href={hrefCajaChica(fondo.id)}
                  scroll={false}
                  title={tituloLimpiarPeriodo(inicio)}
                  className="mt-2 inline-flex cursor-pointer items-center rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {TEXTO_LIMPIAR_PERIODO}
                </Link>
              )}
              {inicio && saldoInicial && (
                <FilaSaldoInicial inicio={inicio} saldo={saldoInicial} money={money} />
              )}
            </div>
          ) : (
            <>
            <FondoHistorialTable
              movimientos={historial}
              aircraft={aircraft}
              providers={providers}
              fondoId={fondo.id}
              persona={fondo.usuario?.nombre ?? "Fondo"}
              moneda={fondo.moneda}
              usuarios={usuarios}
              puedeDescargarExcel={puedeExcel}
            />
            {/* El libro va del más reciente al más viejo: el saldo con el
                que ARRANCA la vista va al pie, bajo la fila más vieja. */}
            {inicio && saldoInicial && (
              <FilaSaldoInicial inicio={inicio} saldo={saldoInicial} money={money} />
            )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * «Saldo inicial al 1-sep-2026» (16-oct-2026, inicio oficial): renglón
 * sintético con el saldo y lo por reponer de la última fila anterior al
 * inicio — las cifras que el API ya calculó con el libro completo. No es un
 * movimiento: no se edita ni entra a la búsqueda de la tabla.
 */
function FilaSaldoInicial({
  inicio,
  saldo,
  money,
}: {
  inicio: string;
  saldo: { saldo: number; por_reponer: number | null };
  money: (n: number) => string;
}) {
  return (
    <div
      data-saldo-inicial
      className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/40 px-4 py-2.5 text-sm"
    >
      <span className="font-medium">{textoSaldoInicial(inicio)}</span>
      <span className="flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums">
        <span>
          <span className="text-xs text-muted-foreground">Saldo </span>
          {money(saldo.saldo)}
        </span>
        {saldo.por_reponer != null && (
          <span>
            <span className="text-xs text-muted-foreground">Por reponer </span>
            {money(saldo.por_reponer)}
          </span>
        )}
      </span>
    </div>
  );
}
