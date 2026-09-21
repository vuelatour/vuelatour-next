"use client";

import { useEffect, useState } from "react";
import {
  BOTON_INICIO,
  BOTON_REINTENTAR,
  ETIQUETA_CODIGO,
  ETIQUETA_HORA,
  ETIQUETA_RUTA,
  MENSAJE_ERROR,
  TITULO_ERROR,
  codigoDeError,
  horaCancun,
  rutaActual,
} from "@/lib/admin/pantalla-error";

/**
 * Último recurso: el layout raíz mismo falló, así que Next NO monta ni el
 * layout ni sus estilos (esta pantalla reemplaza el documento completo). Por
 * eso va con estilos EN LÍNEA y sin ningún componente de UI — pero con el
 * MISMO texto en es-MX que el resto: el operador nunca debe toparse con la
 * página en inglés de Next.
 */
export default function GlobalError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /** Vuelve a PEDIR y re-renderizar; `reset` solo limpia el estado. */
  unstable_retry?: () => void;
}) {
  const reintentar = unstable_retry ?? reset;
  const [info] = useState(() => ({
    hora: horaCancun(),
    ruta: rutaActual(typeof window === "undefined" ? null : window.location),
  }));

  useEffect(() => {
    console.error("[global] error de pantalla", error);
  }, [error]);

  const dato = (etiqueta: string, valor: string) => (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ color: "#829ab1", width: 110, flexShrink: 0 }}>{etiqueta}</span>
      <span
        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", wordBreak: "break-all" }}
        suppressHydrationWarning
      >
        {valor}
      </span>
    </div>
  );

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#102a43",
          color: "#f0f4f8",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: 16,
        }}
      >
        <div
          style={{
            maxWidth: 520,
            width: "100%",
            background: "#14314f",
            border: "1px solid #24476b",
            borderRadius: 14,
            padding: 24,
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>{TITULO_ERROR}</h1>
          <p style={{ fontSize: 14, color: "#bcccdc", margin: "0 0 16px" }}>{MENSAJE_ERROR}</p>
          <div
            style={{
              textAlign: "left",
              fontSize: 12,
              background: "rgba(0,0,0,.2)",
              border: "1px solid #24476b",
              borderRadius: 10,
              padding: "10px 12px",
              display: "grid",
              gap: 6,
              marginBottom: 16,
            }}
          >
            {dato(ETIQUETA_CODIGO, codigoDeError(error))}
            {dato(ETIQUETA_HORA, info.hora)}
            {dato(ETIQUETA_RUTA, info.ruta)}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reintentar}
              style={{
                height: 36,
                padding: "0 16px",
                borderRadius: 8,
                border: "none",
                background: "#dc2626",
                color: "#fff",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {BOTON_REINTENTAR}
            </button>
            {/* Navegación DURA a propósito: el layout raíz falló, así que un
                <Link> (navegación cliente) volvería al mismo árbol roto. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/admin"
              style={{
                height: 36,
                padding: "0 16px",
                borderRadius: 8,
                border: "1px solid #24476b",
                color: "#f0f4f8",
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              {BOTON_INICIO}
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
