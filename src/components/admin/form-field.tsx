import { Label } from "@/components/ui/label";

/**
 * Campo de formulario estándar del admin: label (+asterisco si es requerido),
 * control, y hint/error debajo (el error pisa al hint). Fuente ÚNICA: antes
 * había ~30 copias locales con variaciones sutiles de estilos de error.
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
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {(hint || error) && (
        <p
          className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
