import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, ShieldCheck, Store, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Champ, Choix, EnTete, Liste, Pastille, Section } from "@/components/design";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, messageErreur, patch, post, supprimer } from "@/lib/api";
import { fcfa, pays } from "@/lib/format";
import { useRafraichir } from "@/lib/requetes";
import type { PointDeVente } from "./Vente";

type Caisse = { id: number; nom: string; description: string; comptabilisee: boolean; code: string | null; active: boolean };
type Regles = { refuser_si_retard: boolean; seuil_retard: number; plafond_journalier: number | null };

/** Où va l'argent (caisses), où l'on vend (points de vente et articles), règles de la carte. */
export function PointsDeVente() {
  const rafraichir = useRafraichir();
  const { data: caisses = [] } = useQuery({ queryKey: ["caisses"], queryFn: () => api<Caisse[]>("/api/caisses") });
  const { data: points = [] } = useQuery({ queryKey: ["points-de-vente"], queryFn: () => api<PointDeVente[]>("/api/points-de-vente") });
  const { data: regles } = useQuery({ queryKey: ["regles-carte"], queryFn: () => api<Regles>("/api/cartes/parametres") });
  const [nouvelleCaisse, setNouvelleCaisse] = useState({ nom: "", comptabilisee: false });
  const [nouveauPdv, setNouveauPdv] = useState({ nom: "", caisse: "" });

  const action = async (fn: () => Promise<unknown>, cles: string[], message?: string) => {
    try {
      await fn();
      if (message) toast.success(message);
      rafraichir(...cles);
    } catch (e) {
      toast.error(messageErreur(e));
    }
  };

  function ajouterCaisse(e: FormEvent) {
    e.preventDefault();
    action(() => post("/api/caisses", nouvelleCaisse), ["caisses"], "Caisse créée");
    setNouvelleCaisse({ nom: "", comptabilisee: false });
  }
  function ajouterPdv(e: FormEvent) {
    e.preventDefault();
    action(() => post("/api/points-de-vente", { nom: nouveauPdv.nom, caisse: Number(nouveauPdv.caisse || caisses[0]?.id) }), ["points-de-vente"], "Point de vente créé");
    setNouveauPdv({ nom: "", caisse: "" });
  }

  return (
    <div className="space-y-8">
      <EnTete titre="Caisses et points de vente" sousTitre="Chaque recette va dans une caisse : celle de l'école est comptabilisée ; le foyer, la coopérative… gardent l'argent des élèves, hors comptabilité." />

      <Section titre="Caisses">
        <Liste>
          {caisses.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Wallet className="size-5 text-muted-foreground" />
              <div className="min-w-0 flex-1"><div className="font-medium">{c.nom}</div>{c.description ? <div className="text-xs text-muted-foreground">{c.description}</div> : null}</div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={c.comptabilisee} disabled={c.code === "ecole"} onCheckedChange={(v) => action(() => patch(`/api/caisses/${c.id}`, { comptabilisee: v }), ["caisses"])} />
                {c.comptabilisee ? "Comptabilisée" : "Hors comptabilité"}
              </label>
              {!c.code ? <Button size="icon" variant="ghost" aria-label={`Supprimer ${c.nom}`} onClick={() => action(() => supprimer(`/api/caisses/${c.id}`), ["caisses"])}><Trash2 /></Button> : null}
            </div>
          ))}
          <form onSubmit={ajouterCaisse} className="flex flex-wrap items-center gap-2 bg-muted/40 px-4 py-3">
            <Input required value={nouvelleCaisse.nom} onChange={(e) => setNouvelleCaisse({ ...nouvelleCaisse, nom: e.target.value })} placeholder="Nouvelle caisse (Coopérative, Gouvernement scolaire…)" className="h-9 min-w-56 flex-1" />
            <label className="flex items-center gap-2 text-xs"><Switch checked={nouvelleCaisse.comptabilisee} onCheckedChange={(v) => setNouvelleCaisse({ ...nouvelleCaisse, comptabilisee: v })} /> Comptabilisée</label>
            <Button size="sm" type="submit"><Plus /> Ajouter</Button>
          </form>
        </Liste>
      </Section>

      <Section titre="Points de vente et articles">
        <div className="grid gap-3 lg:grid-cols-2">
          {points.map((p) => <CartePdv key={p.id} p={p} caisses={caisses} action={action} />)}
          <form onSubmit={ajouterPdv} className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-4">
            <div className="flex items-center gap-2 font-medium"><Store className="size-4" /> Nouveau point de vente</div>
            <Input required value={nouveauPdv.nom} onChange={(e) => setNouveauPdv({ ...nouveauPdv, nom: e.target.value })} placeholder="Cantine, Boutique (uniformes), Librairie…" />
            <Choix value={nouveauPdv.caisse} onChange={(e) => setNouveauPdv({ ...nouveauPdv, caisse: e.target.value })} aria-label="Caisse">
              {caisses.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>Recettes : {c.nom}</option>)}
            </Choix>
            <Button type="submit" size="sm" className="self-start"><Plus /> Créer</Button>
          </form>
        </div>
      </Section>

      {regles ? <ReglesCarte regles={regles} action={action} /> : null}
    </div>
  );
}

function CartePdv({ p, caisses, action }: { p: PointDeVente; caisses: Caisse[]; action: (fn: () => Promise<unknown>, cles: string[], m?: string) => void }) {
  const [article, setArticle] = useState({ nom: "", prix: "" });
  return (
    <div className="space-y-3 rounded-xl border border-border/80 bg-card p-4 shadow-carte">
      <div className="flex flex-wrap items-center gap-2">
        <Store className="size-5 text-muted-foreground" />
        <span className="flex-1 font-semibold">{p.nom}</span>
        <Pastille ton={caisses.find((c) => c.id === p.caisse)?.comptabilisee ? "bleu" : "or"}>{p.caisse_nom}</Pastille>
        <Switch checked={p.actif} onCheckedChange={(v) => action(() => patch(`/api/points-de-vente/${p.id}`, { actif: v }), ["points-de-vente"])} aria-label="Actif" />
      </div>
      <Liste>
        {p.articles.map((a) => (
          <div key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className={a.actif ? "flex-1" : "flex-1 text-muted-foreground line-through"}>{a.nom}</span>
            <span className="chiffres">{fcfa(a.prix)}</span>
            <Switch checked={a.actif} onCheckedChange={(v) => action(() => patch(`/api/articles/${a.id}`, { actif: v }), ["points-de-vente"])} aria-label={`${a.nom} en vente`} />
          </div>
        ))}
        <form onSubmit={(e) => { e.preventDefault(); action(() => post("/api/articles", { point_de_vente: p.id, nom: article.nom, prix: Number(article.prix) }), ["points-de-vente"]); setArticle({ nom: "", prix: "" }); }}
          className="flex gap-2 bg-muted/40 px-3 py-2">
          <Input required value={article.nom} onChange={(e) => setArticle({ ...article, nom: e.target.value })} placeholder="Article" className="h-9" />
          <Input required type="number" min={1} value={article.prix} onChange={(e) => setArticle({ ...article, prix: e.target.value })} placeholder={pays.devise} className="h-9 w-28" />
          <Button size="sm" type="submit" aria-label="Ajouter l'article"><Plus /></Button>
        </form>
      </Liste>
    </div>
  );
}

function ReglesCarte({ regles, action }: { regles: Regles; action: (fn: () => Promise<unknown>, cles: string[], m?: string) => void }) {
  const [f, setF] = useState({ seuil: String(regles.seuil_retard), plafond: regles.plafond_journalier == null ? "" : String(regles.plafond_journalier) });
  const enregistrer = (champs: Partial<Regles>) => action(() => patch("/api/cartes/parametres", champs), ["regles-carte"], "Règles enregistrées");
  return (
    <Section titre="Règles de la carte">
      <div className="grid gap-4 rounded-xl border border-border/80 bg-card p-4 shadow-carte md:grid-cols-2">
        <div className="space-y-3">
          <label className="flex items-start gap-3 text-sm">
            <Switch checked={regles.refuser_si_retard} onCheckedChange={(v) => enregistrer({ refuser_si_retard: v })} />
            <span><span className="flex items-center gap-1.5 font-medium"><ShieldCheck className="size-4" /> Refuser l'entrée en cas de retard de paiement</span>
              <span className="text-xs text-muted-foreground">Sinon, le contrôle affiche seulement le retard (conseillé : on ne renvoie pas un enfant sans prévenir la famille).</span></span>
          </label>
          {regles.refuser_si_retard ? (
            <Champ label={`Retard toléré (${pays.devise})`}>
              <div className="flex gap-2"><Input type="number" min={0} value={f.seuil} onChange={(e) => setF({ ...f, seuil: e.target.value })} />
                <Button variant="secondary" onClick={() => enregistrer({ seuil_retard: Number(f.seuil) || 0 })}>Enregistrer</Button></div>
            </Champ>
          ) : null}
        </div>
        <Champ label={`Plafond de dépenses par jour et par élève (${pays.devise})`} aide="Vide : sans limite. Chaque parent peut fixer un plafond différent pour son enfant.">
          <div className="flex gap-2"><Input type="number" min={0} value={f.plafond} onChange={(e) => setF({ ...f, plafond: e.target.value })} placeholder="sans limite" />
            <Button variant="secondary" onClick={() => enregistrer({ plafond_journalier: f.plafond === "" ? null : Number(f.plafond) })}>Enregistrer</Button></div>
        </Champ>
      </div>
    </Section>
  );
}
