/**
 * El hook GENÉRICO de las hojas «Conciliación con el banco» (15-oct-2026, API
 * 0.0.78), por regex sobre el fuente (el runner no tiene DOM):
 *  - sin `fija`, el de Gastos de siempre: turno, `.catch(sinConexion)`,
 *    `cerrar` que no vacía fila ni carga, la descarga con `abrirArchivoFirmado`;
 *  - con `fija` (MODO CONTROLADO, el cuerpo embebido de `?ingreso=`): el efecto
 *    depende SOLO de la llave (fila fija + intento) y el ÚNICO setState de la
 *    carga va en el `.then` asíncrono con turno (`react-hooks/set-state-in-effect`
 *    es ERROR en este repo); «cargando» y «cambió de fila» se DERIVAN.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "../use-detalle-banco.ts"), "utf8");

describe("sin `fija`: el hook de Gastos", () => {
  it("pide con turno y .catch(sinConexion); jamás un await dentro de una transición", () => {
    expect(src).toMatch(/const n = \+\+turno\.current;\s*setCarga\(null\);\s*void pedir\(f\)\s*\.catch\(sinConexion\)\s*\.then\(\(r\) => \{\s*if \(turno\.current === n\) setCarga\(\{ id: clave\(f\), r \}\);/);
    expect(src).not.toMatch(/start\w*\(async/);
    expect(src).not.toContain("useTransition");
  });

  it("cerrar sube el turno y cierra SIN vaciar fila ni carga", () => {
    const cerrar = src.slice(src.indexOf("const cerrar = useCallback"), src.indexOf("// ── MODO CONTROLADO"));
    expect(cerrar).toContain("turno.current += 1;");
    expect(cerrar).toContain("setAbierto(false);");
    expect(cerrar).not.toContain("setFila(");
    expect(cerrar).not.toContain("setCarga(");
  });

  it("la descarga abre la pestaña en el MISMO clic (abrirArchivoFirmado) y nunca lanza", () => {
    expect(src).toContain("abrirArchivoFirmado(");
    expect(src).toContain("estadoCuentaUrlAction(id).catch(sinConexion)");
    expect(src).toContain("toast(TEXTO_NO_ABRIO_PESTANA");
  });

  it("la respuesta solo vale para SU llave", () => {
    expect(src).toContain("carga && fila && carga.id === clave(fila)");
  });
});

describe("con `fija`: el MODO CONTROLADO (sin setState síncrono en un efecto)", () => {
  it("el efecto depende SOLO de la llave (fila fija + intento)", () => {
    expect(src).toContain("const claveFija = fija ? `${clave(fija)}#${intento}` : null;");
    expect(src).toMatch(/useEffect\(\(\) => \{\s*if \(claveFija !== null\) pedirFija\(claveFija\);\s*\}, \[claveFija\]\);/);
  });

  it("el ÚNICO setCarga del modo controlado va dentro del .then, con turno", () => {
    const fijo = src.slice(src.indexOf("const pedirFija = useEffectEvent"), src.indexOf("useEffect(() => {"));
    expect(fijo.match(/setCarga\(/g)).toHaveLength(1);
    expect(fijo).toMatch(/\.then\(\(r\) => \{\s*if \(turno\.current === n\) setCarga\(\{ id, r \}\);/);
    expect(fijo).not.toMatch(/\bset(Fila|Abierto|Intento|Descargando)\(/);
  });

  it("el efecto no llama abrir() ni hace setState; «cargando» se deriva de la llave; reintentar es un evento", () => {
    const efecto = src.slice(src.indexOf("useEffect(() => {"), src.indexOf("const controlado"));
    expect(efecto).not.toContain("abrir(");
    expect(efecto).not.toMatch(/\bset[A-Z]\w*\(/);
    expect(src).toContain("carga && carga.id === claveFija");
    const reintentar = src.slice(src.indexOf("const reintentar = useCallback"), src.indexOf("const descargarEstadoCuenta"));
    expect(reintentar).toContain("setIntento((i) => i + 1);");
  });
});
