import Link from "next/link";
import { ClipboardDocumentCheckIcon } from "@heroicons/react/24/outline";
import {
  hrefSeguimientoVuelo,
  recortarTexto,
  textoAutoria,
  type BannerSeguimiento,
} from "@/lib/admin/seguimiento";

/** Largo máximo de cada nota dentro del banner (la nota completa va en el `title`). */
const MAX_TEXTO_BANNER = 240;

/**
 * AJUSTES PENDIENTES POR REFLEJAR EN LA COTIZACIÓN (29-sep-2026, API 0.0.43).
 *
 * Banda ÁMBAR de ancho completo ARRIBA del papel del cotizador, junto a las
 * demás bandas de aviso y **nunca plegable ni ocultable** (regla del
 * cotizador: un aviso no se esconde detrás de un triángulo). Lista lo que la
 * oficina anotó en «Seguimiento de la cotización» del detalle del vuelo
 * —«los pax pidieron transporte, no está cotizado»— y lleva ahí para
 * marcarlo resuelto. Desaparece SOLO cuando ya no hay pendientes que afecten
 * la cotización; con un API previo (sin contadores) no se pinta.
 *
 * Qué pintar lo decide `bannerSeguimiento` (`lib/admin/seguimiento.ts`);
 * aquí no se cuenta ni se filtra nada. El enlace es un `<Link>` interno a
 * propósito: con cambios sin guardar, `useCambiosSinGuardar` lo intercepta y
 * pregunta «Salir sin guardar».
 */
export function QuoteSeguimientoBanda({
  banner,
  vueloId,
}: {
  banner: BannerSeguimiento | null;
  vueloId: string;
}) {
  if (!banner) return null;
  return (
    <div
      role="status"
      data-seguimiento-banda
      className="flex items-start gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm"
    >
      <ClipboardDocumentCheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="font-medium text-amber-800 dark:text-amber-300">{banner.titulo}</p>
        {banner.items.length > 0 && (
          <ul className="list-disc space-y-1 pl-4 text-amber-700 dark:text-amber-400">
            {banner.items.map((it) => (
              <li key={it.id} className="break-words" title={it.texto}>
                {recortarTexto(it.texto, MAX_TEXTO_BANNER)}
                <span className="text-xs text-amber-700/80 dark:text-amber-400/80">
                  {" "}
                  · {textoAutoria(it.creado_por_nombre, it.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {banner.items.length > 0 && banner.restantes > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            y {banner.restantes} más en el detalle del vuelo.
          </p>
        )}
        <p className="text-xs text-amber-700/90 dark:text-amber-400/90">
          Agrégalos a la cotización y, ya reflejados, márcalos como resueltos en
          el detalle del vuelo.
        </p>
        <Link
          href={hrefSeguimientoVuelo(vueloId)}
          className="inline-flex cursor-pointer items-center text-xs font-medium text-amber-800 underline underline-offset-2 hover:opacity-80 dark:text-amber-300"
        >
          Ver el seguimiento en el vuelo →
        </Link>
      </div>
    </div>
  );
}
