import {
  HomeIcon,
  CalculatorIcon,
  PaperAirplaneIcon,
  CalendarIcon,
  UsersIcon,
  BuildingOfficeIcon,
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
  Cog6ToothIcon,
  BeakerIcon,
  WrenchScrewdriverIcon,
  ArchiveBoxIcon,
  WalletIcon,
  ArrowsRightLeftIcon,
  ClockIcon as GaugeIconAlias,
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
      { label: "Inicio", href: "/admin", icon: HomeIcon },
      {
        label: "Estadísticas",
        href: "/admin/dashboards",
        icon: ChartBarIcon,
        roles: ["ADMIN", "ANALISTA", "SOCIO", "COORDINADOR"],
      },
      { label: "Cotizaciones", href: "/admin/quotes", icon: CalculatorIcon },
      { label: "Vuelos", href: "/admin/flights", icon: PaperAirplaneIcon },
      { label: "Calendario", href: "/admin/calendar", icon: CalendarIcon },
      // Tablero del día: cada escala espera su tacómetro; lo vencido se
      // deduce solo y oficina confirma/ajusta — la operación no se detiene.
      { label: "Tacómetros en vivo", href: "/admin/taco-live", icon: GaugeIconAlias },
      {
        label: "Gastos",
        href: "/admin/expenses",
        icon: ReceiptPercentIcon,
        roles: ["ADMIN", "COORDINADOR", "FACTURACION"],
      },
      {
        // Gastos generales (OTRO/FIJO/INDIRECTO sin vuelo): se asignan o
        // dividen entre aviones; lo no asignado es gasto de la empresa.
        label: "Otros gastos",
        href: "/admin/otros-gastos",
        icon: BanknotesIcon,
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
      { label: "Aeronaves", href: "/admin/aircraft", icon: PaperAirplaneIcon },
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
      {
        label: "Clientes",
        href: "/admin/clients",
        icon: UsersIcon,
        // Espejo de @Roles de GET /v1/clients (PII fiscal): sin MECANICO/PILOTO.
        roles: ["ADMIN", "COORDINADOR", "FACTURACION", "ANALISTA", "SOCIO"],
      },
      { label: "Proveedores", href: "/admin/providers", icon: BuildingOfficeIcon },
      { label: "Aeropuertos", href: "/admin/airports", icon: MapPinIcon },
      {
        label: "Distancias",
        href: "/admin/distancias",
        icon: ArrowsRightLeftIcon,
        roles: ["ADMIN", "COORDINADOR"],
      },
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
      {
        label: "Configuración",
        href: "/admin/configuracion",
        icon: Cog6ToothIcon,
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
