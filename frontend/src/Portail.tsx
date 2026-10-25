import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Building2, School } from "lucide-react";
import { Champ } from "@/components/design";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appliquerCouleurs } from "@/lib/couleurs";

/**
 * Accueil de l'adresse unique (hébergement gratuit) : chaque école a son espace sur /e/<code>.
 * Le dernier code utilisé est retenu sur cet appareil pour revenir en un clic.
 */
export function Portail() {
  const [code, setCode] = useState(() => {
    try {
      return localStorage.getItem("nexus.derniere-ecole") ?? "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    appliquerCouleurs("#0f766e", "#f59e0b");
    document.title = "NexusEcole";
  }, []);

  function ouvrir(e: FormEvent) {
    e.preventDefault();
    const propre = code.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!propre) return;
    try {
      localStorage.setItem("nexus.derniere-ecole", propre);
    } catch {
      /* stockage indisponible */
    }
    window.location.assign(`/e/${propre}`);
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-gradient-to-br from-degrade-1 via-degrade-2 to-degrade-3 p-5">
      <div className="w-full max-w-md rounded-2xl bg-card p-7 shadow-haute">
        <div className="mb-6 flex items-center gap-3">
          <span className="inline-flex size-12 items-center justify-center rounded-xl bg-marque text-sidebar"><School className="size-6" /></span>
          <div>
            <h1 className="text-2xl font-semibold">NexusEcole</h1>
            <p className="text-sm text-muted-foreground">La gestion de votre établissement, en ligne.</p>
          </div>
        </div>
        <form onSubmit={ouvrir} className="space-y-4">
          <Champ label="Code de votre école" aide="Donné par NexusEcole à la création de l'espace (ex. lycee-demo).">
            <Input autoFocus required value={code} onChange={(e) => setCode(e.target.value)} placeholder="lycee-demo" autoCapitalize="none" />
          </Champ>
          <Button type="submit" size="lg" className="w-full">Accéder à mon école <ArrowRight /></Button>
        </form>
        <a href="/console" className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <Building2 className="size-4" /> Console éditeur
        </a>
      </div>
    </div>
  );
}
