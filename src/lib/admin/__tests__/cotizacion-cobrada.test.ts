import { describe, expect, it } from "vitest";
import {
  apiConPermisosPorPersona,
  CHIP_EDICION_CON_COBROS,
  diffEditores,
  errorEditoresPideRecargar,
  mensajeErrorEditores,
  nombresEditores,
  nombresParaRazon,
  PREFIJO_MOTIVO_CON_COBROS,
  puedeEditarCotizacionCobrada,
  resumenGuardadoConCobros,
  saldoTrasEdicion,
  textoBandaEdicionConCobros,
  textoCobrosSinTc,
  textoConfirmarEdicionConCobros,
  textoConfirmarEditores,
  textoSaldoTrasEdicion,
} from "@/lib/admin/cotizacion-cobrada";

/**
 * EDITAR UNA COTIZACIÓN COBRADA con permiso por persona (26-sep-2026, API
 * 0.0.37). El caso del audio: #317 cotizada por transferencia (con IVA) en
 * $754 USD y cobrada en EFECTIVO por $600 USD; «si no, dice que es un cobro
 * parcial porque sigue pensando que falta el IVA».
 */

const ALE = "c691cc8b-3034-4f04-a383-d0b25c1971ec";
const PABLO = "e5aa04a8-ac24-446a-b41d-9af5917cd4f1";
const VILLALOBOS = "11111111-2222-3333-4444-555555555555";

describe("permiso desde /me", () => {
  it("solo `permisos.editar_cotizacion_cobrada === true` da el permiso", () => {
    expect(puedeEditarCotizacionCobrada({ permisos: { editar_cotizacion_cobrada: true } })).toBe(true);
    expect(puedeEditarCotizacionCobrada({ permisos: { editar_cotizacion_cobrada: false } })).toBe(false);
    expect(puedeEditarCotizacionCobrada({ permisos: {} })).toBe(false);
    // API previo (sin `permisos`): todo como hoy.
    expect(puedeEditarCotizacionCobrada({})).toBe(false);
    expect(puedeEditarCotizacionCobrada(null)).toBe(false);
  });

  it("con API previo no se piden los nombres de la lista", () => {
    expect(apiConPermisosPorPersona({})).toBe(false);
    expect(apiConPermisosPorPersona(null)).toBe(false);
    expect(apiConPermisosPorPersona({ permisos: { editar_cotizacion_cobrada: false } })).toBe(true);
  });
});

describe("textos de la edición con cobros", () => {
  it("chip ámbar de la barra del total", () => {
    expect(CHIP_EDICION_CON_COBROS).toBe("Cobrada · editable con permiso");
  });

  it("banda ámbar: cobrado con moneda y nunca con 1 decimal", () => {
    const b = textoBandaEdicionConCobros({ cobradoUsd: 600 });
    expect(b.titulo).toBe(
      "Esta cotización ya tiene cobros por $600 USD. Tienes permiso para corregirla: al guardar cambia el total y el saldo se recalcula con los cobros que ya existen (los cobros no se modifican).",
    );
    expect(b.detalle).toBeNull();
    expect(textoBandaEdicionConCobros({ cobradoUsd: 8050.4 }).titulo).toContain("$8,050.40 USD");
  });

  it("los cobros MXN sin T.C. se dicen (no entran en la suma)", () => {
    expect(textoBandaEdicionConCobros({ cobradoUsd: 0, cobrosSinTc: 2 }).detalle).toBe(
      "Hay 2 cobros en MXN sin tipo de cambio: no entran en el cobrado ni en el saldo.",
    );
    expect(textoCobrosSinTc(1)).toBe(
      "Hay 1 cobro en MXN sin tipo de cambio: no entra en el cobrado ni en el saldo.",
    );
    expect(textoCobrosSinTc(0)).toBeNull();
    expect(textoCobrosSinTc(null)).toBeNull();
  });

  it("confirmación única: folio y cobrado; con tripulación, UN solo texto", () => {
    const t = textoConfirmarEdicionConCobros({ folio: 317, cobradoUsd: 600 });
    expect(t.titulo).toBe("La cotización #317 ya tiene cobros. ¿Corregirla?");
    expect(t.cuerpo).toContain("Ya se cobraron $600 USD.");
    expect(t.cuerpo).toContain("Los cobros NO se modifican.");
    const conTripulacion = textoConfirmarEdicionConCobros({
      folio: 317,
      cobradoUsd: 600,
      cuerpoTripulacion: "El vuelo #317 está confirmado.",
    });
    expect(conTripulacion.cuerpo.endsWith("Los cobros NO se modifican. El vuelo #317 está confirmado.")).toBe(
      true,
    );
    expect(textoConfirmarEdicionConCobros({ folio: null, cobradoUsd: 1 }).titulo).toBe(
      "La cotización ya tiene cobros. ¿Corregirla?",
    );
  });

  it("el prefijo del motivo es espejo del API", () => {
    expect(PREFIJO_MOTIVO_CON_COBROS).toBe("[Con cobros · permiso especial] ");
  });
});

describe("saldo al guardar: total del motor − cobrado del API", () => {
  it("#317: quitar el IVA deja la cotización liquidada con el cobro en efectivo", () => {
    expect(saldoTrasEdicion(600, 600)).toEqual({ tipo: "liquidada", montoUsd: 0 });
    const r = resumenGuardadoConCobros({ totalAntesUsd: 754, totalNuevoUsd: 600, cobradoUsd: 600 });
    expect(r.total).toBe("Total $754 → $600 USD");
    expect(r.cobrado).toBe("Cobrado $600 USD (no cambia)");
    expect(r.saldoTexto).toBe("Saldo nuevo $0 USD · liquidada");
  });

  it("si el total sigue arriba de lo cobrado queda saldo", () => {
    const s = saldoTrasEdicion(754, 600);
    expect(s).toEqual({ tipo: "saldo", montoUsd: 154 });
    expect(textoSaldoTrasEdicion(s)).toBe("Saldo nuevo $154 USD");
  });

  it("si lo cobrado rebasa el total nuevo es SOBRECOBRO", () => {
    const s = saldoTrasEdicion(600, 754.5);
    expect(s).toEqual({ tipo: "sobrecobro", montoUsd: 154.5 });
    expect(textoSaldoTrasEdicion(s)).toBe("Sobrecobro $154.50 USD");
  });

  it("la tolerancia de redondeo (1 USD) vale en los dos sentidos", () => {
    expect(saldoTrasEdicion(600.4, 600).tipo).toBe("liquidada");
    expect(saldoTrasEdicion(600, 600.9).tipo).toBe("liquidada");
    expect(saldoTrasEdicion(601.5, 600).tipo).toBe("saldo");
    expect(saldoTrasEdicion(600, 601.5).tipo).toBe("sobrecobro");
  });

  it("sin cambio de total lo dice (no «$600 → $600»)", () => {
    const r = resumenGuardadoConCobros({ totalAntesUsd: 600, totalNuevoUsd: 600.001, cobradoUsd: 500 });
    expect(r.total).toBe("Total $600 USD (sin cambio)");
    expect(r.saldoTexto).toBe("Saldo nuevo $100 USD");
  });
});

describe("Configuración · «Editan cotizaciones cobradas»", () => {
  const datos = {
    usuario_ids: [ALE, PABLO],
    usuarios: [
      { id: PABLO, nombre: "Pablo Canales" },
      { id: ALE, nombre: "Alejandro Canales" },
    ],
  };

  it("nombres en el orden de la lista; un id sin nombre no se nombra en la razón", () => {
    expect(nombresEditores(datos)).toEqual(["Alejandro Canales", "Pablo Canales"]);
    const conBaja = { ...datos, usuario_ids: [ALE, "zzz", PABLO] };
    expect(nombresEditores(conBaja)).toEqual([
      "Alejandro Canales",
      "usuario dado de baja",
      "Pablo Canales",
    ]);
    expect(nombresParaRazon(conBaja)).toEqual(["Alejandro Canales", "Pablo Canales"]);
    expect(nombresParaRazon(null)).toEqual([]);
    // Un FACTURACION en la lista no se nombra (no puede guardar cotizaciones;
    // el 409 del API tampoco lo nombra).
    expect(
      nombresParaRazon({
        ...datos,
        candidatos: [
          { id: ALE, nombre: "Alejandro Canales", rol: "ADMIN" },
          { id: PABLO, nombre: "Pablo Canales", rol: "FACTURACION" },
        ],
      }),
    ).toEqual(["Alejandro Canales"]);
    // Con candidatos (oficina ACTIVA) solo se nombra a quien sigue activo —
    // el mismo criterio del 409 del API.
    expect(
      nombresParaRazon({ ...datos, candidatos: [{ id: PABLO, nombre: "Pablo Canales", rol: "ADMIN" }] }),
    ).toEqual(["Pablo Canales"]);
  });

  it("diff de la lista: quién entra y quién sale", () => {
    expect(diffEditores([ALE, PABLO], [ALE, VILLALOBOS])).toEqual({
      agregados: [VILLALOBOS],
      quitados: [PABLO],
    });
    expect(diffEditores([ALE], [ALE])).toEqual({ agregados: [], quitados: [] });
  });

  it("la confirmación nombra a quién se le da y a quién se le quita; quitarse a sí mismo se advierte", () => {
    expect(
      textoConfirmarEditores({
        agregados: ["Alejandro Villalobos"],
        quitados: ["Pablo Canales"],
        meQuito: false,
      }),
    ).toBe(
      "Podrán editar cotizaciones cobradas: Alejandro Villalobos. Dejarán de poder editarlas: Pablo Canales.",
    );
    expect(
      textoConfirmarEditores({ agregados: [], quitados: ["Alejandro Canales"], meQuito: true }),
    ).toContain("Te estás quitando a ti");
  });

  it("los errores del PUT: manda el texto del API; sin texto, uno por código", () => {
    expect(mensajeErrorEditores("SOLO_EDITORES_COTIZACION_COBRADA")).toBe(
      "Solo quien ya puede editar cotizaciones cobradas puede cambiar esta lista.",
    );
    expect(mensajeErrorEditores("LISTA_VACIA")).toContain("no puede quedar vacía");
    expect(mensajeErrorEditores("USUARIOS_INVALIDOS", "  ")).toContain("ya no está activo");
    expect(mensajeErrorEditores("EDITORES_CAMBIARON")).toContain("Alguien más cambió la lista");
    expect(
      mensajeErrorEditores(
        "SOLO_EDITORES_COTIZACION_COBRADA",
        "Solo quien ya puede editar cotizaciones cobradas puede cambiar esta lista (Alejandro Canales, Pablo Canales).",
      ),
    ).toContain("(Alejandro Canales, Pablo Canales)");
    expect(mensajeErrorEditores("OTRO", "Falló la red")).toBe("Falló la red");
    expect(mensajeErrorEditores(undefined)).toBe("No se pudo guardar la lista.");
  });

  it("403/400 de validez y el 409 del CAS repintan la sección; LISTA_VACIA no", () => {
    expect(errorEditoresPideRecargar("EDITORES_CAMBIARON")).toBe(true);
    expect(errorEditoresPideRecargar("USUARIOS_INVALIDOS")).toBe(true);
    expect(errorEditoresPideRecargar("SOLO_EDITORES_COTIZACION_COBRADA")).toBe(true);
    expect(errorEditoresPideRecargar("LISTA_VACIA")).toBe(false);
    expect(errorEditoresPideRecargar(undefined)).toBe(false);
  });
});
