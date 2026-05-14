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
      { label: "Cotizaciones", href: "/admin/quotes", icon: CalculatorIcon, comingSoon: true },
      { label: "Vuelos", href: "/admin/flights", icon: PaperAirplaneIcon, comingSoon: true },
      { label: "Calendario", href: "/admin/calendar", icon: CalendarIcon, comingSoon: true },
    ],
  },
  {
    label: "Flota",
    items: [
      { label: "Aeronaves", href: "/admin/aircraft", icon: TruckIcon },
      { label: "Motores", href: "/admin/engines", icon: CpuChipIcon, comingSoon: true },
      { label: "Hélices", href: "/admin/propellers", icon: CpuChipIcon, comingSoon: true },
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
        comingSoon: true,
        roles: ["ADMIN", "FACTURACION"],
      },
    ],
  },
  {
    label: "Tesorería",
    items: [
      {
        label: "Cuentas bancarias",
        href: "/admin/bank-accounts",
        icon: BanknotesIcon,
        comingSoon: true,
        roles: ["ADMIN", "FACTURACION"],
      },
      {
        label: "Tarjetas corp.",
        href: "/admin/cards",
        icon: CreditCardIcon,
        comingSoon: true,
        roles: ["ADMIN", "FACTURACION"],
      },
    ],
  },
  {
    label: "Administración",
    items: [
      {
        label: "Usuarios",
        href: "/admin/users",
        icon: UserCircleIcon,
        comingSoon: true,
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
