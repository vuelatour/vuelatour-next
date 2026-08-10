import { LockClosedIcon } from "@heroicons/react/24/outline";
import { ConfiguracionClient } from "@/components/admin/configuracion/configuracion-client";
import { EmptyState } from "@/components/admin/empty-state";
import { getConfiguracion } from "@/lib/api/configuracion-server";
import { getMe } from "@/lib/api/me";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
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

  const flags = await getConfiguracion();

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
    </div>
  );
}
