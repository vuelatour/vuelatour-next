import { ReceiptPercentIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
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
import { listMultas } from "@/lib/api/multas-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listPilots } from "@/lib/api/pilots-server";
import { MultaCreateButton } from "@/components/admin/multas/multa-create-button";
import { MultaActions } from "@/components/admin/multas/multa-actions";
import type { Multa, MultaEstado } from "@/types/multas";

export const dynamic = "force-dynamic";

const ESTADO: Record<MultaEstado, { label: string; cls: string }> = {
  PENDIENTE: {
    label: "Pendiente",
    cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  },
  PAGADA: {
    label: "Pagada",
    cls: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  },
  CANCELADA: { label: "Cancelada", cls: "bg-muted text-muted-foreground border-border" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

function fmtMoney(v: string | null, moneda: string): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}`;
}

export default async function MultasPage() {
  const [multasRes, aircraftRes, pilotsRes] = await Promise.all([
    listMultas().catch(() => ({ data: [] as Multa[], count: 0, limit: 0, offset: 0 })),
    listAircraft({ limit: 100 }).catch(() => ({ data: [], count: 0, limit: 0, offset: 0 })),
    listPilots({ limit: 100 }).catch(() => ({ data: [], count: 0, limit: 0, offset: 0 })),
  ]);
  const multas = multasRes.data;
  const aircraft = aircraftRes.data.map((a) => ({ id: a.id, matricula: a.matricula }));
  const pilots = pilotsRes.data.map((p) => ({ id: p.id, nombre: p.nombre }));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Flota</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Multas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registro histórico de multas a aeronaves y pilotos.
          </p>
        </div>
        <MultaCreateButton aircraft={aircraft} pilots={pilots} />
      </div>

      {multas.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <ReceiptPercentIcon className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-lg">Sin multas registradas</CardTitle>
            <CardDescription>Usa “Registrar multa” para agregar la primera.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Avión</TableHead>
                  <TableHead>Piloto</TableHead>
                  <TableHead>Autoridad</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {multas.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {fmtDate(m.fecha)}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <p className="text-sm truncate">{m.descripcion}</p>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{m.aeronave?.matricula ?? "—"}</TableCell>
                    <TableCell className="text-sm">{m.piloto?.nombre ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.autoridad ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmtMoney(m.monto, m.moneda)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={ESTADO[m.estado].cls}>
                        {ESTADO[m.estado].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <MultaActions multa={m} aircraft={aircraft} pilots={pilots} />
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
