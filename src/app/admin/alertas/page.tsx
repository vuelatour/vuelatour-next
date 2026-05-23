import { AlertsConfigClient } from "@/components/admin/alerts/alerts-config-client";
import { getAlertConfigs } from "@/lib/api/alerts-server";

export const dynamic = "force-dynamic";

export default async function AlertasPage() {
  const configs = await getAlertConfigs();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Administración</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Alertas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configura qué se notifica, a quién y con cuánta anticipación.
        </p>
      </div>

      <AlertsConfigClient initial={configs} />
    </div>
  );
}
