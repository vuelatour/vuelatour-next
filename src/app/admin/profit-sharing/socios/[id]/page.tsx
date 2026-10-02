import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftIcon,
  ExclamationTriangleIcon,
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
import { EmptyState } from "@/components/admin/empty-state";
import { AvisoDegradado } from "@/components/admin/aviso-degradado";
import { TarjetaErrorCarga } from "@/components/admin/tarjeta-error-carga";
import { BotonRegistrarEntrega } from "@/components/admin/profit-sharing/entrega-socio-dialog";
import { BotonConfigurarCuenta } from "@/components/admin/profit-sharing/cuenta-socio-dialog";
import { FiltroMesesCuenta } from "@/components/admin/profit-sharing/filtro-meses-cuenta";
import { MovimientosCuenta } from "@/components/admin/profit-sharing/movimientos-cuenta";
import { ResumenMesesCuenta } from "@/components/admin/profit-sharing/resumen-meses-cuenta";
import {
  AvisoEntregasPrevias,
  BannerCuentaNoConfigurada,
  KpisCuenta,
  SinPermisoCuenta,
  TarjetaCuentasNoDisponibles,
} from "@/components/admin/profit-sharing/estado-cuenta-partes";
import { getMe } from "@/lib/api/me";
import { Degradaciones } from "@/lib/api/degradar";
import {
  getContextoRegistro,
  getEntregasAntesDelArranque,
  getEstadoCuentaSocio,
} from "@/lib/api/profit-sharing-server";
import { esUuid } from "@/lib/admin/url-params";
import { todayCancun } from "@/lib/datetime";
import { fmtUsd } from "@/lib/format";
import {
  AYUDA_POR_MES_CUENTA,
  MES_CUENTA_DEFAULT,
  RUTA_PAGOS_SOCIOS,
  TEXTO_ERROR_CARGA_CUENTAS,
  TEXTO_FILTRO_MESES_IGNORADO,
  TITULO_PAGOS_SOCIOS,
  contextoEntregaDeEstadoCuenta,
  escondeEntregasAntesDelArranque,
  etiquetaMes,
  filtroMesesCuenta,
  hrefCuentaSocio,
  mesActual,
  mesDeFecha,
  mesParaVerEntregasPrevias,
  puedeRegistrarEntregas,
  puedeVerCuentasSocios,
  textoAvionDeSocio,
  textoEntregasAntesDelArranque,
} from "@/lib/admin/reparto-pagos";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}

function Volver() {
  return (
    <Link
      href={RUTA_PAGOS_SOCIOS}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      <ArrowLeftIcon className="h-4 w-4" aria-hidden />
      {TITULO_PAGOS_SOCIOS}
    </Link>
  );
}

/**
 * ESTADO DE CUENTA de un socio (cuenta corriente, 1-oct-2026, API 0.0.50):
 * generado / entregado / por entregar / estatus, los movimientos con saldo
 * corrido (utilidades por mes y avión, entregas con método, quién entregó,
 * recibió/factura, referencia y comprobante) y el resumen por mes. Filtro
 * por meses en la URL (`?desde=YYYY-MM&hasta=YYYY-MM`). Todo del API.
 */
export default async function EstadoCuentaSocioPage({ params, searchParams }: PageProps) {
  const [{ id }, sp, me] = await Promise.all([params, searchParams, getMe()]);
  // Un id que no es uuid no llega al API (`url-params`).
  if (!esUuid(id)) notFound();

  if (!puedeVerCuentasSocios(me.rol)) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={LockClosedIcon}
          title="Solo administración, facturación, análisis y socios"
          description="Las cuentas de los socios las ven los usuarios con rol ADMIN, FACTURACION, ANALISTA o SOCIO."
        />
      </div>
    );
  }

  // Hoy Cancún del servidor: recorta un `?desde=`/`?hasta=` futuro ANTES
  // de pedirlo (el API respondería 400 y «Reintentar» nunca lo arreglaría).
  const mesHoy = mesActual(todayCancun());
  const filtro = filtroMesesCuenta(sp.desde, sp.hasta, mesHoy);
  const puedeRegistrar = puedeRegistrarEntregas(me.rol);
  const degradado = new Degradaciones();
  const [carga, registro] = await Promise.all([
    getEstadoCuentaSocio(id, filtro),
    getContextoRegistro(me, degradado),
  ]);

  if (carga.estado === "no-existe") notFound();
  if (carga.estado === "sin-permiso") {
    return (
      <div className="space-y-6">
        <Volver />
        <SinPermisoCuenta esSocio={me.rol === "SOCIO"} />
      </div>
    );
  }
  if (carga.estado === "no-disponible") {
    return (
      <div className="space-y-6">
        <Volver />
        <TarjetaCuentasNoDisponibles titulo="Estado de cuenta del socio" />
      </div>
    );
  }
  if (carga.estado !== "ok") {
    return (
      <div className="space-y-6">
        <Volver />
        <TarjetaErrorCarga
          titulo="No se pudo cargar el estado de cuenta"
          descripcion={TEXTO_ERROR_CARGA_CUENTAS}
        />
      </div>
    );
  }

  const datos = carga.datos;
  const hoyMes = mesHoy ?? mesActual(registro.hoy) ?? datos.hasta;
  const cuentaDesdeMes = mesDeFecha(datos.cuenta.cuenta_desde) ?? MES_CUENTA_DEFAULT;
  // Los `totales` del estado de cuenta son los de TODA la cuenta HOY: dan el
  // «por entregar hoy» del diálogo aunque el filtro de meses sea otro.
  const contexto = contextoEntregaDeEstadoCuenta(datos, { mesEnCurso: hoyMes });
  const aviones = datos.aviones ?? [];
  const filtrado = !carga.filtroIgnorado && Boolean(filtro.desde || filtro.hasta);
  const avisos = datos.avisos ?? [];

  // Entregas fechadas ANTES del arranque: el API las suma en el «Saldo al
  // cierre» y no tendrían renglón (ni Editar, ni Eliminar, ni comprobante).
  // Se ofrece abrir la cuenta desde la más antigua para verlas.
  let entregasPrevias: { texto: string; href: string; mes: string } | null = null;
  if (escondeEntregasAntesDelArranque(datos, cuentaDesdeMes)) {
    const previas = await getEntregasAntesDelArranque(datos.socio.id, cuentaDesdeMes);
    const mes = mesParaVerEntregasPrevias({
      mesMasAntiguo: previas?.mesMasAntiguo ?? null,
      cuentaDesdeMes,
      mesActual: hoyMes,
    });
    if (mes) {
      entregasPrevias = {
        texto: textoEntregasAntesDelArranque(previas?.n ?? null, cuentaDesdeMes),
        href: hrefCuentaSocio(datos.socio.id, { desde: mes, hasta: datos.hasta }),
        mes,
      };
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <Volver />
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{datos.socio.nombre}</h1>
          <p className="text-sm text-muted-foreground">
            Estado de cuenta · cuenta desde {etiquetaMes(cuentaDesdeMes)} · saldo inicial{" "}
            <span className="font-mono">{fmtUsd(datos.cuenta.saldo_inicial_usd)}</span>
            {aviones.length > 0 && (
              <>
                {" "}
                ·{" "}
                {aviones.map(textoAvionDeSocio).join(", ")}
              </>
            )}
          </p>
          {datos.cuenta.notas && (
            <p className="text-xs text-muted-foreground">{datos.cuenta.notas}</p>
          )}
        </div>
        {puedeRegistrar && (
          <div className="flex flex-wrap gap-2">
            <BotonConfigurarCuenta
              socio={contexto.socio}
              cuenta={datos.cuenta}
              hoy={registro.hoy}
              variant="outline"
            />
            <BotonRegistrarEntrega contexto={contexto} registro={registro} variant="default" />
          </div>
        )}
      </div>

      <AvisoDegradado faltantes={degradado.faltantes} />

      {carga.filtroIgnorado && (
        <div
          className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground"
          data-filtro-ignorado
        >
          <InformationCircleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{TEXTO_FILTRO_MESES_IGNORADO}</p>
        </div>
      )}

      {avisos.length > 0 && (
        <ul
          className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200"
          data-avisos-cuenta
        >
          {avisos.map((a) => (
            <li key={a} className="flex items-start gap-2">
              <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {a}
            </li>
          ))}
        </ul>
      )}

      {entregasPrevias && <AvisoEntregasPrevias texto={entregasPrevias.texto} href={entregasPrevias.href} />}

      {!datos.cuenta.configurada && (
        <BannerCuentaNoConfigurada
          puedeConfigurar={puedeRegistrar}
          esPropia={me.id === datos.socio.id}
        />
      )}

      <KpisCuenta totales={datos.totales} mesEnCurso={hoyMes} />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle className="text-base">Movimientos</CardTitle>
              <CardDescription>
                {etiquetaMes(datos.desde)} a {etiquetaMes(datos.hasta)}
                {datos.rango && (
                  <>
                    {" "}
                    · generó <span className="font-mono">{fmtUsd(datos.rango.generado_usd)}</span>
                    {" "}· se le entregó{" "}
                    <span className="font-mono">{fmtUsd(datos.rango.entregado_usd)}</span>
                  </>
                )}
              </CardDescription>
            </div>
            <FiltroMesesCuenta
              desde={datos.desde}
              hasta={datos.hasta}
              cuentaDesdeMes={cuentaDesdeMes}
              mesActual={hoyMes}
              mesMinimo={entregasPrevias?.mes ?? null}
              filtrado={filtrado}
            />
          </div>
        </CardHeader>
        <CardContent>
          {datos.movimientos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin movimientos en estos meses.</p>
          ) : (
            <MovimientosCuenta
              movimientos={datos.movimientos}
              contexto={contexto}
              registro={registro}
              puedeRegistrar={puedeRegistrar}
            />
          )}
        </CardContent>
      </Card>

      {datos.por_mes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Por mes</CardTitle>
            <CardDescription>{AYUDA_POR_MES_CUENTA}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResumenMesesCuenta meses={datos.por_mes} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
