import { WalletIcon } from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FondosTable } from "@/components/admin/caja-chica/fondos-table";
import { FondoCreateButton } from "@/components/admin/caja-chica/fondo-create-button";
import { listElegiblesFondo, listFondos } from "@/lib/api/caja-chica-server";
import { listUsers } from "@/lib/api/users-server";

export const dynamic = "force-dynamic";

export default async function CajaChicaPage() {
  const [{ data: fondos, count }, usersRes, elegiblesRes] = await Promise.all([
    listFondos({ limit: 200 }),
    listUsers({ limit: 200 }),
    listElegiblesFondo(),
  ]);

  // Quién puede recibir fondo lo decide el API contra la tabla de fondos: el
  // flag `tiene_fondo_caja` del usuario se marcaba a mano y escondía personas
  // que nunca tuvieron fondo (jul 2026: Luis Cáceres, Abraham Zamora).
  const sinFondo = elegiblesRes.data.map((u) => ({
    id: u.id,
    nombre: u.nombre,
    rol: u.rol,
  }));

  // Para el selector "Autorizado por" al registrar movimientos.
  const usuarios = usersRes.data.map((u) => ({ id: u.id, nombre: u.nombre }));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Tesorería</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Caja chica</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {count} {count === 1 ? "fondo activo" : "fondos activos"}. El saldo descuenta los gastos
            en efectivo de cada persona automáticamente.
          </p>
        </div>
        <FondoCreateButton usuarios={sinFondo} />
      </div>

      {fondos.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <WalletIcon className="h-12 w-12 text-muted-foreground" />
            </div>
            <CardTitle>Sin fondos abiertos</CardTitle>
            <CardDescription>
              Abre un fondo para que pilotos y operativos comprueben sus gastos en efectivo.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <FondosTable fondos={fondos} usuarios={usuarios} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
