"use client";

import { useState, useTransition } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createSocioAction } from "@/app/admin/users/actions";
import {
  ETIQUETA_ES_EMPRESA,
  NOMBRE_SOCIO_MAX,
  PLACEHOLDER_NUEVO_SOCIO,
  PLACEHOLDER_SOCIO,
  VALOR_NUEVO_SOCIO,
  opcionesSocios,
  resolverNuevoSocio,
  textoSocioCreado,
  textoSocioYaExistia,
  type UsuarioOpcion,
} from "@/lib/admin/propietarios";
import type { User } from "@/types/users";

interface SocioSelectorProps {
  /** Lo pone `Field` (clona a su único hijo) o quien lo monte. */
  id?: string;
  /** "" = sin elegir. */
  value: string;
  onChange: (socioId: string) => void;
  /** TODOS los usuarios (cualquier estado): los socios reales están INACTIVOS. */
  usuarios: readonly UsuarioOpcion[];
  /** Tras un alta en línea (o un 409 con el existente): el usuario que entra a la lista. */
  onUsuarioNuevo: (u: UsuarioOpcion) => void;
  /** ADMIN (`POST /v1/users/socios`): ofrece «＋ Nuevo socio…». */
  puedeCrear?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}

function opcionDeUsuario(u: User): UsuarioOpcion {
  return { id: u.id, nombre: u.nombre, rol: u.rol, estado: u.estado, es_empresa: u.es_empresa ?? null };
}

/**
 * Selector de SOCIO con alta en el MISMO lugar (19-oct-2026, pedido del
 * cliente: «que sea sencillo sin tenerme que salir o mover a otra pantalla
 * que pueda agregar un socio desde esta parte»).
 *
 *  - Lista los socios y empresas de cualquier estado (antes solo usuarios
 *    ACTIVOS: salían pilotos y oficina y ningún socio real).
 *  - «＋ Nuevo socio…» es la última opción: cambia el selector por un campo
 *    de nombre + «Es una empresa» (Enter guarda, Esc cancela; los dos con
 *    stopPropagation: sin eso Enter enviaría el formulario y Esc cerraría la
 *    ventana). Lo tecleado que ya existe (sin acentos ni mayúsculas) se
 *    ELIGE en vez de duplicarse; el 409 `SOCIO_YA_EXISTE` del API también.
 *  - El socio nuevo nace INACTIVO y sin acceso al sistema (lo decide el API).
 */
export function SocioSelector({
  id,
  value,
  onChange,
  usuarios,
  onUsuarioNuevo,
  puedeCrear = false,
  disabled = false,
  "aria-label": ariaLabel,
}: SocioSelectorProps) {
  const [pending, startTransition] = useTransition();
  const [agregando, setAgregando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [esEmpresa, setEsEmpresa] = useState(false);
  const [errorApi, setErrorApi] = useState<string | null>(null);

  const opciones = opcionesSocios(usuarios, value, { conNuevo: puedeCrear });
  const alta = nombre.trim() ? resolverNuevoSocio(nombre, usuarios) : null;
  const errorLocal = alta && alta.tipo === "INVALIDO" ? alta.error : null;
  const error = errorLocal ?? errorApi;

  const cancelar = () => {
    setAgregando(false);
    setNombre("");
    setEsEmpresa(false);
    setErrorApi(null);
  };

  const guardar = () => {
    if (pending || !alta) return;
    if (alta.tipo === "EXISTE") {
      onChange(alta.usuario.id);
      toast.success(textoSocioYaExistia(alta.usuario.nombre));
      cancelar();
      return;
    }
    if (alta.tipo !== "NUEVO") return;
    startTransition(async () => {
      const res = await createSocioAction({ nombre: alta.nombre, es_empresa: esEmpresa }).catch(() => ({
        ok: false as const,
        error: "El servidor no respondió. Vuelve a intentarlo.",
      }));
      if (res.ok && res.data) {
        const nuevo = opcionDeUsuario(res.data);
        // Primero la lista (para que la opción exista) y luego la selección.
        onUsuarioNuevo(nuevo);
        onChange(nuevo.id);
        cancelar();
        toast.success(textoSocioCreado(nuevo.nombre));
        return;
      }
      // Otro usuario con ese nombre que la lista local no tenía: se elige.
      const existente = (res as { details?: { usuario?: UsuarioOpcion } }).details?.usuario;
      if ((res as { code?: string }).code === "SOCIO_YA_EXISTE" && existente?.id) {
        onUsuarioNuevo(existente);
        onChange(existente.id);
        cancelar();
        toast.success(textoSocioYaExistia(existente.nombre));
        return;
      }
      const fe = (res as { fieldErrors?: Record<string, string[]> }).fieldErrors;
      setErrorApi(fe?.nombre?.[0] ?? res.error ?? "No se pudo dar de alta al socio.");
    });
  };

  if (agregando) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Input
            id={id}
            value={nombre}
            autoFocus
            maxLength={NOMBRE_SOCIO_MAX + 10}
            placeholder={PLACEHOLDER_NUEVO_SOCIO}
            aria-label={PLACEHOLDER_NUEVO_SOCIO}
            aria-invalid={error ? true : undefined}
            disabled={pending}
            onChange={(e) => {
              setNombre(e.target.value);
              setErrorApi(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // Sin esto el Enter ENVÍA el formulario de la ventana.
                e.preventDefault();
                e.stopPropagation();
                guardar();
              }
              if (e.key === "Escape") {
                // Esc cancela el alta, NO cierra la ventana.
                e.preventDefault();
                e.stopPropagation();
                cancelar();
              }
            }}
            className="h-9"
          />
          <Button
            type="button"
            size="sm"
            className="h-9 shrink-0 cursor-pointer"
            onClick={guardar}
            disabled={pending || !alta || !!errorLocal}
          >
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-9 w-9 shrink-0 cursor-pointer p-0"
            aria-label="Cancelar"
            title="Cancelar (Esc)"
            onClick={cancelar}
            disabled={pending}
          >
            <XMarkIcon className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id={id ? `${id}-empresa` : undefined}
            size="sm"
            checked={esEmpresa}
            onCheckedChange={(v) => setEsEmpresa(Boolean(v))}
            disabled={pending}
            aria-label={ETIQUETA_ES_EMPRESA}
          />
          <Label htmlFor={id ? `${id}-empresa` : undefined} className="text-xs font-normal">
            {ETIQUETA_ES_EMPRESA}
          </Label>
        </div>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <SearchableSelect
      id={id}
      aria-label={ariaLabel}
      options={opciones}
      value={value}
      disabled={disabled}
      placeholder={PLACEHOLDER_SOCIO}
      searchPlaceholder="Buscar socio…"
      emptyText="Sin resultados"
      onChange={(v) => {
        if (v === VALOR_NUEVO_SOCIO) {
          // La opción centinela NO se elige: abre el alta en línea
          // (el valor anterior se conserva si se cancela).
          setAgregando(true);
          setNombre("");
          setEsEmpresa(false);
          setErrorApi(null);
          return;
        }
        onChange(v);
      }}
    />
  );
}
