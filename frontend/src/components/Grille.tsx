import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { Creneau } from "@/lib/types";
import { cn } from "@/lib/utils";

export const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const heure = (h: string) => h.slice(0, 5).replace(":", "h");

/** Emploi du temps de la semaine : une colonne par jour (empilées sur téléphone). */
export function GrilleSemaine({ creneaux, vue = "classe", choisir }: {
  creneaux: Creneau[]; vue?: "classe" | "enseignant"; choisir?: (c: Creneau) => void;
}) {
  if (!creneaux.length) return <EmptyState icon={CalendarDays} title="Emploi du temps vide" />;
  const jours = JOURS.map((nom, i) => ({ nom, creneaux: creneaux.filter((c) => c.jour === i + 1).sort((a, b) => a.debut.localeCompare(b.debut)) }))
    .filter((j, i) => j.creneaux.length || i < 5);
  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      {jours.map((j) => (
        <div key={j.nom} className="space-y-2 rounded-xl border border-border/80 bg-card p-3 shadow-carte">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{j.nom}</div>
          {j.creneaux.length ? j.creneaux.map((c) => (
            <button key={c.id} type="button" disabled={!choisir} onClick={() => choisir?.(c)}
              className={cn("block w-full rounded-lg border-l-4 border-primary bg-primary-soft/50 px-2.5 py-2 text-left", choisir && "hover:bg-primary-soft")}>
              <div className="text-xs font-semibold chiffres text-accent-foreground">{heure(c.debut)} – {heure(c.fin)}</div>
              <div className="text-sm font-medium">{c.matiere_nom}</div>
              <div className="text-xs text-muted-foreground">
                {[vue === "enseignant" ? c.classe_nom : c.enseignant_nom, c.salle && `salle ${c.salle}`].filter(Boolean).join(" · ")}
              </div>
            </button>
          )) : <p className="text-xs text-muted-foreground">—</p>}
        </div>
      ))}
    </div>
  );
}
