import { WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CLASE_VALOR_MOSAICO,
  DESCRIPCION_CARD_MANTENIMIENTO,
  ID_CARD_MANTENIMIENTO,
  SECCIONES_MANTENIMIENTO,
  TITULO_CARD_MANTENIMIENTO,
  mosaicoComponentes,
  mosaicoDiscrepancias,
  mosaicoOrdenes,
  type IdSeccionMantenimiento,
  type Mosaico,
} from "@/lib/admin/mantenimiento-unificado";
import type { EstadoCarga } from "@/lib/admin/ingenieria-errores";
import type { AeronaveDiscrepancia } from "@/types/aircraft";
import type { ComponenteAeronave, Mantenimiento } from "@/types/engineering";

/**
 * LA card de mantenimiento del expediente del avión (17-nov-2026): un solo
 * componente, grande, con todo lo de mantenimiento. Pedido del cliente:
 * «debemos crear un solo componente donde venga todo lo de mantenimiento…
 * para tenerlo mejor ubicado».
 *
 * Este archivo es solo el MARCO (card + navegación por anclas + secciones
 * apiladas + resumen); los datos y las acciones viven en
 * `aircraft-engineering.tsx` y en las piezas que entran como slots.
 */
export function MantenimientoCard({
  resumen,
  children,
}: {
  /** Los mosaicos del resumen (siempre arriba). */
  resumen: React.ReactNode;
  /** Las secciones (`SeccionMantenimiento`), en orden. */
  children: React.ReactNode;
}) {
  return (
    <Card id={ID_CARD_MANTENIMIENTO} className="scroll-mt-24 lg:col-span-2">
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <WrenchScrewdriverIcon className="h-4 w-4 text-muted-foreground" />
          {TITULO_CARD_MANTENIMIENTO}
        </CardTitle>
        <CardDescription>{DESCRIPCION_CARD_MANTENIMIENTO}</CardDescription>
        {/* Navegación por anclas: la card es larga a propósito. */}
        <nav aria-label="Secciones de mantenimiento" className="flex flex-wrap gap-1.5 pt-1">
          {SECCIONES_MANTENIMIENTO.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {s.etiqueta}
            </a>
          ))}
        </nav>
      </CardHeader>
      <CardContent className="space-y-6">
        <section id="mantenimiento-resumen" className="scroll-mt-24">
          {resumen}
        </section>
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * Una sección de la card. Con `titulo` pinta su encabezado; sin él, el
 * contenido trae el suyo (las cards embebidas de tacómetros y discrepancias).
 */
export function SeccionMantenimiento({
  id,
  titulo,
  descripcion,
  accion,
  children,
}: {
  id: Exclude<IdSeccionMantenimiento, "mantenimiento-resumen">;
  titulo?: string;
  descripcion?: string;
  /** Botón principal de la sección (a la derecha del título). */
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 space-y-3 border-t border-border pt-5"
      data-seccion-mantenimiento={id}
    >
      {titulo && (
        <div className="flex flex-row items-start justify-between gap-2">
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold leading-snug">{titulo}</h3>
            {descripcion && (
              <p className="text-xs text-muted-foreground">{descripcion}</p>
            )}
          </div>
          {accion}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Resumen de mantenimiento: tres mosaicos que dicen de un vistazo cómo va el
 * avión y llevan a la sección donde se resuelve. Lo que dice cada uno sale de
 * `lib/admin/mantenimiento-unificado.ts`; aquí solo se pinta.
 *
 * NO lleva «Próximo servicio»: ese dato (con Hobbs, «Faltan» y el estado de
 * su orden) se pinta UNA vez, en la sección «Horas y programa de servicio»
 * que va justo debajo.
 */
export function MantenimientoResumen({
  mant,
  componentes,
  discrepancias,
}: {
  /** Órdenes; null = no se pudieron leer. */
  mant: Mantenimiento[] | null;
  componentes: { estado: EstadoCarga; datos: { componentes: ComponenteAeronave[] } | null };
  discrepancias: AeronaveDiscrepancia[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <MosaicoVista mosaico={mosaicoOrdenes(mant)} />
      <MosaicoVista
        mosaico={mosaicoComponentes(componentes.estado, componentes.datos?.componentes)}
      />
      <MosaicoVista mosaico={mosaicoDiscrepancias(discrepancias)} />
    </div>
  );
}

function MosaicoVista({ mosaico }: { mosaico: Mosaico }) {
  return (
    <div
      className="rounded-lg border border-border bg-muted/20 p-3"
      data-mosaico={mosaico.rotulo}
    >
      <a
        href={mosaico.href}
        className="text-[11px] font-medium text-muted-foreground hover:underline"
      >
        {mosaico.rotulo}
      </a>
      <p
        className={`mt-0.5 text-lg font-semibold tracking-tight tabular-nums ${CLASE_VALOR_MOSAICO[mosaico.tono]}`}
      >
        {mosaico.valor}
      </p>
      {mosaico.hint && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{mosaico.hint}</p>
      )}
    </div>
  );
}
