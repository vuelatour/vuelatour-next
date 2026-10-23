import type { Metadata } from "next";
import { TITULOS_DETALLE, tituloRepartoAvion } from "@/lib/admin/titulos-pestana";
import { TituloPestana } from "@/components/admin/titulo-pestana";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  LockClosedIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/admin/empty-state";
import { AvisoDegradado } from "@/components/admin/aviso-degradado";
import { TarjetaErrorCarga } from "@/components/admin/tarjeta-error-carga";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import { AvisoPeriodoAjustado } from "@/components/admin/aviso-inicio-oficial";
import { ChipEstadoCierre } from "@/components/admin/chip-cierre";
import { PeriodSelector } from "@/components/admin/profit-sharing/period-selector";
import { CascadaAvion } from "@/components/admin/profit-sharing/cascada-avion";
import { CierreRepartoAvion } from "@/components/admin/profit-sharing/cierre-reparto-aviso";
import { DesgloseSection } from "@/components/admin/profit-sharing/desglose-section";
import { GastosAvionTable } from "@/components/admin/profit-sharing/gastos-avion-table";
import { EntregasAvionTable } from "@/components/admin/profit-sharing/entregas-avion-table";
import {
  SociosAvionTable,
  type FilaSocioAvion,
} from "@/components/admin/profit-sharing/socios-avion-table";
import { getMe } from "@/lib/api/me";
import { Degradaciones } from "@/lib/api/degradar";
import { getInicioOficial } from "@/lib/api/inicio-oficial";
import { listAircraftOwners } from "@/lib/api/aircraft";
import {
  getAvionDetalle,
  getContextoRegistro,
  getSociosCuenta,
} from "@/lib/api/profit-sharing-server";
import { todayCancun } from "@/lib/datetime";
import { fmtDecimal } from "@/lib/format";
import { esUuid } from "@/lib/admin/url-params";
import { cn } from "@/lib/utils";
import { textoBadgeCierrePeriodo } from "@/lib/admin/cierre-mes";
import {
  mesActual,
  mesDePeriodo,
  puedeRegistrarEntregas,
  puedeVerCuentasSocios,
} from "@/lib/admin/reparto-pagos";
import {
  NOTA_COMBUSTIBLE_SEPARADO,
  NOTA_REPARTO_COMO_BALANCE,
  NOTA_REPARTO_EN_PESOS,
  combustibleSeparado,
  repartoComoBalance,
  repartoEnPesos,
} from "@/lib/admin/reparto-pesos";
import {
  AYUDA_ENTREGAS_AVION,
  AYUDA_SOCIOS_AVION,
  ayudaCascada,
  ayudaGastosAvion,
  ETIQUETA_FICHA_AVION,
  ETIQUETA_HISTORICO,
  ETIQUETA_VOLVER_REPARTO,
  TEXTO_AVION_NO_DISPONIBLE,
  TEXTO_ERROR_CARGA_AVION,
  TEXTO_SIN_ENTREGAS_AVION,
  TEXTO_SOCIO_SOLO_LO_SUYO,
  TITULO_CASCADA,
  TITULO_ENTREGAS_AVION,
  TITULO_GASTOS_AVION,
  TITULO_SOCIOS_AVION,
  TITULO_VUELOS_AVION,
  contextoEntregaDesdeAvion,
  filasPropietarioDeSocio,
  hrefHistoricoAvion,
  hrefRepartoConPeriodo,
  periodoRepartoDeUrl,
  puedeCambiarDescuentoReserva,
  puedeDescargarBalanceAvion,
  puedeVerRepartoAvion,
  saldoCascada,
} from "@/lib/admin/reparto-avion";
import type { ResumenCuentaSocio } from "@/types/reparto-pagos";

export const dynamic = "force-dynamic";

// Pestaña: «Reparto del avión» mientras carga; «Reparto N621TX · septiembre
// 2026» lo pone <TituloPestana> con lo que la página ya leyó (el head NO lee
// el API: regla 5 de titulos-pestana).
export const metadata: Metadata = { title: TITULOS_DETALLE.repartoAvion };

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}

function Volver({ periodo }: { periodo: { desde?: string; hasta?: string } }) {
  return (
    <Link
      href={hrefRepartoConPeriodo(periodo)}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      <ArrowLeftIcon className="h-4 w-4" aria-hidden />
      {ETIQUETA_VOLVER_REPARTO}
    </Link>
  );
}

/**
 * PANTALLA POR AVIÓN del reparto (20-oct-2026, API 0.0.101, invariante 99):
 * sustituye a la card como lugar del detalle. Pedido del cliente: «una
 * pantalla por avión… para saber cuáles son esos permisos, gastos indirectos
 * y directos de lo que hablan en el excel», «el reserva de overhaul también
 * debe venir… eso no se resta, y debe venir cuánto es lo que debe guardar
 * cada socio… seleccionar en cada avión en cada socio si se les restamos»,
 * «las cuentas de dispersión… en el detalle o pantalla del avión… todo en
 * Pesos». Secciones: encabezado con el saldo, la cascada (AFAC resta; la
 * reserva informativa debajo), los gastos del periodo gasto por gasto, los
 * vuelos, los socios (reserva a guardar, se descuenta / solo informativa,
 * entregado y por entregar DE ESTE AVIÓN, «Registrar entrega») y las
 * entregas del avión. Todo en pesos; el USD en gris. Todo lo manda el API.
 */
export default async function RepartoAvionPage({ params, searchParams }: PageProps) {
  const [{ id }, sp, me] = await Promise.all([params, searchParams, getMe()]);
  // Un id que no es uuid no llega al API (`url-params`).
  if (!esUuid(id)) notFound();

  if (!puedeVerRepartoAvion(me.rol)) {
    return (
      <div className="space-y-6">
        <Volver periodo={sp} />
        <EmptyState
          icon={LockClosedIcon}
          title="Solo administración, análisis, facturación y socios"
          description="El reparto por avión lo ven los usuarios con rol ADMIN, ANALISTA, FACTURACION o SOCIO."
        />
      </div>
    );
  }

  const inicio = await getInicioOficial();
  const hoy = todayCancun();
  const { desde, hasta, ajustado } = periodoRepartoDeUrl(sp, inicio, hoy);
  const puedeRegistrar = puedeRegistrarEntregas(me.rol);
  const puedeCambiarReserva = puedeCambiarDescuentoReserva(me.rol);
  const degradado = new Degradaciones();
  // La lectura PRINCIPAL nunca lanza; las cuentas de los socios (lo por
  // entregar de TODA su cuenta, para «Registrar entrega»), el contexto de
  // registro y los propietarios (los renglones de `aeronave_socio` para el
  // descuento de la reserva, solo ADMIN) son ACCESORIOS.
  const [carga, cargaSocios, registro, propietarios] = await Promise.all([
    getAvionDetalle(id, { desde, hasta }),
    puedeVerCuentasSocios(me.rol) ? getSociosCuenta() : Promise.resolve(null),
    getContextoRegistro(me, degradado),
    puedeCambiarReserva
      ? degradado.opcional("los propietarios del avión", listAircraftOwners(id, { history: true }), null)
      : Promise.resolve(null),
  ]);

  if (carga.estado === "no-existe") notFound();
  if (carga.estado === "sin-permiso") {
    return (
      <div className="space-y-6">
        <Volver periodo={{ desde, hasta }} />
        <EmptyState
          icon={LockClosedIcon}
          title="Sin permiso"
          description="Tu usuario no tiene acceso al reparto de este avión."
        />
      </div>
    );
  }
  if (carga.estado === "no-disponible") {
    return (
      <div className="space-y-6">
        <Volver periodo={{ desde, hasta }} />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{TITULOS_DETALLE.repartoAvion}</CardTitle>
            <CardDescription>{TEXTO_AVION_NO_DISPONIBLE}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  if (carga.estado !== "ok") {
    return (
      <div className="space-y-6">
        <Volver periodo={{ desde, hasta }} />
        <TarjetaErrorCarga titulo="No se pudo cargar el reparto del avión" descripcion={TEXTO_ERROR_CARGA_AVION} />
      </div>
    );
  }

  const datos = carga.datos;
  const avion = datos.avion;
  const periodo = datos.periodo;
  const enPesos = repartoEnPesos(datos);
  const comoBalance = repartoComoBalance(datos);
  // Combustible separado de los directos (23-oct-2026, API 0.0.103): la
  // cascada y los gastos siguen las líneas del Excel. Sin las llaves, lo de antes.
  const conCombustible = combustibleSeparado(avion);
  const saldo = saldoCascada(avion, enPesos);
  const positivo = (saldo.valor ?? avion.saldo_disponible_usd) >= 0;
  const detalle = avion.detalle ?? null;
  const badgeCierre = textoBadgeCierrePeriodo(datos.cierre);
  // Lo por entregar de TODA la cuenta de cada socio (para el diálogo) sale
  // del resumen de cuentas; sin él, el diálogo abre con lo mínimo.
  const resumenPorSocio = new Map<string, ResumenCuentaSocio>(
    cargaSocios?.estado === "ok" ? cargaSocios.datos.socios.map((s) => [s.socio.id, s]) : [],
  );
  const mesEnCurso =
    (cargaSocios?.estado === "ok" ? cargaSocios.datos.hasta_mes : null) || mesActual(hoy);
  const mesSugerido = mesDePeriodo(periodo.desde, periodo.hasta);
  const filasSocios: FilaSocioAvion[] = datos.socios.map((s) => ({
    socio: s,
    ownerIds: filasPropietarioDeSocio(propietarios, s.socio_id, periodo).map((o) => o.id),
    contexto: puedeRegistrar
      ? contextoEntregaDesdeAvion(s, avion.aeronave, resumenPorSocio.get(s.socio_id) ?? null, {
          mesEnCurso,
          mesSugerido,
        })
      : null,
  }));
  const totalVuelos = avion.ingresos.vuelos_cobrados + avion.ingresos.vuelos_pendientes;

  return (
    <div className="space-y-6">
      <TituloPestana titulo={tituloRepartoAvion(avion.aeronave.matricula, periodo.desde, periodo.hasta)} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <Volver periodo={{ desde, hasta }} />
          <h1 className="font-mono text-2xl font-semibold tracking-tight md:text-3xl">{avion.aeronave.matricula}</h1>
          <p className="text-sm text-muted-foreground">
            {avion.aeronave.modelo} · reparto del periodo, en pesos (MXN)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={hrefHistoricoAvion(avion.aeronave.id)}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer gap-1.5")}
            data-accion="ver-historico-avion"
          >
            <CalendarDaysIcon className="h-4 w-4" aria-hidden />
            {ETIQUETA_HISTORICO}
          </Link>
          <Link
            href={`/admin/aircraft/${avion.aeronave.id}`}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "cursor-pointer gap-1.5")}
          >
            <PaperAirplaneIcon className="h-4 w-4" aria-hidden />
            {ETIQUETA_FICHA_AVION}
          </Link>
          {puedeDescargarBalanceAvion(me.rol) && (
            <ExcelExportButton
              path={`/v1/aircraft/${avion.aeronave.id}/balance.xlsx`}
              query={{ desde: periodo.desde, hasta: periodo.hasta }}
              filename={`balance-${avion.aeronave.matricula}-${periodo.desde}-${periodo.hasta}.xlsx`}
              label="Balance (Excel)"
            />
          )}
        </div>
      </div>

      <PeriodSelector initial={{ desde, hasta }} atajoMesPasado hoy={hoy} />
      <AvisoPeriodoAjustado inicio={inicio} ajustado={ajustado} />
      <AvisoDegradado faltantes={degradado.faltantes} />

      <Card data-saldo-avion>
        <CardContent className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Saldo disponible del periodo</p>
            <p
              className={`mt-1 text-3xl font-semibold tabular-nums ${
                positivo ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
              }`}
              data-saldo-principal
            >
              {saldo.principal}
            </p>
            {saldo.informativo && (
              <p className="text-sm text-muted-foreground tabular-nums">{saldo.informativo}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="h-4 w-4" aria-hidden />
              {fmtDecimal(avion.horas_voladas_hr, 1)} hr voladas
            </span>
            <span className="inline-flex items-center gap-1">
              <PaperAirplaneIcon className="h-4 w-4" aria-hidden />
              {totalVuelos} vuelo(s) · {avion.ingresos.vuelos_cobrados} cobrados
            </span>
            {badgeCierre && (
              <span className="inline-flex items-center gap-1.5">
                Mes: <ChipEstadoCierre badge={badgeCierre} />
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
        <InformationCircleIcon className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
        <div className="min-w-0 space-y-1 text-xs text-muted-foreground">
          {enPesos && <p>{NOTA_REPARTO_EN_PESOS}</p>}
          {comoBalance && <p>{NOTA_REPARTO_COMO_BALANCE}</p>}
          {conCombustible && <p>{NOTA_COMBUSTIBLE_SEPARADO}</p>}
          {me.rol === "SOCIO" && <p>{TEXTO_SOCIO_SOLO_LO_SUYO}</p>}
          {(datos.gastos_sin_tc?.count ?? 0) > 0 && (
            <p className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0" />
              {datos.gastos_sin_tc?.count} gasto(s) fijo(s) en MXN sin tipo de cambio (
              {fmtDecimal(datos.gastos_sin_tc?.monto_mxn ?? 0)} MXN) quedaron fuera del prorrateo (sin TC
              capturado ni TC oficial disponible para su fecha).
            </p>
          )}
        </div>
      </div>

      <CierreRepartoAvion cierre={datos.cierre} matricula={avion.aeronave.matricula} />

      {/* 2. La cascada completa: las filas SUMAN el saldo; la reserva, aparte. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{TITULO_CASCADA}</CardTitle>
          <CardDescription>{ayudaCascada(conCombustible)}</CardDescription>
        </CardHeader>
        <CardContent>
          <CascadaAvion avion={avion} enPesos={enPesos} comoBalance={comoBalance} />
        </CardContent>
      </Card>

      {/* 3. Gastos del periodo, gasto por gasto, agrupados como en el balance. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{TITULO_GASTOS_AVION}</CardTitle>
          <CardDescription>{ayudaGastosAvion(conCombustible)}</CardDescription>
        </CardHeader>
        <CardContent>
          <GastosAvionTable avion={avion} filas={detalle?.gastos} enPesos={enPesos} />
        </CardContent>
      </Card>

      {/* 4. Vuelos y otros ingresos del periodo (el desglose de siempre). */}
      {detalle && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{TITULO_VUELOS_AVION}</CardTitle>
            <CardDescription>
              Cada vuelo con su venta, lo cobrado y lo pendiente de la parte de este avión, y los gastos por categoría.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DesgloseSection detalle={detalle} enPesos={enPesos} />
          </CardContent>
        </Card>
      )}

      {/* 5. Socios de este avión. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{TITULO_SOCIOS_AVION}</CardTitle>
          <CardDescription>{AYUDA_SOCIOS_AVION}</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-2">
          <SociosAvionTable
            aeronaveId={avion.aeronave.id}
            matricula={avion.aeronave.matricula}
            filas={filasSocios}
            puedeCambiarReserva={puedeCambiarReserva}
            puedeRegistrar={puedeRegistrar}
            registro={registro}
            rol={me.rol}
            usuarioId={me.id}
          />
        </CardContent>
      </Card>

      {/* 6. Entregas que corresponden a este avión en el periodo. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{TITULO_ENTREGAS_AVION}</CardTitle>
          <CardDescription>{AYUDA_ENTREGAS_AVION}</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-2">
          <EntregasAvionTable
            entregas={datos.entregas}
            socios={datos.socios}
            puedeAdjuntar={puedeRegistrar}
            vacio={TEXTO_SIN_ENTREGAS_AVION}
          />
        </CardContent>
      </Card>
    </div>
  );
}
