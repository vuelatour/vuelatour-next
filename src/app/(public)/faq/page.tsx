import type { Metadata } from "next";

import { PageHeader } from "@/components/public/page-header";
import { CtaBanner } from "@/components/public/cta-banner";
import { FaqAccordion } from "./faq-accordion";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Common questions about Vuelatour private charter flights and panoramic air tours from Cancún.",
};

const FAQS = [
  {
    q: "How far in advance should I book?",
    a: "For air tours, 24-48 h is usually enough. For point-to-point charters (Cozumel, Holbox, Chichén Itzá) we recommend 3-5 days, especially on weekends and during high season (Dec-Apr, Jul-Aug). For custom multi-leg trips, plan for 7-10 days.",
  },
  {
    q: "What's included in the quoted price?",
    a: "The aircraft, the certified crew, fuel, airport fees on the Cancún side, and the FBO assistance for boarding. Additional landing/handling fees at destination airports (e.g. Cozumel, Chichén Itzá) are quoted separately so you see them clearly. Ground transfer at destination is optional and quoted on request.",
  },
  {
    q: "How many passengers fit per flight?",
    a: "Our Cessna 206 takes up to 5 passengers. Our Cessna 208 Caravan takes up to 9 passengers. Total weight matters more than the head count — when you request a quote we'll ask for approximate weights to confirm the right aircraft.",
  },
  {
    q: "What happens if the weather doesn't cooperate?",
    a: "Safety is the only criterion. If the captain calls a no-go, you get a full refund or a free re-schedule, your choice. We monitor conditions up until departure and will always offer the option to delay rather than push through marginal weather.",
  },
  {
    q: "Is luggage allowed?",
    a: "Yes, with weight limits depending on aircraft and pax count. As a rule of thumb: one soft carry-on per passenger for tours, plus a personal item. For charters with checked luggage, let us know on the quote request so we can confirm capacity.",
  },
  {
    q: "Are your operators certified?",
    a: "Yes. We operate under TAI (Taxi Aéreo Internacional) and TAN (Taxi Aéreo Nacional) permits issued by Mexican civil aviation authority — the licenses required for legal commercial air taxi service in Mexico. Maintenance logs are available on request.",
  },
  {
    q: "Can I bring my pet on board?",
    a: "Small pets in soft carriers are welcome on private charters. For tours and shared flights, please confirm with us first. Mexican domestic flights don't require pet documentation, but international legs (Belize, US) do.",
  },
  {
    q: "What payment methods do you accept?",
    a: "Credit and debit cards (Visa, Mastercard, Amex), bank transfer in MXN or USD, and PayPal. A deposit is required to confirm; the balance can be paid before departure.",
  },
];

export default function FaqPage() {
  return (
    <>
      <PageHeader
        kicker="FAQ"
        title={
          <>
            Everything you need to know{" "}
            <span className="text-brand-500">before you fly.</span>
          </>
        }
        description="Booking, pricing, certifications, weather policy and the small print. If your question isn't here, send it our way — we answer within 2 hours."
      />

      <section className="bg-background py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <FaqAccordion items={FAQS} />
        </div>
      </section>

      <CtaBanner
        title="Still have questions?"
        description="Send us a message — humans answer within 2 hours during operating hours (7 am - 9 pm CST)."
        primary={{ href: "/contact", label: "Contact us" }}
        secondary={{ href: "/quote", label: "Request a quote" }}
      />
    </>
  );
}
