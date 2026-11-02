import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Landmark, PiggyBank, ShieldAlert, ShieldCheck, Wallet } from "lucide-react";
import { Champ, EnTete, Indicateur, Liste, Pastille, Section } from "@/components/design";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { aujourdhui, fcfa, MOYENS } from "@/lib/format";

type Rapport = {
  caisses: { id: number; nom: string; comptabilisee: boolean; total: number; detail: { libelle: string; montant: number }[] }[];
  porte_monnaie: { solde_total: number; recharges: { moyen: string; montant: number }[] };
};

/** Recettes par caisse : ce qui est comptabilisé par l'école, ce qui revient aux élèves, et l'argent des familles en dépôt. */
export function RapportCaisses() {
  const [du, setDu] = useState(aujourdhui().slice(0, 8) + "01");
  const [au, setAu] = useState(aujourdhui());
  const { data } = useQuery({ queryKey: ["rapport-caisses", du, au], queryFn: () => api<Rapport>(`/api/finances/caisses?du=${du}&au=${au}`) });
  const { data: livre } = useQuery({ queryKey: ["grand-livre"], queryFn: () => api<{ intact: boolean; mouvements: number }>("/api/porte-monnaie/grand-livre"), retry: false });
  const comptabilise = data?.caisses.filter((c) => c.comptabilisee).reduce((t, c) => t + c.total, 0);
  const horsCompta = data?.caisses.filter((c) => !c.comptabilisee).reduce((t, c) => t + c.total, 0);
  const recharges = data?.porte_monnaie.recharges.reduce((t, r) => t + r.montant, 0);

  return (
    <div className="space-y-6">
      <EnTete titre="Recettes par caisse" sousTitre="Frais scolaires, ventes et tickets, séparés selon la caisse qui les reçoit." />
      <div className="flex flex-wrap gap-3">
        <Champ label="Du"><Input type="date" value={du} onChange={(e) => setDu(e.target.value)} /></Champ>
        <Champ label="Au"><Input type="date" value={au} onChange={(e) => setAu(e.target.value)} /></Champ>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicateur icone={Landmark} valeur={fcfa(comptabilise)} libelle="recettes de l'école (comptabilisées)" />
        <Indicateur icone={PiggyBank} valeur={fcfa(horsCompta)} libelle="recettes hors comptabilité" ton="or" />
        <Indicateur icone={Wallet} valeur={fcfa(recharges)} libelle="recharges des porte-monnaie" ton="bleu" />
        <Indicateur icone={Wallet} valeur={fcfa(data?.porte_monnaie.solde_total)} libelle="argent des familles en dépôt" ton="rose"
          detail="à rendre ou à dépenser : pas une recette" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {data?.caisses.map((c) => (
          <Section key={c.id} titre={c.nom} action={<Pastille ton={c.comptabilisee ? "bleu" : "or"}>{c.comptabilisee ? "Comptabilisée" : "Hors comptabilité"}</Pastille>}>
            <Liste>
              {c.detail.length ? c.detail.map((d) => (
                <div key={d.libelle} className="flex justify-between px-4 py-2.5 text-sm"><span>{d.libelle}</span><span className="chiffres">{fcfa(d.montant)}</span></div>
              )) : <p className="px-4 py-2.5 text-sm text-muted-foreground">Aucune recette sur la période.</p>}
              <div className="flex justify-between bg-muted/40 px-4 py-2.5 font-semibold"><span>Total</span><span className="chiffres">{fcfa(c.total)}</span></div>
            </Liste>
          </Section>
        ))}
      </div>
      {data?.porte_monnaie.recharges.length ? (
        <Section titre="Recharges des porte-monnaie (par moyen)">
          <Liste>{data.porte_monnaie.recharges.map((r) => (
            <div key={r.moyen} className="flex justify-between px-4 py-2.5 text-sm"><span>{MOYENS[r.moyen] ?? r.moyen}</span><span className="chiffres">{fcfa(r.montant)}</span></div>
          ))}</Liste>
        </Section>
      ) : null}
      {livre ? (
        <div className={`flex items-center gap-3 rounded-xl border p-4 text-sm ${livre.intact ? "border-primary/30 bg-primary-soft/40" : "border-destructive/40 bg-[#fbe6e6]"}`}>
          {livre.intact ? <ShieldCheck className="size-5 text-primary" /> : <ShieldAlert className="size-5 text-destructive" />}
          {livre.intact ? `Grand livre des porte-monnaie intact : ${livre.mouvements} mouvements, chaîne d'empreintes vérifiée.`
            : "ALERTE : le grand livre des porte-monnaie a été modifié en dehors de l'application. Contactez NexusEcole."}
        </div>
      ) : null}
    </div>
  );
}
