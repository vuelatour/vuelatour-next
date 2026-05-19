import {
  HomeIcon,
  CalculatorIcon,
  PaperAirplaneIcon,
  CalendarIcon,
  UsersIcon,
  BuildingOfficeIcon,
  TruckIcon,
  ChartBarIcon,
  ChartPieIcon,
  CpuChipIcon,
  CubeIcon,
  MapIcon,
  MapPinIcon,
  CreditCardIcon,
  BanknotesIcon,
  DocumentTextIcon,
  ReceiptPercentIcon,
  ShieldCheckIcon,
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
      {
        label: "Tablero ejecutivo",
        href: "/admin/dashboards",
        icon: ChartBarIcon,
        roles: ["ADMIN", "ANALISTA"],
      },
      { label: "Cotizaciones", href: "/admin/quotes", icon: CalculatorIcon },
      { label: "Vuelos", href: "/admin/flights", icon: PaperAirplaneIcon },
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
      { label: "Vencimientos", href: "/admin/expirations", icon: ShieldCheckIcon },
      { label: "Inventario", href: "/admin/inventory", icon: CubeIcon },
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
    label: "Finanzas",
    items: [
      {
        label: "Gastos",
        href: "/admin/expenses",
        icon: ReceiptPercentIcon,
        roles: ["ADMIN", "COORDINADOR", "ANALISTA", "FACTURACION", "PILOTO"],
      },
      {
        label: "Caja chica",
        href: "/admin/cash-funds",
        icon: BanknotesIcon,
        roles: ["ADMIN", "FACTURACION", "COORDINADOR", "ANALISTA"],
      },
      {
        label: "Reparto de utilidades",
        href: "/admin/profit-sharing",
        icon: ChartPieIcon,
        roles: ["ADMIN", "ANALISTA"],
      },
    ],
  },
  {
    label: "Tesorería",
    items: [
      {
        label: "Bancos y conciliación",
        href: "/admin/treasury",
        icon: BanknotesIcon,
        roles: ["ADMIN", "FACTURACION", "ANALISTA"],
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
        label: "Usuarios",
        href: "/admin/users",
        icon: UserCircleIcon,
        roles: ["ADMIN"],
      },
      {
        label: "Tipos de documento",
        href: "/admin/document-types",
        icon: DocumentTextIcon,
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
