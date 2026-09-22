#!/usr/bin/env node
/**
 * Sincroniza el CSS de la HOJA INTERNA desde pyservices (fuente única, Fase
 * 2.2 del rediseño del cotizador, 22-sep-2026):
 *
 *   ../vuelatour-pyservices/app/static/cotizacion-interna.css → src/styles/cotizacion-interna.css
 *
 * Hermano de `npm run sync:hoja-css` (la hoja del CLIENTE). La hoja interna
 * que edita la oficina y el PDF interno que se imprime comparten ESTE
 * archivo: nunca se edita aquí a mano — se cambia en pyservices y se vuelve a
 * correr este script. El test `src/styles/__tests__/hoja-interna-css-deriva.test.ts`
 * detecta la deriva cuando el repo hermano existe en el workspace.
 *
 * La FUENTE (`cotizacion-fuente.css`, Arimo incrustada) NO se copia aquí: ya
 * la trae `sync:hoja-css` y las dos hojas la comparten. Lo de PANTALLA
 * (geometría del papel, inputs invisibles, marca de agua) vive en
 * `src/styles/cotizacion-interna-pantalla.css`, que es del panel y no se
 * sincroniza.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, "..");
const hermano = resolve(raiz, "..", "vuelatour-pyservices");

/** Pares [origen, destino] que se copian tal cual. */
export const ARCHIVOS_HOJA_INTERNA = [
  ["app/static/cotizacion-interna.css", "src/styles/cotizacion-interna.css"],
];

function main() {
  if (!existsSync(hermano)) {
    console.error(`No existe el repo hermano: ${hermano}`);
    process.exit(1);
  }
  for (const [src, dst] of ARCHIVOS_HOJA_INTERNA) {
    const origen = resolve(hermano, src);
    const destino = resolve(raiz, dst);
    if (!existsSync(origen)) {
      console.error(
        `Falta en pyservices: ${origen}\n` +
          "Es la Fase 2.1 (el CSS del PDF interno sale a app/static/, acotado a .cot-interna).",
      );
      process.exit(1);
    }
    mkdirSync(dirname(destino), { recursive: true });
    copyFileSync(origen, destino);
    console.log(`${src} → ${dst}`);
  }
}

main();
