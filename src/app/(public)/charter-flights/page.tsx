import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Clock,
  Plane,
  ShieldCheck,
  Users,
  Wifi,
} from "lucide-react";

import { PageHeader } from "@/components/public/page-header";
import { CtaBanner } from "@/components/public/cta-banner";

export const metadata: Metadata = {
  title: "Charter Flights",
  description:
    "Private charter flights from Cancún to Cozumel, Holbox, Chichén Itzá and the Riviera Maya. Fly on your schedule with certified operators.",
};

const ROUTES = [
  {
    name: "Cancún → Cozumel",
    duration: "20 min",
    pax: "1-6 pax",
    from: 1_200,
    description:
      "The fastest way to reach the Caribbean's diving capital. Skip the ferry and land 5 minutes from downtown.",
  },
  {
    name: "Cancún → Holbox",
    duration: "35 min",
    pax: "1-6 pax",
    from: 1_650,
    description:
      "Door-to-island in under an hour. We land you directly at Holbox's small strip. no taxi, no ferry.",
  },
  {
    name: "Cancún → Chichén Itzá",
    duration: "30 min",
    pax: "1-6 pax",
    from: 1_850,
    description:
      "Visit the wonder of the world without the 3-hour bus. Includes ground transfer to the site.",
  },
  {
    name: "Custom route",
    duration: "On request",
    pax: "1-9 pax",
    from: null,
    description:
      "Tulum, Mérida, Bacalar, Belize. Tell us where and when. we build the route around you.",
  },
];

const INCLUDED = [
  { icon: Plane, title: "Certified aircraft", body: "Cessna 206 & 208 Caravan. full maintenance log on request." },
  { icon: ShieldCheck, title: "TAI & TAN licensed", body: "Operating under Mexican civil aviation taxi-aéreo permits." },
  { icon: Users, title: "FBO assistance", body: "We meet you at Terminal FBO Cancún and handle boarding." },
  { icon: Wifi, title: "Real-time tracking", body: "Share your flight with anyone via a public tracking link." },
];

export default function CharterFlightsPage() {
  return (
    <>
      <PageHeader
        kicker="Charter Flights"
        title={
          <>
            Fly private from Cancún -{" "}
            <span className="text-brand-500">on your schedule.</span>
          </>
        }
        description="Skip the ferries, the buses and the 3-hour drives. Land where you actually want to be, in a fraction of the time, with a certified operator and 25+ years on the route."
      />

      <section className="bg-background py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Popular routes
              </h2>
              <p className="mt-2 max-w-xl text-muted-foreground">
                Indicative pricing per leg, up to 6 passengers. Final quote
                depends on date, weight and ground services.
              </p>
            </div>
            <Link
              href="/quote"
              className="inline-flex h-11 items-center gap-2 self-start rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Request a quote
              <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {ROUTES.map((route) => (
              <article
                key={route.name}
                className="group flex flex-col rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-lg font-semibold">{route.name}</h3>
                  {route.from && (
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        From
                      </p>
                      <p className="text-xl font-bold">
                        ${route.from.toLocaleString()}
                        <span className="ml-0.5 text-xs font-medium text-muted-foreground">
                          USD
                        </span>
                      </p>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {route.description}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="size-3.5" />
                    {route.duration}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-3.5" />
                    {route.pax}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/30 py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            What's included
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Every charter ships with the operational essentials so the only
            decision left is the destination.
          </p>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {INCLUDED.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl border border-border bg-card p-6"
              >
                <div className="flex size-11 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                  <Icon className="size-5" />
                </div>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBanner
        title="Ready to fly?"
        description="Tell us your route and dates. We respond with a firm quote within 2 hours."
        primary={{ href: "/quote", label: "Get a Quote" }}
        secondary={{ href: "/contact", label: "Talk to us" }}
      />
    </>
  );
}
