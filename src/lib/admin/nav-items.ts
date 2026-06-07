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
  MapIcon,
  MapPinIcon,
  CreditCardIcon,
  BanknotesIcon,
  DocumentTextIcon,
  ReceiptPercentIcon,
  ShieldCheckIcon,
  UserCircleIcon,
  RocketLaunchIcon,
  BellAlertIcon,
  BeakerIcon,
  WrenchScrewdriverIcon,
  ArchiveBoxIcon,
  WalletIcon,
  ArrowsRightLeftIcon,
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
        label: "Dashboards",
        href: "/admin/dashboards",
        icon: ChartBarIcon,
        roles: ["ADMIN", "ANALISTA", "SOCIO", "COORDINADOR"],
      },
      { label: "Cotizaciones", href: "/admin/quotes", icon: CalculatorIcon },
      { label: "Vuelos", href: "/admin/flights", icon: PaperAirplaneIcon },
      { label: "Calendario", href: "/admin/calendar", icon: CalendarIcon },
      {
        label: "Gastos",
        href: "/admin/expenses",
        icon: ReceiptPercentIcon,
        roles: ["ADMIN", "COORDINADOR", "FACTURACION"],
      },
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
      { label: "Motores", href: "/admin/engines", icon: CpuChipIcon },
      { label: "Hélices", href: "/admin/propellers", icon: CpuChipIcon },
      {
        label: "Ingeniería",
        href: "/admin/ingenieria",
        icon: WrenchScrewdriverIcon,
        roles: ["ADMIN", "COORDINADOR"],
      },
      {
        label: "Vencimientos",
        href: "/admin/expirations",
        icon: ShieldCheckIcon,
        roles: ["ADMIN", "COORDINADOR", "MECANICO"],
      },
      {
        label: "Inventario",
        href: "/admin/inventory",
        icon: ArchiveBoxIcon,
        roles: ["ADMIN", "COORDINADOR", "MECANICO", "SOCIO"],
      },
      {
        label: "Multas",
        href: "/admin/multas",
        icon: ReceiptPercentIcon,
        roles: ["ADMIN", "COORDINADOR", "ANALISTA", "SOCIO"],
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
      {
        label: "Tipos de documento",
        href: "/admin/document-types",
        icon: DocumentTextIcon,
        roles: ["ADMIN", "COORDINADOR"],
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
        label: "Facturas recibidas",
        href: "/admin/facturas-recibidas",
        icon: ReceiptPercentIcon,
        roles: ["ADMIN", "FACTURACION"],
      },
      {
        label: "Caja chica",
        href: "/admin/caja-chica",
        icon: WalletIcon,
        roles: ["ADMIN", "FACTURACION", "SOCIO"],
      },
      {
        label: "Conciliación",
        href: "/admin/conciliacion",
        icon: ArrowsRightLeftIcon,
        roles: ["ADMIN", "FACTURACION"],
      },
      {
        label: "Reparto de utilidades",
        href: "/admin/profit-sharing",
        icon: ChartPieIcon,
        roles: ["ADMIN", "ANALISTA", "SOCIO"],
      },
      {
        label: "Reportes",
        href: "/admin/reportes",
        icon: ArchiveBoxIcon,
        roles: ["ADMIN", "ANALISTA", "FACTURACION"],
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
