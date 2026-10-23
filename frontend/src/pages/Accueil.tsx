import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Banknote, CalendarRange, ClipboardList, GraduationCap, Layers, Plus, UserCheck, Wallet } from "lucide-react";
import { Bandeau, Indicateur, Liste, Pastille, Section } from "@/components/design";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ouvrirDocument } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateHeure, fcfa } from "@/lib/format";
import type { Config } from "@/lib/types";

type Tableau = {
  annee: string | null; eleves_inscrits: number; classes: number; filles: number;
  finances?: {
    encaisse_jour: number; encaisse_mois: number; impayes: number;
    derniers_paiements: { id: number; numero_recu: string; eleve: string; montant: number; moyen: string; encaisse_le: string }[];
  };
};

export function Accueil({ config }: { config: Config }) {
  const { moi, peut } = useAuth();
  const { data: t } = useQuery({ queryKey: ["tableau-de-bord"], queryFn: () => api<Tableau>("/api/tableau-de-bord") });
  const jour = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  if (moi && ["parent", "eleve"].includes(moi.role)) {
    return (
      <div className="space-y-7">
        <Bandeau surtitre={jour} titre={`Bonjour ${moi.prenom}`} texte={`Bienvenue dans l'espace de ${config.nom}.`} />
        <EmptyState icon={GraduationCap} title="Votre espace arrive bientôt"
          description="Notes, bulletins, absences, paiements et porte-monnaie de la carte scolaire seront disponibles ici." />
      </div>
    );
  }

  const f = t?.finances;
  return (
    <div className="space-y-7">
      <Bandeau surtitre={jour} titre={`Bonjour ${moi?.prenom || ""}`.trim()}
        texte={t?.annee ? `Année scolaire ${t.annee} : voici où en sont les inscriptions et les paiements.` : "Bienvenue dans votre espace établissement."}>
        {peut("frais.encaisser") && config.modules.includes("frais") ? (
          <Button asChild size="sm" className="bg-white text-degrade-2 hover:bg-white/90"><Link to="/caisse"><Banknote /> Encaisser</Link></Button>
        ) : null}
        {peut("notes.saisir") && config.modules.includes("notes") ? (
          <Button asChild size="sm" className="border border-white/25 bg-white/10 text-white hover:bg-white/20"><Link to="/notes"><ClipboardList /> Saisir des notes</Link></Button>
        ) : null}
        {peut("absences.saisir") && config.modules.includes("absences") ? (
          <Button asChild size="sm" className="border border-white/25 bg-white/10 text-white hover:bg-white/20"><Link to="/appel"><UserCheck /> Faire l'appel</Link></Button>
        ) : null}
        {peut("eleves.gerer") ? (
          <Button asChild size="sm" className="border border-white/25 bg-white/10 text-white hover:bg-white/20"><Link to="/eleves?nouveau=1"><Plus /> Nouvel élève</Link></Button>
        ) : null}
      </Bandeau>

      {t && !t.annee && peut("scolarite.parametrer") ? (
        <Link to="/classes" className="group flex items-center gap-4 rounded-xl border border-or/40 bg-or-soft p-4 transition-colors hover:border-or">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-or text-[#3d2c00]"><CalendarRange className="size-5" /></span>
          <div className="flex-1">
            <div className="font-semibold text-[#5c4100]">Commencez par l'année scolaire</div>
            <div className="text-sm text-[#7a5600]">Créez l'année 2026-2027 et ses classes, puis la grille des frais.</div>
          </div>
          <ArrowRight className="size-5 text-[#7a5600] transition-transform group-hover:translate-x-1" />
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link to="/eleves"><Indicateur icone={GraduationCap} valeur={t?.eleves_inscrits} libelle="élèves inscrits"
          detail={t && t.eleves_inscrits ? `dont ${t.filles} fille${t.filles > 1 ? "s" : ""}` : undefined} /></Link>
        <Link to="/classes"><Indicateur icone={Layers} valeur={t?.classes} libelle="classes" ton="bleu" /></Link>
        {f ? (
          <>
            <Link to="/caisse"><Indicateur icone={Wallet} valeur={fcfa(f.encaisse_jour)} libelle="encaissé aujourd'hui" ton="or" detail={`${fcfa(f.encaisse_mois)} ce mois`} /></Link>
            <Link to="/impayes"><Indicateur icone={AlertTriangle} valeur={fcfa(f.impayes)} libelle="d'impayés échus" ton="rose" /></Link>
          </>
        ) : null}
      </div>

      {f ? (
        <Section titre="Derniers paiements" action={<Link to="/caisse" className="text-sm font-medium text-primary hover:underline">Caisse</Link>}>
          {f.derniers_paiements.length ? (
            <Liste>
              {f.derniers_paiements.map((p) => (
                <button key={p.id} onClick={() => ouvrirDocument(`/recus/${p.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-accent-foreground"><Banknote className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.eleve}</div>
                    <div className="text-xs text-muted-foreground">{p.numero_recu} · {dateHeure(p.encaisse_le)}</div>
                  </div>
                  <Pastille ton="gris" className="hidden sm:inline-flex">{p.moyen}</Pastille>
                  <span className="font-semibold chiffres">{fcfa(p.montant)}</span>
                </button>
              ))}
            </Liste>
          ) : (
            <EmptyState icon={Banknote} title="Aucun paiement pour l'instant" description="Les encaissements apparaîtront ici." />
          )}
        </Section>
      ) : null}
    </div>
  );
}
