import type { Metadata } from "next";
import { Clock, Mail, MapPin, Phone } from "lucide-react";

import { PageHeader } from "@/components/public/page-header";
import {
  FacebookIcon,
  InstagramIcon,
  WhatsappIcon,
  YoutubeIcon,
} from "@/components/icons/social-icons";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with Vuelatour. Cancún International Airport, Terminal FBO. Phone, email and WhatsApp. we answer within 2 hours.",
};

const SOCIALS = [
  { href: "https://wa.me/529982407149", label: "WhatsApp", Icon: WhatsappIcon },
  { href: "https://facebook.com/vuelatour", label: "Facebook", Icon: FacebookIcon },
  { href: "https://instagram.com/vuelatour", label: "Instagram", Icon: InstagramIcon },
  { href: "https://youtube.com/@vuelatour", label: "YouTube", Icon: YoutubeIcon },
];

export default function ContactPage() {
  return (
    <>
      <PageHeader
        kicker="Contact"
        title={
          <>
            Tell us where you want to go -{" "}
            <span className="text-brand-500">we handle the rest.</span>
          </>
        }
        description="A real person reads every message. We answer within 2 hours during operating hours."
      />

      <section className="bg-background py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-5 lg:gap-12">
            <div className="lg:col-span-2">
              <h2 className="text-2xl font-bold tracking-tight">Reach us</h2>
              <p className="mt-2 text-muted-foreground">
                Operating hours 7 am - 9 pm CST, 7 days a week.
              </p>

              <ul className="mt-8 space-y-6">
                <ContactRow
                  icon={MapPin}
                  title="Office"
                  body={
                    <>
                      Aeropuerto Internacional de Cancún
                      <br />
                      Terminal FBO, Cancún, Q.R., México
                    </>
                  }
                />
                <ContactRow
                  icon={Phone}
                  title="Phone"
                  body={
                    <div className="space-y-1">
                      <a
                        href="tel:+529982407149"
                        className="block hover:text-brand-600"
                      >
                        +52 998 240 7149
                      </a>
                      <a
                        href="tel:+524771538017"
                        className="block hover:text-brand-600"
                      >
                        +52 477 153 8017
                      </a>
                    </div>
                  }
                />
                <ContactRow
                  icon={Mail}
                  title="Email"
                  body={
                    <a
                      href="mailto:info@vuelatour.com"
                      className="hover:text-brand-600"
                    >
                      info@vuelatour.com
                    </a>
                  }
                />
                <ContactRow
                  icon={Clock}
                  title="Response time"
                  body="Under 2 hours during operating hours."
                />
              </ul>

              <div className="mt-10 border-t border-border pt-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Find us on
                </p>
                <ul className="mt-3 flex items-center gap-3">
                  {SOCIALS.map(({ href, label, Icon }) => (
                    <li key={label}>
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={label}
                        className="inline-flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-brand-500/10 hover:text-brand-600"
                      >
                        <Icon className="size-[18px]" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="lg:col-span-3">
              <div className="rounded-3xl border border-border bg-card p-6 sm:p-8">
                <h2 className="text-2xl font-bold tracking-tight">
                  Send us a message
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Fields marked with * are required. We never share your data.
                </p>
                <div className="mt-8">
                  <ContactForm />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function ContactRow({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="font-semibold">{title}</p>
        <div className="mt-1 text-sm text-muted-foreground">{body}</div>
      </div>
    </li>
  );
}
