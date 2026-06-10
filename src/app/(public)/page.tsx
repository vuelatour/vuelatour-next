import type { Metadata } from "next";

import { HeroSection } from "@/components/public/hero-section";
import { CtaBanner } from "@/components/public/cta-banner";
import {
  PopularRoutes,
  ServicesSplit,
  StatsBand,
  WhyAndFaq,
} from "@/components/public/home-sections";

export const metadata: Metadata = {
  title: "Vuelatour | Private Charter Flights & Airplane Tours in Cancún",
  description:
    "The fastest way to fly to Cozumel, Holbox, Chichén Itzá and the Riviera Maya. Private charter flights and panoramic air tours from Cancún with 25+ years of experience.",
};

export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <StatsBand />
      <ServicesSplit />
      <PopularRoutes />
      <WhyAndFaq />
      <CtaBanner
        title="Tell us where you want to go"
        description="Proposal, contract and digital boarding pass within 24 hours. A real person reads every message."
        primary={{ href: "/quote", label: "Get a Quote" }}
        secondary={{ href: "/contact", label: "Contact us" }}
      />
    </>
  );
}
