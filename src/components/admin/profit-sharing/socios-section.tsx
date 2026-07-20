import Link from "next/link";
import { UsersIcon } from "@heroicons/react/24/outline";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDecimal, fmtUsd } from "@/lib/format";
import type { RepartoSocio } from "@/types/profit-sharing";

/** Paleta fija del design system para distinguir socios (máx. 4 y cicla). */
const PALETA = ["bg-brand-600", "bg-navy-500", "bg-navy-300", "bg-navy-700"];

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Reparto a socios de un avión: barra apilada de porcentajes + tabla con el
 * monto que le toca a cada uno. Los montos vienen del API (mismo saldo).
 */
export function SociosSection({
  socios,
  porcentajeTotal,
  aeronaveId,
}: {
  socios: RepartoSocio[];
  porcentajeTotal: number;
  aeronaveId: string;
}) {
  if (socios.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-3 text-center">
        <UsersIcon className="mx-auto h-5 w-5 text-muted-foreground" />
        <p className="mt-1 text-xs text-muted-foreground">
          Sin socios configurados para esta aeronave.{" "}
          <Link
            href={`/admin/aircraft/${aeronaveId}`}
            className="font-medium underline underline-offset-2 hover:text-foreground"
          >
            Configúralos en la ficha del avión
          </Link>
          .
        </p>
      </div>
    );
  }

  const pctOk = porcentajeTotal === 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">Reparto a socios</p>
        {!pctOk && (
          <p className="text-xs font-medium text-destructive">
            Suman {fmtDecimal(porcentajeTotal)}% (no 100%)
          </p>
        )}
      </div>

      {/* Barra apilada de porcentajes (ancho relativo al 100%). */}
      <div
        role="img"
        aria-label={`Porcentajes de socios: ${socios
          .map((s) => `${s.socio_nombre} ${fmtDecimal(s.porcentaje)}%`)
          .join(", ")}`}
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
      >
        {socios.map((s, i) => (
          <div
            key={s.socio_id}
            className={PALETA[i % PALETA.length]}
            style={{ width: `${Math.max(0, Math.min(100, s.porcentaje))}%` }}
            title={`${s.socio_nombre} · ${fmtDecimal(s.porcentaje)}%`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {socios.map((s, i) => (
          <span
            key={s.socio_id}
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${PALETA[i % PALETA.length]}`}
            />
            <span className="font-medium text-foreground">{iniciales(s.socio_nombre)}</span>
            {fmtDecimal(s.porcentaje)}%
          </span>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Socio</TableHead>
            <TableHead className="text-right">%</TableHead>
            <TableHead className="text-right">Monto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {socios.map((s) => (
            <TableRow key={s.socio_id}>
              <TableCell className="text-sm">{s.socio_nombre}</TableCell>
              <TableCell className="text-right font-mono text-xs">
                {fmtDecimal(s.porcentaje)}%
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {fmtUsd(s.monto_usd)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
