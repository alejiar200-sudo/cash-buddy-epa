import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet, createRootRouteWithContext, useRouter, HeadContent, Scripts,
} from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { StoreProvider } from "@/lib/store";
import { DayProvider } from "@/lib/day-context";
import { AppShell } from "@/components/AppShell";
import { Toaster } from "@/components/ui/sonner";

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-7xl font-black">404</h1>
        <p className="mt-2 text-muted-foreground">Página no encontrada</p>
        <a href="/" className="inline-block mt-6 px-5 py-3 bg-primary text-primary-foreground rounded-xl font-bold">Volver al inicio</a>
      </div>
    </div>
  );
}

function ErrorView({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold">Algo salió mal</h1>
        <p className="text-sm text-muted-foreground mt-2">{error.message}</p>
        <button onClick={() => { router.invalidate(); reset(); }} className="mt-6 px-5 py-3 bg-primary text-primary-foreground rounded-xl font-bold">
          Intentar de nuevo
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Epa — Caja diaria" },
      { name: "description", content: "Sistema de gestión de caja diaria para Epa" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ErrorView,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <DayProvider>
          <AppShell>
            <Outlet />
          </AppShell>
          <Toaster position="top-right" theme="dark" richColors />
        </DayProvider>
      </StoreProvider>
    </QueryClientProvider>
  );
}
