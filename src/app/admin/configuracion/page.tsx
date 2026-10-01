import { LockClosedIcon } from "@heroicons/react/24/outline";
import { ConfiguracionClient } from "@/components/admin/configuracion/configuracion-client";
import { IaCreditosSection } from "@/components/admin/configuracion/ia-creditos-section";
import { ResponsablesFacturacionSection } from "@/components/admin/configuracion/responsables-facturacion-section";
import {
  EditoresCotizacionCobradaSection,
  type CandidatoEditor,
} from "@/components/admin/configuracion/editores-cotizacion-cobrada-section";
import { AvisoDegradado } from "@/components/admin/aviso-degradado";
import { getResponsablesFacturacion } from "@/lib/api/facturas-emitidas-server";
import { isApiError } from "@/lib/api/errors";
import { esErrorDeNext } from "@/lib/api/degradar";
import { esNoDisponible } from "@/lib/admin/facturas-emitidas";
import { EmptyState } from "@/components/admin/empty-state";
import {
  getConfiguracion,
  getEditoresCotizacionCobrada,
} from "@/lib/api/configuracion-server";
import { listUsers } from "@/lib/api/users-server";
import { ROLES_EDITAN_COTIZACION } from "@/lib/admin/quote-sheet-interna";
import { getIaUso, rangoDelMes } from "@/lib/api/ia-uso-server";
import {
  consumoEnRangoIa,
  rangoCubre,
  rangoUltimosDiasIa,
} from "@/lib/admin/ia-saldo";
import { getMe } from "@/lib/api/me";
import { todayCancun } from "@/lib/datetime";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ mes?: string }>;
}

export default async function ConfiguracionPage({ searchParams }: PageProps) {
  // Solo ADMIN puede cambiar la configuración: sin este gate la página se
  // renderizaba operable para otros roles (GET /config es abierto a propósito
  // para la app) y el 403 recién aparecía al confirmar el switch.
  const me = await getMe();
  if (me.rol !== "ADMIN") {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">Administración</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Configuración
          </h1>
        </div>
        <EmptyState
          icon={LockClosedIcon}
          title="Solo administradores"
          description="La configuración global del sistema solo la puede cambiar un usuario con rol ADMIN."
        />
      </div>
    );
  }

  // Mes del consumo de IA: default = mes corriente en HORA CANCÚN (el día 1
  // en la madrugada UTC aún es el mes anterior para la operación). Un mes
  // inválido o futuro en la URL cae al corriente.
  const sp = await searchParams;
  const mesActual = todayCancun().slice(0, 7);
  const mes =
    sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) && sp.mes <= mesActual
      ? sp.mes
      : mesActual;
  const rango = rangoDelMes(mes);
  // Ritmo de consumo de IA (aviso de saldo bajo, 1-oct-2026): los últimos 7
  // días Cancún. El API no lo manda; sale del `por_dia` del mes que ya se
  // pide cuando lo contiene, y si no (otro mes en pantalla, o los días 1–6
  // del mes) de una lectura aparte de esos 7 días. Best-effort como el
  // resto de la sección: sin dato, el aviso no dice «N días».
  const ultimos7 = rangoUltimosDiasIa(todayCancun());
  const mesCubre7Dias = rangoCubre(rango, ultimos7);

  // getIaUso es best-effort (.catch → null): un fallo del registro de IA
  // JAMÁS tumba la página de banderas.
  // Responsables de facturación (24-sep-2026): ACCESORIO. Sin la migración
  // (503) la sección lo dice en gris; otro fallo se AVISA arriba.
  const faltantes: string[] = [];
  // EDITAN COTIZACIONES COBRADAS (26-sep-2026, API 0.0.37): ACCESORIO. Un
  // 404 es un API previo (la sección lo dice en gris, sin avisar arriba);
  // otro fallo se AVISA. Los candidatos salen de `/v1/users` (oficina activa
  // que puede guardar cotizaciones) salvo que el API mande los suyos.
  const [flags, iaUso, iaUso7Dias, responsables, editoresCarga, usuariosActivos] = await Promise.all([
    getConfiguracion(),
    getIaUso(rango.desde, rango.hasta),
    mesCubre7Dias ? Promise.resolve(null) : getIaUso(ultimos7.desde, ultimos7.hasta),
    getResponsablesFacturacion().catch((e: unknown) => {
      if (esErrorDeNext(e)) throw e;
      if (!(isApiError(e) && esNoDisponible(e))) {
        console.error("[admin] no se pudo cargar los responsables de facturación", e);
        faltantes.push("los responsables de facturación");
      }
      return null;
    }),
    getEditoresCotizacionCobrada().then(
      (datos) => ({ datos, noDisponible: false }),
      (e: unknown) => {
        if (esErrorDeNext(e)) throw e;
        const noDisponible = isApiError(e) && e.status === 404;
        if (!noDisponible) {
          console.error("[admin] no se pudo cargar quién edita cotizaciones cobradas", e);
          faltantes.push("quién edita cotizaciones cobradas");
        }
        return { datos: null, noDisponible };
      },
    ),
    listUsers({ estado: "ACTIVO", limit: 200 }).catch((e: unknown) => {
      if (esErrorDeNext(e)) throw e;
      console.error("[admin] no se pudo cargar los usuarios de oficina", e);
      return null;
    }),
  ]);

  const consumo7dUsd = consumoEnRangoIa(
    (mesCubre7Dias ? iaUso : iaUso7Dias)?.por_dia,
    ultimos7,
  );

  const editores = editoresCarga.datos;
  // Candidatos al permiso: la oficina activa que puede GUARDAR una cotización
  // (`ROLES_EDITAN_COTIZACION`, espejo del `@Roles` de revise — el API solo
  // da `/me.permisos` a esos roles, así que ofrecérselo a Facturación sería
  // un switch que no hace nada) más quien YA está en la lista y sigue activo
  // (no se anuncia como «dado de baja»). Fuente: los `candidatos` del API
  // (oficina activa); con un API que no los mande, `/v1/users`. Sin ninguno
  // de los dos, al menos los ya elegidos (para poder quitarlos) y se avisa.
  const yaElegidos = new Set(editores?.usuario_ids ?? []);
  const puedeSerEditor = (u: { id: string; rol?: string }) =>
    (u.rol != null && ROLES_EDITAN_COTIZACION.has(u.rol)) || yaElegidos.has(u.id);
  let candidatosEditores: CandidatoEditor[] = [];
  if (editores?.candidatos) {
    candidatosEditores = editores.candidatos.filter(puedeSerEditor);
  } else if (usuariosActivos) {
    candidatosEditores = usuariosActivos.data
      .filter((u) => puedeSerEditor(u) && !u.es_piloto_externo)
      .map((u) => ({ id: u.id, nombre: u.nombre, rol: u.rol }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es-MX"));
  } else if (editores) {
    candidatosEditores = editores.usuarios.map((u) => ({ id: u.id, nombre: u.nombre }));
    if (editores.puede_modificar) faltantes.push("los usuarios de oficina");
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Administración</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Configuración
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Banderas globales de comportamiento del sistema. Los cambios aplican
          a toda la operación.
        </p>
      </div>

      <AvisoDegradado faltantes={faltantes} />

      <ConfiguracionClient initial={flags} />

      <ResponsablesFacturacionSection
        datos={responsables}
        // Falla de carga ≠ «falta la migración»: la sección no debe decir
        // «Disponible cuando se habilite…» cuando solo no se pudo leer.
        fallo={faltantes.includes("los responsables de facturación")}
      />

      <EditoresCotizacionCobradaSection
        // Se remonta cuando la lista GUARDADA cambia (otro editor la cambió y
        // el 409 EDITORES_CAMBIARON repintó la página): los switches arrancan
        // de lo que hay hoy, no de la selección vieja de este operador.
        key={(editores?.usuario_ids ?? []).join(",")}
        datos={editores}
        candidatos={candidatosEditores}
        meId={me.id}
        fallo={!editores && !editoresCarga.noDisponible}
      />

      <IaCreditosSection
        resumen={iaUso}
        mes={mes}
        mesActual={mesActual}
        consumo7dUsd={consumo7dUsd}
      />
    </div>
  );
}
