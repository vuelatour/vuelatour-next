import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ETIQUETA_AGREGAR_PROVEEDOR,
  FORM_PROVEEDOR_VACIO,
  VALOR_AGREGAR_PROVEEDOR,
  cuerpoProveedorRapido,
  erroresProveedorRapido,
  formDeProveedor,
  mensajeErrorProveedorRapido,
  normalizarNombreProveedor,
  opcionesSelectorProveedor,
  proveedorConMismoNombre,
  puedeEditarProveedor,
} from "@/lib/admin/proveedores-gasto";

const LISTA = [
  { id: "p-asur", nombre: "Aeropuertos del Sureste (ASUR)" },
  { id: "p-est", nombre: "Estafeta Mexicana" },
];

describe("proveedor en línea desde el gasto (20-oct-2026, API 0.0.100)", () => {
  it("roles: toda la oficina", () => {
    expect(puedeEditarProveedor("COORDINADOR")).toBe(true);
    expect(puedeEditarProveedor("FACTURACION")).toBe(true);
    expect(puedeEditarProveedor("ANALISTA")).toBe(false);
    expect(puedeEditarProveedor(undefined)).toBe(false);
  });

  it("normalización = la del API (sin acentos, mayúsculas ni signos)", () => {
    expect(normalizarNombreProveedor("  Estafeta Mexicana, S.A. ")).toBe("estafeta mexicana s a");
    expect(proveedorConMismoNombre("ESTAFETA mexicana", LISTA)?.id).toBe("p-est");
    expect(proveedorConMismoNombre("estafeta mexicana", LISTA, "p-est")).toBeNull();
  });

  it("paridad con `normalizarNombreProveedor` del API", () => {
    const raiz = process.env.VUELATOUR_API_DIR ?? path.resolve(__dirname, "../../../../../vuelatour-api");
    const archivo = path.join(raiz, "src/modules/providers/providers.service.ts");
    if (!existsSync(archivo)) return;
    const src = readFileSync(archivo, "utf8");
    if (!src.includes("normalizarNombreProveedor")) return;
    expect(src).toContain(".replace(/[^a-z0-9ñ]+/g, ' ')");
    expect(src).toContain("PROVEEDOR_DUPLICADO");
  });

  it("opciones: «＋ Agregar proveedor…» al final solo con permiso", () => {
    expect(opcionesSelectorProveedor(LISTA, false).map((o) => o.value)).toEqual(["p-asur", "p-est"]);
    const con = opcionesSelectorProveedor(LISTA, true);
    expect(con.at(-1)).toEqual({ value: VALOR_AGREGAR_PROVEEDOR, label: ETIQUETA_AGREGAR_PROVEEDOR });
  });

  it("validación: nombre obligatorio, duplicado avisado, RFC 12–13", () => {
    expect(erroresProveedorRapido(FORM_PROVEEDOR_VACIO, LISTA).nombre).toBe("Escribe el nombre del proveedor.");
    expect(erroresProveedorRapido({ ...FORM_PROVEEDOR_VACIO, nombre: "estafeta mexicana" }, LISTA).nombre).toBe(
      "Ya existe «Estafeta Mexicana»: elígelo de la lista.",
    );
    expect(erroresProveedorRapido({ ...FORM_PROVEEDOR_VACIO, nombre: "DHL", rfc: "ABC" }, LISTA).rfc).toBe(
      "El RFC tiene 12 o 13 caracteres.",
    );
    expect(erroresProveedorRapido({ ...FORM_PROVEEDOR_VACIO, nombre: "DHL" }, LISTA)).toEqual({});
  });

  it("cuerpo: el alta sin vacíos; la edición solo lo que cambió (vaciar ⇒ null)", () => {
    expect(cuerpoProveedorRapido({ ...FORM_PROVEEDOR_VACIO, nombre: " DHL ", rfc: "dhl123456ab1" })).toEqual({
      nombre: "DHL",
      tipo: "NACIONAL",
      rfc: "DHL123456AB1",
    });
    const base = formDeProveedor({ nombre: "DHL", tipo: "NACIONAL", rfc: "DHL123456AB1", telefono: "998", email: null });
    expect(cuerpoProveedorRapido({ ...base, telefono: "" }, base)).toEqual({ telefono: null });
    expect(cuerpoProveedorRapido(base, base)).toEqual({});
    expect(cuerpoProveedorRapido({ ...base, nombre: "DHL Express" }, base)).toEqual({ nombre: "DHL Express" });
  });

  it("errores del API", () => {
    expect(
      mensajeErrorProveedorRapido({ code: "PROVEEDOR_DUPLICADO", error: "Ya existe el proveedor «DHL»: elígelo de la lista." }),
    ).toBe("Ya existe el proveedor «DHL»: elígelo de la lista.");
    expect(mensajeErrorProveedorRapido({ status: 403 })).toBe(
      "Tu usuario no puede dar de alta ni corregir proveedores.",
    );
  });
});
