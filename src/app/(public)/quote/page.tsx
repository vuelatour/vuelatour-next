import { redirect } from "next/navigation";

/**
 * /quote es el destino de los CTAs principales de la web pública. Mientras no
 * exista el formulario de cotización dedicado, aterriza en Contact (que ya
 * captura la solicitud); los query params (?tour=, ?aircraft=) se conservan
 * para cuando el form exista.
 */
export default async function QuotePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
  }
  redirect(qs.size > 0 ? `/contact?${qs.toString()}` : "/contact");
}
