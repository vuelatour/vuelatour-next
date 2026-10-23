import Link from "next/link";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import {
  diferidosDelAvion,
  folioDiferido,
  lineaDiferido,
  listasDiferidos,
  noCoincideSnapshot,
  textoBadgeCierrePeriodo,
  textoNoCoincideSnapshot,
  tituloBloquePasan,
  tituloBloquePasarian,
  tituloBloqueVienen,
} from "@/lib/admin/cierre-mes";
import { ChipEstadoCierre, ChipMarcaCierre } from "@/components/admin/chip-cierre";
import type { CierrePeriodoAditivo, VueloDiferidoMarca } from "@/types/cierres";

/**
 * Cierre de mes en el REPARTO (16-oct-2026, API 0.0.88). Sin hooks: sirve en
 * la página (servidor) y en la card por avión. Todo sale de `cierre` del
 * API: el estado del periodo (desde el cierre por avión, API 0.0.104, puede
 * ser «Parcial» con los aviones cerrados en el tooltip), el aviso rojo si
 * los números de hoy ya no coinciden con lo congelado (flota cerrada o
 * parcial) y las listas de vuelos que SALEN (pasan al mes siguiente, no se
 * reparten), ENTRAN (vienen de un mes anterior) o PASARÍAN al cerrar un mes
 * abierto. Sin `cierre` (API previo) ⇒ nada.
 */
export function CierreRepartoAviso({ cierre }: { cierre: CierrePeriodoAditivo | null | undefined }) {
  if (!cierre || !cierre.disponible) return null;
  const badge = textoBadgeCierrePeriodo(cierre);
  const { salen, entran, pasarian } = listasDiferidos(cierre);
  const noCoincide = noCoincideSnapshot(cierre);
  if (!badge && !noCoincide && salen.length + entran.length + pasarian.length === 0) return null;
  return (
    <div className="space-y-2" data-cierre-reparto>
      {badge && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          Estado del mes: <ChipEstadoCierre badge={badge} />
        </p>
      )}
      {noCoincide && (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {textoNoCoincideSnapshot(cierre.cerrado_at)}
        </p>
      )}
      <ListaDiferidos titulo={tituloBloquePasan(salen[0]?.destino)} vuelos={salen} tono="pasa" />
      <ListaDiferidos titulo={tituloBloqueVienen(entran[0]?.origen)} vuelos={entran} tono="viene" />
      <ListaDiferidos titulo={tituloBloquePasarian(pasarian[0]?.destino)} vuelos={pasarian} tono="pasaria" />
    </div>
  );
}

/** Los de UN avión (card por avión): mismos bloques, filtrados por matrícula. */
export function CierreRepartoAvion({
  cierre,
  matricula,
}: {
  cierre: CierrePeriodoAditivo | null | undefined;
  matricula: string;
}) {
  if (!cierre || !cierre.disponible) return null;
  const { salen, entran } = listasDiferidos(cierre);
  const s = diferidosDelAvion(salen, matricula);
  const e = diferidosDelAvion(entran, matricula);
  if (s.length + e.length === 0) return null;
  return (
    <div className="space-y-1.5" data-cierre-reparto-avion={matricula}>
      <ListaDiferidos titulo={tituloBloquePasan(s[0]?.destino)} vuelos={s} tono="pasa" compacta />
      <ListaDiferidos titulo={tituloBloqueVienen(e[0]?.origen)} vuelos={e} tono="viene" compacta />
    </div>
  );
}

const CLASE_BLOQUE: Record<"pasa" | "viene" | "pasaria", string> = {
  pasa: "border-amber-300/60 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20",
  pasaria: "border-amber-200/60 bg-amber-50/30 dark:border-amber-900 dark:bg-amber-950/10",
  viene: "border-sky-300/60 bg-sky-50/50 dark:border-sky-800 dark:bg-sky-950/20",
};

function ListaDiferidos({
  titulo,
  vuelos,
  tono,
  compacta = false,
}: {
  titulo: string;
  vuelos: VueloDiferidoMarca[];
  tono: "pasa" | "viene" | "pasaria";
  compacta?: boolean;
}) {
  if (vuelos.length === 0) return null;
  const max = compacta ? 6 : 12;
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${CLASE_BLOQUE[tono]}`} data-diferidos={tono}>
      <p className="font-medium">
        {titulo} <span className="text-muted-foreground">· {vuelos.length}</span>
      </p>
      <ul className="mt-1 space-y-0.5">
        {vuelos.slice(0, max).map((v, i) => (
          <li
            key={v.id ?? `${folioDiferido(v)}-${i}`}
            className="flex flex-wrap items-center gap-1.5 text-muted-foreground"
            title={compacta ? v.leyenda : undefined}
          >
            {v.id ? (
              <Link href={`/admin/flights/${v.id}`} className="cursor-pointer underline underline-offset-2 hover:text-foreground">
                {lineaDiferido(v)}
              </Link>
            ) : (
              <span>{lineaDiferido(v)}</span>
            )}
            {!compacta && <ChipMarcaCierre marca={v.leyenda} />}
          </li>
        ))}
        {vuelos.length > max && <li className="text-muted-foreground">y {vuelos.length - max} más…</li>}
      </ul>
    </div>
  );
}
