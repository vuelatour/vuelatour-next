import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Gauge, Plane, Ruler, Users } from "lucide-react";

import { PageHeader } from "@/components/public/page-header";
import { CtaBanner } from "@/components/public/cta-banner";

export const metadata: Metadata = {
  title: "Our Fleet",
  description:
    "Cessna 206 and Cessna 208 Caravan operated under TAI/TAN civil aviation permits. Single-engine, high-wing, panoramic windows.",
};

type Aircraft = {
  model: string;
  tagline: string;
  description: string;
  seats: string;
  range: string;
  cruise: string;
  bestFor: string[];
  gradient: string;
};

const FLEET: Aircraft[] = [
  {
    model: "Cessna 206 Stationair",
    tagline: "The workhorse of the Caribbean",
    description:
      "Single-engine high-wing — every passenger gets an unobstructed window. Ideal for short hops and panoramic tours where altitude matters less than the view.",
    seats: "5 passengers",
    range: "1,350 km",
    cruise: "260 km/h",
    bestFor: ["Cancún ↔ Cozumel", "Isla Mujeres tours", "Sunset flights"],
    gradient: "from-sky-500 via-cyan-400 to-blue-300",
  },
  {
    model: "Cessna 208 Caravan",
    tagline: "Range, capacity, comfort",
    description:
      "Turboprop with PT6A engine and pressurized cabin. The right plane when the route is longer (Chichén Itzá, Belize, Mérida) or the group is bigger.",
    seats: "9 passengers",
    range: "1,900 km",
    cruise: "340 km/h",
    bestFor: ["Chichén Itzá day trip", "Belize charters", "Group transfers"],
    gradient: "from-slate-700 via-navy-700 to-navy-900",
  },
];

export default function OurFleetPage() {
  return (
    <>
      <PageHeader
        kicker="Our Fleet"
        title={
          <>
            Aircraft you can trust,{" "}
            <span className="text-brand-500">cabins built for the view.</span>
          </>
        }
        description="Two complementary aircraft cover every route we fly. Single-engine Cessnas, full maintenance log on request, operated under Mexican civil aviation taxi-aéreo permits (TAI/TAN)."
      />

      <section className="bg-background py-16 md:py-24">
        <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6 lg:px-8">
          {FLEET.map((plane, idx) => (
            <AircraftCard key={plane.model} aircraft={plane} reverse={idx % 2 === 1} />
          ))}
        </div>
      </section>

      <section className="bg-muted/30 py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-3">
            <SpecBlock
              title="Maintenance"
              body="100% scheduled-inspection compliance. Full logbook available before any charter on request."
            />
            <SpecBlock
              title="Licensing"
              body="TAI (Taxi Aéreo Internacional) and TAN (Taxi Aéreo Nacional) permits — required for legal commercial air taxi in Mexico."
            />
            <SpecBlock
              title="Crew"
              body="Captain + first officer for Caravan operations. All pilots ATPL, minimum 3,000 hours total time."
            />
          </div>
        </div>
      </section>

      <CtaBanner
        title="Charter the right aircraft for your route"
        description="Not sure which one fits? Send your route and pax count — we'll recommend the aircraft and quote both options."
        primary={{ href: "/quote", label: "Get a Quote" }}
        secondary={{ href: "/contact", label: "Talk to us" }}
      />
    </>
  );
}

function AircraftCard({
  aircraft,
  reverse,
}: {
  aircraft: Aircraft;
  reverse: boolean;
}) {
  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-card">
      <div
        className={`grid gap-0 md:grid-cols-2 ${reverse ? "md:[&>:first-child]:order-2" : ""}`}
      >
        <div className="relative aspect-[4/3] overflow-hidden md:aspect-auto">
          <div
            aria-hidden="true"
            className={`absolute inset-0 bg-gradient-to-br ${aircraft.gradient}`}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_30%_60%,rgba(255,255,255,0.15),transparent_60%)]"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Plane className="size-24 -rotate-12 stroke-[1] text-white/30 md:size-40" />
          </div>
        </div>

        <div className="flex flex-col justify-center p-6 md:p-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
            {aircraft.tagline}
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            {aircraft.model}
          </h2>
          <p className="mt-4 text-muted-foreground">{aircraft.description}</p>

          <dl className="mt-6 grid grid-cols-3 gap-4 border-y border-border py-5">
            <Spec icon={Users} label="Capacity" value={aircraft.seats} />
            <Spec icon={Ruler} label="Range" value={aircraft.range} />
            <Spec icon={Gauge} label="Cruise" value={aircraft.cruise} />
          </dl>

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Best for
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {aircraft.bestFor.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground"
                >
                  {tag}
                </li>
              ))}
            </ul>
          </div>

          <Link
            href="/quote"
            className="mt-8 inline-flex items-center gap-2 self-start text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            Quote this aircraft
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function Spec({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}

function SpecBlock({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
