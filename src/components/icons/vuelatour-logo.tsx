import { cn } from "@/lib/utils";

/**
 * Logo textual "vuelat[o]ur" donde la "o" se reemplaza por un círculo rojo
 * de marca con una "o" blanca centrada. Sustituye al WebP del proyecto
 * anterior — al ser puro DOM/SVG escala sin pérdida y respeta `currentColor`
 * para encajar en headers claros u oscuros.
 */
export function VuelatourLogo({
  className,
  dotClassName,
}: {
  className?: string;
  dotClassName?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline font-bold tracking-tight text-2xl md:text-3xl leading-none",
        className,
      )}
      aria-label="Vuelatour"
    >
      <span>vuelat</span>
      <span
        className={cn(
          "relative inline-flex items-center justify-center mx-[1px] size-[0.78em] rounded-full bg-brand-500 text-white",
          dotClassName,
        )}
        aria-hidden="true"
      >
        <span className="text-[0.55em] font-bold leading-none translate-y-[1px]">
          o
        </span>
      </span>
      <span>ur</span>
    </span>
  );
}
