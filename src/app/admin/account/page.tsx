import {
  EnvelopeIcon,
  ShieldCheckIcon,
  CreditCardIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AccountForm } from "@/components/admin/account/account-form";
import { getMe } from "@/lib/api/me";

export const dynamic = "force-dynamic";

const ROL_DESCRIPTIONS: Record<string, string> = {
  ADMIN: "Acceso total. Promueve usuarios, edita catálogos y financieros.",
  COORDINADOR: "Gestiona vuelos, cotizaciones y operación diaria.",
  ANALISTA: "Lectura amplia para análisis y reportes.",
  FACTURACION: "Emisión de CFDI, conciliación y cuentas bancarias.",
  PILOTO: "Captura tacómetros y gastos durante el vuelo.",
  SOCIO: "Visibilidad limitada al reparto y resultados.",
};

export default async function AccountPage() {
  const me = await getMe();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Mi cuenta</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Configuración de la cuenta
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Edita tu nombre y teléfono. El email viene de Google y no se puede
          cambiar aquí.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Perfil</CardTitle>
              <CardDescription>
                Esta información aparece en el menú lateral y en auditoría.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AccountForm
                initial={{
                  nombre: me.nombre,
                  telefono: me.telefono ?? "",
                }}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Identidad</CardTitle>
              <CardDescription className="text-xs">
                Vinculado a Google Sign-In.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row icon={<EnvelopeIcon className="h-4 w-4 text-muted-foreground" />} label="Email">
                <span className="font-mono text-xs break-all">{me.email}</span>
              </Row>
              <Row icon={<ShieldCheckIcon className="h-4 w-4 text-muted-foreground" />} label="Rol">
                <div className="flex flex-col items-end gap-0.5">
                  <Badge className="bg-brand-600/15 text-brand-600 dark:text-brand-400 border-brand-600/30">
                    {me.rol}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground text-right">
                    {ROL_DESCRIPTIONS[me.rol] ?? ""}
                  </span>
                </div>
              </Row>
              <Row icon={<ShieldCheckIcon className="h-4 w-4 text-muted-foreground" />} label="Estado">
                <Badge variant="outline">{me.estado}</Badge>
              </Row>
            </CardContent>
          </Card>

          {(me.tarjeta_terminacion || me.tiene_fondo_caja) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Tesorería</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {me.tarjeta_terminacion && (
                  <Row icon={<CreditCardIcon className="h-4 w-4 text-muted-foreground" />} label="Tarjeta corp.">
                    <span className="font-mono text-xs">
                      •••• {me.tarjeta_terminacion}
                    </span>
                  </Row>
                )}
                {me.tiene_fondo_caja && (
                  <Row icon={<BanknotesIcon className="h-4 w-4 text-muted-foreground" />} label="Fondo de caja">
                    <Badge variant="outline" className="text-xs">Asignado</Badge>
                  </Row>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-right max-w-[60%]">{children}</div>
    </div>
  );
}
