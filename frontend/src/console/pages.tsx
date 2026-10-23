import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Building2, Clock, ExternalLink, Plus, ReceiptText, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Bandeau, Champ, Choix, EnTete, Indicateur, Liste, Pastille, Section } from "@/components/design";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { api, messageErreur, post, type Page } from "@/lib/api";
import { date, fcfa } from "@/lib/format";
import { useRafraichir } from "@/lib/requetes";

type Ecole = { id: number; nom: string; domaine: string; statut: string; forfait: string | null; ville: string; fin_essai: string | null; couleur_primaire: string };
type Forfait = { code: string; nom: string; prix_mensuel: number; max_eleves: number | null };
type Facture = { id: number; numero: string; ecole_nom: string; montant: number; echeance: string; statut: string; moyen_paiement: string };
type Stats = { ecoles_total: number; ecoles_par_statut: Record<string, number>; revenu_mensuel_recurrent: number; factures_impayees: number };

const STATUTS: Record<string, [string, "vert" | "bleu" | "or" | "rouge" | "gris"]> = {
  essai: ["Essai", "bleu"], actif: ["Actif", "vert"], suspendu: ["Suspendu", "or"], resilie: ["Résilié", "rouge"],
  emise: ["Émise", "bleu"], payee: ["Payée", "vert"], en_retard: ["En retard", "rouge"], annulee: ["Annulée", "gris"],
};
const Statut = ({ s }: { s: string }) => <Pastille ton={STATUTS[s]?.[1] ?? "gris"}>{STATUTS[s]?.[0] ?? s}</Pastille>;
const lienEcole = (domaine: string) => `${location.protocol}//${domaine}${location.port ? `:${location.port}` : ""}`;

export function AccueilConsole() {
  const { data: s } = useQuery({ queryKey: ["stats"], queryFn: () => api<Stats>("/api/admin/statistiques") });
  const { data: ecoles } = useQuery({ queryKey: ["ecoles"], queryFn: async () => (await api<Page<Ecole>>("/api/admin/ecoles")).results });
  return (
    <div className="space-y-7">
      <Bandeau surtitre={new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} titre="NexusEcole"
        texte="Vos écoles clientes, leurs abonnements et le revenu de la plateforme.">
        <Button asChild size="sm" className="bg-white text-degrade-2 hover:bg-white/90"><Link to="/ecoles?nouvelle=1"><Plus /> Nouvelle école</Link></Button>
      </Bandeau>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicateur icone={Building2} valeur={s?.ecoles_total} libelle="écoles" />
        <Indicateur icone={Wallet} valeur={fcfa(s?.revenu_mensuel_recurrent)} libelle="revenu mensuel récurrent" ton="or" />
        <Indicateur icone={AlertTriangle} valeur={fcfa(s?.factures_impayees)} libelle="factures impayées" ton="rose" />
        <Indicateur icone={Clock} valeur={s ? `${s.ecoles_par_statut.essai ?? 0} / ${s.ecoles_par_statut.suspendu ?? 0}` : undefined} libelle="en essai / suspendues" ton="bleu" />
      </div>
      <Section titre="Écoles" action={<Link to="/ecoles" className="text-sm font-medium text-primary hover:underline">Tout voir</Link>}>
        {ecoles?.length ? (
          <Liste>
            {ecoles.slice(0, 6).map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <span className="size-3 shrink-0 rounded-full" style={{ background: e.couleur_primaire }} />
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{e.nom}</div><div className="text-xs text-muted-foreground">{e.ville} · {e.forfait ?? "sans forfait"}</div></div>
                <Statut s={e.statut} />
              </div>
            ))}
          </Liste>
        ) : <EmptyState icon={Building2} title="Aucune école" />}
      </Section>
    </div>
  );
}

export function Ecoles() {
  const rafraichir = useRafraichir();
  const { data: ecoles } = useQuery({ queryKey: ["ecoles"], queryFn: async () => (await api<Page<Ecole>>("/api/admin/ecoles")).results });
  const [nouvelle, setNouvelle] = useState(new URLSearchParams(location.search).get("nouvelle") === "1");
  const agir = async (chemin: string, corps: object = {}, message = "C'est fait") => {
    try {
      await post(chemin, corps);
      toast.success(message);
      rafraichir("ecoles", "stats", "factures");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  };
  return (
    <div className="space-y-6">
      <EnTete titre="Écoles" sousTitre="Chaque école a son espace, ses couleurs et ses données isolées."
        actions={<Button onClick={() => setNouvelle(true)}><Plus /> Nouvelle école</Button>} />
      {ecoles?.length ? (
        <Liste>
          {ecoles.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
              <span className="size-3 shrink-0 rounded-full" style={{ background: e.couleur_primaire }} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{e.nom}</div>
                <a href={lienEcole(e.domaine)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">{e.domaine} <ExternalLink className="size-3" /></a>
              </div>
              <span className="text-sm text-muted-foreground">{e.forfait ?? "—"}</span>
              <div className="flex flex-col items-end"><Statut s={e.statut} />{e.statut === "essai" && e.fin_essai ? <span className="mt-0.5 text-[11px] text-muted-foreground">jusqu'au {date(e.fin_essai)}</span> : null}</div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => agir(`/api/admin/ecoles/${e.id}/facturer`, { mois: 1 }, "Facture d'un mois émise")}>Facturer 1 mois</Button>
                <Button size="sm" variant="secondary" onClick={() => agir(`/api/admin/ecoles/${e.id}/facturer`, { mois: 10 }, "Facture annuelle émise (2 mois offerts)")}>Facturer l'année</Button>
                {e.statut === "suspendu"
                  ? <Button size="sm" onClick={() => agir(`/api/admin/ecoles/${e.id}/activer`, {}, "École réactivée")}>Réactiver</Button>
                  : <Button size="sm" variant="ghost" className="text-destructive" onClick={() => agir(`/api/admin/ecoles/${e.id}/suspendre`, {}, "École suspendue (lecture seule)")}>Suspendre</Button>}
              </div>
            </div>
          ))}
        </Liste>
      ) : ecoles ? <EmptyState icon={Building2} title="Aucune école" /> : null}
      <NouvelleEcole ouvert={nouvelle} fermer={() => setNouvelle(false)} />
    </div>
  );
}

function NouvelleEcole({ ouvert, fermer }: { ouvert: boolean; fermer: () => void }) {
  const rafraichir = useRafraichir();
  const { data: forfaits = [] } = useQuery({ queryKey: ["forfaits"], queryFn: async () => (await api<Page<Forfait>>("/api/admin/forfaits")).results });
  const vide = { nom: "", sous_domaine: "", ville: "", forfait: "starter", couleur_primaire: "#0f766e", couleur_secondaire: "#f59e0b", prenom: "", nom_directeur: "", email: "", mot_de_passe: "" };
  const [f, setF] = useState(vide);
  const [envoi, setEnvoi] = useState(false);
  const champ = (k: keyof typeof vide) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });
  async function valider(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    try {
      await post("/api/admin/ecoles", {
        nom: f.nom, sous_domaine: f.sous_domaine, ville: f.ville, forfait: f.forfait,
        couleur_primaire: f.couleur_primaire, couleur_secondaire: f.couleur_secondaire,
        directeur: { prenom: f.prenom, nom: f.nom_directeur, email: f.email, mot_de_passe: f.mot_de_passe },
      });
      toast.success(`${f.nom} est prête (30 jours d'essai)`);
      rafraichir("ecoles", "stats");
      setF(vide);
      fermer();
    } catch (err) {
      toast.error(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nouvelle école</DialogTitle>
          <DialogDescription>Crée son espace (schéma isolé), son adresse et le compte du directeur.</DialogDescription>
        </DialogHeader>
        <form onSubmit={valider} className="grid gap-4 sm:grid-cols-2">
          <Champ label="Nom de l'école" className="sm:col-span-2"><Input required {...champ("nom")} placeholder="Institution Sainte-Marie" /></Champ>
          <Champ label="Sous-domaine" aide={f.sous_domaine ? `${f.sous_domaine}.nexusecole.sn` : "lettres, chiffres et tirets"}>
            <Input required pattern="[a-z0-9-]{3,40}" {...champ("sous_domaine")} />
          </Champ>
          <Champ label="Ville"><Input {...champ("ville")} /></Champ>
          <Champ label="Forfait" className="sm:col-span-2">
            <Choix {...champ("forfait")}>{forfaits.map((fo) => <option key={fo.code} value={fo.code}>{fo.nom} · {fcfa(fo.prix_mensuel)}/mois{fo.max_eleves ? ` · ${fo.max_eleves} élèves` : ""}</option>)}</Choix>
          </Champ>
          <Champ label="Couleur principale"><Input type="color" className="h-10 p-1" {...champ("couleur_primaire")} /></Champ>
          <Champ label="Couleur d'accent"><Input type="color" className="h-10 p-1" {...champ("couleur_secondaire")} /></Champ>
          <Champ label="Prénom du directeur"><Input required {...champ("prenom")} /></Champ>
          <Champ label="Nom du directeur"><Input required {...champ("nom_directeur")} /></Champ>
          <Champ label="Email du directeur"><Input type="email" required {...champ("email")} /></Champ>
          <Champ label="Mot de passe initial"><Input type="text" required minLength={10} {...champ("mot_de_passe")} /></Champ>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="secondary" onClick={fermer}>Annuler</Button>
            <Button type="submit" disabled={envoi}>{envoi ? "Création de l'espace…" : "Créer l'école"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Factures() {
  const rafraichir = useRafraichir();
  const { data: factures } = useQuery({ queryKey: ["factures"], queryFn: async () => (await api<Page<Facture>>("/api/admin/factures")).results });
  const [aPayer, setAPayer] = useState<Facture | null>(null);
  const [moyen, setMoyen] = useState("wave");
  const [reference, setReference] = useState("");
  async function payer(e: FormEvent) {
    e.preventDefault();
    try {
      await post(`/api/admin/factures/${aPayer!.id}/payer`, { moyen, reference });
      toast.success(`Facture ${aPayer!.numero} payée`);
      rafraichir("factures", "stats", "ecoles");
      setAPayer(null);
      setReference("");
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }
  return (
    <div className="space-y-6">
      <EnTete titre="Factures" sousTitre="Abonnements facturés aux écoles." />
      {factures?.length ? (
        <Liste>
          {factures.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary-soft text-accent-foreground"><ReceiptText className="size-5" /></span>
              <div className="min-w-0 flex-1"><div className="font-medium">{f.ecole_nom}</div><div className="text-xs text-muted-foreground">{f.numero} · échéance {date(f.echeance)}</div></div>
              <Statut s={f.statut} />
              <span className="font-semibold chiffres">{fcfa(f.montant)}</span>
              {f.statut !== "payee" ? <Button size="sm" onClick={() => setAPayer(f)}>Enregistrer le paiement</Button> : null}
            </div>
          ))}
        </Liste>
      ) : factures ? <EmptyState icon={ReceiptText} title="Aucune facture" description="Facturez une école depuis la page Écoles." /> : null}
      <Dialog open={!!aPayer} onOpenChange={(o) => !o && setAPayer(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Paiement de {aPayer?.numero}</DialogTitle><DialogDescription>{aPayer?.ecole_nom} · {fcfa(aPayer?.montant)}</DialogDescription></DialogHeader>
          <form onSubmit={payer} className="space-y-4">
            <Champ label="Moyen"><Choix value={moyen} onChange={(e) => setMoyen(e.target.value)}>
              <option value="wave">Wave</option><option value="orange_money">Orange Money</option><option value="free_money">Free Money</option>
              <option value="virement">Virement</option><option value="especes">Espèces</option>
            </Choix></Champ>
            <Champ label="Référence"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Champ>
            <DialogFooter><Button type="button" variant="secondary" onClick={() => setAPayer(null)}>Annuler</Button><Button type="submit">Confirmer</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
