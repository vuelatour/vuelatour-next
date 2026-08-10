import { ConfiguracionClient } from "@/components/admin/configuracion/configuracion-client";
import { getConfiguracion } from "@/lib/api/configuracion-server";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
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
