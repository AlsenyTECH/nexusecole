import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ErreurApi } from "@/lib/api";
import { AuthProvider } from "@/lib/auth";
import { appliquerMode, modeEnregistre } from "@/lib/theme";
import { ConsoleApp } from "@/console/ConsoleApp";
import { EcoleApp } from "@/EcoleApp";
import { espace } from "@/lib/ecole";
import { Portail } from "@/Portail";
import "./index.css";

appliquerMode(modeEnregistre());
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", () => appliquerMode(modeEnregistre()));

const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Inutile de réessayer une requête refusée (droits, introuvable) : seulement les pannes réseau.
      retry: (n, e) => !(e instanceof ErreurApi && e.status < 500) && n < 2,
    },
  },
});

// Un seul build : le sous-domaine (ou le chemin /e/<école>, /console) décide de l'espace affiché.
const Application = { console: ConsoleApp, ecole: EcoleApp, portail: Portail }[espace.type];

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter basename={espace.base || undefined}>
        <AuthProvider>
          <Application />
          <Toaster position="top-center" richColors />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
