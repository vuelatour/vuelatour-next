import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock, MapPin, Users } from "lucide-react";

import { PageHeader } from "@/components/public/page-header";
import { CtaBanner } from "@/components/public/cta-banner";

export const metadata: Metadata = {
  title: "Air Tours",
  description:
    "Panoramic airplane tours over Cancún, Isla Mujeres, Cozumel, Holbox and the Riviera Maya. 30-90 minute experiences for up to 6 passengers.",
};

type Tour = {
  slug: string;
  name: string;
  duration: string;
  pax: string;
  from: number;
  highlights: string[];
  featured?: boolean;
  gradient: string;
};

const TOURS: Tour[] = [
  {
    slug: "cancun-tour",
    name: "Airplane Tour Cancún",
    duration: "60 min",
    pax: "1-5 pax",
    from: 690,
    featured: true,
    highlights: ["Hotel Zone", "Isla Mujeres", "Punta Sam"],
    gradient: "from-sky-500 via-cyan-400 to-emerald-400",
  },
  {
    slug: "isla-mujeres",
    name: "Isla Mujeres Loop",
    duration: "45 min",
    pax: "1-5 pax",
    from: 540,
    highlights: ["Punta Sur", "El Meco", "Caribbean reefs"],
    gradient: "from-cyan-500 via-teal-400 to-sky-400",
  },
  {
    slug: "cozumel-aerial",
    name: "Cozumel Aerial",
    duration: "75 min",
    pax: "1-5 pax",
    from: 890,
    highlights: ["Palancar Reef", "Punta Sur", "Riviera coast"],
    gradient: "from-blue-600 via-sky-500 to-cyan-300",
  },
  {
    slug: "holbox-flyover",
    name: "Holbox Flyover",
    duration: "90 min",
    pax: "1-5 pax",
    from: 1_150,
    highlights: ["Yum Balam", "Cabo Catoche", "Pink lagoons"],
    gradient: "from-rose-400 via-orange-300 to-amber-200",
  },
  {
    slug: "chichen-itza",
    name: "Chichén Itzá Sky",
    duration: "90 min",
    pax: "1-5 pax",
    from: 1_280,
    highlights: ["Pyramid flyover", "Cenotes route", "Yucatán jungle"],
    gradient: "from-amber-500 via-orange-400 to-yellow-300",
  },
  {
    slug: "riviera-sunset",
    name: "Riviera Maya Sunset",
    duration: "60 min",
    pax: "1-5 pax",
    from: 790,
    highlights: ["Tulum ruins", "Akumal bay", "Golden hour"],
    gradient: "from-orange-500 via-rose-400 to-purple-500",
  },
];

export default function AirToursPage() {
  return (
    <>
      <PageHeader
        kicker="Air Tours"
        title={
          <>
            See the Mexican Caribbean{" "}
            <span className="text-brand-500">from above.</span>
          </>
        }
        description="Panoramic flights over Cancún, Isla Mujeres, Cozumel, Holbox, Chichén Itzá and the Riviera Maya. Every seat is a window seat."
      />

      <section className="bg-background py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Choose your route
              </h2>
              <p className="mt-2 max-w-xl text-muted-foreground">
                Flat-rate per aircraft, not per person. Pricing in USD.
              </p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {TOURS.map((tour) => (
              <TourCard key={tour.slug} tour={tour} />
            ))}
          </div>
        </div>
      </section>

      <CtaBanner
        title="Build a custom tour"
        description="Combining destinations or chartering for a special date? We tailor the route — proposal, contract and digital boarding pass in 24 h."
        primary={{ href: "/quote", label: "Get a Quote" }}
        secondary={{ href: "/contact", label: "Contact us" }}
      />
    </>
  );
}

function TourCard({ tour }: { tour: Tour }) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-lg">
      <div className="relative aspect-[16/10] overflow-hidden">
        <div
          aria-hidden="true"
          className={`absolute inset-0 bg-gradient-to-br ${tour.gradient}`}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(13,31,51,0.6))]"
        />
        {tour.featured && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white">
            Most Popular
          </span>
        )}
        <div className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
          <Clock className="size-3" />
          {tour.duration}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-semibold">{tour.name}</h3>
        <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3.5" />
          {tour.pax}
        </p>

        <ul className="mt-4 flex-1 space-y-1.5">
          {tour.highlights.map((h) => (
            <li
              key={h}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <MapPin className="size-3.5 text-brand-500" />
              {h}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex items-end justify-between border-t border-border pt-4">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              From
            </p>
            <p className="text-2xl font-bold">
              ${tour.from}
              <span className="ml-0.5 text-xs font-medium text-muted-foreground">
                USD
              </span>
            </p>
          </div>
          <Link
            href={`/quote?tour=${tour.slug}`}
            className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition-transform group-hover:translate-x-0.5"
          >
            Book
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
