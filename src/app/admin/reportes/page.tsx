import type { Metadata } from "next";
import { TITULOS_SECCION } from "@/lib/admin/titulos-pestana";
import { Suspense } from "react";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PeriodSelector } from "@/components/admin/profit-sharing/period-selector";
import { CierreRepartoSection } from "@/components/admin/profit-sharing/mes-reporte-select";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import {
  FlightReportPicker,
  type FlightPickItem,
} from "@/components/admin/flights/flight-report-picker";
import { AircraftBalancePicker } from "@/components/admin/reportes/aircraft-balance-picker";
import { AtajosPeriodoReportes } from "@/components/admin/reportes/atajos-periodo-reportes";
import { TextoPlegable } from "@/components/admin/texto-plegable";
import { AvisoDegradado } from "@/components/admin/aviso-degradado";
import { PreCierreCard } from "@/components/admin/reportes/pre-cierre-card";
import { PreCierreCardCargando } from "@/components/admin/reportes/pre-cierre-card-cargando";
import { VerEnPantallaLink } from "@/components/admin/reportes/ver-en-pantalla-link";
import { CierreMesCard, CierreMesCardCargando } from "@/components/admin/reportes/cierre-mes-card";
import { listFlights } from "@/lib/api/flights-server";
import { listAircraft } from "@/lib/api/aircraft";
import { getMe } from "@/lib/api/me";
import { getInicioOficial } from "@/lib/api/inicio-oficial";
import { ajustarRangoAlInicio } from "@/lib/admin/inicio-oficial";
import { AvisoPeriodoAjustado } from "@/components/admin/aviso-inicio-oficial";
import { Degradaciones } from "@/lib/api/degradar";
import { fmtDate, todayCancun } from "@/lib/datetime";
import { rangoFiltro } from "@/lib/admin/url-params";
import {
  NOTA_BALANCE_VUELATOUR,
  TITULO_CARD_BALANCE_VUELATOUR,
  TITULO_DETALLE_LIBROS,
  librosBalanceVuelaTour,
} from "@/lib/admin/reportes-balance";
import {
  TEXTO_BALANCES_SIN_PERMISO,
  periodoDefaultVista,
  puedeAbrirBalances,
  textoPeriodoVista,
} from "@/lib/admin/balance-vista";
import {
  DESCRIPCION_BALANCE_POR_AVION,
  DESCRIPCION_CIERRE_REPARTO,
  DETALLE_BALANCE_POR_AVION,
  ETIQUETA_DEGRADADO_AVIONES,
  ETIQUETA_DEGRADADO_USUARIO,
  ETIQUETA_DEGRADADO_VUELOS,
  KICKER_BALANCES,
  KICKER_CIERRE,
  KICKER_OTROS,
  SUBTITULO_REPORTES,
  SUBTITULO_REPORTES_SIN_BALANCES,
  TITULO_BALANCE_POR_AVION,
  ariaVerEnPantalla,
  avionBalanceDeAeronave,
  ordenarAvionesBalance,
  puedeExportarHorasPiloto,
} from "@/lib/admin/reportes-ui";

export const dynamic = "force-dynamic";

/**
 * 300 s (16-oct-2026, cierre de mes): las server actions de esta página
 * heredan este tope y «Cerrar <mes>» hace en el API el pre-cierre y DOS
 * repartos completos antes de escribir (decenas de segundos, como el balance
 * general). Con el tope corto, Vercel cortaba la respuesta con el mes YA
 * cerrado y el diálogo decía «sin respuesta».
 */
export const maxDuration = 300;

export const metadata: Metadata = { title: TITULOS_SECCION.reportes };

interface PageProps {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}

/**
 * `/admin/reportes` (12-oct-2026, «los balances a un clic»). Pedido del
 * cliente: «mejoremos la UI para que sea más limpio e intuitivo acceder a las
 * opciones de balance por avión y general que son las 2 cosas que más se
 * consultan aquí». De arriba abajo: periodo (+ atajos) → BALANCES (flota,
 * avión, «¿Qué trae cada libro?») → CIERRE DEL MES (pre-cierre entero +
 * cierre) → OTROS REPORTES (vuelo, exports). Textos y reglas en
 * `lib/admin/reportes-ui.ts`; los libros en `lib/admin/reportes-balance.ts`.
 */
export default async function ReportesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  // «Hoy» en Cancún UNA vez: el default del periodo y los atajos salen de aquí
  // (todo es servidor: nada se recalcula en el cliente).
  const hoy = todayCancun();
  const fb = periodoDefaultVista(hoy);
  // Fechas VALIDADAS (21-sep-2026): ver `lib/admin/url-params.ts`.
  const rango = rangoFiltro(sp.desde, sp.hasta);
  let desde = rango.desde ?? fb.desde;
  let hasta = rango.hasta ?? fb.hasta;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  // Inicio oficial (16-oct-2026, API 0.0.84): una URL vieja con agosto pasa
  // al periodo desde el inicio, con aviso (sin redirigir). Sin él, intacto.
  const inicio = await getInicioOficial();
  const ajuste = ajustarRangoAlInicio({ desde, hasta }, inicio, hoy);
  desde = ajuste.desde ?? desde;
  hasta = ajuste.hasta ?? hasta;

  // Catálogos ACCESORIOS: degradan POR TARJETA y se AVISA (regla «degradar sin
  // mentir»). `null` = NO cargó (se dice) ≠ `[]` = no hay.
  const degradado = new Degradaciones();
  const [me, vuelos, aeronaves] = await Promise.all([
    degradado.opcional(ETIQUETA_DEGRADADO_USUARIO, getMe(), null),
    degradado.opcional(ETIQUETA_DEGRADADO_VUELOS, listFlights({ limit: 100, offset: 0 }), null),
    degradado.opcional(ETIQUETA_DEGRADADO_AVIONES, listAircraft({ limit: 100, offset: 0 }), null),
  ]);
  const rol = me?.rol ?? null;

  // Vuelos recientes para el selector del reporte por vuelo.
  const flightsPick: FlightPickItem[] = (vuelos?.data ?? []).map((f) => {
    const ruta =
      f.ruta_iatas && f.ruta_iatas.length > 0
        ? f.ruta_iatas.join(" → ")
        : `${f.origen_iata} → ${f.destino_iata}`;
    // Fecha en el label: con varias idas a la misma ruta, el folio solo no
    // alcanza para encontrar el vuelo (y el buscador filtra por texto).
    const fecha = f.fecha_vuelo ? ` · ${fmtDate(f.fecha_vuelo)}` : "";
    return {
      id: f.id,
      folio: f.folio,
      label: `#${f.folio} · ${ruta}${fecha}`,
    };
  });
  const vuelosFallaron = vuelos === null;

  // Todos los aviones, inactivos incluidos (su libro histórico sirve), en el
  // orden de la grilla: activos A–Z, inactivos al final.
  const aviones = aeronaves ? ordenarAvionesBalance(aeronaves.data.map(avionBalanceDeAeronave)) : [];
  const avionesDisponibles = aeronaves !== null;

  // «Balance mensual» y «Balance general» del periodo (mismo orden que los tiles).
  const librosBalance = librosBalanceVuelaTour(desde, hasta);
  // Sin `/me` se ofrece todo: el API es el candado.
  const abreBalances = puedeAbrirBalances(rol);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Tesorería</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {abreBalances ? SUBTITULO_REPORTES : SUBTITULO_REPORTES_SIN_BALANCES}
        </p>
      </div>

      <div className="space-y-2">
        <PeriodSelector initial={{ desde, hasta }} />
        <AtajosPeriodoReportes hoy={hoy} desde={desde} hasta={hasta} inicio={inicio} />
        <AvisoPeriodoAjustado inicio={inicio} ajustado={ajuste.ajustado} />
      </div>
      <AvisoDegradado faltantes={degradado.faltantes} />

      {/* BALANCES: lo que más se consulta va arriba y a UN clic; el periodo en
          palabras se dice UNA sola vez, junto al rótulo. */}
      <section aria-labelledby="reportes-balances" className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2
            id="reportes-balances"
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {KICKER_BALANCES}
          </h2>
          <span className="text-xs text-muted-foreground">{textoPeriodoVista(desde, hasta)}</span>
        </div>
        {abreBalances ? (
          <>
            {/* Los dos libros de la FLOTA van PRIMERO (en móvil el general
                queda a un scroll, no a ocho). */}
            <Card>
              <CardHeader>
                <CardTitle id="reportes-balances-flota" className="text-base">
                  {TITULO_CARD_BALANCE_VUELATOUR}
                </CardTitle>
                <CardDescription>{NOTA_BALANCE_VUELATOUR}</CardDescription>
              </CardHeader>
              <CardContent>
                {/* `role="list"`: sin él, VoiceOver no anuncia la lista (el
                    preflight quita las viñetas); el nombre es el título de la
                    card, una sola vez. */}
                <ul
                  role="list"
                  aria-labelledby="reportes-balances-flota"
                  className="grid gap-3 sm:grid-cols-2"
                >
                  {librosBalance.map((libro) => (
                    <li
                      key={libro.modo}
                      data-libro={libro.modo}
                      className="flex flex-col gap-3 rounded-lg border border-border p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{libro.nombre}</p>
                        <p className="text-xs text-muted-foreground">{libro.resumen}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {/* «Ver en pantalla» PRIMERO en todos los tiles: la
                            posición es la jerarquía (prioridad a la vista). */}
                        <VerEnPantallaLink
                          destino={{ tipo: "vuelatour", modo: libro.modo }}
                          desde={desde}
                          hasta={hasta}
                          aria-label={ariaVerEnPantalla(libro.nombre)}
                        />
                        <ExcelExportButton
                          path={libro.path}
                          filename={libro.filename}
                          label={libro.etiqueta}
                          query={libro.query}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Un tile por AVIÓN. */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{TITULO_BALANCE_POR_AVION}</CardTitle>
                <CardDescription>{DESCRIPCION_BALANCE_POR_AVION}</CardDescription>
              </CardHeader>
              <CardContent>
                <AircraftBalancePicker
                  aircraft={aviones}
                  disponibles={avionesDisponibles}
                  desde={desde}
                  hasta={hasta}
                />
              </CardContent>
            </Card>

            {/* Las descripciones largas, plegadas y SIEMPRE en el DOM (el SSR
                las imprime). */}
            <TextoPlegable titulo={TITULO_DETALLE_LIBROS}>
              {librosBalance.map((libro) => (
                <p key={libro.modo}>
                  <span className="font-medium text-foreground">{`${libro.nombre}:`}</span>{" "}
                  {libro.detalle}
                </p>
              ))}
              <p>
                <span className="font-medium text-foreground">{`${TITULO_BALANCE_POR_AVION}:`}</span>{" "}
                {DETALLE_BALANCE_POR_AVION}
              </p>
            </TextoPlegable>
          </>
        ) : (
          /* FACTURACION (u otro rol fuera de ADMIN/ANALISTA): el API responde
             403 a los cuatro endpoints; se explica en vez de pintar botones
             que fallan. */
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <LockClosedIcon className="h-5 w-5 text-muted-foreground" aria-hidden />
                {TEXTO_BALANCES_SIN_PERMISO.titulo}
              </CardTitle>
              <CardDescription>{TEXTO_BALANCES_SIN_PERMISO.descripcion}</CardDescription>
            </CardHeader>
          </Card>
        )}
      </section>

      {/* CIERRE DEL MES: el pre-cierre ENTERO, pegado a la acción que custodia. */}
      <section aria-labelledby="reportes-cierre" className="space-y-3">
        <h2
          id="reportes-cierre"
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {KICKER_CIERRE}
        </h2>
        {/* El pre-cierre es la lectura PESADA de la página (12-oct-2026): va
            en su propio Suspense para que cambiar el periodo pinte el resto
            al instante y el selector de fechas no «se trabe» esperándolo. */}
        <Suspense key={`${desde}:${hasta}`} fallback={<PreCierreCardCargando />}>
          <PreCierreCard desde={desde} hasta={hasta} />
        </Suspense>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cierre y reparto del periodo</CardTitle>
            <CardDescription>{DESCRIPCION_CIERRE_REPARTO}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Cierre FORMAL del mes (16-oct-2026, API 0.0.88): estado,
                «Cerrar <mes>» y «Reabrir mes». Su propio Suspense: con un API
                lento no detiene las descargas. */}
            <Suspense key={`cierre:${desde}:${hasta}`} fallback={<CierreMesCardCargando />}>
              <CierreMesCard desde={desde} hasta={hasta} hoy={hoy} inicio={inicio} rol={rol} />
            </Suspense>
            <CierreRepartoSection desde={desde} hasta={hasta} rol={rol ?? undefined} />
          </CardContent>
        </Card>
      </section>

      {/* OTROS REPORTES: dos columnas desde lg. */}
      <section aria-labelledby="reportes-otros" className="space-y-3">
        <h2
          id="reportes-otros"
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {KICKER_OTROS}
        </h2>
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reporte por vuelo</CardTitle>
              <CardDescription>
                Reporte consolidado de un vuelo (cotización, ingreso, tacómetro,
                combustible y gastos) en PDF y Excel. Independiente del periodo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FlightReportPicker flights={flightsPick} fallo={vuelosFallaron} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Exports de operación</CardTitle>
              <CardDescription>
                Inventario y cardex son a la fecha; horas por piloto y gastos respetan el periodo.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2 flex-wrap">
              <ExcelExportButton
                path="/v1/inventory/items/export"
                filename="inventario-valorizado.xlsx"
                label="Inventario valorizado"
              />
              <ExcelExportButton
                path="/v1/inventory/movimientos/export"
                filename="cardex.xlsx"
                label="Cardex"
              />
              {/* Solo a quien el API se lo da (ADMIN y COORDINADOR): ANALISTA y
                  FACTURACION veían un botón que siempre respondía 403. */}
              {puedeExportarHorasPiloto(rol) && (
                <ExcelExportButton
                  path="/v1/dashboards/horas-piloto/export"
                  filename="horas-por-piloto.xlsx"
                  label="Horas por piloto"
                  query={{ desde, hasta }}
                />
              )}
              <ExcelExportButton
                path="/v1/expenses/export"
                filename="gastos.xlsx"
                label="Gastos"
                query={{ desde, hasta }}
              />
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
