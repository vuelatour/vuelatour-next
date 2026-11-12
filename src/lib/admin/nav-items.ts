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
  DocumentCheckIcon,
  ReceiptPercentIcon,
  ShieldCheckIcon,
  UserCircleIcon,
  UserGroupIcon,
  RocketLaunchIcon,
  BellAlertIcon,
  Cog6ToothIcon,
  BeakerIcon,
  EnvelopeIcon,
  WrenchScrewdriverIcon,
  ArchiveBoxIcon,
  ShoppingCartIcon,
  WalletIcon,
  ArrowsRightLeftIcon,
  ArrowTrendingUpIcon,
  ClockIcon as GaugeIconAlias,
} from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";
import type { PermisosMe, Rol } from "@/types/me";
import { ROLES_GASTOS_PERSONALES, esDireccion } from "@/lib/admin/roles";
import { ROLES_NOMINA, TITULO_NOMINA } from "@/lib/admin/nomina";
import { ROLES_VEN_CORREOS_CLIENTE, TITULO_CORREOS_ENVIADOS } from "@/lib/admin/correo-cliente";

export interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Si la página aún no se ha construido (FRONT 4+). */
  comingSoon?: boolean;
  /** Si está restringido a ciertos roles. Sin valor = visible para todos. */
  roles?: Rol[];
  /**
   * Permiso POR PERSONA de `/me.permisos` que TAMBIÉN abre el ítem a quien
   * su rol no (12-nov-2026, API 0.0.137 y 0.0.138): «Nómina» y «Gastos
   * personales» para alguien de Administración a quien Dirección le dio ESE
   * acceso en Configuración.
   */
  permiso?: keyof PermisosMe;
  /**
   * Contador a la derecha del ítem (24-sep-2026). `por_facturar` = vuelos
   * con «Necesito factura» sin factura registrada; lo pide el sidebar con
   * `useConteoPorFacturar` (0 o error ⇒ no se pinta).
   */
  badge?: "por_facturar";
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
        // SOLO DIRECCIÓN (6-nov-2026, invariante 122 del API): Administración
        // (ADMIN) ya no entra; los demás roles siguen como estaban.
        label: "Estadísticas",
        href: "/admin/dashboards",
        icon: ChartBarIcon,
        roles: ["DIRECCION", "ANALISTA", "SOCIO", "COORDINADOR"],
      },
      { label: "Cotizaciones", href: "/admin/quotes", icon: CalculatorIcon },
      { label: "Vuelos", href: "/admin/flights", icon: PaperAirplaneIcon },
      {
        // Correos enviados a CLIENTES (9-nov-2026, API 0.0.133), pedido de la
        // oficina: «¿en dónde veo que se enviaron? ¿desde qué correo?». Junto
        // a Cotizaciones y Vuelos, que es desde donde se mandan (a mano: el
        // correo de confirmación ya no sale solo). Roles = los que el API deja
        // leerlos, desde la fuente única `lib/admin/correo-cliente.ts` (pura).
        label: TITULO_CORREOS_ENVIADOS,
        href: "/admin/correos-enviados",
        icon: EnvelopeIcon,
        roles: [...ROLES_VEN_CORREOS_CLIENTE],
      },
      { label: "Calendario", href: "/admin/calendar", icon: CalendarIcon },
      // Tablero del día: cada escala espera su tacómetro; lo vencido se
      // deduce solo y oficina confirma/ajusta — la operación no se detiene.
      { label: "Tacómetros en vivo", href: "/admin/taco-live", icon: GaugeIconAlias },
      {
        // TODO el dinero que entra (24-sep-2026): cobros de vuelos (solo
        // lectura), anticipos, otros ingresos y la conciliación de ABONOS.
        // Justo antes de «Gastos» y con sus mismos roles.
        label: "Ingresos",
        href: "/admin/ingresos",
        icon: ArrowTrendingUpIcon,
        // Solo Dirección (invariante 122): ADMIN salió; = `ROLES_INGRESOS`.
        roles: ["DIRECCION", "COORDINADOR", "FACTURACION"],
      },
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
        // Nómina (15-oct-2026), pedido del cliente: «Necesitamos un nuevo
        // espacio debajo de Gastos y Otros Gastos que se llame Nomina para
        // tener en ese apartado todo lo de nomina». Los gastos de categoría
        // NOMINA del mes. Roles desde la fuente única `lib/admin/nomina.ts`
        // (pura: sin React); además entra quien tenga el acceso POR PERSONA
        // que da Dirección en Configuración (`permisos.nomina`).
        label: TITULO_NOMINA,
        href: "/admin/nomina",
        icon: UserGroupIcon,
        roles: [...ROLES_NOMINA],
        permiso: "nomina",
      },
      {
        // Gastos PERSONALES del dueño (PERSONAL_DUENO): dinero personal, no
        // de la empresa — fuera de balances/reparto/cierre. Sin FACTURACION.
        // Solo Dirección (invariante 122 del API): ADMIN salió. Roles desde
        // la fuente única `lib/admin/roles.ts`; además entra quien tenga el
        // acceso POR PERSONA que da Dirección en Configuración
        // (`permisos.gastos_personales`, 12-nov-2026, API 0.0.138).
        label: "Gastos personales",
        href: "/admin/gastos-personales",
        icon: WalletIcon,
        roles: [...ROLES_GASTOS_PERSONALES],
        permiso: "gastos_personales",
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
        // DOS pantallas (6-nov-2026, pedido del dueño: «separar en dos
        // pantallas el inventario y las compras o gastos de la tienda»):
        // «Inventario» = la bodega (existencias, salidas, cardex) y «Compras
        // de la tienda» = lo que se compra y lo que se paga por ello (compra
        // directa, pedidos por recibir, gastos de compras). Antes era un solo
        // ítem «Inventario/Tienda» (12-oct-2026). `itemNavActivo` enciende
        // solo el más específico (la ruta de compras cuelga de la de bodega).
        label: "Inventario",
        href: "/admin/inventory",
        icon: ArchiveBoxIcon,
        roles: ["ADMIN", "COORDINADOR", "MECANICO", "SOCIO"],
      },
      {
        label: "Compras de la tienda",
        href: "/admin/inventory/compras",
        icon: ShoppingCartIcon,
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
        // Registro de las facturas que hace facturación A MANO (24-sep-2026,
        // pedido de Ale) + «Por facturar» (solicitudes de «Necesito factura»,
        // pedido de Itzi). El badge es el número por facturar.
        label: "Facturas emitidas",
        href: "/admin/facturas-emitidas",
        icon: DocumentCheckIcon,
        roles: ["ADMIN", "FACTURACION"],
        badge: "por_facturar",
      },
      {
        // Timbrado AUTOMÁTICO vía PAC: la página no cambia; solo se renombra
        // para no confundirla con el registro manual de arriba.
        label: "Facturación automática",
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
        // Solo Dirección (invariante 122): ADMIN salió.
        roles: ["DIRECCION", "ANALISTA", "SOCIO"],
      },
      {
        // Cuenta corriente de cada socio (1-oct-2026, API 0.0.50): generado,
        // entregado, por entregar y la relación de entregas con comprobante.
        // FACTURACION entra aquí aunque no vea el reparto (registra entregas).
        label: "Pagos a socios",
        href: "/admin/profit-sharing/socios",
        icon: UserGroupIcon,
        // Solo Dirección (invariante 122): ADMIN salió.
        roles: ["DIRECCION", "FACTURACION", "ANALISTA", "SOCIO"],
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

/**
 * ¿El ítem del menú está activo en `pathname`? Gana el href MÁS LARGO que
 * coincide (1-oct-2026): «Pagos a socios» (`/admin/profit-sharing/socios`)
 * vive DENTRO de «Reparto de utilidades» (`/admin/profit-sharing`) y, con un
 * simple «empieza con», los dos salían marcados a la vez.
 */
export function itemNavActivo(
  pathname: string,
  href: string,
  hrefs: readonly string[] = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href)),
): boolean {
  const coincide = (h: string) =>
    h === "/admin" ? pathname === "/admin" : pathname === h || pathname.startsWith(`${h}/`);
  if (!coincide(href)) return false;
  return !hrefs.some((h) => h !== href && h.length > href.length && coincide(h));
}

/**
 * DIRECCIÓN ve TODO el menú (6-nov-2026, invariante 122 del API): es el
 * superconjunto de ADMIN y el API le deja pasar cualquier ruta, así que las
 * listas `roles` no necesitan nombrarla. Los demás roles, por su lista — o,
 * en los ítems con `permiso`, por el permiso POR PERSONA que trae `/me`
 * (12-nov-2026: «Nómina» y «Gastos personales» para quien Dirección le dio
 * ese acceso; cada ítem mira SOLO su permiso). Sin rol conocido ningún
 * permiso abre nada.
 */
export function filterNavGroupsForRole(
  rol: Rol | undefined,
  permisos?: PermisosMe | null,
): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter(
      (it) =>
        esDireccion(rol) ||
        !it.roles ||
        (rol && it.roles.includes(rol)) ||
        (rol != null && it.permiso != null && permisos?.[it.permiso] === true),
    ),
  })).filter((g) => g.items.length > 0);
}
