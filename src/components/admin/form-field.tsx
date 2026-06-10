import { cloneElement, isValidElement, useId } from "react";
import { Label } from "@/components/ui/label";

/**
 * Campo de formulario estándar del admin: label (+asterisco si es requerido),
 * control, y hint/error debajo (el error pisa al hint). Fuente ÚNICA: antes
 * había ~30 copias locales con variaciones sutiles de estilos de error.
 *
 * Accesibilidad: liga label↔control automáticamente (htmlFor + id generado)
 * cuando el hijo es un único elemento sin id propio; el error se anuncia con
 * role="alert".
 */
export function Field({
  label,
  hint,
  required,
  error,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  const autoId = useId();
  let control = children;
  let htmlFor: string | undefined;
  if (isValidElement(children)) {
    const existing = (children.props as { id?: string }).id;
    htmlFor = existing ?? autoId;
    if (!existing) {
      control = cloneElement(children as React.ReactElement<{ id?: string }>, {
        id: autoId,
      });
    }
  }
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium" htmlFor={htmlFor}>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {control}
      {(hint || error) && (
        <p
          role={error ? "alert" : undefined}
          className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
