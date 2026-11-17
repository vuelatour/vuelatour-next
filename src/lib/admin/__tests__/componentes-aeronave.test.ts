/**
 * COMPONENTES CON VIDA LÍMITE (17-nov-2026, API 0.0.140). Pedido del cliente:
 * «saber cuánto tiempo le queda a un foco, a una llanta».
 *
 * Lo que le queda lo CALCULA el API (`vida`); aquí se congela cómo se dice y
 * cómo se pinta, y que el formulario mande al API exactamente lo que el
 * operador ve.
 */
import { describe, expect, it } from "vitest";
import {
  ETIQUETA_ESTADO_VIDA,
  TEXTO_A_CONDICION,
  etiquetaLimite,
  lineasRestante,
  mensajeErrorComponente,
  numeroDeTexto,
  payloadComponente,
  payloadReemplazo,
  payloadRetiro,
  porcentajeVidaUsada,
  resumenComponentes,
  textoConfirmarEliminar,
  textoConfirmarReemplazo,
  textoConfirmarRetiro,
  textoEnServicio,
  textoFaltante,
  textoIdentificacion,
  textoInstalacion,
  textoMosaicoComponentes,
  textoRestanteFecha,
  textoRestanteHoras,
  textoRetiro,
  textoSustitucion,
  textoTiempoTranscurrido,
  tituloComponente,
  tonoVida,
  validarComponente,
  validarReemplazo,
  validarRetiro,
  valoresComponente,
  valoresReemplazo,
  valoresRetiro,
} from "../componentes-aeronave";
import type { ComponenteAeronave, VidaComponente } from "@/types/engineering";

const vida = (p: Partial<VidaComponente> = {}): VidaComponente => ({
  horas_en_servicio: 379.5,
  horas_restantes: 120.5,
  vence_el: "2027-03-12",
  dias_restantes: 115,
  dias_en_servicio: 250,
  estado: "VIGENTE",
  por: "HORAS",
  faltantes: [],
  ...p,
});

const comp = (p: Partial<ComponenteAeronave> = {}): ComponenteAeronave => ({
  id: "c-1",
  aeronave_id: "a-1",
  nombre: "Llanta principal",
  categoria: "Tren de aterrizaje",
  posicion: "Izquierda",
  numero_parte: "6.00-6",
  numero_serie: "A123",
  fabricante: "Goodyear",
  fecha_instalacion: "2026-03-12",
  horas_aeronave_instalacion: 5480.2,
  horas_previas: 0,
  limite_horas: 500,
  limite_meses: 12,
  fecha_vencimiento: null,
  aviso_horas: 10,
  aviso_dias: 30,
  notas: null,
  estado: "INSTALADO",
  fecha_retiro: null,
  horas_aeronave_retiro: null,
  motivo_retiro: null,
  reemplaza_a_id: null,
  reemplazado_por_id: null,
  created_at: "2026-03-12T15:00:00Z",
  updated_at: "2026-03-12T15:00:00Z",
  actualizado_por_nombre: null,
  vida: vida(),
  ...p,
});

describe("lo que le queda (lo calcula el API; aquí se redacta)", () => {
  it("por horas: «faltan 120.5 h» / «vencido por 3.2 h»", () => {
    expect(textoRestanteHoras(vida())).toBe("faltan 120.5 h");
    expect(textoRestanteHoras(vida({ horas_restantes: -3.2 }))).toBe("vencido por 3.2 h");
    expect(textoRestanteHoras(vida({ horas_restantes: null }))).toBeNull();
  });

  it("por fecha: vence el…, vence hoy, venció el…", () => {
    expect(textoRestanteFecha(vida())).toBe("vence el 12/03/2027 · en 115 días");
    expect(textoRestanteFecha(vida({ dias_restantes: 1 }))).toBe(
      "vence el 12/03/2027 · en 1 día",
    );
    expect(textoRestanteFecha(vida({ dias_restantes: 0 }))).toBe("vence hoy");
    expect(textoRestanteFecha(vida({ vence_el: "2026-11-13", dias_restantes: -4 }))).toBe(
      "venció el 13/11/2026 · hace 4 días",
    );
    expect(textoRestanteFecha(vida({ vence_el: null, dias_restantes: null }))).toBeNull();
  });

  it("qué dato falta, en palabras de operador", () => {
    expect(textoFaltante("horas_aeronave_instalacion")).toBe(
      "falta capturar el Hobbs al instalar",
    );
    expect(textoFaltante("fecha_instalacion")).toBe("falta capturar la fecha de instalación");
    expect(textoFaltante("horas_aeronave")).toBe("el avión todavía no tiene horas registradas");
    expect(textoFaltante("otra_cosa")).toContain("falta un dato");
  });

  it("renglones: el que DECIDE el estado va marcado; lo que falta, aparte", () => {
    expect(lineasRestante(vida())).toEqual([
      { texto: "faltan 120.5 h", decide: true },
      { texto: "vence el 12/03/2027 · en 115 días", decide: false },
    ]);
    expect(
      lineasRestante(vida({ por: "FECHA", estado: "POR_VENCER", dias_restantes: 20 })),
    ).toEqual([
      { texto: "faltan 120.5 h", decide: false },
      { texto: "vence el 12/03/2027 · en 20 días", decide: true },
    ]);
    expect(
      lineasRestante(
        vida({
          horas_restantes: null,
          horas_en_servicio: null,
          estado: "SIN_DATOS",
          por: null,
          faltantes: ["horas_aeronave_instalacion"],
        }),
      ),
    ).toEqual([
      { texto: "vence el 12/03/2027 · en 115 días", decide: false },
      { texto: "falta capturar el Hobbs al instalar", decide: false, falta: true },
    ]);
  });

  it("sin límites ⇒ «a condición», nunca un renglón vacío", () => {
    expect(
      lineasRestante(
        vida({
          horas_restantes: null,
          vence_el: null,
          dias_restantes: null,
          estado: "SIN_LIMITE",
          por: null,
        }),
      ),
    ).toEqual([{ texto: TEXTO_A_CONDICION, decide: false }]);
  });

  it("«lleva 210.0 h · 8 meses instalado»", () => {
    expect(textoEnServicio({ horas_en_servicio: 210, dias_en_servicio: 250 })).toBe(
      "lleva 210.0 h · 8 meses instalado",
    );
    expect(textoEnServicio({ horas_en_servicio: 1234.56, dias_en_servicio: null })).toBe(
      "lleva 1,234.6 h",
    );
    expect(textoEnServicio({ horas_en_servicio: null, dias_en_servicio: 45 })).toBe(
      "lleva 45 días instalado",
    );
    expect(textoEnServicio({ horas_en_servicio: null, dias_en_servicio: null })).toBeNull();
  });

  it("tiempo transcurrido en palabras", () => {
    expect(textoTiempoTranscurrido(1)).toBe("1 día");
    expect(textoTiempoTranscurrido(59)).toBe("59 días");
    expect(textoTiempoTranscurrido(61)).toBe("2 meses");
    expect(textoTiempoTranscurrido(365)).toBe("12 meses");
    expect(textoTiempoTranscurrido(731)).toBe("2 años");
    expect(textoTiempoTranscurrido(830)).toBe("2 años 3 meses");
  });
});

describe("cada cuándo se cambia", () => {
  it("horas, meses, los dos, fecha exacta o a condición", () => {
    expect(etiquetaLimite(comp())).toBe("cada 500 h o 12 meses");
    expect(etiquetaLimite(comp({ limite_meses: null }))).toBe("cada 500 h");
    expect(etiquetaLimite(comp({ limite_horas: null }))).toBe("cada 12 meses");
    expect(etiquetaLimite(comp({ limite_horas: null, limite_meses: 1 }))).toBe("cada 1 mes");
    expect(
      etiquetaLimite(
        comp({ limite_horas: null, limite_meses: null, fecha_vencimiento: "2027-03-12" }),
      ),
    ).toBe("vence el 12/03/2027");
    // La fecha EXACTA manda sobre los meses.
    expect(etiquetaLimite(comp({ fecha_vencimiento: "2027-03-12" }))).toBe(
      "cada 500 h o el 12/03/2027",
    );
    expect(etiquetaLimite(comp({ limite_horas: 1200.5, limite_meses: null }))).toBe(
      "cada 1,200.5 h",
    );
    expect(etiquetaLimite(comp({ limite_horas: null, limite_meses: null }))).toBe(
      "a condición (sin límite)",
    );
  });
});

describe("estado, tono y barra", () => {
  it("etiquetas y colores por estado", () => {
    expect(ETIQUETA_ESTADO_VIDA.VENCIDO).toBe("Vencido");
    expect(ETIQUETA_ESTADO_VIDA.SIN_LIMITE).toBe("A condición");
    expect(tonoVida("VENCIDO")).toBe("rojo");
    expect(tonoVida("POR_VENCER")).toBe("ambar");
    expect(tonoVida("SIN_DATOS")).toBe("ambar");
    expect(tonoVida("VIGENTE")).toBe("verde");
    expect(tonoVida("SIN_LIMITE")).toBe("gris");
    expect(tonoVida(undefined)).toBe("gris");
  });

  it("barra: lo usado entre lo usado + lo que queda, de la dimensión que decide", () => {
    // 379.5 de 500 h.
    expect(porcentajeVidaUsada(vida())).toBe(76);
    // Decide la FECHA: 250 de 365 días.
    expect(porcentajeVidaUsada(vida({ por: "FECHA" }))).toBe(68);
    // Vencido: nunca pasa de 100 %.
    expect(porcentajeVidaUsada(vida({ horas_en_servicio: 503.2, horas_restantes: -3.2 }))).toBe(
      100,
    );
    // Sin límite o sin datos: no hay barra.
    expect(
      porcentajeVidaUsada(
        vida({
          horas_restantes: null,
          dias_restantes: null,
          vence_el: null,
          estado: "SIN_LIMITE",
          por: null,
        }),
      ),
    ).toBeNull();
  });
});

describe("ficha", () => {
  it("título, identificación e instalación", () => {
    expect(tituloComponente(comp())).toBe("Llanta principal · Izquierda");
    expect(tituloComponente(comp({ posicion: null }))).toBe("Llanta principal");
    expect(textoIdentificacion(comp())).toBe("P/N 6.00-6 · S/N A123 · Goodyear");
    expect(
      textoIdentificacion(comp({ numero_parte: null, numero_serie: null, fabricante: null })),
    ).toBeNull();
    expect(textoInstalacion(comp())).toBe("Instalado el 12/03/2026 · Hobbs 5,480.2 h");
    expect(textoInstalacion(comp({ horas_previas: 35 }))).toBe(
      "Instalado el 12/03/2026 · Hobbs 5,480.2 h · traía 35.0 h",
    );
    expect(
      textoInstalacion(comp({ fecha_instalacion: null, horas_aeronave_instalacion: null })),
    ).toBe("Sin fecha de instalación");
  });

  it("retiro: cuándo, a qué Hobbs y cuánto estuvo", () => {
    const retirado = comp({
      estado: "RETIRADO",
      fecha_retiro: "2026-11-17",
      horas_aeronave_retiro: 5600,
      reemplazado_por_id: "c-2",
      vida: vida({
        horas_en_servicio: 119.8,
        dias_en_servicio: 250,
        horas_restantes: null,
        vence_el: null,
        dias_restantes: null,
        estado: "SIN_LIMITE",
        por: null,
      }),
    });
    expect(textoRetiro(retirado)).toBe(
      "Retirado el 17/11/2026 · Hobbs 5,600.0 h · estuvo 119.8 h · 8 meses",
    );
    expect(textoSustitucion(retirado)).toBe("Se cambió por una pieza nueva");
    expect(textoSustitucion(comp())).toBe("Se retiró sin sustituto");
  });
});

describe("mosaico del resumen", () => {
  const con = (...estados: VidaComponente["estado"][]) =>
    estados.map((estado) => ({ vida: vida({ estado }) }));

  it("lo más urgente manda", () => {
    expect(textoMosaicoComponentes(resumenComponentes([]))).toEqual({
      valor: "Sin componentes",
      hint: "Agrega los que quieras vigilar",
      tono: "gris",
    });
    expect(
      textoMosaicoComponentes(resumenComponentes(con("VENCIDO", "POR_VENCER", "VIGENTE"))),
    ).toEqual({ valor: "1 vencido", hint: "y 1 por vencer · de 3 instalados", tono: "rojo" });
    expect(textoMosaicoComponentes(resumenComponentes(con("VENCIDO", "VENCIDO")))).toEqual({
      valor: "2 vencidos",
      hint: "de 2 instalados",
      tono: "rojo",
    });
    expect(textoMosaicoComponentes(resumenComponentes(con("POR_VENCER", "VIGENTE")))).toEqual({
      valor: "1 por vencer",
      hint: "de 2 instalados",
      tono: "ambar",
    });
    expect(textoMosaicoComponentes(resumenComponentes(con("SIN_DATOS", "VIGENTE")))).toEqual({
      valor: "Falta un dato en 1",
      hint: "de 2 instalados",
      tono: "ambar",
    });
    expect(textoMosaicoComponentes(resumenComponentes(con("VIGENTE", "SIN_LIMITE")))).toEqual({
      valor: "Al día",
      hint: "2 instalados",
      tono: "verde",
    });
    expect(textoMosaicoComponentes(resumenComponentes(con("VIGENTE")))).toMatchObject({
      hint: "1 instalado",
    });
  });
});

describe("formulario de alta / edición", () => {
  it("ALTA: hoy (Cancún) y el Hobbs actual ya vienen puestos", () => {
    const v = valoresComponente(null, { horasAeronave: 5599.4, hoy: "2026-11-17" });
    expect(v.fecha_instalacion).toBe("2026-11-17");
    expect(v.horas_aeronave_instalacion).toBe("5599.4");
    expect(v.nombre).toBe("");
    // Sin contexto no se inventa nada.
    expect(valoresComponente(null).horas_aeronave_instalacion).toBe("");
  });

  it("EDICIÓN: lo guardado, con los nulos como vacío", () => {
    const v = valoresComponente(comp({ numero_serie: null, horas_previas: 0 }));
    expect(v).toMatchObject({
      nombre: "Llanta principal",
      numero_serie: "",
      horas_previas: "",
      limite_horas: "500",
      limite_meses: "12",
      aviso_horas: "10",
      aviso_dias: "30",
    });
  });

  it("número de texto: acepta miles con coma; vacío = null; basura = NaN", () => {
    expect(numeroDeTexto("1,200.5")).toBe(1200.5);
    expect(numeroDeTexto("  ")).toBeNull();
    expect(numeroDeTexto("abc")).toBeNaN();
  });

  it("valida con los límites del API", () => {
    const base = valoresComponente(null, { horasAeronave: 100, hoy: "2026-11-17" });
    expect(validarComponente({ ...base, nombre: "a" })).toMatchObject({
      nombre: "Escribe el nombre del componente",
    });
    expect(validarComponente({ ...base, nombre: "Llanta" })).toEqual({});
    expect(
      validarComponente({
        ...base,
        nombre: "Llanta",
        limite_horas: "0",
        limite_meses: "1.5",
        horas_previas: "-2",
        horas_aeronave_instalacion: "abc",
        aviso_dias: "2.5",
        fecha_vencimiento: "12/03/2027",
      }),
    ).toEqual({
      limite_horas: "Debe ser mayor que cero (o déjalo vacío)",
      limite_meses: "Meses enteros, de 1 a 600 (o déjalo vacío)",
      horas_previas: "No puede ser negativo",
      horas_aeronave_instalacion: "Escribe un número",
      aviso_dias: "Días enteros",
      fecha_vencimiento: "Fecha inválida",
    });
  });

  it("ALTA: lo vacío se OMITE (el API pone sus valores por defecto)", () => {
    const v = {
      ...valoresComponente(null, { horasAeronave: 5599.4, hoy: "2026-11-17" }),
      nombre: "  Foco de aterrizaje ",
      limite_horas: "25",
    };
    expect(payloadComponente(v, "alta")).toEqual({
      nombre: "Foco de aterrizaje",
      fecha_instalacion: "2026-11-17",
      horas_aeronave_instalacion: 5599.4,
      horas_previas: 0,
      limite_horas: 25,
    });
  });

  it("EDICIÓN: lo vacío viaja como null explícito para LIMPIAR; los avisos vacíos se omiten", () => {
    const v = {
      ...valoresComponente(comp()),
      numero_serie: "",
      limite_meses: "",
      aviso_horas: "",
      aviso_dias: "45",
    };
    const body = payloadComponente(v, "edicion");
    expect(body).toMatchObject({
      nombre: "Llanta principal",
      numero_serie: null,
      limite_horas: 500,
      limite_meses: null,
      fecha_vencimiento: null,
      notas: null,
      horas_previas: 0,
      aviso_dias: 45,
    });
    expect("aviso_horas" in body).toBe(false);
  });
});

describe("retirar y reemplazar", () => {
  const ctx = { horasAeronave: 5600, hoy: "2026-11-17" };

  it("retiro: hoy y el Hobbs actual ya vienen puestos; lo vacío no viaja", () => {
    const v = valoresRetiro(ctx);
    expect(v).toEqual({ fecha: "2026-11-17", horas_aeronave: "5600", motivo: "" });
    expect(payloadRetiro(v)).toEqual({ fecha: "2026-11-17", horas_aeronave: 5600 });
    expect(payloadRetiro({ fecha: "2026-11-17", horas_aeronave: "", motivo: " Desgaste " })).toEqual(
      { fecha: "2026-11-17", motivo: "Desgaste" },
    );
    expect(validarRetiro({ fecha: "", horas_aeronave: "-1", motivo: "" })).toEqual({
      fecha: "Pon la fecha",
      horas_aeronave: "No puede ser negativo",
    });
  });

  it("reemplazo: la pieza nueva arranca con el P/N, fabricante y límites de la que sale; sin S/N ni fecha exacta", () => {
    const v = valoresReemplazo(comp({ fecha_vencimiento: "2027-01-01" }), ctx);
    expect(v).toMatchObject({
      fecha: "2026-11-17",
      horas_aeronave: "5600",
      numero_parte: "6.00-6",
      numero_serie: "",
      fabricante: "Goodyear",
      limite_horas: "500",
      limite_meses: "12",
      fecha_vencimiento: "",
    });
    expect(validarReemplazo(v)).toEqual({});
  });

  it("reemplazo: los límites viajan SIEMPRE como se ven (número o null)", () => {
    const v = {
      ...valoresReemplazo(comp(), ctx),
      numero_serie: "B777",
      limite_meses: "",
      motivo: "Desgaste",
    };
    expect(payloadReemplazo(v)).toEqual({
      fecha: "2026-11-17",
      horas_aeronave: 5600,
      motivo: "Desgaste",
      nuevo: {
        limite_horas: 500,
        limite_meses: null,
        numero_parte: "6.00-6",
        numero_serie: "B777",
        fabricante: "Goodyear",
      },
    });
  });
});

describe("confirmaciones y errores", () => {
  it("cada acción destructiva dice qué va a pasar", () => {
    const r = textoConfirmarReemplazo(comp());
    expect(r.descripcion).toContain("«Llanta principal · Izquierda» (S/N A123)");
    expect(r.descripcion).toContain("historial");
    expect(r.boton).toBe("Sí, cambiar el componente");
    expect(textoConfirmarRetiro(comp()).descripcion).toContain("SIN poner otro");
    expect(textoConfirmarEliminar(comp()).descripcion).toContain("capturó por error");
  });

  it("errores del API por código", () => {
    expect(mensajeErrorComponente({ status: 409, code: "COMPONENTE_YA_RETIRADO" })).toContain(
      "ya estaba retirado",
    );
    expect(mensajeErrorComponente({ status: 503, code: "MIGRACION_PENDIENTE" })).toContain(
      "falta actualizar el sistema",
    );
    expect(mensajeErrorComponente({ status: 400, message: "limite_horas inválido" })).toBe(
      "limite_horas inválido",
    );
  });
});
