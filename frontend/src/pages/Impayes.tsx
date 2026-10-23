import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { Avatar, Choix, EnTete, Liste, Pastille } from "@/components/design";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import { date, fcfa } from "@/lib/format";
import { lienWhatsApp, useAnneeActive, useClasses } from "@/lib/requetes";

type Ligne = { inscription: number; eleve_id: number; eleve: string; classe: string; telephone_parent: string; montant: number; echeances: number; depuis: string };

export function Impayes() {
  const [classe, setClasse] = useState("");
  const { annee } = useAnneeActive();
  const { data: classes = [] } = useClasses(annee?.id);
  const { data } = useQuery({
    queryKey: ["impayes", classe],
    queryFn: () => api<{ total: number; eleves: Ligne[] }>(`/api/finances/impayes${classe ? `?classe=${classe}` : ""}`),
  });

  return (
    <div className="space-y-6">
      <EnTete titre="Impayés" sousTitre={data ? `${fcfa(data.total)} échus et non réglés · ${data.eleves.length} élève${data.eleves.length > 1 ? "s" : ""}` : undefined}
        actions={<Choix value={classe} onChange={(e) => setClasse(e.target.value)} className="w-52">
          <option value="">Toutes les classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </Choix>} />
      {data?.eleves.length ? (
        <Liste>
          {data.eleves.map((l) => {
            const [prenom, nom] = l.eleve.split(" ");
            const lien = lienWhatsApp(l.telephone_parent,
              `Bonjour, sauf erreur de notre part, ${l.eleve.replace(/\s*\(.*\)$/, "")} (${l.classe}) a ${fcfa(l.montant)} de frais de scolarité échus. Merci de passer à la caisse ou de régler par Wave / Orange Money.`);
            return (
              <div key={l.inscription} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar prenom={prenom} nom={nom} />
                <Link to={`/eleves/${l.eleve_id}`} className="min-w-0 flex-1">
                  <div className="truncate font-medium">{l.eleve}</div>
                  <div className="text-xs text-muted-foreground">{l.echeances} échéance{l.echeances > 1 ? "s" : ""} · en retard depuis le {date(l.depuis)}</div>
                </Link>
                <Pastille ton="bleu">{l.classe}</Pastille>
                <span className="font-semibold text-destructive chiffres">{fcfa(l.montant)}</span>
                {lien ? (
                  <Button asChild size="sm" className="bg-[#1fa855] text-white hover:bg-[#1a9149]">
                    <a href={lien} target="_blank" rel="noreferrer"><MessageCircle /> Relancer</a>
                  </Button>
                ) : <span className="text-xs text-muted-foreground">pas de téléphone</span>}
              </div>
            );
          })}
        </Liste>
      ) : data ? <EmptyState icon={CheckCircle2} title="Aucun impayé" description="Toutes les échéances échues sont réglées." /> : null}
    </div>
  );
}
