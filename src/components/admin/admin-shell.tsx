import { SidebarBrand } from "./sidebar-brand";
import { SidebarNav } from "./sidebar-nav";
import { SidebarFooter } from "./sidebar-footer";
import { AdminTopbar } from "./admin-topbar";
import { NotificationsProvider } from "./notifications/notifications-provider";
import { InicioOficialProvider } from "./inicio-oficial-provider";
import { AfacRealProvider } from "./afac-real-provider";
import { PagoOperadorProvider } from "./pago-operador-provider";
import { PorPagarProvider } from "./por-pagar-provider";
import { CatalogosGastoProvider } from "./catalogos-gasto-provider";
import { inicioOficialDeMe } from "@/lib/admin/inicio-oficial";
import { puedeEditarAfacReal } from "@/lib/admin/libro-afac";
import { puedeMarcarPagoOperador } from "@/lib/admin/pago-operador-externo";
import { capacidadPorPagarDeMe } from "@/lib/admin/gasto-por-pagar";
import type { MeResponse } from "@/types/me";

interface AdminShellProps {
  me: MeResponse;
  children: React.ReactNode;
}

export function AdminShell({ me, children }: AdminShellProps) {
  return (
    // Inicio oficial (16-oct-2026, API 0.0.84): sin la llave ⇒ null ⇒ como hoy.
    <InicioOficialProvider inicio={inicioOficialDeMe(me)}>
      {/* AFAC por vuelo (16-oct-2026, API 0.0.89): sin `config.afac_real` o
          sin rol de oficina ⇒ false ⇒ sin la casilla «Es pago de AFAC». */}
      <AfacRealProvider puedeMarcarPagoAfac={puedeEditarAfacReal(me)}>
        {/* «Es el pago al operador externo» (27-oct-2026, API 0.0.110): rol de
            oficina ⇒ la casilla en los gastos de vuelos cubiertos por externo. */}
        <PagoOperadorProvider puedeMarcar={puedeMarcarPagoOperador(me)}>
        {/* Gastos por pagar (19-oct-2026, API 0.0.95): sin
            `config.gastos_por_pagar` ⇒ sin capacidad ⇒ todo como antes. */}
        <PorPagarProvider capacidad={capacidadPorPagarDeMe(me)}>
        {/* Cuenta y proveedor en línea desde el gasto (20-oct-2026, API
            0.0.100): el rol decide si se ofrece agregar/corregir. */}
        <CatalogosGastoProvider rol={me.rol ?? null}>
        <NotificationsProvider currentUserId={me.id}>
          <div className="min-h-screen bg-background">
            {/* Sidebar desktop fija */}
            <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-navy-900 border-r border-navy-800 text-white">
              <SidebarBrand />
              <SidebarNav rol={me.rol} />
              <SidebarFooter />
            </aside>

            {/* Main column con offset por sidebar */}
            <div className="lg:pl-64 flex flex-col min-h-screen">
              <AdminTopbar me={me} />
              <main className="flex-1 px-4 lg:px-6 py-6 lg:py-8">{children}</main>
            </div>
          </div>
        </NotificationsProvider>
        </CatalogosGastoProvider>
        </PorPagarProvider>
        </PagoOperadorProvider>
      </AfacRealProvider>
    </InicioOficialProvider>
  );
}
