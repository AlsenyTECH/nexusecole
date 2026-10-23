import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, Search, Wallet } from "lucide-react";
import { Avatar, EnTete, Indicateur, Liste, Pastille, Section } from "@/components/design";
import { Encaissement } from "@/components/Encaissement";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ouvrirDocument } from "@/lib/utils";
import { api, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { aujourdhui, dateHeure, fcfa, MOYENS } from "@/lib/format";
import type { Inscription, Paiement } from "@/lib/types";
import { Annulation } from "./EleveDetail";

type CaisseJour = {
  date: string; total: number; nombre: number;
  par_moyen: { moyen: string; total: number; nombre: number }[];
  par_caissier: { caissier: string; total: number; nombre: number }[];
  annules: Paiement[];
  recus: { premier: string | null; dernier: string | null };
};

export function Caisse() {
  const { peut } = useAuth();
  const [q, setQ] = useState("");
  const [inscription, setInscription] = useState<number | null>(null);
  const { data: resultats } = useQuery({
    queryKey: ["inscriptions", "recherche", q],
    enabled: q.trim().length >= 2,
    queryFn: async () => (await api<Page<Inscription>>(`/api/inscriptions?statut=active&q=${encodeURIComponent(q.trim())}`)).results,
  });

  return (
    <div className="space-y-7">
      <EnTete titre="Caisse" sousTitre="Recherchez l'élève, encaissez, remettez le reçu." />
      <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-carte md:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, prénom ou matricule de l'élève"
            className="h-12 pl-11 text-base" />
        </div>
        {q.trim().length >= 2 ? (
          resultats?.length ? (
            <div className="mt-3 divide-y divide-border/70">
              {resultats.map((i) => (
                <div key={i.id} className="flex items-center gap-3 py-2.5">
                  <Avatar prenom={i.eleve_nom.split(" ")[0]} nom={i.eleve_nom.split(" ")[1]} taille="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{i.eleve_nom}</div>
                    <div className="text-xs text-muted-foreground">{i.classe_nom}</div>
                  </div>
                  <Button size="sm" onClick={() => setInscription(i.id)}><Banknote /> Encaisser</Button>
                </div>
              ))}
            </div>
          ) : resultats ? <p className="mt-3 text-sm text-muted-foreground">Aucun élève inscrit ne correspond.</p> : null
        ) : null}
      </div>

      {peut("frais.rapports") ? <CaisseDuJour /> : null}
      <Encaissement inscription={inscription} ouvert={inscription !== null} fermer={() => setInscription(null)} />
    </div>
  );
}

function CaisseDuJour() {
  const { peut } = useAuth();
  const [jour, setJour] = useState(aujourdhui());
  const [aAnnuler, setAAnnuler] = useState<Paiement | null>(null);
  const { data: c } = useQuery({ queryKey: ["caisse", jour], queryFn: () => api<CaisseJour>(`/api/finances/caisse?date=${jour}`) });
  const { data: paiements } = useQuery({
    queryKey: ["paiements", "jour", jour],
    queryFn: async () => (await api<Page<Paiement>>("/api/paiements")).results.filter((p) => p.encaisse_le.slice(0, 10) === jour),
  });

  return (
    <Section titre="Caisse du jour" action={<Input type="date" value={jour} onChange={(e) => setJour(e.target.value)} className="h-9 w-auto" />}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicateur icone={Wallet} valeur={fcfa(c?.total)} libelle={`${c?.nombre ?? 0} paiement${(c?.nombre ?? 0) > 1 ? "s" : ""}`} />
        {c?.par_moyen.map((m) => (
          <Indicateur key={m.moyen} icone={Banknote} valeur={fcfa(m.total)} libelle={MOYENS[m.moyen] ?? m.moyen} ton={m.moyen === "especes" ? "or" : "bleu"} detail={`${m.nombre} paiement${m.nombre > 1 ? "s" : ""}`} />
        ))}
      </div>
      {c && c.recus.premier ? (
        <p className="text-sm text-muted-foreground">
          Reçus du {c.recus.premier} au {c.recus.dernier}
          {c.par_caissier.length ? ` · ${c.par_caissier.map((x) => `${x.caissier} : ${fcfa(x.total)}`).join(" · ")}` : ""}
        </p>
      ) : null}
      {paiements?.length ? (
        <Liste>
          {paiements.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.eleve}</div>
                <div className="text-xs text-muted-foreground">{p.numero_recu} · {dateHeure(p.encaisse_le)} · {MOYENS[p.moyen]} · {p.encaisse_par_nom}</div>
              </div>
              {p.annule ? <Pastille ton="rouge">Annulé</Pastille> : null}
              <span className={p.annule ? "font-semibold text-muted-foreground line-through chiffres" : "font-semibold chiffres"}>{fcfa(p.montant)}</span>
              <Button variant="ghost" size="sm" onClick={() => ouvrirDocument(`/recus/${p.id}`)}>Reçu</Button>
              {!p.annule && peut("frais.annuler") ? <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setAAnnuler(p)}>Annuler</Button> : null}
            </div>
          ))}
        </Liste>
      ) : <EmptyState icon={Wallet} title="Aucun encaissement ce jour-là" />}
      <Annulation paiement={aAnnuler} fermer={() => setAAnnuler(null)} />
    </Section>
  );
}
