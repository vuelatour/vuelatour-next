/**
 * ¿El 400 es el de un API que todavía NO conoce un campo nuevo de la consulta
 * (`forbidNonWhitelisted`: «property excluir_categoria should not exist»)?
 * PURO (sin red ni Next): lo usan la lectura de Gastos en el servidor
 * (`lib/api/expenses-server.ts`) y la descarga del Excel en el navegador
 * (`lib/download.ts`). Espejo de `esApiSinRangoFechas`
 * (`lib/admin/quote-navegacion.ts`): se mira el TEXTO porque class-validator
 * no manda código; el mensaje puede llegar como string o como lista.
 *
 * Cualquier otro status (un 502 del deploy, un 500) o un 400 de OTRO campo ⇒
 * false: ese error sube como siempre y nunca se disfraza de lista.
 */
export function esCampoDesconocidoParaApi(status: unknown, mensaje: unknown, campo: string): boolean {
  if (status !== 400 || !campo) return false;
  const texto = Array.isArray(mensaje) ? mensaje.join(" ") : String(mensaje ?? "");
  const nombre = campo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`\\b${nombre}\\b`, "i").test(texto)) return false;
  return /should not exist|no debe existir|not allowed|property/i.test(texto);
}

/** La misma consulta SIN los campos que el API previo no conoce (los demás intactos). */
export function sinCampos<T extends Record<string, unknown>>(query: T, campos: readonly string[]): T {
  const out = { ...query };
  for (const c of campos) delete out[c];
  return out;
}
