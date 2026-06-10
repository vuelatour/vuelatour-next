import Link from "next/link";
import { ArrowRight, Clock, Plane, Users } from "lucide-react";

import { FaqAccordion } from "@/app/(public)/faq/faq-accordion";

/**
 * Secciones de la home pública (debajo del hero del mapa). Server Components,
 * motion solo CSS. Familias de layout distintas por sección: split asimétrico,
 * banda de stats, scroll-snap horizontal y FAQ en 2 columnas.
 */

/* ---------- 1. Servicios: split asimétrico 7/5 ---------- */
export function ServicesSplit() {
  return (
    <section className="bg-background py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
          Two ways to fly with us.
        </h2>
        <div className="mt-10 grid gap-6 lg:grid-cols-12">
          <Link
            href="/charter-flights"
            className="group relative flex min-h-[320px] flex-col justify-end overflow-hidden rounded-3xl bg-navy-900 p-8 lg:col-span-7"
          >
            {/* TODO: foto real de charter (cabina/pista) 1600x900 */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(230,57,70,0.25),transparent_55%),linear-gradient(135deg,#102a43_0%,#243b53_100%)] transition-transform duration-500 group-hover:scale-[1.02]"
            />
            <div className="relative">
              <p className="inline-flex items-center gap-2 text-sm font-medium text-navy-200">
                <Plane className="size-4" /> Door to door, on your schedule
              </p>
              <h3 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                Private charter flights
              </h3>
              <p className="mt-2 max-w-md text-sm text-navy-200">
                Cozumel, Mérida, Chetumal, Belize and beyond. Flat rate per
                aircraft, up to 6 passengers.
              </p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-white">
                Explore charters
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>

          <Link
            href="/air-tours"
            className="group relative flex min-h-[320px] flex-col justify-end overflow-hidden rounded-3xl p-8 lg:col-span-5"
          >
            {/* TODO: foto aérea real (arrecife/costa) 1200x900 */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[linear-gradient(160deg,#0ea5e9_0%,#22d3ee_45%,#34d399_100%)] transition-transform duration-500 group-hover:scale-[1.02]"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,rgba(13,31,51,0.65))]"
            />
            <div className="relative">
              <p className="inline-flex items-center gap-2 text-sm font-medium text-white/85">
                <Clock className="size-4" /> 30 to 90 minutes in the air
              </p>
              <h3 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                Panoramic air tours
              </h3>
              <p className="mt-2 max-w-sm text-sm text-white/85">
                Isla Mujeres, Holbox, Tulum and Chichén Itzá. Every seat is a
                window seat.
              </p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-white">
                Explore tours
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------- 2. Banda de stats (claims reales del negocio) ---------- */
const STATS = [
  { value: "25+", label: "Years flying the Caribbean" },
  { value: "20+", label: "Destinations from Cancún" },
  { value: "6", label: "Passengers per aircraft" },
  { value: "2 h", label: "Response time, 7 days a week" },
] as const;

export function StatsBand() {
  return (
    <section className="border-y border-border bg-muted/30">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-y-8 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
        {STATS.map((s) => (
          <div key={s.label} className="text-center md:text-left">
            <p className="text-3xl font-bold tracking-tight text-brand-600 sm:text-4xl">
              {s.value}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- 3. Rutas populares: scroll-snap horizontal ---------- */
type Route = {
  slug: string;
  name: string;
  duration: string;
  from: number;
  note: string;
  gradient: string;
};

const ROUTES: Route[] = [
  {
    slug: "cozumel",
    name: "Cancún to Cozumel",
    duration: "20 min",
    from: 1_200,
    note: "Skip the 4 hour ferry round trip.",
    gradient: "from-blue-600 via-sky-500 to-cyan-300",
  },
  {
    slug: "holbox",
    name: "Cancún to Holbox",
    duration: "35 min",
    from: 1_650,
    note: "Land on the island, no van + ferry combo.",
    gradient: "from-rose-400 via-orange-300 to-amber-200",
  },
  {
    slug: "chichen-itza",
    name: "Chichén Itzá Sky",
    duration: "90 min",
    from: 1_280,
    note: "The pyramid from 1,500 ft.",
    gradient: "from-amber-500 via-orange-400 to-yellow-300",
  },
  {
    slug: "isla-mujeres",
    name: "Isla Mujeres Loop",
    duration: "45 min",
    from: 540,
    note: "The most booked sunset seat.",
    gradient: "from-cyan-500 via-teal-400 to-sky-400",
  },
  {
    slug: "tulum",
    name: "Cancún to Tulum",
    duration: "25 min",
    from: 1_400,
    note: "Ruins and beach before lunch.",
    gradient: "from-emerald-500 via-teal-400 to-cyan-300",
  },
];

export function PopularRoutes() {
  return (
    <section className="bg-background py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Where travelers fly most.
          </h2>
          <Link
            href="/air-tours"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            All routes
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
      <div className="mt-8 overflow-x-auto pb-4 [scrollbar-width:none]">
        <div className="mx-auto flex max-w-7xl snap-x snap-mandatory gap-5 px-4 sm:px-6 lg:px-8">
          {ROUTES.map((r) => (
            <Link
              key={r.slug}
              href={`/quote?tour=${r.slug}`}
              className="group relative flex w-[280px] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-2xl p-5 sm:w-[320px]"
              style={{ aspectRatio: "4 / 5" }}
            >
              {/* TODO: foto real del destino */}
              <div
                aria-hidden="true"
                className={`absolute inset-0 bg-gradient-to-br ${r.gradient} transition-transform duration-500 group-hover:scale-[1.03]`}
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(13,31,51,0.75))]"
              />
              <div className="relative text-white">
                <p className="inline-flex items-center gap-1.5 text-xs font-medium text-white/85">
                  <Clock className="size-3.5" /> {r.duration}
                </p>
                <h3 className="mt-1 text-xl font-bold leading-tight">{r.name}</h3>
                <p className="mt-1 text-sm text-white/85">{r.note}</p>
                <p className="mt-3 text-sm font-semibold">
                  From ${r.from.toLocaleString("en-US")} USD
                  <span className="ml-1 font-normal text-white/75">per aircraft</span>
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- 4. Por qué Vuelatour + FAQ teaser (2 columnas) ---------- */
const TEASER_FAQS = [
  {
    q: "Is the price per person or per aircraft?",
    a: "Per aircraft. You book the whole plane (up to 6 seats depending on the model), so a full group often costs less than commercial options.",
  },
  {
    q: "What happens if the weather turns bad?",
    a: "Safety decides. We reschedule at no cost or refund in full. Our pilots make the final call, not the calendar.",
  },
  {
    q: "How far in advance should I book?",
    a: "Tours: 24 to 48 hours is usually enough. Charters in high season: 3 to 5 days. Same day is sometimes possible, write to us on WhatsApp.",
  },
];

export function WhyAndFaq() {
  return (
    <section className="bg-background pb-16 md:pb-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Flying with us, in plain terms.
          </h2>
          <ul className="mt-8 space-y-6">
            <li className="flex gap-4">
              <Plane className="mt-1 size-5 shrink-0 text-brand-600" />
              <div>
                <h3 className="font-semibold">Certified charter operator</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Certified operators, maintenance on schedule and two decades of
                  Caribbean weather experience in the cockpit.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <Users className="mt-1 size-5 shrink-0 text-brand-600" />
              <div>
                <h3 className="font-semibold">A human answers</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Quotes, changes and weather calls handled by our Cancún team,
                  within 2 hours, in English or Spanish.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <Clock className="mt-1 size-5 shrink-0 text-brand-600" />
              <div>
                <h3 className="font-semibold">Your time back</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ferries, buses and layovers become a 20 minute flight over
                  turquoise water. That is the product.
                </p>
              </div>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Before you ask</h2>
          <div className="mt-4">
            <FaqAccordion items={TEASER_FAQS} />
          </div>
          <Link
            href="/faq"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            Read the full FAQ
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
