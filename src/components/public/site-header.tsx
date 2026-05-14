"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X, ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { VuelatourLogo } from "@/components/icons/vuelatour-logo";

type Locale = "es" | "en";

const NAV_ITEMS = [
  { href: "/charter-flights", label: "Charter Flights" },
  { href: "/air-tours", label: "Air Tours" },
  { href: "/our-fleet", label: "Our Fleet" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
] as const;

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Bloquea scroll del body cuando el drawer móvil está abierto.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-shadow",
        "bg-navy-900 text-white",
        scrolled && "shadow-lg",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 md:h-20 lg:px-8">
        <Link
          href="/"
          className="shrink-0"
          aria-label="Vuelatour — Inicio"
          onClick={() => setOpen(false)}
        >
          <VuelatourLogo />
        </Link>

        <nav
          aria-label="Principal"
          className="hidden items-center gap-7 lg:flex"
        >
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-white/85 transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1 rounded-lg bg-navy-800 p-1 sm:flex">
            {(["es", "en"] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLocale(lang)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold uppercase transition-colors",
                  locale === lang
                    ? "bg-brand-600 text-white"
                    : "text-navy-300 hover:text-white",
                )}
                aria-pressed={locale === lang}
              >
                {lang}
              </button>
            ))}
          </div>

          <Link
            href="/quote"
            className="hidden h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700 sm:inline-flex"
          >
            Get Quote
            <ArrowRight className="size-4" />
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex size-10 items-center justify-center rounded-lg bg-navy-800 text-white transition-colors hover:bg-navy-700 lg:hidden"
            aria-expanded={open}
            aria-controls="site-header-mobile-menu"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div
          id="site-header-mobile-menu"
          className="border-t border-navy-800 bg-navy-900 lg:hidden"
        >
          <nav
            aria-label="Móvil"
            className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 sm:px-6"
          >
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-sm font-medium text-white/85 transition-colors hover:bg-navy-800 hover:text-white"
              >
                {item.label}
              </Link>
            ))}

            <div className="mt-2 flex items-center justify-between gap-3 sm:hidden">
              <div className="flex items-center gap-1 rounded-lg bg-navy-800 p-1">
                {(["es", "en"] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setLocale(lang)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-semibold uppercase transition-colors",
                      locale === lang
                        ? "bg-brand-600 text-white"
                        : "text-navy-300 hover:text-white",
                    )}
                    aria-pressed={locale === lang}
                  >
                    {lang}
                  </button>
                ))}
              </div>

              <Link
                href="/quote"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
              >
                Get Quote
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
