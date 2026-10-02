import Link from "next/link";
import {
  ArrowLeftIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/admin/empty-state";
import { AvisoDegradado } from "@/components/admin/aviso-degradado";
import { TarjetaErrorCarga } from "@/components/admin/tarjeta-error-carga";
import { SociosCuentaTable } from "@/components/admin/profit-sharing/socios-cuenta-table";
import {
  KpisCuentasSocios,
  TarjetaCuentasNoDisponibles,
} from "@/components/admin/profit-sharing/estado-cuenta-partes";
import { getMe } from "@/lib/api/me";
import { Degradaciones } from "@/lib/api/degradar";
import { getContextoRegistro, getSociosCuenta } from "@/lib/api/profit-sharing-server";
import {
  AYUDA_PAGOS_SOCIOS,
  TEXTO_ERROR_CARGA_CUENTAS,
  TITULO_PAGOS_SOCIOS,
  mesActual,
  puedeRegistrarEntregas,
  puedeVerCuentasSocios,
  sociosSinConfigurar,
  textoSociosSinConfigurar,
} from "@/lib/admin/reparto-pagos";

export const dynamic = "force-dynamic";

/** Roles que abren «Reparto de utilidades» (espejo del menú). */
const VEN_REPARTO = ["ADMIN", "ANALISTA", "SOCIO"];

function Encabezado({ conReparto }: { conReparto: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm text-muted-foreground">Tesorería</p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{TITULO_PAGOS_SOCIOS}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{AYUDA_PAGOS_SOCIOS}</p>
      </div>
      {conReparto && (
        <Link
          href="/admin/profit-sharing"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          <ArrowLeftIcon className="h-4 w-4" aria-hidden />
          Reparto de utilidades
        </Link>
      )}
    </div>
  );
}

/**
 * PAGOS A SOCIOS (cuenta corriente, 1-oct-2026, API 0.0.50). Aclaración del
 * cliente: «cuánto se le ha ido repartiendo a los socios, cuánto falta por
 * repartir, cómo se le repartió, la fecha de la entrega y algún comprobante
 * escaneado». Una fila por socio con generado / entregado / por entregar /
 * estado / última entrega, «Registrar entrega», «Ver cuenta» y «Configurar
 * cuenta». Los números son del API; la página solo pinta.
 */
export default async function PagosSociosPage() {
  const me = await getMe();
  const conReparto = VEN_REPARTO.includes(me.rol);

  if (!puedeVerCuentasSocios(me.rol)) {
    return (
      <div className="space-y-6">
        <Encabezado conReparto={false} />
        <EmptyState
          icon={LockClosedIcon}
          title="Solo administración, facturación, análisis y socios"
          description="Las cuentas de los socios las ven los usuarios con rol ADMIN, FACTURACION, ANALISTA o SOCIO."
        />
      </div>
    );
  }

  const degradado = new Degradaciones();
  const [carga, registro] = await Promise.all([
    getSociosCuenta(),
    getContextoRegistro(me, degradado),
  ]);
  const puedeRegistrar = puedeRegistrarEntregas(me.rol);

  if (carga.estado === "no-disponible") {
    return (
      <div className="space-y-6">
        <Encabezado conReparto={conReparto} />
        <TarjetaCuentasNoDisponibles titulo={TITULO_PAGOS_SOCIOS} />
      </div>
    );
  }

  if (carga.estado === "sin-permiso") {
    return (
      <div className="space-y-6">
        <Encabezado conReparto={conReparto} />
        <EmptyState
          icon={LockClosedIcon}
          title="Sin permiso"
          description="Tu usuario no tiene acceso a las cuentas de los socios."
        />
      </div>
    );
  }

  if (carga.estado !== "ok") {
    // Jamás «sin socios» cuando la carga falló.
    return (
      <div className="space-y-6">
        <Encabezado conReparto={conReparto} />
        <TarjetaErrorCarga
          titulo="No se pudieron cargar las cuentas de los socios"
          descripcion={TEXTO_ERROR_CARGA_CUENTAS}
        />
      </div>
    );
  }

  const { socios, totales } = carga.datos;
  const hastaMes = carga.datos.hasta_mes || mesActual(registro.hoy);
  // El aviso «configura…» solo a quien puede hacerlo (como en el estado de
  // cuenta); quien consulta ve la etiqueta informativa del renglón.
  const sinConfigurar = puedeRegistrar ? textoSociosSinConfigurar(sociosSinConfigurar(socios)) : null;

  return (
    <div className="space-y-6">
      <Encabezado conReparto={conReparto} />
      <AvisoDegradado faltantes={degradado.faltantes} />

      {totales && <KpisCuentasSocios totales={totales} />}

      {sinConfigurar && (
        <div
          className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200"
          data-banner-sin-configurar
        >
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{sinConfigurar}</p>
        </div>
      )}

      {socios.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={me.rol === "SOCIO" ? "No tienes una cuenta de socio" : "Sin socios en los aviones"}
          description={
            me.rol === "SOCIO"
              ? "Tu usuario no aparece como socio de ningún avión."
              : "Configura los socios y sus porcentajes en la ficha de cada avión."
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0 sm:p-2">
            <SociosCuentaTable
              socios={socios}
              totales={totales}
              hastaMes={hastaMes}
              puedeRegistrar={puedeRegistrar}
              registro={registro}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
