#!/usr/bin/env node
/**
 * Sincroniza el CSS de la HOJA de cotización desde pyservices (fuente única,
 * form-as-document 8-sep-2026):
 *
 *   ../vuelatour-pyservices/app/static/cotizacion-fuente.css → src/styles/cotizacion-fuente.css
 *   ../vuelatour-pyservices/app/static/cotizacion-hoja.css   → src/styles/cotizacion-hoja.css
 *   ../vuelatour-pyservices/app/assets/logo-vuelatour*.png   → public/cotizacion/
 *
 * La hoja que edita el operador (`QuoteSheet`) y el PDF que baja el cliente
 * comparten ESTOS archivos: nunca se editan aquí a mano — se cambian en
 * pyservices y se vuelve a correr `npm run sync:hoja-css`. El test
 * `src/styles/__tests__/hoja-css-deriva.test.ts` detecta la deriva cuando el
 * repo hermano existe en el workspace.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, "..");
const hermano = resolve(raiz, "..", "vuelatour-pyservices");

/** Pares [origen, destino] que se copian tal cual. */
export const ARCHIVOS_HOJA = [
  ["app/static/cotizacion-fuente.css", "src/styles/cotizacion-fuente.css"],
  ["app/static/cotizacion-hoja.css", "src/styles/cotizacion-hoja.css"],
  ["app/assets/logo-vuelatour.png", "public/cotizacion/logo-vuelatour.png"],
  ["app/assets/logo-vuelatour-blanco.png", "public/cotizacion/logo-vuelatour-blanco.png"],
];

function main() {
  if (!existsSync(hermano)) {
    console.error(`No existe el repo hermano: ${hermano}`);
    process.exit(1);
  }
  for (const [src, dst] of ARCHIVOS_HOJA) {
    const origen = resolve(hermano, src);
    const destino = resolve(raiz, dst);
    if (!existsSync(origen)) {
      console.error(`Falta en pyservices: ${origen}`);
      process.exit(1);
    }
    mkdirSync(dirname(destino), { recursive: true });
    copyFileSync(origen, destino);
    console.log(`${src} → ${dst}`);
  }
}

main();
