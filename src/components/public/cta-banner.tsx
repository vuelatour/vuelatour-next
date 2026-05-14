import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Card de CTA "gradient navy" del DESIGN_SYSTEM §13.3, pensada como
 * cierre de cada página interna.
 */
export function CtaBanner({
  title,
  description,
  primary,
  secondary,
}: {
  title: string;
  description: string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <section className="bg-background py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-navy-700 bg-gradient-to-r from-navy-900 to-navy-800 p-8 md:p-12">
          <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white sm:text-3xl">
                {title}
              </h2>
              <p className="mt-2 max-w-2xl text-navy-300">{description}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={primary.href}
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-600 px-7 text-base font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-brand-700"
              >
                {primary.label}
                <ArrowRight className="size-4" />
              </Link>
              {secondary && (
                <Link
                  href={secondary.href}
                  className="inline-flex h-12 items-center rounded-xl bg-white/10 px-7 text-base font-semibold text-white ring-1 ring-white/20 transition-colors hover:bg-white/15"
                >
                  {secondary.label}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
