"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QrCodeIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { buscarPorCodigoAction } from "@/app/admin/inventory/actions";
import { normalizarCodigo } from "@/app/admin/inventory/schema";
import { ItemFormDialog } from "./item-form-dialog";

/** Un código de barras real: solo dígitos y al menos 8 (EAN-8/UPC/EAN-13/ITF-14). */
const pareceCodigoBarras = (s: string) => /^\d{8,}$/.test(s);

/**
 * Buscador por código de barras del inventario. Pensado para el lector USB
 * (teclea los dígitos y manda Enter) y para pegar el código: con ≥ 8 dígitos
 * busca solo; con Enter busca lo que haya. Ítem → abre su ficha; empaque
 * (caja) → abre la ficha con el movimiento listo para capturar por caja; no
 * existe → toast con «Dar de alta con este código».
 */
export function CodigoSearch({ categorias }: { categorias: string[] }) {
  const router = useRouter();
  const [valor, setValor] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [altaCodigo, setAltaCodigo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);
  const ultimoRef = useRef<string>("");

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  // Tras un 404/error el input se re-habilita en el MISMO render en que se
  // pedía el foco: select() corría con el input aún disabled y el foco se
  // perdía (el lector USB tecleaba al vacío). Se enfoca después de pintar.
  const [enfoquePendiente, setEnfoquePendiente] = useState(0);
  useEffect(() => {
    if (enfoquePendiente === 0 || buscando) return;
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [enfoquePendiente, buscando]);

  const buscar = async (raw: string) => {
    const codigo = normalizarCodigo(raw);
    if (!codigo || buscando) return;
    ultimoRef.current = codigo;
    setBuscando(true);
    const res = await buscarPorCodigoAction(codigo).catch((err: unknown) => ({
      ok: false as const,
      data: undefined,
      status: undefined,
      error: err instanceof Error ? err.message : "No se pudo buscar el código",
    }));
    setBuscando(false);
    if (res.ok && res.data) {
      const { tipo, item, empaque } = res.data;
      setValor("");
      if (tipo === "EMPAQUE" && empaque) {
        toast.success(`${empaque.nombre} de ${item.nombre}`, {
          description: "Captura cuántas cajas entran o salen.",
        });
        router.push(`/admin/inventory/${item.id}?empaque=${encodeURIComponent(empaque.id)}`);
      } else {
        router.push(`/admin/inventory/${item.id}`);
      }
      return;
    }
    if (res.status === 404) {
      toast.warning(`Código ${codigo} no registrado`, {
        description: "Ningún producto ni caja tiene ese código de barras.",
        action: {
          label: "Dar de alta con este código",
          onClick: () => setAltaCodigo(codigo),
        },
        duration: 8000,
      });
      setEnfoquePendiente((n) => n + 1);
      return;
    }
    toast.error(res.error ?? "No se pudo buscar el código");
    setEnfoquePendiente((n) => n + 1);
  };

  const onChange = (v: string) => {
    setValor(v);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    const codigo = normalizarCodigo(v);
    // El lector teclea muy rápido y a veces sin Enter: una pausa corta con
    // un código completo dispara la búsqueda sola.
    if (pareceCodigoBarras(codigo) && codigo !== ultimoRef.current) {
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void buscar(codigo);
      }, 400);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="relative w-full max-w-sm">
          <QrCodeIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={valor}
            inputMode="numeric"
            autoComplete="off"
            aria-label="Buscar por código de barras"
            placeholder={buscando ? "Buscando…" : "Escanea o teclea un código de barras + Enter"}
            className="h-9 pl-8 font-mono text-sm"
            disabled={buscando}
            onChange={(e) => onChange(e.target.value)}
            onPaste={(e) => {
              const pegado = normalizarCodigo(e.clipboardData.getData("text"));
              if (pareceCodigoBarras(pegado)) {
                e.preventDefault();
                setValor(pegado);
                void buscar(pegado);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (timerRef.current !== null) {
                  window.clearTimeout(timerRef.current);
                  timerRef.current = null;
                }
                ultimoRef.current = "";
                void buscar(valor);
              }
            }}
          />
        </div>
        <p className="hidden text-xs text-muted-foreground sm:block">
          Abre el producto (o su caja) al instante.
        </p>
      </div>

      <ItemFormDialog
        open={altaCodigo !== null}
        onOpenChange={(o) => {
          if (!o) {
            setAltaCodigo(null);
            ultimoRef.current = "";
          }
        }}
        categorias={categorias}
        initialCodigo={altaCodigo ?? undefined}
      />
    </>
  );
}
