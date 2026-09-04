import Link from "next/link";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import type { GrupoDetalle } from "@/types/grupos";

/**
 * Avisos y problemas del grupo (SIEMPRE visibles, en ámbar): el API manda
 * `problemas[]` (PAX no cuadran, precio desactualizado, extras editados) y
 * `avisos[]` (detalles de los problemas + avisos de la última acción). Un
 * warning nunca se esconde. Sin hooks: server component.
 */
export function GrupoAvisos({ grupo }: { grupo: GrupoDetalle }) {
  const problemas = grupo.problemas ?? [];
  // Los avisos ya incluyen el detalle de cada problema; no repetir.
  const detallesProblemas = new Set(problemas.map((p) => p.detalle));
  const otrosAvisos = (grupo.avisos ?? []).filter((a) => a && !detallesProblemas.has(a));
  if (problemas.length === 0 && otrosAvisos.length === 0) return null;

  const hijoPorFolio = new Map(grupo.aviones.map((a) => [a.folio, a.vuelo_id]));

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
      <ExclamationTriangleIcon className="h-5 w-5 shrink-0 mt-0.5" />
      <div className="min-w-0 space-y-1.5">
        {problemas.length > 0 && (
          <div className="space-y-1">
            <p className="font-medium">
              {problemas.length === 1
                ? "Este grupo tiene un pendiente que revisar:"
                : `Este grupo tiene ${problemas.length} pendientes que revisar:`}
            </p>
            <ul className="space-y-0.5 list-disc pl-5">
              {problemas.map((p, i) => {
                const vueloId = p.folio != null ? hijoPorFolio.get(p.folio) : undefined;
                return (
                  <li key={`${p.tipo}-${i}`}>
                    {p.detalle}
                    {vueloId && (
                      <>
                        {" "}
                        <Link
                          href={`/admin/quotes/${vueloId}`}
                          className="underline underline-offset-2 hover:text-foreground"
                        >
                          abrir #{p.folio}
                        </Link>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {otrosAvisos.length > 0 && (
          <ul className="space-y-0.5 list-disc pl-5">
            {otrosAvisos.map((a, i) => (
              <li key={`aviso-${i}`}>{a}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
