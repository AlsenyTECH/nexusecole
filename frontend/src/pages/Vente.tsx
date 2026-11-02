import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Minus, Plus, ShoppingBasket, Store, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Choix, EnTete, Liste, Pastille, Section } from "@/components/design";
import { Scanner } from "@/components/Scanner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { api, messageErreur, post, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { aujourdhui, fcfa } from "@/lib/format";
import { useRafraichir } from "@/lib/requetes";
import { cn } from "@/lib/utils";

export type PointDeVente = {
  id: number; nom: string; caisse: number; caisse_nom: string; actif: boolean;
  articles: { id: number; point_de_vente: number; nom: string; prix: number; actif: boolean }[];
};
type Client = {
  qr: string; solde: number; bloque: boolean; plafond_restant: number | null;
  eleve: { id: number; prenom: string; nom: string; classe: string | null; photo: string | null };
};
type Vente = { id: number; eleve_nom: string; montant: number; lignes: { nom: string; quantite: number }[]; par_nom: string; le: string; annulee_le: string | null };

/** Point de vente : cantine, boutique, librairie… paiement par la carte (porte-monnaie). */
export function PointVente() {
  const { peut } = useAuth();
  const rafraichir = useRafraichir();
  const { data: points = [] } = useQuery({ queryKey: ["points-de-vente"], queryFn: () => api<PointDeVente[]>("/api/points-de-vente") });
  const actifs = points.filter((p) => p.actif);
  const [pdvId, setPdvId] = useState(() => { try { return localStorage.getItem("nexus.pdv") ?? ""; } catch { return ""; } });
  useEffect(() => { if (!actifs.some((p) => String(p.id) === pdvId) && actifs.length) setPdvId(String(actifs[0].id)); }, [actifs, pdvId]);
  useEffect(() => { try { localStorage.setItem("nexus.pdv", pdvId); } catch { /* navigation privée */ } }, [pdvId]);
  const pdv = actifs.find((p) => String(p.id) === pdvId);
  const [client, setClient] = useState<Client | null>(null);
  const [panier, setPanier] = useState<Record<number, number>>({});
  const [libre, setLibre] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const { data: ventes } = useQuery({
    queryKey: ["ventes", pdvId], enabled: !!pdvId,
    queryFn: () => api<Page<Vente>>(`/api/ventes?point_de_vente=${pdvId}&date=${aujourdhui()}&page_size=100`),
  });

  const articles = pdv?.articles.filter((a) => a.actif) ?? [];
  const total = articles.reduce((t, a) => t + a.prix * (panier[a.id] ?? 0), 0) + (Number(libre) || 0);
  const ajouter = (id: number, n: number) => setPanier((p) => ({ ...p, [id]: Math.max(0, (p[id] ?? 0) + n) }));

  async function lire(qr: string) {
    try {
      const c = await post<Omit<Client, "qr">>("/api/cartes/lire", { qr });
      setClient({ ...c, qr });
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }
  async function encaisser() {
    if (!client || !pdv) return;
    setEnvoi(true);
    const lignes = Object.entries(panier).filter(([, n]) => n > 0).map(([article, quantite]) => ({ article: Number(article), quantite }));
    try {
      const r = await post<{ solde: number }>("/api/ventes", lignes.length
        ? { point_de_vente: pdv.id, qr: client.qr, lignes }
        : { point_de_vente: pdv.id, qr: client.qr, montant: Number(libre), libelle: "Achat" });
      toast.success(`${fcfa(total)} payés par ${client.eleve.prenom} · reste ${fcfa(r.solde)}`);
      setClient(null); setPanier({}); setLibre("");
      rafraichir("ventes");
    } catch (e) {
      toast.error(messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  }
  async function annuler(v: Vente) {
    if (!confirm(`Annuler la vente de ${fcfa(v.montant)} à ${v.eleve_nom} ? L'élève est remboursé sur sa carte.`)) return;
    try {
      await post(`/api/ventes/${v.id}/annuler`);
      rafraichir("ventes");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }

  if (!actifs.length) {
    return (
      <div className="space-y-6">
        <EnTete titre="Point de vente" />
        <EmptyState icon={Store} title="Aucun point de vente" description="Créez la cantine, la boutique ou la librairie et leurs articles dans « Caisses et points de vente »." />
      </div>
    );
  }
  const insuffisant = client && (total > client.solde || (client.plafond_restant !== null && total > client.plafond_restant));
  const recette = (ventes?.results ?? []).filter((v) => !v.annulee_le).reduce((t, v) => t + v.montant, 0);

  return (
    <div className="space-y-6">
      <EnTete titre="Point de vente" sousTitre="L'élève paie avec sa carte : le montant est débité de son porte-monnaie."
        actions={<Choix value={pdvId} onChange={(e) => { setPdvId(e.target.value); setPanier({}); }} className="w-56" aria-label="Point de vente">
          {actifs.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </Choix>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          {client ? (
            <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-carte">
              {client.eleve.photo ? <img src={client.eleve.photo} alt="" className="size-16 rounded-xl object-cover" /> : <Avatar prenom={client.eleve.prenom} nom={client.eleve.nom} taille="lg" />}
              <div className="flex-1">
                <div className="font-semibold">{client.eleve.prenom} {client.eleve.nom}</div>
                <div className="text-sm text-muted-foreground">{client.eleve.classe} · solde <b className="text-foreground">{fcfa(client.solde)}</b>
                  {client.plafond_restant !== null ? ` · encore ${fcfa(client.plafond_restant)} aujourd'hui` : ""}</div>
                {client.bloque ? <Pastille ton="rouge"><Lock className="size-3" /> Carte bloquée</Pastille> : null}
              </div>
              <Button variant="ghost" size="icon" onClick={() => setClient(null)} aria-label="Changer d'élève"><X /></Button>
            </div>
          ) : <Scanner onLecture={lire} />}
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {articles.map((a) => (
              <button key={a.id} type="button" onClick={() => ajouter(a.id, 1)}
                className={cn("rounded-xl border p-3 text-left transition-colors", panier[a.id] ? "border-primary bg-primary-soft/60" : "border-border bg-card hover:bg-muted/50")}>
                <div className="text-sm font-medium">{a.nom}</div>
                <div className="text-xs text-muted-foreground chiffres">{fcfa(a.prix)}</div>
                {panier[a.id] ? <div className="mt-1 text-xs font-semibold text-accent-foreground">× {panier[a.id]}</div> : null}
              </button>
            ))}
          </div>
          {Object.entries(panier).some(([, n]) => n > 0) ? (
            <Liste>
              {articles.filter((a) => panier[a.id]).map((a) => (
                <div key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="flex-1">{a.nom}</span>
                  <Button size="icon" variant="ghost" className="size-8" onClick={() => ajouter(a.id, -1)} aria-label="Retirer un"><Minus /></Button>
                  <span className="w-6 text-center chiffres">{panier[a.id]}</span>
                  <Button size="icon" variant="ghost" className="size-8" onClick={() => ajouter(a.id, 1)} aria-label="Ajouter un"><Plus /></Button>
                  <span className="w-24 text-right chiffres">{fcfa(a.prix * panier[a.id])}</span>
                </div>
              ))}
            </Liste>
          ) : (
            <Input type="number" min={1} value={libre} onChange={(e) => setLibre(e.target.value)} placeholder="ou montant libre" aria-label="Montant libre" />
          )}
          <Button className="h-12 w-full text-base" disabled={!client || !total || envoi || !!insuffisant || client?.bloque} onClick={encaisser}>
            <ShoppingBasket /> {insuffisant ? "Solde ou plafond insuffisant" : `Encaisser ${fcfa(total)}`}
          </Button>
        </div>
      </div>
      <Section titre="Ventes du jour" action={<span className="text-sm font-semibold chiffres">{fcfa(recette)}</span>}>
        {ventes?.results.length ? (
          <Liste>
            {ventes.results.map((v) => (
              <div key={v.id} className={cn("flex items-center gap-3 px-4 py-2.5 text-sm", v.annulee_le && "opacity-50")}>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{v.eleve_nom}</div>
                  <div className="truncate text-xs text-muted-foreground">{v.lignes.map((l) => `${l.quantite} × ${l.nom}`).join(", ")} · {new Date(v.le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · {v.par_nom}</div>
                </div>
                <span className={cn("font-semibold chiffres", v.annulee_le && "line-through")}>{fcfa(v.montant)}</span>
                {!v.annulee_le && peut("ventes.parametrer") ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => annuler(v)}>Annuler</Button> : null}
              </div>
            ))}
          </Liste>
        ) : <p className="text-sm text-muted-foreground">Aucune vente aujourd'hui.</p>}
      </Section>
    </div>
  );
}
