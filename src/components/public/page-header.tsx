import { cn } from "@/lib/utils";

/**
 * Sub-hero compacto que abre cada página interna. No es el hero principal
 * (ése vive solo en la landing) — sigue el patrón "kicker + título + sub" del
 * DESIGN_SYSTEM §2.4 sobre fondo navy con un velo radial sutil.
 */
export function PageHeader({
  kicker,
  title,
  description,
  className,
}: {
  kicker?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden bg-navy-950 text-white",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_30%,rgba(230,57,70,0.18),transparent_55%),radial-gradient(circle_at_80%_70%,rgba(28,69,135,0.45),transparent_60%)]"
      />
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 md:py-20 lg:px-8">
        {kicker && (
          <p className="inline-flex items-center gap-2 rounded-full bg-brand-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-300 ring-1 ring-brand-500/25">
            {kicker}
          </p>
        )}
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
          {title}
        </h1>
        {description && (
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-navy-200 sm:text-lg">
            {description}
          </p>
        )}
      </div>
    </section>
  );
}
