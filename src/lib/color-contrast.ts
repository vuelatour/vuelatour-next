/**
 * Color de texto legible sobre un fondo dado (pedido 21-ago-2026: la paleta
 * pastel de los aviones — amarillo, blanco, verde claro — volvía invisible el
 * texto blanco de los chips del calendario). Contraste WCAG 2.x contra
 * blanco: si no alcanza 4.5:1 se usa texto oscuro.
 */
export function textOnColor(hex: string | null | undefined): string {
  const lum = relativeLuminance(hex);
  if (lum == null) return "#ffffff";
  // Contraste blanco-sobre-fondo = (1.05) / (L + 0.05).
  const contrasteBlanco = 1.05 / (lum + 0.05);
  return contrasteBlanco >= 4.5 ? "#ffffff" : "#111827";
}

function relativeLuminance(hex: string | null | undefined): number | null {
  if (!hex) return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const canal = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
}
