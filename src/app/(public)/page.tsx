import type { Metadata } from "next";

import { HeroSection } from "@/components/public/hero-section";

export const metadata: Metadata = {
  title: "Vuelatour — Private Charter Flights & Airplane Tours in Cancún",
  description:
    "The fastest way to fly to Cozumel, Holbox, Chichén Itzá and the Riviera Maya. Private charter flights and panoramic air tours from Cancún with 25+ years of experience.",
};

export default function LandingPage() {
  return (
    <>
      <HeroSection />

      {/* Las secciones siguientes (servicios, destinos, testimonios, FAQ) se
          irán componiendo aquí siguiendo el DESIGN_SYSTEM. Por ahora el hero
          ya es funcional y enlaza a las páginas internas. */}
    </>
  );
}
