import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Estado vacío estándar del admin (ícono en círculo + título + guía).
 * Fuente única: antes el mismo bloque estaba copiado en ~19 páginas.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="text-center py-12">
        <div className="flex justify-center mb-4">
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
            <Icon className="h-7 w-7 text-muted-foreground" />
          </div>
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {children}
      </CardHeader>
    </Card>
  );
}
