/**
 * «Editar datos» del piloto (2-oct-2026): fuente única del botón, los textos,
 * el cuerpo del PATCH en los dos modos del diálogo y la traducción de errores.
 */
import { describe, expect, it } from "vitest";
import type { User } from "@/types/users";
import { APODO_API_VIEJO } from "@/lib/admin/usuario-apodo";
import { MSG_SERVIDOR_NO_RESPONDIO } from "@/lib/admin/errores-tecnicos";
import {
  BOTON_EDITAR_PILOTO,
  CAMPOS_MODO_PILOTO,
  DESCRIPCION_DIALOGO_PILOTO,
  HINT_TARJETA_PILOTO,
  MSG_EDITAR_PILOTO_API_VIEJO,
  MSG_SOLO_ADMIN_EDITA_USUARIOS,
  MSG_TARJETA_DE_OTRO_USUARIO,
  TOAST_PILOTO_ACTUALIZADO,
  cuerpoActualizarPiloto,
  mensajeErrorEditarPiloto,
  opcionesTarjetaPiloto,
  payloadModoPiloto,
  payloadModoUsuario,
  puedeEditarPiloto,
  tarjetaParaPayload,
  tituloDialogoPiloto,
  usuarioParaEdicion,
} from "../pilotos-edicion";

const ZAMORA: User = {
  id: "a0a0a0a0-0000-4000-8000-000000000002",
  supabase_auth_id: "auth-z",
  email: "zamora@vuelatour.com",
  nombre: "Abraham Zamora",
  rol: "PILOTO",
  estado: "ACTIVO",
  tiene_fondo_caja: true,
  tarjeta_terminacion: "0593",
  es_piloto: true,
  es_piloto_externo: false,
  telefono: "+52 9981234567",
  apodo: "Zamora",
  avatar_url: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

describe("puedeEditarPiloto", () => {
  it("ADMIN y COORDINADOR sí; sin /me (null/undefined) se OFRECE; los demás no", () => {
    expect(puedeEditarPiloto("ADMIN")).toBe(true);
    expect(puedeEditarPiloto("COORDINADOR")).toBe(true);
    expect(puedeEditarPiloto(null)).toBe(true);
    expect(puedeEditarPiloto(undefined)).toBe(true);
    for (const rol of ["FACTURACION", "ANALISTA", "SOCIO", "PILOTO", "MECANICO", "VISITANTE"] as const) {
      expect(puedeEditarPiloto(rol)).toBe(false);
    }
  });
});

describe("textos", () => {
  it("botón, título, hint de tarjeta y toast", () => {
    expect(BOTON_EDITAR_PILOTO).toBe("Editar datos");
    expect(tituloDialogoPiloto("Abraham Zamora")).toBe("Editar datos de Abraham Zamora");
    expect(HINT_TARJETA_PILOTO).toBe(
      "Si la tarjeta nueva no aparece, primero dala de alta en Tesorería → Tarjetas corp. (solo ADMIN)",
    );
    expect(DESCRIPCION_DIALOGO_PILOTO).toContain("no modifica los gastos");
    expect(TOAST_PILOTO_ACTUALIZADO).toBe("Datos del piloto actualizados");
    expect([...CAMPOS_MODO_PILOTO]).toEqual(["nombre", "telefono", "apodo", "tarjeta_terminacion"]);
  });
});

describe("tarjetaParaPayload", () => {
  it("sin cambio no viaja; quitarla = null; cambiarla = la nueva", () => {
    expect(tarjetaParaPayload("0593", "0593")).toEqual({ cambio: false, valor: "0593" });
    expect(tarjetaParaPayload(null, "")).toEqual({ cambio: false, valor: null });
    expect(tarjetaParaPayload("0593", "")).toEqual({ cambio: true, valor: null });
    expect(tarjetaParaPayload("0593", "1111")).toEqual({ cambio: true, valor: "1111" });
    expect(tarjetaParaPayload("", "1111")).toEqual({ cambio: true, valor: "1111" });
  });
});

describe("payloadModoPiloto", () => {
  it("⊆ {nombre, telefono, apodo, tarjeta}; tarjeta y apodo solo si cambiaron", () => {
    const sinCambios = payloadModoPiloto(ZAMORA, {
      nombre: "Abraham Zamora",
      telefono: "+52 9981234567",
      apodo: "Zamora",
      tarjeta_terminacion: "0593",
    });
    expect(sinCambios).toEqual({ nombre: "Abraham Zamora", telefono: "+52 9981234567" });

    const conCambios = payloadModoPiloto(ZAMORA, {
      nombre: "Abraham Zamora",
      telefono: "+52 9981234567",
      apodo: "  Zam  ",
      tarjeta_terminacion: "1111",
    });
    expect(conCambios).toEqual({
      nombre: "Abraham Zamora",
      telefono: "+52 9981234567",
      apodo: "Zam",
      tarjeta_terminacion: "1111",
    });
    for (const k of Object.keys(conCambios)) {
      expect(CAMPOS_MODO_PILOTO as readonly string[]).toContain(k);
    }
  });

  it("vaciar tarjeta o apodo manda null explícito (quitar)", () => {
    expect(
      payloadModoPiloto(ZAMORA, { nombre: "Abraham Zamora", apodo: "", tarjeta_terminacion: "" }),
    ).toEqual({ nombre: "Abraham Zamora", apodo: null, tarjeta_terminacion: null });
  });
});

describe("payloadModoUsuario", () => {
  const base = {
    nombre: "Abraham Zamora",
    rol: "PILOTO",
    estado: "ACTIVO",
    tarjeta_terminacion: "0593",
    apodo: "Zamora",
    es_piloto: true,
    es_piloto_externo: false,
    telefono: "+52 9981234567",
    avatar_url: "",
  };

  it("tiene_fondo_caja NUNCA viaja; banderas sin cambio no viajan", () => {
    const p = payloadModoUsuario(ZAMORA, { ...base, tiene_fondo_caja: false });
    expect(p).not.toHaveProperty("tiene_fondo_caja");
    expect(p).not.toHaveProperty("es_piloto");
    expect(p).not.toHaveProperty("es_piloto_externo");
    expect(p).not.toHaveProperty("tarjeta_terminacion");
    expect(p).not.toHaveProperty("apodo");
    expect(p).toMatchObject({ nombre: "Abraham Zamora", rol: "PILOTO", estado: "ACTIVO" });
  });

  it("es_piloto / es_piloto_externo viajan SOLO si cambiaron", () => {
    const p = payloadModoUsuario(ZAMORA, { ...base, es_piloto: false, es_piloto_externo: true });
    expect(p.es_piloto).toBe(false);
    expect(p.es_piloto_externo).toBe(true);
  });

  it("servidor sin es_piloto: jamás viaja (un false por omisión quitaría el doble rol)", () => {
    const sinDato: User = { ...ZAMORA };
    delete sinDato.es_piloto;
    const p = payloadModoUsuario(sinDato, { ...base, es_piloto: false });
    expect(p).not.toHaveProperty("es_piloto");
  });

  it("tarjeta y apodo con el mismo trato que el modo piloto", () => {
    const p = payloadModoUsuario(ZAMORA, { ...base, tarjeta_terminacion: "", apodo: "" });
    expect(p.tarjeta_terminacion).toBeNull();
    expect(p.apodo).toBeNull();
  });
});

describe("cuerpoActualizarPiloto", () => {
  it("solo los 4 campos, sin \"\"/undefined, conserva null y normaliza el apodo", () => {
    expect(
      cuerpoActualizarPiloto({
        nombre: "Abraham Zamora",
        telefono: "",
        apodo: "  Za   m ",
        tarjeta_terminacion: null,
        rol: "ADMIN",
        tiene_fondo_caja: true,
      }),
    ).toEqual({ nombre: "Abraham Zamora", apodo: "Za m", tarjeta_terminacion: null });
    expect(cuerpoActualizarPiloto({ nombre: "X", apodo: "   " })).toEqual({ nombre: "X", apodo: null });
    expect(cuerpoActualizarPiloto({ nombre: "X", apodo: null })).toEqual({ nombre: "X", apodo: null });
  });
});

describe("opcionesTarjetaPiloto", () => {
  it("libres o del piloto; sin dato del dueño se ofrece", () => {
    const opciones = [
      { terminacion: "0593", nombre_titular: "Zamora", usuario_id: ZAMORA.id },
      { terminacion: "0585", nombre_titular: "Cáceres", usuario_id: "c0c0" },
      { terminacion: "1111", nombre_titular: "Libre", usuario_id: null },
      { terminacion: "2222", nombre_titular: "API viejo" },
    ];
    expect(opcionesTarjetaPiloto(opciones, ZAMORA.id).map((o) => o.terminacion)).toEqual([
      "0593",
      "1111",
      "2222",
    ]);
  });
});

describe("usuarioParaEdicion", () => {
  it("solo campos de User (no stats ni vuelos) y conserva la AUSENCIA de es_piloto/apodo", () => {
    const ficha = { ...ZAMORA, stats: { vuelos_mes: 3 }, vuelos_proximos: [] } as unknown as User;
    const u = usuarioParaEdicion(ficha);
    expect(u).not.toHaveProperty("stats");
    expect(u).not.toHaveProperty("vuelos_proximos");
    expect(u.es_piloto).toBe(true);
    expect(u.apodo).toBe("Zamora");

    const viejo = { ...ZAMORA } as User;
    delete viejo.es_piloto;
    delete viejo.apodo;
    const v = usuarioParaEdicion(viejo);
    expect(v).not.toHaveProperty("es_piloto");
    expect(v).not.toHaveProperty("apodo");
  });
});

describe("mensajeErrorEditarPiloto", () => {
  it("403 de negocio ⇒ el texto del API (o su respaldo si llegó técnico)", () => {
    expect(
      mensajeErrorEditarPiloto({
        status: 403,
        code: "SOLO_ADMIN_EDITA_USUARIOS",
        error: "Ese usuario es de oficina: solo un ADMIN lo edita",
      }),
    ).toBe("Ese usuario es de oficina: solo un ADMIN lo edita");
    expect(
      mensajeErrorEditarPiloto({
        status: 403,
        code: "TARJETA_DE_OTRO_USUARIO",
        error: "Esa tarjeta es de Luis Cáceres: un ADMIN la reasigna desde Tarjetas corp.",
      }),
    ).toBe("Esa tarjeta es de Luis Cáceres: un ADMIN la reasigna desde Tarjetas corp.");
    expect(mensajeErrorEditarPiloto({ status: 403, code: "SOLO_ADMIN_EDITA_USUARIOS", error: "Forbidden" })).toBe(
      MSG_SOLO_ADMIN_EDITA_USUARIOS,
    );
    expect(mensajeErrorEditarPiloto({ status: 403, code: "TARJETA_DE_OTRO_USUARIO", error: "" })).toBe(
      MSG_TARJETA_DE_OTRO_USUARIO,
    );
  });

  it("403 sin código de negocio (RolesGuard de un API viejo) ⇒ falta actualizar el servidor", () => {
    expect(
      mensajeErrorEditarPiloto({
        status: 403,
        code: "FORBIDDEN",
        error: "Required role: ADMIN. Current: COORDINADOR",
      }),
    ).toBe(MSG_EDITAR_PILOTO_API_VIEJO);
    expect(mensajeErrorEditarPiloto({ status: 403 })).toBe(MSG_EDITAR_PILOTO_API_VIEJO);
    expect(MSG_EDITAR_PILOTO_API_VIEJO).toMatch(/^Tu usuario todavía no puede editar datos de pilotos \(falta actualizar el servidor\)/);
  });

  it("técnico ⇒ «El servidor no respondió…»; apodo con API viejo ⇒ su aviso; lo demás tal cual", () => {
    expect(mensajeErrorEditarPiloto({ status: 502, code: "PARSE_ERROR", error: "Bad Gateway" })).toBe(
      MSG_SERVIDOR_NO_RESPONDIO,
    );
    expect(mensajeErrorEditarPiloto({ error: "fetch failed" })).toBe(MSG_SERVIDOR_NO_RESPONDIO);
    expect(mensajeErrorEditarPiloto({ status: 400, error: "property apodo should not exist" })).toBe(APODO_API_VIEJO);
    const tarjeta =
      "La tarjeta **** 9999 no está registrada (o está inactiva) en Tarjetas corp.: regístrala primero o deja el campo vacío.";
    expect(mensajeErrorEditarPiloto({ status: 400, code: "BAD_REQUEST", error: tarjeta })).toBe(tarjeta);
  });
});
