import { describe, expect, it } from "vitest";
import {
  ROLES_EXCEL_CAJA,
  esReposicionDescargable,
  nombreExcelPorReponer,
  nombreExcelReposicion,
  porReponerDeFondo,
  puedeDescargarExcelCaja,
  reposicionRecienRegistrada,
  rutaExcelPorReponer,
  rutaExcelReposicion,
  textoExcelNoDescargado,
} from "@/lib/admin/caja-chica-excel";

/**
 * EXCEL de caja chica (24-sep-2026). Palabras del cliente: «al momento de
 * reembolsar la caja de cada uno, me puede arrojar un Excel descargable con
 * la información de lo que estoy reembolsando». El Excel lo arma el API; aquí
 * se custodia QUÉ se descarga, quién puede y cuándo sale solo.
 */
const MOV = "6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
const FONDO = "0b1c2d3e-4f50-4617-8829-3a4b5c6d7e8f";

describe("rutas del proxy (nunca el API directo: la cookie viaja sola)", () => {
  it("reposición y pendiente", () => {
    expect(rutaExcelReposicion(MOV)).toBe(`/api/caja-chica/movimientos/${MOV}/reposicion`);
    expect(rutaExcelPorReponer(FONDO)).toBe(`/api/caja-chica/fondos/${FONDO}/por-reponer`);
  });
});

describe("nombres de respaldo (el del API gana)", () => {
  it("«Reposicion caja <responsable> <fecha>.xlsx»", () => {
    expect(nombreExcelReposicion("Itzi", "2026-09-21")).toBe("Reposicion caja Itzi 2026-09-21.xlsx");
    expect(nombreExcelPorReponer("Luis", "2026-09-24")).toBe("Por reponer caja Luis 2026-09-24.xlsx");
  });

  it("sin caracteres que rompan el nombre del archivo", () => {
    expect(nombreExcelReposicion('Mary / "Cruz"', "2026-09-11")).toBe(
      "Reposicion caja Mary Cruz 2026-09-11.xlsx",
    );
    expect(nombreExcelReposicion(null, null)).toBe("Reposicion caja fondo sin fecha.xlsx");
  });
});

describe("quién descarga (espejo de GESTION del API)", () => {
  it("ADMIN y FACTURACION sí; los demás no", () => {
    expect([...ROLES_EXCEL_CAJA]).toEqual(["ADMIN", "FACTURACION"]);
    expect(puedeDescargarExcelCaja("ADMIN")).toBe(true);
    expect(puedeDescargarExcelCaja("FACTURACION")).toBe(true);
    for (const rol of ["COORDINADOR", "SOCIO", "PILOTO", "MECANICO", "VISITANTE", null, undefined]) {
      expect(puedeDescargarExcelCaja(rol)).toBe(false);
    }
  });
});

describe("qué filas del historial llevan el ícono", () => {
  it("solo REPOSICIÓN (el API responde 409 a reintegro/ajuste)", () => {
    expect(esReposicionDescargable({ tipo: "REPOSICION" })).toBe(true);
    expect(esReposicionDescargable({ tipo: "REINTEGRO" })).toBe(false);
    expect(esReposicionDescargable({ tipo: "AJUSTE" })).toBe(false);
    expect(esReposicionDescargable(null)).toBe(false);
  });
});

describe("descarga AUTOMÁTICA al registrar", () => {
  const creado = { id: MOV, tipo: "REPOSICION", fecha: "2026-09-21" };

  it("solo una REPOSICIÓN NUEVA con id", () => {
    expect(reposicionRecienRegistrada({ esCorreccion: false, tipo: "REPOSICION", creado })).toBe(creado);
    // Corregir una reposición vieja no vuelve a bajar nada.
    expect(reposicionRecienRegistrada({ esCorreccion: true, tipo: "REPOSICION", creado })).toBeNull();
    expect(reposicionRecienRegistrada({ esCorreccion: false, tipo: "REINTEGRO", creado })).toBeNull();
    expect(reposicionRecienRegistrada({ esCorreccion: false, tipo: "AJUSTE", creado })).toBeNull();
    // Sin id (respuesta rara) no hay qué descargar.
    expect(reposicionRecienRegistrada({ esCorreccion: false, tipo: "REPOSICION", creado: {} })).toBeNull();
    expect(reposicionRecienRegistrada({ esCorreccion: false, tipo: "REPOSICION", creado: undefined })).toBeNull();
  });

  it("si el Excel falla, se dice que la reposición SÍ quedó", () => {
    expect(textoExcelNoDescargado("El servidor respondió con error 502.")).toBe(
      "La reposición quedó registrada, pero el Excel no se pudo descargar: El servidor respondió con error 502.",
    );
  });
});

describe("porReponerDeFondo — la card lee la fuente única del API", () => {
  // Casos REALES de prod (24-sep-2026): la card decía una cifra y el Excel
  // «Por reponer» otra, porque la card calculaba «fondo total − saldo».
  it("Diego: fondo $5,000 sin entregas registradas y $4,944 gastados ⇒ $4,944 (no $9,944)", () => {
    const fondo = {
      saldo: -4944,
      monto_fondo: 5000,
      // DESC: la primera fila es la última del libro.
      historial: [{ por_reponer: 4944 }, { por_reponer: 4800 }],
    };
    expect(porReponerDeFondo(fondo)).toBe(4944);
  });

  it("Gregorio: libro vacío ⇒ $0 (lo mismo que el Excel), no el fondo completo", () => {
    expect(porReponerDeFondo({ saldo: 0, monto_fondo: 2000, historial: [] })).toBe(0);
  });

  it("Mary: con entregas, el por reponer de la última fila (incluye lo que venía de antes)", () => {
    expect(
      porReponerDeFondo({ saldo: 10187.08, monto_fondo: 40000, historial: [{ por_reponer: 29812.92 }] }),
    ).toBe(29812.92);
  });

  it("API sin por_reponer por fila ⇒ la fórmula vieja (la card nunca queda vacía)", () => {
    expect(porReponerDeFondo({ saldo: 1453, monto_fondo: 3000, historial: [{}] })).toBe(1547);
  });
});
