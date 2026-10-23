import type { ReactNode, SelectHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Composants de mise en page communs (repris du design d'AP2A Impact).

const TEINTES = [
  "bg-primary-soft text-accent-foreground", "bg-[#e6eefb] text-[#1f4e99]", "bg-[#fdf3d8] text-[#7a5600]",
  "bg-[#fbe8ef] text-[#9b2c55]", "bg-[#ece8fb] text-[#4f3aa3]",
];
const teinte = (t: string) => TEINTES[[...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TEINTES.length];
const TAILLES = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-16 text-xl" };

/** Initiales sur une pastille de couleur stable (déduite du nom). */
export function Avatar({ prenom = "", nom = "", taille = "md", className }: {
  prenom?: string; nom?: string; taille?: keyof typeof TAILLES; className?: string;
}) {
  const initiales = `${prenom.trim()[0] ?? ""}${nom.trim()[0] ?? ""}`.toUpperCase() || "?";
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-heading font-semibold",
      teinte(`${prenom}${nom}`), TAILLES[taille], className)}>
      {initiales}
    </span>
  );
}

/** Indicateur chiffré : icône teintée, valeur, libellé. */
export function Indicateur({ icone: Icone, valeur, libelle, detail, ton = "vert" }: {
  icone: LucideIcon; valeur: ReactNode; libelle: string; detail?: ReactNode; ton?: "vert" | "or" | "bleu" | "rose";
}) {
  const tons = {
    vert: "bg-primary-soft text-accent-foreground", or: "bg-[#fdf3d8] text-[#7a5600]",
    bleu: "bg-[#e6eefb] text-[#1f4e99]", rose: "bg-[#fbe8ef] text-[#9b2c55]",
  };
  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-carte">
      <span className={cn("inline-flex size-9 items-center justify-center rounded-lg [&_svg]:size-[18px]", tons[ton])}><Icone /></span>
      <div>
        <div className="font-heading text-xl font-semibold leading-tight chiffres sm:text-2xl">{valeur ?? "…"}</div>
        <div className="text-[13px] text-muted-foreground">{libelle}</div>
        {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
      </div>
    </div>
  );
}

/** En-tête de page : titre, sous-titre et actions à droite. */
export function EnTete({ titre, sousTitre, actions }: { titre: string; sousTitre?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold md:text-[28px]">{titre}</h1>
        {sousTitre ? <p className="mt-1 text-sm text-muted-foreground">{sousTitre}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** Bandeau en dégradé aux couleurs de l'école. */
export function Bandeau({ surtitre, titre, texte, children }: { surtitre?: string; titre: string; texte?: string; children?: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-degrade-1 via-degrade-2 to-degrade-3 p-6 text-white shadow-haute md:p-8">
      <svg aria-hidden className="absolute -right-10 -top-10 size-64 opacity-[0.08]" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="90" fill="none" stroke="white" strokeWidth="18" />
        <circle cx="100" cy="100" r="45" fill="none" stroke="white" strokeWidth="18" />
      </svg>
      <div className="relative">
        {surtitre ? <p className="text-sm first-letter:uppercase text-white/70">{surtitre}</p> : null}
        <h1 className="mt-1 text-2xl font-semibold text-white md:text-3xl">{titre}</h1>
        {texte ? <p className="mt-1 max-w-xl text-sm text-white/80 md:text-base">{texte}</p> : null}
        {children ? <div className="mt-5 flex flex-wrap gap-2">{children}</div> : null}
      </div>
    </div>
  );
}

/** Titre de section, avec un lien ou un bouton à droite. */
export function Section({ titre, action, children, className }: { titre: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{titre}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Liste encadrée : lignes séparées, coins arrondis. */
export function Liste({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-border/70 overflow-hidden rounded-xl border border-border/80 bg-card shadow-carte", className)}>{children}</div>;
}

/** Squelette de chargement. */
export function Squelette({ lignes = 5 }: { lignes?: number }) {
  return (
    <Liste>
      {Array.from({ length: lignes }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <span className="size-10 animate-pulse rounded-full bg-muted" />
          <span className="flex-1 space-y-2">
            <span className="block h-3.5 w-2/5 animate-pulse rounded bg-muted" />
            <span className="block h-3 w-3/5 animate-pulse rounded bg-muted/70" />
          </span>
        </div>
      ))}
    </Liste>
  );
}

/** Champ de formulaire : libellé, contrôle, aide. */
export function Champ({ label, aide, children, className }: { label: string; aide?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[13px] font-medium">{label}</Label>
      {children}
      {aide ? <p className="text-xs text-muted-foreground">{aide}</p> : null}
    </div>
  );
}

const COULEURS_PASTILLE = {
  vert: "bg-[#e2f4e2] text-[#0b6b0b] [--point:#0ca30c]",
  or: "bg-or-soft text-[#7a5600] [--point:#e9a812]",
  rouge: "bg-[#fbe6e6] text-[#a32b2b] [--point:#d03b3b]",
  bleu: "bg-[#e6eefb] text-[#1f4e99] [--point:#3b6fc4]",
  gris: "bg-muted text-muted-foreground [--point:#8a978f]",
};

/** Pastille de statut avec point de couleur. */
export function Pastille({ ton, children, className }: { ton: keyof typeof COULEURS_PASTILLE; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", COULEURS_PASTILLE[ton], className)}>
      <span className="size-1.5 rounded-full bg-[var(--point)]" />
      {children}
    </span>
  );
}

/** Sélecteur natif stylé comme les champs (léger et efficace sur téléphone). */
export function Choix({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn("flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50", className)}
      {...props}
    />
  );
}

/** Initiales d'un établissement : « Lycée Démo » → LD, « Institution Sainte-Marie » → SM. */
export function initialesEcole(nom: string) {
  const sansType = nom.replace(/^(École|Ecole|Lycée|Collège|Institution|Groupe scolaire|Complexe scolaire)\s+/i, "");
  const mots = (sansType.split(/[\s-]+/).filter((m) => m.length > 2).length > 1 ? sansType : nom).split(/[\s-]+/).filter((m) => m.length > 2);
  return (mots.length > 1 ? mots.slice(0, 2).map((m) => m[0]).join("") : (mots[0] ?? nom).slice(0, 2)).toUpperCase();
}
