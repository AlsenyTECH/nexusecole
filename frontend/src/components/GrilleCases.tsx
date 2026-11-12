import { JOURS } from "@/components/Grille";
import type { Case } from "@/lib/types";
import { cn } from "@/lib/utils";

export const cle = (j: number, i: number) => `${j}-${i}`;
export const versCases = (s: Set<string>): Case[] => [...s].map((k) => k.split("-").map(Number) as Case).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
export const versEnsemble = (c: Case[] | undefined) => new Set((c ?? []).map(([j, i]) => cle(j, i)));

export type RenduCase = { classe: string; texte?: string; desactive?: boolean };

/** Grille jours × heures cliquable (créneaux ouverts de l'école, disponibilités d'un professeur). */
export function GrilleCases({ heures, rendu, cliquer, cliquerJour, jours = 6 }: {
  heures: string[]; rendu: (j: number, i: number) => RenduCase; cliquer?: (j: number, i: number) => void;
  cliquerJour?: (j: number) => void; jours?: number;
}) {
  const fin = (h: string) => `${String(Number(h.slice(0, 2)) + 1).padStart(2, "0")}${h.slice(2)}`;
  return (
    <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-carte">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-24 p-2 text-left text-xs font-semibold text-muted-foreground">Heure</th>
            {JOURS.slice(0, jours).map((nom, d) => (
              <th key={nom} className="p-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {cliquerJour ? <button type="button" className="rounded px-1.5 py-0.5 hover:bg-muted" onClick={() => cliquerJour(d + 1)}
                  title="Tout le jour">{nom}</button> : nom}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {heures.map((h, i) => (
            <tr key={h} className={cn(i > 0 && heures[i - 1] < "13:00" && h >= "13:00" && "border-t-4 border-muted")}>
              <td className="p-2 text-xs font-semibold chiffres text-muted-foreground">{h.replace(":", "h")} – {fin(h).replace(":", "h")}</td>
              {JOURS.slice(0, jours).map((nom, d) => {
                const r = rendu(d + 1, i);
                return (
                  <td key={nom} className="p-1">
                    <button type="button" disabled={!cliquer || r.desactive} onClick={() => cliquer?.(d + 1, i)}
                      aria-label={`${nom} ${h}`}
                      className={cn("flex h-9 w-full items-center justify-center rounded-md border text-xs font-medium transition-colors", r.classe,
                        cliquer && !r.desactive && "hover:brightness-95")}>
                      {r.texte}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const STYLE = {
  ouvert: "border-primary/30 bg-primary-soft text-accent-foreground",
  ferme: "border-dashed border-border bg-muted/40 text-muted-foreground",
  libre: "border-border bg-card text-muted-foreground",
  prefere: "border-[#3b6fc4]/40 bg-[#e6eefb] text-[#1f4e99]",
  indispo: "border-[#d03b3b]/40 bg-[#fbe6e6] text-[#a32b2b]",
};

/** Disponibilités : clic = libre → préféré → indisponible → libre. */
export function GrilleDispo({ heures, ouverts, indispo, prefere, changer, lecture }: {
  heures: string[]; ouverts: Set<string>; indispo: Set<string>; prefere: Set<string>;
  changer?: (indispo: Set<string>, prefere: Set<string>) => void; lecture?: boolean;
}) {
  const cliquer = (j: number, i: number) => {
    const k = cle(j, i), ind = new Set(indispo), pre = new Set(prefere);
    if (ind.has(k)) ind.delete(k);
    else if (pre.has(k)) { pre.delete(k); ind.add(k); }
    else pre.add(k);
    changer?.(ind, pre);
  };
  return (
    <div className="space-y-2">
      <GrilleCases heures={heures} cliquer={lecture ? undefined : cliquer}
        rendu={(j, i) => {
          const k = cle(j, i);
          if (!ouverts.has(k)) return { classe: STYLE.ferme, desactive: true };
          if (indispo.has(k)) return { classe: STYLE.indispo, texte: "Indisponible" };
          if (prefere.has(k)) return { classe: STYLE.prefere, texte: "Préféré" };
          return { classe: STYLE.libre, texte: "Libre" };
        }} />
      <p className="text-xs text-muted-foreground">
        Cliquez une case : <span className="font-medium">libre</span> → <span className="font-medium text-[#1f4e99]">préféré</span> →{" "}
        <span className="font-medium text-[#a32b2b]">indisponible</span>. Les cases grisées sont fermées dans la grille de l'école.
      </p>
    </div>
  );
}
