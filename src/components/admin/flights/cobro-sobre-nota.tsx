import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { folioTexto } from "@/lib/admin/grupos-ui";
import { fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FlightCobro } from "@/types/flights";

/**
 * Nota de un cobro que es PARTE de un SOBRE de grupo: "Parte del sobre G-12
 * · $2,060.16 de $10,800.76" con link al grupo. Montos tal cual los manda
 * el API (la parte y el total del sobre); nada se calcula aquí. Sin hooks:
 * sirve en la card del vuelo y en la de la cotización. Devuelve null si el
 * cobro no es parte de un sobre.
 */
export function CobroSobreNota({
  cobro,
  className,
}: {
  cobro: FlightCobro;
  className?: string;
}) {
  const sobre = cobro.cobro_grupo;
  if (!sobre) return null;
  const folio = folioTexto(sobre.grupo_folio);
  return (
    <p className={cn("text-[11px]", className)}>
      <Link
        href={`/admin/quotes/grupo/${sobre.grupo_id}`}
        className="text-fuchsia-700 dark:text-fuchsia-300 underline underline-offset-2 hover:opacity-80"
        title="Abrir el grupo: el sobre se edita, re-parte o elimina desde Cobros del grupo"
      >
        Parte del sobre {folio}
      </Link>
      <span className="text-muted-foreground">
        {" "}
        · <span className="font-mono">{fmtUsd(cobro.monto)}</span> de{" "}
        <span className="font-mono">{fmtUsd(sobre.monto_total)}</span> {sobre.moneda}
      </span>
    </p>
  );
}

/** true si el cobro es parte de un sobre de grupo (se gestiona desde el grupo). */
export function esParteDeSobre(cobro: FlightCobro): boolean {
  return cobro.cobro_grupo != null || cobro.cobro_grupo_id != null;
}

/**
 * Badge "Conciliado" de un cobro: SOLO cuando el API lo dice
 * (`cobro.conciliado === true`, liga directa o la del sobre). Nunca se
 * deduce en el panel.
 */
export function CobroConciliadoBadge({ cobro }: { cobro: FlightCobro }) {
  if (cobro.conciliado !== true) return null;
  return (
    <Badge
      variant="outline"
      className="ml-2 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-sans font-medium"
      title={
        esParteDeSobre(cobro)
          ? "El sobre del grupo está conciliado con un movimiento bancario"
          : "Conciliado con un movimiento bancario"
      }
    >
      Conciliado
    </Badge>
  );
}
