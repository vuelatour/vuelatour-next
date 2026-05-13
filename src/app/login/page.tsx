import { Suspense } from "react";
import { Plane } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Plane className="size-6" />
          </div>
          <CardTitle>Vuelatour</CardTitle>
          <CardDescription>Sistema de Control Financiero y Operativo</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Suspense fallback={<Skeleton className="h-9 w-full" />}>
            <LoginForm />
          </Suspense>
          <p className="text-muted-foreground text-center text-xs">
            Solo cuentas autorizadas por el administrador pueden acceder al sistema.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
