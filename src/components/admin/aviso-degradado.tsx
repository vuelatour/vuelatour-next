import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { textoDegradado } from "@/lib/api/degradar";

/**
 * Aviso DISCRETO de que algo accesorio no cargó (21-sep-2026). Va arriba del
 * contenido de la pantalla, en gris —no en rojo—: los datos principales sí
 * están; lo que falta es un catálogo de selector. Si no faltó nada, no pinta.
 *
 * Fuente única del texto: `textoDegradado` (`lib/api/degradar.ts`). Ninguna
 * página lo redacta a mano.
 */
export function AvisoDegradado({
  faltantes,
  extra,
}: {
  faltantes: string[];
  /** Otras líneas del mismo tono (p. ej. lotes que no se pudieron verificar). */
  extra?: (string | null | undefined)[];
}) {
  const principal = textoDegradado(faltantes);
  const lineas = [principal, ...(extra ?? [])].filter(
    (l): l is string => typeof l === "string" && l.length > 0,
  );
  if (lineas.length === 0) return null;

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
      <InformationCircleIcon className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
      <div className="min-w-0 space-y-1 text-xs text-muted-foreground">
        {lineas.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
    </div>
  );
}
