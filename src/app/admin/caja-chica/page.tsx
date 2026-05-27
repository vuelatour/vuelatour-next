import Link from "next/link";
import { WalletIcon } from "@heroicons/react/24/outline";
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
import { FondoActions } from "@/components/admin/caja-chica/fondo-actions";
import { FondoCreateButton } from "@/components/admin/caja-chica/fondo-create-button";
import { listFondos } from "@/lib/api/caja-chica-server";
import { listUsers } from "@/lib/api/users-server";

export const dynamic = "force-dynamic";

const money = (n: number, moneda: string) =>
  n.toLocaleString("es-MX", { style: "currency", currency: moneda, maximumFractionDigits: 2 });

export default async function CajaChicaPage() {
  const [{ data: fondos, count }, usersRes] = await Promise.all([
    listFondos({ limit: 200 }),
    listUsers({ limit: 200 }),
  ]);

  const sinFondo = usersRes.data
    .filter((u) => !u.tiene_fondo_caja)
    .map((u) => ({ id: u.id, nombre: u.nombre, rol: u.rol }));

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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Moneda</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fondos.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <Link
                        href={`/admin/caja-chica/${f.id}`}
                        className="font-medium hover:text-brand-600 hover:underline"
                      >
                        {f.usuario?.nombre ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{f.usuario?.rol ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{f.moneda}</TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-medium ${f.saldo < 0 ? "text-destructive" : ""}`}
                    >
                      {money(f.saldo, f.moneda)}
                    </TableCell>
                    <TableCell>
                      <FondoActions fondo={f} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
