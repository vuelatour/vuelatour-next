import Link from "next/link";
import { MapPin, Phone, Mail } from "lucide-react";

import { VuelatourLogo } from "@/components/icons/vuelatour-logo";
import {
  FacebookIcon,
  InstagramIcon,
  YoutubeIcon,
  WhatsappIcon,
} from "@/components/icons/social-icons";

const SERVICES = [
  { href: "/charter-flights", label: "Charter Flights" },
  { href: "/air-tours", label: "Air Tours" },
  { href: "/our-fleet", label: "Our Fleet" },
  { href: "/contact", label: "Contact" },
];

const COMPANY = [
  { href: "/about", label: "About Us" },
  { href: "/blog", label: "Blog" },
  { href: "/faq", label: "FAQ" },
];

const LEGAL = [
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/cookies", label: "Cookie Policy" },
];

const SOCIALS = [
  {
    href: "https://facebook.com/vuelatour",
    label: "Facebook",
    Icon: FacebookIcon,
  },
  {
    href: "https://instagram.com/vuelatour",
    label: "Instagram",
    Icon: InstagramIcon,
  },
  {
    href: "https://youtube.com/@vuelatour",
    label: "YouTube",
    Icon: YoutubeIcon,
  },
  {
    href: "https://wa.me/529982407149",
    label: "WhatsApp",
    Icon: WhatsappIcon,
  },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-navy-900 text-navy-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 py-12 md:py-16 md:grid-cols-2 lg:grid-cols-5 lg:gap-8">
          <div className="lg:col-span-2">
            <Link href="/" aria-label="Vuelatour. Inicio">
              <VuelatourLogo className="text-white" />
            </Link>

            <p className="mt-5 text-sm italic text-navy-300">
              flying is <span className="font-semibold text-brand-500">wonderful!</span>
            </p>

            <p className="mt-5 max-w-xs text-sm leading-relaxed text-navy-300">
              Private charter flights and panoramic air tours in Cancún and
              the Riviera Maya. 25+ years experience.
            </p>

            <ul className="mt-6 flex items-center gap-3">
              {SOCIALS.map(({ href, label, Icon }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="inline-flex size-10 items-center justify-center rounded-lg bg-navy-800 text-navy-300 transition-colors hover:bg-navy-700 hover:text-brand-400"
                  >
                    <Icon className="size-[18px]" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <FooterColumn title="Services" items={SERVICES} />
          <FooterColumn title="Company" items={COMPANY} />
          <FooterColumn title="Legal" items={LEGAL} />

          <div>
            <h3 className="text-base font-semibold text-white">Contact</h3>
            <ul className="mt-5 space-y-4 text-sm text-navy-300">
              <li className="flex gap-3">
                <MapPin className="mt-0.5 size-4 shrink-0 text-navy-400" />
                <span className="leading-relaxed">
                  Aeropuerto Internacional de Cancún, Terminal FBO, Cancún,
                  Q.R., México
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="size-4 shrink-0 text-navy-400" />
                <a
                  href="tel:+529982407149"
                  className="transition-colors hover:text-white"
                >
                  +52 998 240 7149
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="size-4 shrink-0 text-navy-400" />
                <a
                  href="tel:+524771538017"
                  className="transition-colors hover:text-white"
                >
                  +52 477 153 8017
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="size-4 shrink-0 text-navy-400" />
                <a
                  href="mailto:info@vuelatour.com"
                  className="transition-colors hover:text-white"
                >
                  info@vuelatour.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-navy-800 py-6">
          <div className="flex flex-col gap-4 text-xs text-navy-400 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span>© {year} Vuelatour. All rights reserved</span>
              <span className="hidden md:inline">•</span>
              <Link
                href="/admin"
                className="transition-colors hover:text-white"
              >
                Admin
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="inline-flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-green-500" />
                TAI &amp; TAN Certified
              </span>
              <span className="hidden md:inline">•</span>
              <span>25+ years experience</span>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-navy-400">
            Made with <span className="text-brand-500">♥</span> by{" "}
            <a
              href="https://eddcode.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold transition-colors hover:text-white"
            >
              EDDCODE
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  items,
}: {
  title: string;
  items: Array<{ href: string; label: string }>;
}) {
  return (
    <div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <ul className="mt-5 space-y-3 text-sm">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="text-navy-300 transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
