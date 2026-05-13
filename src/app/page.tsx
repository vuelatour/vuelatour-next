import { Clock, Plane } from "lucide-react";
import { serverApi } from "@/lib/api/server";
import { isInvitedError, ApiError } from "@/lib/api/errors";
import type { MeResponse } from "@/lib/api/me";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function HomePage() {
  let me: MeResponse | null = null;
  let invited = false;
  let errorMessage: string | null = null;

  try {
    me = await serverApi<MeResponse>("/v1/me");
  } catch (err) {
    if (isInvitedError(err)) {
      invited = true;
    } else if (err instanceof ApiError) {
      errorMessage = err.message;
    } else {
      errorMessage = "No se pudo contactar al servidor.";
    }
  }

  if (invited) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
              <Clock className="size-6" />
            </div>
            <CardTitle>Cuenta pendiente de activación</CardTitle>
            <CardDescription>
              Tu acceso fue creado pero un administrador necesita activarlo antes de que puedas usar el sistema.
              Contacta a tu administrador para completar el alta.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <SignOutButton />
          </CardContent>
        </Card>
      </main>
    );
  }

  if (errorMessage || !me) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Hubo un problema</CardTitle>
            <CardDescription>{errorMessage ?? "Error desconocido."}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <SignOutButton />
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Plane className="size-5 text-primary" />
            <span className="font-semibold">Vuelatour</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{me.nombre}</span>
            <Badge variant="secondary">{me.rol}</Badge>
            <SignOutButton />
          </div>
        </div>
      </header>
      <section className="mx-auto w-full max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Bienvenido, {me.nombre}.</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          La sesión está activa y el API responde. Próximos pasos: catálogos de aeronaves, aeropuertos y rutas.
        </p>
      </section>
    </main>
  );
}
