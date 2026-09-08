/**
 * Caché PURA de la vista previa de la hoja 1 (F1, 8-sep-2026): sin DOM ni
 * React, para poder probarla con vitest. El hook `useQuotePreviewHtml` la
 * usa por payload serializado.
 *
 * - `hashPayload(json)`: hash de 53 bits (cyrb53) síncrono — suficiente
 *   como LLAVE de un mapa de 20 entradas; la colisión es imposible en la
 *   práctica y, por si acaso, la caché GUARDA el JSON completo y lo compara
 *   al leer (una colisión jamás devuelve la hoja de otro payload).
 * - `PreviewCache`: LRU por inserción/lectura con tope (20 por defecto).
 */

export function hashPayload(json: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < json.length; i++) {
    const ch = json.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(36);
}

interface Entrada {
  json: string;
  html: string;
}

export class PreviewCache {
  private readonly mapa = new Map<string, Entrada>();

  constructor(private readonly limite = 20) {}

  get size(): number {
    return this.mapa.size;
  }

  /** HTML cacheado para ese payload EXACTO (compara el JSON, no solo el hash). */
  get(json: string): string | null {
    const key = hashPayload(json);
    const hit = this.mapa.get(key);
    if (!hit || hit.json !== json) return null;
    // LRU: la lectura lo vuelve el más reciente.
    this.mapa.delete(key);
    this.mapa.set(key, hit);
    return hit.html;
  }

  set(json: string, html: string): void {
    const key = hashPayload(json);
    if (this.mapa.has(key)) this.mapa.delete(key);
    this.mapa.set(key, { json, html });
    while (this.mapa.size > this.limite) {
      const masViejo = this.mapa.keys().next().value;
      if (masViejo === undefined) break;
      this.mapa.delete(masViejo);
    }
  }

  has(json: string): boolean {
    return this.get(json) !== null;
  }

  clear(): void {
    this.mapa.clear();
  }
}
