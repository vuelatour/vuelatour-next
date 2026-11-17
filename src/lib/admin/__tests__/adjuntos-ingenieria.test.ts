/**
 * EVIDENCIAS Y DOCUMENTOS de ingeniería (17-nov-2026, API 0.0.140). Pedido del
 * cliente: subir la foto o el PDF del sticker que entrega el taller (y las
 * facturas de las piezas) y poder descargarlos después.
 *
 * Aquí se congelan los textos, el catálogo y —lo más delicado— la SUBIDA paso
 * a paso: un archivo que sube al bucket pero no se registra en el API se
 * retira del bucket (no se dejan huérfanos) y un archivo que falla no detiene
 * a los demás.
 */
import { describe, expect, it, vi } from "vitest";
import {
  ACCEPT_ADJUNTO,
  ETIQUETAS_ADJUNTO,
  MAX_BYTES_ADJUNTO,
  TEXTO_INVITA_STICKER,
  TOPE_ADJUNTOS_POR_DESTINO,
  adjuntosDeDestino,
  etiquetaAdjunto,
  etiquetaPorDefecto,
  mensajeErrorAdjunto,
  subirAdjuntos,
  tamanoLegible,
  textoAvanceSubida,
  textoConfirmarQuitarAdjunto,
  textoContadorAdjuntos,
  textoMetaAdjunto,
  textoResultadoSubida,
  textoSubirAdjunto,
  tipoArchivo,
  tituloAdjuntos,
  tituloSubirAdjunto,
  validarArchivoAdjunto,
} from "../adjuntos-ingenieria";
import {
  TEXTO_ESCRITURA_NO_DISPONIBLE,
  TEXTO_SIN_PERMISO,
} from "../ingenieria-errores";
import type { AdjuntoIngenieria } from "@/types/engineering";

const adj = (p: Partial<AdjuntoIngenieria> & { id: string }): AdjuntoIngenieria => ({
  destino: "MANTENIMIENTO",
  destino_id: "m-1",
  aeronave_id: "a-1",
  nombre: "sticker-100hrs.pdf",
  mime: "application/pdf",
  bytes: 870_400,
  etiqueta: "STICKER",
  nota: null,
  subido_por_nombre: "Itzi",
  created_at: "2026-11-17T18:00:00Z",
  ...p,
});

describe("catálogo y textos", () => {
  it("el sticker es lo primero y lo sugerido en un mantenimiento; la factura, en una pieza", () => {
    expect(ETIQUETAS_ADJUNTO[0]).toMatchObject({
      value: "STICKER",
      label: "Sticker / etiqueta de servicio",
    });
    expect(ETIQUETAS_ADJUNTO.map((e) => e.value)).toEqual([
      "STICKER",
      "FACTURA",
      "CERTIFICADO",
      "ORDEN_TRABAJO",
      "BITACORA",
      "OTRO",
    ]);
    expect(etiquetaPorDefecto("MANTENIMIENTO")).toBe("STICKER");
    for (const d of ["COMPONENTE", "MOTOR", "HELICE"] as const) {
      expect(etiquetaPorDefecto(d)).toBe("FACTURA");
    }
  });

  it("etiqueta desconocida o ausente ⇒ «Documento» (nunca la clave cruda)", () => {
    expect(etiquetaAdjunto("ORDEN_TRABAJO")).toBe("Orden de trabajo");
    expect(etiquetaAdjunto(null)).toBe("Documento");
    expect(etiquetaAdjunto("ALGO_NUEVO")).toBe("Documento");
  });

  it("en un mantenimiento son «evidencias»; en una pieza, «documentos»", () => {
    expect(tituloAdjuntos("MANTENIMIENTO")).toBe("Evidencias");
    expect(tituloAdjuntos("COMPONENTE")).toBe("Documentos");
    expect(textoContadorAdjuntos(0, "MANTENIMIENTO")).toBe("Sin evidencias");
    expect(textoContadorAdjuntos(1, "MANTENIMIENTO")).toBe("1 evidencia");
    expect(textoContadorAdjuntos(3, "MOTOR")).toBe("3 documentos");
    expect(textoSubirAdjunto("MANTENIMIENTO")).toBe("Subir evidencia");
    expect(textoSubirAdjunto("HELICE")).toBe("Subir documento");
    expect(tituloSubirAdjunto("MANTENIMIENTO")).toBe("Subir evidencia del mantenimiento");
  });

  it("la invitación a subir el sticker dice qué subir", () => {
    expect(TEXTO_INVITA_STICKER).toContain("sticker");
    expect(TEXTO_INVITA_STICKER).toContain("PDF");
  });

  it("tamaño legible y tipo de archivo", () => {
    expect(tamanoLegible(512)).toBe("512 B");
    expect(tamanoLegible(870_400)).toBe("850 KB");
    expect(tamanoLegible(1_258_291)).toBe("1.2 MB");
    expect(tamanoLegible(null)).toBe("—");
    expect(tamanoLegible(Number.NaN)).toBe("—");
    expect(tipoArchivo("application/pdf")).toBe("pdf");
    expect(tipoArchivo("image/jpeg")).toBe("imagen");
    expect(tipoArchivo("application/zip")).toBe("otro");
  });

  it("meta del archivo: tamaño · fecha en Cancún · quién (si viene)", () => {
    // 18:00Z = 13:00 en Cancún del mismo día.
    expect(textoMetaAdjunto(adj({ id: "x" }))).toBe("850 KB · 17/11/2026 · Itzi");
    expect(textoMetaAdjunto(adj({ id: "x", subido_por_nombre: null }))).toBe(
      "850 KB · 17/11/2026",
    );
  });

  it("quitar confirma con el nombre del archivo", () => {
    const t = textoConfirmarQuitarAdjunto("sticker.pdf");
    expect(t.titulo).toBe("Quitar archivo");
    expect(t.descripcion).toContain("«sticker.pdf»");
    expect(t.boton).toBe("Quitar");
  });

  it("reparte por destino", () => {
    const lista = [
      adj({ id: "1" }),
      adj({ id: "2", destino: "COMPONENTE", destino_id: "c-1" }),
      adj({ id: "3", destino_id: "m-2" }),
      adj({ id: "4", destino: "MOTOR", destino_id: "m-1" }),
    ];
    expect(adjuntosDeDestino(lista, "MANTENIMIENTO", "m-1").map((a) => a.id)).toEqual(["1"]);
    // Mismo id, otro destino: no se mezclan.
    expect(adjuntosDeDestino(lista, "MOTOR", "m-1").map((a) => a.id)).toEqual(["4"]);
    expect(adjuntosDeDestino(lista, "HELICE", "h-1")).toEqual([]);
  });
});

describe("errores del API", () => {
  it("por código, en es-MX", () => {
    expect(mensajeErrorAdjunto({ status: 409, code: "TOPE_ADJUNTOS" })).toContain(
      String(TOPE_ADJUNTOS_POR_DESTINO),
    );
    expect(mensajeErrorAdjunto({ status: 409, code: "ARCHIVO_YA_REGISTRADO" })).toBe(
      "Ese archivo ya estaba registrado.",
    );
    expect(mensajeErrorAdjunto({ status: 400, code: "ARCHIVO_NO_ENCONTRADO" })).toContain(
      "no terminó de subir",
    );
    expect(mensajeErrorAdjunto({ status: 404, code: "DESTINO_NO_ENCONTRADO" })).toContain(
      "ya no existe",
    );
  });

  it("migración pendiente o API sin desplegar ⇒ «falta actualizar el sistema»", () => {
    expect(mensajeErrorAdjunto({ status: 503, code: "MIGRACION_PENDIENTE" })).toBe(
      TEXTO_ESCRITURA_NO_DISPONIBLE,
    );
    expect(
      mensajeErrorAdjunto({ status: 404, message: "Cannot POST /v1/engineering/adjuntos" }),
    ).toBe(TEXTO_ESCRITURA_NO_DISPONIBLE);
  });

  it("403 ⇒ sin permiso; lo demás, el mensaje del API", () => {
    expect(mensajeErrorAdjunto({ status: 403, message: "Forbidden resource" })).toBe(
      TEXTO_SIN_PERMISO,
    );
    expect(mensajeErrorAdjunto({ status: 400, message: "El nombre es obligatorio" })).toBe(
      "El nombre es obligatorio",
    );
  });
});

describe("validar un archivo antes de subirlo", () => {
  const archivo = (p: Partial<{ name: string; size: number; type: string }> = {}) => ({
    name: "foto.jpg",
    size: 2_000_000,
    type: "image/jpeg",
    ...p,
  });

  it("acepta foto y PDF dentro del tope (los del bucket documentos-flota)", () => {
    expect(ACCEPT_ADJUNTO).toBe("image/jpeg,image/png,image/webp,application/pdf");
    for (const type of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) {
      expect(validarArchivoAdjunto(archivo({ type }))).toBeNull();
    }
    expect(validarArchivoAdjunto(archivo({ size: MAX_BYTES_ADJUNTO }))).toBeNull();
  });

  it("rechaza formato raro, peso de más y vacío, diciendo por qué", () => {
    expect(validarArchivoAdjunto(archivo({ type: "image/heic" }))).toContain("formato no soportado");
    expect(validarArchivoAdjunto(archivo({ type: "" }))).toContain("formato no soportado");
    expect(validarArchivoAdjunto(archivo({ size: MAX_BYTES_ADJUNTO + 1 }))).toBe(
      "pesa más de 10 MB",
    );
    expect(validarArchivoAdjunto(archivo({ size: 0 }))).toBe("el archivo está vacío");
  });
});

describe("subirAdjuntos: uno por uno, sin huérfanos", () => {
  const f = (name: string, extra: Partial<{ size: number; type: string }> = {}) => ({
    name,
    size: 1000,
    type: "application/pdf",
    ...extra,
  });

  it("todo bien: sube, registra y no limpia nada", async () => {
    const subir = vi.fn(async (a: { name: string }) => `oficina/${a.name}`);
    const registrar = vi.fn(async (ruta: string) => ({ id: ruta }));
    const limpiar = vi.fn(async () => {});
    const avances: string[] = [];
    const res = await subirAdjuntos([f("a.pdf"), f("b.pdf")], {
      subir,
      registrar,
      limpiar,
      alAvanzar: (h, t) => avances.push(`${h}/${t}`),
    });
    expect(res.subidos).toEqual([{ id: "oficina/a.pdf" }, { id: "oficina/b.pdf" }]);
    expect(res.fallidos).toEqual([]);
    expect(limpiar).not.toHaveBeenCalled();
    expect(avances).toEqual(["1/2", "2/2"]);
    // Uno por uno: el segundo no empieza antes de registrar el primero.
    expect(subir.mock.invocationCallOrder[1]).toBeGreaterThan(
      registrar.mock.invocationCallOrder[0],
    );
  });

  it("el REGISTRO falla ⇒ el objeto recién subido se retira del bucket y los demás siguen", async () => {
    const limpiar = vi.fn(async () => {});
    const res = await subirAdjuntos([f("a.pdf"), f("b.pdf"), f("c.pdf")], {
      subir: async (a) => `oficina/${a.name}`,
      registrar: async (ruta) => {
        if (ruta.endsWith("b.pdf")) {
          throw Object.assign(new Error("tope"), { status: 409, code: "TOPE_ADJUNTOS" });
        }
        return { id: ruta };
      },
      limpiar,
    });
    expect(res.subidos).toEqual([{ id: "oficina/a.pdf" }, { id: "oficina/c.pdf" }]);
    expect(limpiar).toHaveBeenCalledTimes(1);
    expect(limpiar).toHaveBeenCalledWith("oficina/b.pdf");
    expect(res.fallidos).toHaveLength(1);
    expect(res.fallidos[0].nombre).toBe("b.pdf");
    expect(res.fallidos[0].motivo).toContain("quita alguno");
  });

  it("la SUBIDA falla ⇒ no hay nada que limpiar y se pinta el texto del bucket tal cual", async () => {
    const limpiar = vi.fn(async () => {});
    const registrar = vi.fn(async () => ({}));
    const res = await subirAdjuntos([f("a.pdf")], {
      subir: async () => {
        throw new Error("No se pudo subir el documento: red caída");
      },
      registrar,
      limpiar,
    });
    expect(registrar).not.toHaveBeenCalled();
    expect(limpiar).not.toHaveBeenCalled();
    expect(res.fallidos).toEqual([
      { nombre: "a.pdf", motivo: "No se pudo subir el documento: red caída" },
    ]);
  });

  it("un archivo inválido ni siquiera se sube", async () => {
    const subir = vi.fn(async () => "oficina/x");
    const res = await subirAdjuntos([f("foto.heic", { type: "image/heic" }), f("ok.pdf")], {
      subir,
      registrar: async (ruta) => ({ id: ruta }),
      limpiar: async () => {},
    });
    expect(subir).toHaveBeenCalledTimes(1);
    expect(res.subidos).toHaveLength(1);
    expect(res.fallidos[0]).toMatchObject({ nombre: "foto.heic" });
  });

  it("si limpiar también falla, la subida no revienta", async () => {
    const res = await subirAdjuntos([f("a.pdf")], {
      subir: async () => "oficina/a.pdf",
      registrar: async () => {
        throw Object.assign(new Error("x"), { status: 500, code: "UNKNOWN" });
      },
      limpiar: async () => {
        throw new Error("sin permiso de borrar");
      },
    });
    expect(res.subidos).toEqual([]);
    expect(res.fallidos).toHaveLength(1);
  });
});

describe("qué se dice al terminar", () => {
  it("todo bien", () => {
    expect(textoResultadoSubida({ subidos: [1], fallidos: [] })).toEqual({
      tipo: "exito",
      texto: "Se subió 1 archivo.",
    });
    expect(textoResultadoSubida({ subidos: [1, 2, 3], fallidos: [] }).texto).toBe(
      "Se subieron 3 archivos.",
    );
  });

  it("a medias: cuántos subieron y cuáles no, con su motivo", () => {
    const r = textoResultadoSubida({
      subidos: [1, 2],
      fallidos: [{ nombre: "foto.heic", motivo: "formato no soportado" }],
    });
    expect(r.tipo).toBe("parcial");
    expect(r.texto).toBe(
      "Se subieron 2 de 3 archivos. No se pudo subir: foto.heic (formato no soportado).",
    );
  });

  it("nada", () => {
    const r = textoResultadoSubida({
      subidos: [],
      fallidos: [{ nombre: "a.pdf", motivo: "pesa más de 10 MB" }],
    });
    expect(r).toEqual({ tipo: "error", texto: "No se pudo subir a.pdf (pesa más de 10 MB)." });
  });

  it("avance", () => {
    expect(textoAvanceSubida(0, 1)).toBe("Subiendo…");
    expect(textoAvanceSubida(1, 5)).toBe("Subiendo 2 de 5…");
    expect(textoAvanceSubida(5, 5)).toBe("Subiendo 5 de 5…");
  });
});
