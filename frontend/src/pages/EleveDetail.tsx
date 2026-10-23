import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Banknote, Ban, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Champ, Choix, Indicateur, Liste, Pastille, Section } from "@/components/design";
import { Encaissement } from "@/components/Encaissement";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ouvrirDocument } from "@/lib/utils";
import { api, messageErreur, post, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, dateHeure, fcfa, MOYENS } from "@/lib/format";
import { useAnneeActive, useClasses, useRafraichir } from "@/lib/requetes";
import type { Eleve, Inscription, Paiement, Situation } from "@/lib/types";

export function EleveDetail() {
  const { id } = useParams();
  const { peut } = useAuth();
  const { annee } = useAnneeActive();
  const { data: eleve } = useQuery({ queryKey: ["eleves", id], queryFn: () => api<Eleve>(`/api/eleves/${id}`) });
  const { data: inscriptions } = useQuery({
    queryKey: ["inscriptions", "eleve", id],
    queryFn: async () => (await api<Page<Inscription>>(`/api/inscriptions?eleve=${id}`)).results,
  });
  const courante = inscriptions?.find((i) => i.annee === annee?.id) ?? inscriptions?.[0];
  const [encaisser, setEncaisser] = useState(false);

  if (!eleve) return <p className="text-muted-foreground">Chargement…</p>;
  return (
    <div className="space-y-7">
      <Link to="/eleves" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Élèves</Link>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar prenom={eleve.prenom} nom={eleve.nom} taille="lg" />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold md:text-[28px]">{eleve.prenom} {eleve.nom}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{eleve.matricule}</span>
            {eleve.date_naissance ? <span>· né{eleve.sexe === "F" ? "e" : ""} le {date(eleve.date_naissance)}</span> : null}
            {eleve.telephone_parent ? <span>· parent : {eleve.telephone_parent}</span> : null}
          </div>
        </div>
        {courante && peut("frais.encaisser") ? <Button onClick={() => setEncaisser(true)}><Banknote /> Encaisser</Button> : null}
      </div>

      {courante ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/80 bg-card p-4 shadow-carte">
          <span className="text-sm text-muted-foreground">Inscrit en</span>
          <Pastille ton="bleu">{courante.classe_nom}</Pastille>
          <span className="text-sm text-muted-foreground">depuis le {date(courante.date_inscription)}</span>
          {courante.reduction_pct ? <Pastille ton="or">Réduction {courante.reduction_pct} %{courante.motif_reduction ? ` · ${courante.motif_reduction}` : ""}</Pastille> : null}
          {courante.statut !== "active" ? <Pastille ton="gris">{courante.statut}</Pastille> : null}
        </div>
      ) : inscriptions && peut("inscriptions.gerer") && annee ? (
        <Inscrire eleve={eleve} />
      ) : null}

      {courante && peut("frais.voir") ? <Finances inscription={courante.id} /> : null}
      <Encaissement inscription={courante?.id ?? null} ouvert={encaisser} fermer={() => setEncaisser(false)} />
    </div>
  );
}

function Inscrire({ eleve }: { eleve: Eleve }) {
  const rafraichir = useRafraichir();
  const { annee } = useAnneeActive();
  const { data: classes = [] } = useClasses(annee?.id);
  const [classe, setClasse] = useState("");
  const [reduction, setReduction] = useState("0");
  async function valider(e: FormEvent) {
    e.preventDefault();
    try {
      await post("/api/inscriptions", { eleve: eleve.id, classe: Number(classe), reduction_pct: Number(reduction) || 0 });
      toast.success("Élève inscrit : ses échéances ont été créées.");
      rafraichir("inscriptions", "eleves", "tableau-de-bord");
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }
  return (
    <form onSubmit={valider} className="flex flex-wrap items-end gap-3 rounded-xl border border-or/40 bg-or-soft p-4">
      <p className="w-full text-sm font-medium text-[#5c4100]">{eleve.prenom} n'est pas encore inscrit pour {annee?.libelle}.</p>
      <Champ label="Classe" className="min-w-48 flex-1">
        <Choix required value={classe} onChange={(e) => setClasse(e.target.value)}>
          <option value="">Choisir…</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </Choix>
      </Champ>
      <Champ label="Réduction (%)" className="w-32"><Input type="number" min={0} max={100} value={reduction} onChange={(e) => setReduction(e.target.value)} /></Champ>
      <Button type="submit">Inscrire</Button>
    </form>
  );
}

function Finances({ inscription }: { inscription: number }) {
  const { peut } = useAuth();
  const { data: s } = useQuery({ queryKey: ["situation", inscription], queryFn: () => api<Situation>(`/api/inscriptions/${inscription}/situation`) });
  const { data: paiements } = useQuery({
    queryKey: ["paiements", "inscription", inscription],
    queryFn: async () => (await api<Page<Paiement>>(`/api/paiements?inscription=${inscription}`)).results,
  });
  const [aAnnuler, setAAnnuler] = useState<Paiement | null>(null);
  const aujourdhui = new Date().toLocaleDateString("sv-SE");

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicateur icone={ReceiptText} valeur={fcfa(s?.total)} libelle="total de l'année" ton="bleu" />
        <Indicateur icone={Banknote} valeur={fcfa(s?.paye)} libelle="payé" />
        <Indicateur icone={ReceiptText} valeur={fcfa(s?.reste)} libelle="reste à payer" ton="or" />
        <Indicateur icone={Ban} valeur={fcfa(s?.en_retard)} libelle="en retard" ton="rose" />
      </div>

      <Section titre="Échéances">
        <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-carte">
          <Table>
            <TableHeader><TableRow><TableHead>Libellé</TableHead><TableHead>Avant le</TableHead><TableHead className="text-right">Montant</TableHead><TableHead className="text-right">Reste</TableHead><TableHead>État</TableHead></TableRow></TableHeader>
            <TableBody>
              {s?.echeances.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.libelle}</TableCell>
                  <TableCell>{date(e.date_limite)}</TableCell>
                  <TableCell className="text-right chiffres">{fcfa(e.montant)}</TableCell>
                  <TableCell className="text-right chiffres">{e.reste ? fcfa(e.reste) : "—"}</TableCell>
                  <TableCell>
                    {e.reste === 0 ? <Pastille ton="vert">Payée</Pastille>
                      : e.date_limite < aujourdhui ? <Pastille ton="rouge">En retard</Pastille>
                      : e.paye ? <Pastille ton="or">Partielle</Pastille>
                      : <Pastille ton="gris">À venir</Pastille>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {s && !s.echeances.length ? <p className="p-4 text-sm text-muted-foreground">Aucune échéance : la grille des frais était vide au moment de l'inscription.</p> : null}
        </div>
      </Section>

      <Section titre="Paiements">
        {paiements?.length ? (
          <Liste>
            {paiements.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{p.numero_recu} <span className="font-normal text-muted-foreground">· {MOYENS[p.moyen]}{p.reference ? ` ${p.reference}` : ""}</span></div>
                  <div className="text-xs text-muted-foreground">
                    {dateHeure(p.encaisse_le)} · par {p.encaisse_par_nom}
                    {p.annule ? ` · annulé : ${p.motif_annulation}` : ""}
                  </div>
                </div>
                {p.annule ? <Pastille ton="rouge">Annulé</Pastille> : null}
                <span className={p.annule ? "font-semibold text-muted-foreground line-through chiffres" : "font-semibold chiffres"}>{fcfa(p.montant)}</span>
                <Button variant="ghost" size="sm" onClick={() => ouvrirDocument(`/recus/${p.id}`)}>Reçu</Button>
                {!p.annule && peut("frais.annuler") ? <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setAAnnuler(p)}>Annuler</Button> : null}
              </div>
            ))}
          </Liste>
        ) : <EmptyState icon={Banknote} title="Aucun paiement" />}
      </Section>
      <Annulation paiement={aAnnuler} fermer={() => setAAnnuler(null)} />
    </>
  );
}

export function Annulation({ paiement, fermer }: { paiement: Paiement | null; fermer: () => void }) {
  const rafraichir = useRafraichir();
  const [motif, setMotif] = useState("");
  const [envoi, setEnvoi] = useState(false);
  async function valider(e: FormEvent) {
    e.preventDefault();
    if (!paiement) return;
    setEnvoi(true);
    try {
      await post(`/api/paiements/${paiement.id}/annuler`, { motif });
      toast.success(`Reçu ${paiement.numero_recu} annulé`);
      rafraichir("situation", "paiements", "tableau-de-bord", "impayes", "caisse");
      setMotif("");
      fermer();
    } catch (err) {
      toast.error(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }
  return (
    <Dialog open={!!paiement} onOpenChange={(o) => !o && fermer()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Annuler le reçu {paiement?.numero_recu}</DialogTitle>
          <DialogDescription>
            Le paiement de {fcfa(paiement?.montant)} restera visible comme « annulé » avec votre nom et le motif. Cette action est définitive.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={valider} className="space-y-4">
          <Champ label="Motif"><Input required value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="ex. Erreur de montant, doublon…" /></Champ>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={fermer}>Retour</Button>
            <Button type="submit" variant="destructive" disabled={envoi}>Annuler le paiement</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
