import type { Metadata } from "next";
import { TITULOS_DETALLE, tituloHistoricoAvion } from "@/lib/admin/titulos-pestana";
import { TituloPestana } from "@/components/admin/titulo-pestana";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftIcon,
  InformationCircleIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
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
import { EmptyState } from "@/components/admin/empty-state";
import { TarjetaErrorCarga } from "@/components/admin/tarjeta-error-carga";
import { AvisoPeriodoAjustado } from "@/components/admin/aviso-inicio-oficial";
import { FiltroMesesCuenta } from "@/components/admin/profit-sharing/filtro-meses-cuenta";
import { HistoricoAvionTable } from "@/components/admin/profit-sharing/historico-avion-table";
import { EntregasAvionTable } from "@/components/admin/profit-sharing/entregas-avion-table";
import { getMe } from "@/lib/api/me";
import { getInicioOficial } from "@/lib/api/inicio-oficial";
import { getAvionHistorico } from "@/lib/api/profit-sharing-server";
import { todayCancun } from "@/lib/datetime";
import { fmtMxn } from "@/lib/format";
import { esUuid } from "@/lib/admin/url-params";
import { cn } from "@/lib/utils";
import { mesInicio } from "@/lib/admin/inicio-oficial";
import {
  etiquetaMes,
  hrefCuentaSocioDesdeReparto,
  mesActual,
  puedeRegistrarEntregas,
} from "@/lib/admin/reparto-pagos";
import {
  AYUDA_HISTORICO,
  AYUDA_SOCIOS_HISTORICO,
  ETIQUETA_COLUMNA_RESERVA_A_GUARDAR,
  ETIQUETA_TODO_EL_HISTORICO,
  ETIQUETA_VOLVER_REPARTO,
  TEXTO_AVION_NO_DISPONIBLE,
  TEXTO_ERROR_CARGA_HISTORICO,
  TEXTO_FILTRO_HISTORICO_IGNORADO,
  TEXTO_SIN_ENTREGAS_AVION,
  TEXTO_SIN_SOCIOS_AVION,
  TEXTO_SOCIO_SOLO_LO_SUYO,
  TITULO_ENTREGAS_HISTORICO,
  TITULO_HISTORICO,
  TITULO_SOCIOS_HISTORICO,
  filtroMesesHistorico,
  hrefRepartoAvion,
  mesesFuturosDelRango,
  puedeVerRepartoAvion,
  textoPorEntregarAvion,
} from "@/lib/admin/reparto-avion";

export const dynamic = "force-dynamic";

// Pestaña: «Histórico del avión» mientras carga; «Histórico N621TX» lo pone
// <TituloPestana> con lo que la página ya leyó (el head NO lee el API).
export const metadata: Metadata = { title: TITULOS_DETALLE.historicoAvion };

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}

function Volver({ aeronaveId }: { aeronaveId: string }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      <Link
        href={hrefRepartoAvion(aeronaveId)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        <ArrowLeftIcon className="h-4 w-4" aria-hidden />
        {TITULOS_DETALLE.repartoAvion}
      </Link>
      <Link
        href="/admin/profit-sharing"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        {ETIQUETA_VOLVER_REPARTO}
      </Link>
    </div>
  );
}

/**
 * HISTÓRICO mes a mes de UN avión (20-oct-2026, API 0.0.101): «que vengan
 * los números de todo el histórico del avión y poder filtrar por mes, que
 * sea muy fácil de entender». Un renglón por mes con la cascada EN PESOS,
 * el saldo, la reserva informativa, lo entregado y el estado del cierre;
 * totales del rango; los socios del rango (generado, reserva a guardar,
 * entregado, por entregar) y las entregas. Filtro `?desde=AAAA-MM&hasta=`
 * (default del API: del inicio oficial al mes en curso). Todo del API.
 */
export default async function HistoricoAvionPage({ params, searchParams }: PageProps) {
  const [{ id }, sp, me] = await Promise.all([params, searchParams, getMe()]);
  if (!esUuid(id)) notFound();

  if (!puedeVerRepartoAvion(me.rol)) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={LockClosedIcon}
          title="Solo administración, análisis, facturación y socios"
          description="El histórico por avión lo ven los usuarios con rol ADMIN, ANALISTA, FACTURACION o SOCIO."
        />
      </div>
    );
  }

  // El `?desde=`/`?hasta=` se corrige ANTES de pedirlo (un mes futuro o más de
  // 36 meses daría 400 RANGO_INVALIDO para siempre); inicio oficial con aviso.
  const mesHoy = mesActual(todayCancun());
  const inicio = await getInicioOficial();
  const filtro = filtroMesesHistorico(sp.desde, sp.hasta, mesHoy, inicio);
  const carga = await getAvionHistorico(id, filtro);

  if (carga.estado === "no-existe") notFound();
  if (carga.estado === "sin-permiso") {
    return (
      <div className="space-y-6">
        <Volver aeronaveId={id} />
        <EmptyState icon={LockClosedIcon} title="Sin permiso" description="Tu usuario no tiene acceso al histórico de este avión." />
      </div>
    );
  }
  if (carga.estado === "no-disponible") {
    return (
      <div className="space-y-6">
        <Volver aeronaveId={id} />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{TITULOS_DETALLE.historicoAvion}</CardTitle>
            <CardDescription>{TEXTO_AVION_NO_DISPONIBLE}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  if (carga.estado !== "ok") {
    return (
      <div className="space-y-6">
        <Volver aeronaveId={id} />
        <TarjetaErrorCarga titulo="No se pudo cargar el histórico del avión" descripcion={TEXTO_ERROR_CARGA_HISTORICO} />
      </div>
    );
  }

  const datos = carga.datos;
  const filtrado = !carga.filtroIgnorado && Boolean(filtro.desde || filtro.hasta);
  const futuros = mesesFuturosDelRango(datos.desde, datos.hasta, datos.mes_actual);
  const puedeAdjuntar = puedeRegistrarEntregas(me.rol);

  return (
    <div className="space-y-6">
      <TituloPestana titulo={tituloHistoricoAvion(datos.aeronave.matricula)} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <Volver aeronaveId={datos.aeronave.id} />
          <h1 className="font-mono text-2xl font-semibold tracking-tight md:text-3xl">{datos.aeronave.matricula}</h1>
          <p className="text-sm text-muted-foreground">
            {datos.aeronave.modelo} · {TITULO_HISTORICO.toLowerCase()}, en pesos (MXN)
          </p>
        </div>
        <FiltroMesesCuenta
          desde={datos.desde}
          hasta={datos.hasta}
          cuentaDesdeMes={mesInicio(inicio) ?? datos.desde}
          mesActual={datos.mes_actual}
          filtrado={filtrado}
          etiquetaTodo={ETIQUETA_TODO_EL_HISTORICO}
        />
      </div>

      <AvisoPeriodoAjustado inicio={inicio} ajustado={filtro.ajustado === true} />

      {carga.filtroIgnorado && (
        <div
          className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground"
          data-filtro-ignorado
        >
          <InformationCircleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{TEXTO_FILTRO_HISTORICO_IGNORADO}</p>
        </div>
      )}

      {me.rol === "SOCIO" && (
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
          <InformationCircleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{TEXTO_SOCIO_SOLO_LO_SUYO}</p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {TITULO_HISTORICO} · {etiquetaMes(datos.desde)} a {etiquetaMes(datos.hasta)}
          </CardTitle>
          <CardDescription>
            {AYUDA_HISTORICO}
            {futuros.length > 0 && ` Los meses que aún no llegan (${futuros.map(etiquetaMes).join(", ")}) no se muestran.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HistoricoAvionTable meses={datos.meses} totales={datos.totales} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{TITULO_SOCIOS_HISTORICO}</CardTitle>
          <CardDescription>{AYUDA_SOCIOS_HISTORICO}</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-2">
          {datos.socios.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground sm:px-2">{TEXTO_SIN_SOCIOS_AVION}</p>
          ) : (
            <Table data-tabla-socios-historico>
              <TableHeader>
                <TableRow>
                  <TableHead>Socio</TableHead>
                  <TableHead className="text-right">Generado (a recibir)</TableHead>
                  <TableHead className="text-right">{ETIQUETA_COLUMNA_RESERVA_A_GUARDAR}</TableHead>
                  <TableHead className="text-right">Entregado</TableHead>
                  <TableHead className="text-right">Por entregar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datos.socios.map((s) => {
                  const href = hrefCuentaSocioDesdeReparto({ rol: me.rol, usuarioId: me.id }, s.socio_id);
                  const porEntregar = textoPorEntregarAvion(s.por_entregar_mxn);
                  return (
                    <TableRow key={s.socio_id} data-socio-historico={s.socio_id}>
                      <TableCell className="min-w-[10rem] whitespace-normal text-sm font-medium">
                        {href ? (
                          <Link href={href} className="cursor-pointer underline-offset-2 hover:underline">
                            {s.socio_nombre}
                          </Link>
                        ) : (
                          s.socio_nombre
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtMxn(s.generado_mxn)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{fmtMxn(s.reserva_mxn)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtMxn(s.entregado_mxn)}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono text-sm font-semibold",
                          porEntregar.tono === "ambar" && "text-amber-700 dark:text-amber-400",
                          porEntregar.tono === "azul" && "text-sky-700 dark:text-sky-300",
                        )}
                      >
                        {porEntregar.texto}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{TITULO_ENTREGAS_HISTORICO}</CardTitle>
          <CardDescription>
            Entregas registradas con «corresponde a» este avión en los meses del rango.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-2">
          <EntregasAvionTable
            entregas={datos.entregas}
            socios={datos.socios}
            puedeAdjuntar={puedeAdjuntar}
            vacio={TEXTO_SIN_ENTREGAS_AVION}
          />
        </CardContent>
      </Card>
    </div>
  );
}
