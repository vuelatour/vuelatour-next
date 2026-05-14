import Link from "next/link";
import { PaperAirplaneIcon, ArrowRightIcon } from "@heroicons/react/24/outline";

/**
 * Landing pública (placeholder). La landing definitiva se migrará desde
 * vuelatour.com aplicando el DESIGN_SYSTEM.md. Por ahora un hero simple
 * con CTA al admin para no bloquear el flujo del equipo interno.
 */
export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 md:h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-brand-600 flex items-center justify-center text-white text-sm font-bold tracking-tight">
              VT
            </div>
            <span className="text-lg font-semibold tracking-tight">Vuela Tour</span>
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-muted transition-colors"
          >
            Ingresar al sistema
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
        </div>
      </header>

      <section className="flex-1 flex items-center justify-center px-4 py-20 md:py-28">
        <div className="max-w-3xl text-center space-y-8">
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
              <PaperAirplaneIcon className="w-3.5 h-3.5" />
              Próximamente
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.1]">
            Volando es <span className="text-brand-600">maravilloso</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto">
            Vuelos privados y tours aéreos desde Cancún. La landing definitiva está en migración —
            mientras tanto, el equipo puede acceder al sistema operativo.
          </p>
          <div className="pt-4 flex justify-center">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 h-12 px-8 rounded-xl bg-primary text-primary-foreground text-base font-semibold hover:opacity-90 transition-opacity"
            >
              Acceder al admin
              <ArrowRightIcon className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} Aero Charter Cancún S.A. de C.V.</p>
          <p>
            Hecho con <span className="text-brand-500">♥</span> por EDDCODE
          </p>
        </div>
      </footer>
    </main>
  );
}
