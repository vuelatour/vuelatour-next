import { refrescarUrlsFirmadasAction } from "@/app/actions/storage";
import { crearPedidorDeUrls, type PedirUrl } from "@/lib/admin/foto-firmada";

/**
 * Pide UNA URL firmada nueva (bucket privado) desde el navegador. Las
 * peticiones de un mismo instante se juntan en UN lote por bucket — ver
 * `crearPedidorDeUrls` (las server actions van en fila: 50 miniaturas
 * vencidas serían 50 viajes). Nunca rechaza: sin firma ⇒ null.
 */
export const pedirUrlFirmada: PedirUrl = crearPedidorDeUrls(async (bucket, paths) => {
  const res = await refrescarUrlsFirmadasAction({ bucket, paths });
  return res.ok ? (res.data?.urls ?? null) : null;
});
