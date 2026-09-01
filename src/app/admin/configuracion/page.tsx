import { LockClosedIcon } from "@heroicons/react/24/outline";
import { ConfiguracionClient } from "@/components/admin/configuracion/configuracion-client";
import { IaCreditosSection } from "@/components/admin/configuracion/ia-creditos-section";
import { EmptyState } from "@/components/admin/empty-state";
import { getConfiguracion } from "@/lib/api/configuracion-server";
import { getIaUso, rangoDelMes } from "@/lib/api/ia-uso-server";
import { getMe } from "@/lib/api/me";
import { todayCancun } from "@/lib/datetime";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ mes?: string }>;
}

export default async function ConfiguracionPage({ searchParams }: PageProps) {
  // Solo ADMIN puede cambiar la configuración: sin este gate la página se
  // renderizaba operable para otros roles (GET /config es abierto a propósito
  // para la app) y el 403 recién aparecía al confirmar el switch.
  const me = await getMe();
  if (me.rol !== "ADMIN") {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">Administración</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Configuración
          </h1>
        </div>
        <EmptyState
          icon={LockClosedIcon}
          title="Solo administradores"
          description="La configuración global del sistema solo la puede cambiar un usuario con rol ADMIN."
        />
      </div>
    );
  }

  // Mes del consumo de IA: default = mes corriente en HORA CANCÚN (el día 1
  // en la madrugada UTC aún es el mes anterior para la operación). Un mes
  // inválido o futuro en la URL cae al corriente.
  const sp = await searchParams;
  const mesActual = todayCancun().slice(0, 7);
  const mes =
    sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) && sp.mes <= mesActual
      ? sp.mes
      : mesActual;
  const rango = rangoDelMes(mes);

  // getIaUso es best-effort (.catch → null): un fallo del registro de IA
  // JAMÁS tumba la página de banderas.
  const [flags, iaUso] = await Promise.all([
    getConfiguracion(),
    getIaUso(rango.desde, rango.hasta),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Administración</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Configuración
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Banderas globales de comportamiento del sistema. Los cambios aplican
          a toda la operación.
        </p>
      </div>

      <ConfiguracionClient initial={flags} />

      <IaCreditosSection resumen={iaUso} mes={mes} mesActual={mesActual} />
    </div>
  );
}
