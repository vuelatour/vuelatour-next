import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getMe } from "@/lib/api/me";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  // El layout ya validó que el usuario está ACTIVO. Aquí re-usamos el cache.
  const me = await getMe();

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Bienvenido,</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{me.nombre}</h1>
        </div>
        <Badge className="bg-brand-600/15 text-brand-600 hover:bg-brand-600/20 border-brand-600/30">
          {me.rol}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Email</CardDescription>
            <CardTitle className="text-base font-medium break-all">{me.email}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Estado</CardDescription>
            <CardTitle className="text-base font-medium">{me.estado}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Fondo de caja</CardDescription>
            <CardTitle className="text-base font-medium">
              {me.tiene_fondo_caja ? "Sí" : "No"}
            </CardTitle>
          </CardHeader>
        </Card>
        {me.tarjeta_terminacion && (
          <Card>
            <CardHeader>
              <CardDescription>Tarjeta corp.</CardDescription>
              <CardTitle className="text-base font-medium">**** {me.tarjeta_terminacion}</CardTitle>
            </CardHeader>
          </Card>
        )}
        {me.telefono && (
          <Card>
            <CardHeader>
              <CardDescription>Teléfono</CardDescription>
              <CardTitle className="text-base font-medium">{me.telefono}</CardTitle>
            </CardHeader>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Próximos pasos</CardTitle>
          <CardDescription>
            El sistema está en construcción. Los módulos en gris del sidebar (marcados &ldquo;Próx.&rdquo;)
            se irán habilitando en las próximas iteraciones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>· Listado de aeronaves con sus motores, hélices y porcentajes de propiedad</li>
            <li>· Cotizador con preview en vivo (NM × tarifa + TUAS + IVA)</li>
            <li>· Calendario operativo con vuelos por aeronave</li>
            <li>· Gestión de clientes y emisión de cotizaciones PDF</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
