"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useNotifications } from "@/components/admin/notifications/notifications-provider";
import { conteoPorFacturar } from "@/lib/api/facturas-emitidas-browser";
import { EVENTO_CONTEO_POR_FACTURAR } from "@/lib/admin/facturas-emitidas";

/**
 * BADGE «por facturar» del menú (24-sep-2026): cuántos vuelos tienen una
 * solicitud de factura («Necesito factura») sin factura registrada. Es una
 * PISTA, no un dato: con error o sin la migración (503) simplemente no se
 * pinta.
 *
 * `SidebarNav` se monta DOS veces (aside de escritorio, oculto por CSS en el
 * celular, y el Sheet del topbar): el estado vive a nivel de MÓDULO —una sola
 * petición en vuelo, caché de 30 s y suscriptores— para no duplicar el sondeo.
 *
 * Se refresca al montar, al cambiar de pantalla, al volver el foco a la
 * ventana, cada 120 s y cuando llega una notificación nueva (la campana ya
 * escucha el socket: una «Factura pedida» mueve el badge al instante).
 */

const CACHE_MS = 30_000;
const SONDEO_MS = 120_000;

let valor: number | null = null;
let leidoAt = 0;
let enVuelo: Promise<void> | null = null;
const suscriptores = new Set<() => void>();

function avisar() {
  for (const cb of suscriptores) cb();
}

/** Pide el conteo (o reutiliza la petición en vuelo / la caché). */
export function refrescarConteoPorFacturar(forzar = false): Promise<void> {
  if (enVuelo) return enVuelo;
  if (!forzar && Date.now() - leidoAt < CACHE_MS) return Promise.resolve();
  enVuelo = conteoPorFacturar()
    .then((res) => {
      valor = res.ok ? Math.max(0, Number(res.data.por_facturar) || 0) : null;
    })
    .catch(() => {
      valor = null;
    })
    .finally(() => {
      leidoAt = Date.now();
      enVuelo = null;
      avisar();
    });
  return enVuelo;
}

function suscribir(cb: () => void) {
  suscriptores.add(cb);
  return () => {
    suscriptores.delete(cb);
  };
}

/** Número de vuelos por facturar, o `null` (sin badge). */
export function useConteoPorFacturar(habilitado: boolean): number | null {
  const pathname = usePathname();
  const { notifications } = useNotifications();
  const ultimaNotificacion = notifications[0]?.id ?? null;
  const actual = useSyncExternalStore(
    suscribir,
    () => valor,
    () => null,
  );

  // Al montar y al cambiar de pantalla (con caché de 30 s).
  useEffect(() => {
    if (!habilitado) return;
    void refrescarConteoPorFacturar();
  }, [habilitado, pathname]);

  // Llega una notificación nueva (p. ej. «Factura pedida»): se fuerza.
  useEffect(() => {
    if (!habilitado || !ultimaNotificacion) return;
    void refrescarConteoPorFacturar(true);
  }, [habilitado, ultimaNotificacion]);

  // Foco de la ventana, sondeo cada 120 s y el aviso de la propia pantalla
  // (pedir/retirar/registrar una factura: `avisarCambioPorFacturar`).
  useEffect(() => {
    if (!habilitado) return;
    const alFoco = () => void refrescarConteoPorFacturar();
    const alCambio = () => void refrescarConteoPorFacturar(true);
    window.addEventListener("focus", alFoco);
    window.addEventListener(EVENTO_CONTEO_POR_FACTURAR, alCambio);
    const reloj = window.setInterval(() => void refrescarConteoPorFacturar(true), SONDEO_MS);
    return () => {
      window.removeEventListener("focus", alFoco);
      window.removeEventListener(EVENTO_CONTEO_POR_FACTURAR, alCambio);
      window.clearInterval(reloj);
    };
  }, [habilitado]);

  return habilitado ? actual : null;
}
