import {
  HomeIcon,
  CalculatorIcon,
  PaperAirplaneIcon,
  CalendarIcon,
  UsersIcon,
  BuildingOfficeIcon,
  TruckIcon,
  CpuChipIcon,
  MapIcon,
  MapPinIcon,
  CreditCardIcon,
  BanknotesIcon,
  DocumentTextIcon,
  UserCircleIcon,
  RocketLaunchIcon,
  BellAlertIcon,
  BeakerIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";
import type { Rol } from "@/types/me";

export interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Si la página aún no se ha construido (FRONT 4+). */
  comingSoon?: boolean;
  /** Si está restringido a ciertos roles. Sin valor = visible para todos. */
  roles?: Rol[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operación",
    items: [
      { label: "Dashboard", href: "/admin", icon: HomeIcon },
      { label: "Cotizaciones", href: "/admin/quotes", icon: CalculatorIcon },
      { label: "Vuelos", href: "/admin/flights", icon: PaperAirplaneIcon },
      { label: "Calendario", href: "/admin/calendar", icon: CalendarIcon },
      {
        label: "Combustibles",
        href: "/admin/combustibles",
        icon: BeakerIcon,
        roles: ["ADMIN", "COORDINADOR", "FACTURACION"],
      },
    ],
  },
  {
    label: "Flota",
    items: [
      { label: "Aeronaves", href: "/admin/aircraft", icon: TruckIcon },
      { label: "Motores", href: "/admin/engines", icon: CpuChipIcon, comingSoon: true },
      { label: "Hélices", href: "/admin/propellers", icon: CpuChipIcon, comingSoon: true },
      {
        label: "Ingeniería",
        href: "/admin/ingenieria",
        icon: WrenchScrewdriverIcon,
        roles: ["ADMIN", "COORDINADOR"],
      },
      { label: "Rutas", href: "/admin/routes", icon: MapIcon },
    ],
  },
  {
    label: "Catálogos",
    items: [
      { label: "Clientes", href: "/admin/clients", icon: UsersIcon },
      { label: "Proveedores", href: "/admin/providers", icon: BuildingOfficeIcon },
      { label: "Aeropuertos", href: "/admin/airports", icon: MapPinIcon },
      {
        label: "Entidades fiscales",
        href: "/admin/issuing-entities",
        icon: DocumentTextIcon,
        roles: ["ADMIN", "FACTURACION"],
      },
    ],
  },
  {
    label: "Tesorería",
    items: [
      {
        label: "Facturas",
        href: "/admin/facturas",
        icon: DocumentTextIcon,
        roles: ["ADMIN", "FACTURACION"],
      },
      {
        label: "Cuentas bancarias",
        href: "/admin/bank-accounts",
        icon: BanknotesIcon,
        roles: ["ADMIN", "FACTURACION"],
      },
      {
        label: "Tarjetas corp.",
        href: "/admin/cards",
        icon: CreditCardIcon,
        roles: ["ADMIN", "FACTURACION"],
      },
    ],
  },
  {
    label: "Administración",
    items: [
      {
        label: "Pilotos",
        href: "/admin/pilots",
        icon: RocketLaunchIcon,
        roles: ["ADMIN", "COORDINADOR"],
      },
      {
        label: "Usuarios",
        href: "/admin/users",
        icon: UserCircleIcon,
        roles: ["ADMIN"],
      },
      {
        label: "Alertas",
        href: "/admin/alertas",
        icon: BellAlertIcon,
        roles: ["ADMIN"],
      },
    ],
  },
];

export function filterNavGroupsForRole(rol: Rol | undefined): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => !it.roles || (rol && it.roles.includes(rol))),
  })).filter((g) => g.items.length > 0);
}
