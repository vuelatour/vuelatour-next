import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { signOut } from "@/app/actions/auth";

export function UnknownErrorScreen({ message }: { message: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="vt-card p-8 space-y-6 text-center">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
              <ExclamationTriangleIcon className="h-7 w-7 text-brand-600 dark:text-brand-400" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Algo salió mal</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
            >
              Cerrar sesión e intentar de nuevo
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
