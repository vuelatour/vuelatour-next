import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fmtUsd } from "@/lib/format";
import type { GrupoDetalle } from "@/types/grupos";

/**
 * Operación del grupo: llegadas sin tacómetro, gastos por avión y permisos
 * de pista, tal como los agrega el API por hijo. Sin hooks: server component.
 */
export function GrupoOperacionCard({ grupo }: { grupo: GrupoDetalle }) {
  const op = grupo.operacion;
  const llegadas = op?.llegadas_faltantes ?? [];
  const gastos = (op?.gastos_usd ?? []).filter((g) => g.n > 0);
  const permisos = (op?.permisos ?? []).filter((p) => p.estado_permiso && p.estado_permiso !== "no_aplica");
  const vacio = llegadas.length === 0 && gastos.length === 0 && permisos.length === 0;

  const etiqueta = (x: { posicion: number | null; folio: number }) =>
    `${x.posicion != null ? `Avión ${x.posicion} · ` : ""}#${x.folio}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Operación</CardTitle>
        <CardDescription className="text-xs">
          Tacómetros, gastos y permisos de cada avión. Se capturan en el
          detalle de cada vuelo; aquí solo se resumen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {vacio && (
          <p className="text-muted-foreground">Sin pendientes de operación registrados.</p>
        )}

        {llegadas.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Llegadas sin tacómetro
            </p>
            <ul className="space-y-0.5">
              {llegadas.map((l) => (
                <li key={l.vuelo_id} className="flex items-center justify-between gap-3">
                  <Link href={`/admin/flights/${l.vuelo_id}`} className="underline-offset-2 hover:underline">
                    {etiqueta(l)}
                  </Link>
                  <span className="font-mono text-xs">
                    {l.faltan} {l.faltan === 1 ? "tramo" : "tramos"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {gastos.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Gastos por avión
            </p>
            <ul className="space-y-0.5">
              {gastos.map((g) => (
                <li key={g.vuelo_id} className="flex items-center justify-between gap-3">
                  <Link href={`/admin/flights/${g.vuelo_id}`} className="underline-offset-2 hover:underline">
                    {etiqueta(g)}
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({g.n} {g.n === 1 ? "gasto" : "gastos"}
                      {g.sin_tc > 0 ? `, ${g.sin_tc} sin TC` : ""})
                    </span>
                  </Link>
                  <span className="font-mono text-xs">{fmtUsd(g.usd)}</span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-muted-foreground">
              Informativo por avión (USD con el TC de cada gasto; los gastos sin TC no
              suman). El balance por avión sigue siendo la fuente para cierres.
            </p>
          </div>
        )}

        {permisos.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Permisos de pista
            </p>
            <ul className="space-y-0.5">
              {permisos.map((p) => (
                <li key={p.vuelo_id} className="flex items-center justify-between gap-3">
                  <Link href={`/admin/flights/${p.vuelo_id}`} className="underline-offset-2 hover:underline">
                    {etiqueta(p)}
                  </Link>
                  {p.estado_permiso === "pendiente" ? (
                    <Badge
                      variant="outline"
                      className="border-amber-500/50 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
                    >
                      Pendiente
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-green-500/40 bg-green-500/10 text-[10px] text-green-600 dark:text-green-400"
                    >
                      Emitido
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
