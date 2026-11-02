import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Lock, LockOpen, MapPin, PartyPopper, Plus, Ticket, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Champ, Choix, Liste, Pastille, Section } from "@/components/design";
import { QR } from "@/components/QR";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { api, messageErreur, patch, post } from "@/lib/api";
import { date, dateHeure, fcfa, pays } from "@/lib/format";
import { useRafraichir } from "@/lib/requetes";
import { cn } from "@/lib/utils";

type PorteMonnaie = {
  solde: number; bloque: boolean; plafond_journalier: number | null; plafond_effectif: number | null; depense_aujourdhui: number;
  carte: { numero: string; active: boolean; qr: string | null };
  recharge_en_ligne: boolean; operateurs: Record<string, string>;
  mouvements: { id: number; type: string; libelle: string; montant: number; solde_apres: number; le: string }[];
  en_attente: { reference: string; montant: number; operateur: string; cree_le: string }[];
};
type Activite = {
  id: number; titre: string; description: string; date: string; heure: string | null; lieu: string; prix: number;
  achetable: boolean; complet: boolean; ticket: { code: string; statut: string } | null;
};

export function OngletPorteMonnaie({ id, prenom }: { id: number; prenom: string }) {
  const rafraichir = useRafraichir();
  const { data: p } = useQuery({ queryKey: ["famille", id, "porte-monnaie"], queryFn: () => api<PorteMonnaie>(`/api/famille/enfants/${id}/porte-monnaie`) });
  const [recharge, setRecharge] = useState(false);
  const [carte, setCarte] = useState(false);
  const [plafond, setPlafond] = useState<string | null>(null);
  if (!p) return <p className="text-muted-foreground">Chargement…</p>;

  async function regler(champs: { bloque?: boolean; plafond_journalier?: number | null }) {
    try {
      await patch(`/api/famille/enfants/${id}/reglages`, champs);
      toast.success("Réglage enregistré");
      rafraichir("famille");
      setPlafond(null);
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-gradient-to-br from-degrade-1 via-degrade-2 to-degrade-3 p-5 text-white shadow-haute">
          <div className="flex items-center gap-2 text-sm text-white/75"><Wallet className="size-4" /> Porte-monnaie de {prenom}</div>
          <div className="mt-1 font-heading text-4xl font-semibold chiffres">{fcfa(p.solde)}</div>
          <div className="mt-1 text-sm text-white/75">
            dépensé aujourd'hui : {fcfa(p.depense_aujourdhui)}{p.plafond_effectif != null ? ` sur ${fcfa(p.plafond_effectif)} autorisés` : ""}
          </div>
          {p.bloque ? <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs"><Lock className="size-3" /> Achats bloqués</div> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {p.recharge_en_ligne ? <Button size="sm" className="bg-white text-degrade-2 hover:bg-white/90" onClick={() => setRecharge(true)}><Plus /> Recharger</Button> : null}
            {p.carte.qr ? <Button size="sm" className="border border-white/25 bg-white/10 text-white hover:bg-white/20" onClick={() => setCarte(true)}>Carte sur le téléphone</Button> : null}
          </div>
          {!p.recharge_en_ligne ? <p className="mt-3 text-xs text-white/75">Recharge à la caisse de l'école (espèces, Wave, Orange Money).</p> : null}
        </div>
        <div className="space-y-3 rounded-xl border border-border/80 bg-card p-4 shadow-carte">
          <div className="font-medium">Vos réglages</div>
          <Champ label={`Dépenses maximum par jour (${pays.devise})`} aide="Cantine, boutique, tickets. Vide : la règle de l'école.">
            <div className="flex gap-2">
              <Input type="number" min={0} value={plafond ?? (p.plafond_journalier == null ? "" : String(p.plafond_journalier))}
                onChange={(e) => setPlafond(e.target.value)} placeholder="règle de l'école" />
              <Button variant="secondary" disabled={plafond === null} onClick={() => regler({ plafond_journalier: plafond ? Number(plafond) : null })}>OK</Button>
            </div>
          </Champ>
          <Button variant={p.bloque ? "default" : "secondary"} className={cn(!p.bloque && "text-destructive")} onClick={() => regler({ bloque: !p.bloque })}>
            {p.bloque ? <><LockOpen /> Débloquer les achats</> : <><Lock /> Bloquer les achats (carte perdue…)</>}
          </Button>
          <p className="text-xs text-muted-foreground">Carte perdue ? Bloquez ici, puis demandez une nouvelle carte à l'école : l'ancienne sera refusée partout.</p>
        </div>
      </div>

      {p.en_attente.length ? (
        <div className="rounded-xl border border-or/40 bg-or-soft p-3 text-sm text-[#5c4100]">
          {p.en_attente.map((d) => <div key={d.reference}>Recharge de {fcfa(d.montant)} par {p.operateurs[d.operateur]} en attente de confirmation…</div>)}
        </div>
      ) : null}

      <Section titre="Mouvements">
        {p.mouvements.length ? (
          <Liste>
            {p.mouvements.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1"><div className="truncate">{m.libelle}</div><div className="text-xs text-muted-foreground">{dateHeure(m.le)}</div></div>
                <span className={cn("font-semibold chiffres", m.montant > 0 && "text-primary")}>{m.montant > 0 ? "+" : ""}{fcfa(m.montant)}</span>
              </div>
            ))}
          </Liste>
        ) : <EmptyState icon={Wallet} title="Aucun mouvement" />}
      </Section>

      <Recharge id={id} operateurs={p.operateurs} ouvert={recharge} fermer={() => setRecharge(false)} />
      <Dialog open={carte} onOpenChange={setCarte}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Carte de {prenom}</DialogTitle>
            <DialogDescription>Si la carte est oubliée, présentez ce QR code au contrôle ou à la cantine.</DialogDescription>
          </DialogHeader>
          {p.carte.qr ? <div className="flex flex-col items-center gap-2"><QR texte={p.carte.qr} taille={240} /><span className="font-mono tracking-wider">{p.carte.numero}</span></div> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Recharge({ id, operateurs, ouvert, fermer }: { id: number; operateurs: Record<string, string>; ouvert: boolean; fermer: () => void }) {
  const naviguer = useNavigate();
  const [montant, setMontant] = useState("");
  const [operateur, setOperateur] = useState("wave");
  const [envoi, setEnvoi] = useState(false);
  async function valider(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    try {
      const r = await post<{ url: string }>(`/api/famille/enfants/${id}/recharges`, { montant: Number(montant), operateur });
      // Page de paiement de l'opérateur (simulateur en démonstration), puis retour au porte-monnaie
      naviguer(`${r.url}?retour=${encodeURIComponent(`/enfants/${id}?onglet=porte-monnaie`)}`);
    } catch (err) {
      toast.error(messageErreur(err));
      setEnvoi(false);
    }
  }
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recharger le porte-monnaie</DialogTitle>
          <DialogDescription>Le montant est ajouté dès que l'opérateur confirme votre paiement.</DialogDescription>
        </DialogHeader>
        <form onSubmit={valider} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[1000, 2500, 5000, 10000].map((m) => (
              <button key={m} type="button" onClick={() => setMontant(String(m))}
                className={cn("rounded-full border px-3 py-1.5 text-sm chiffres", montant === String(m) ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>{fcfa(m)}</button>
            ))}
          </div>
          <Champ label="Montant"><Input type="number" min={100} required value={montant} onChange={(e) => setMontant(e.target.value)} /></Champ>
          <Champ label="Payer avec">
            <Choix value={operateur} onChange={(e) => setOperateur(e.target.value)}>
              {Object.entries(operateurs).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Choix>
          </Champ>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={fermer}>Annuler</Button>
            <Button type="submit" disabled={envoi || !montant}>Continuer vers le paiement</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OngletActivites({ id }: { id: number }) {
  const rafraichir = useRafraichir();
  const { data } = useQuery({ queryKey: ["famille", id, "activites"], queryFn: () => api<Activite[] | null>(`/api/famille/enfants/${id}/activites`) });
  if (!data) return data === null ? <EmptyState icon={PartyPopper} title="Aucune activité" /> : <p className="text-muted-foreground">Chargement…</p>;
  if (!data.length) return <EmptyState icon={PartyPopper} title="Aucune activité à venir" />;

  async function acheter(a: Activite) {
    if (!confirm(`Acheter le ticket « ${a.titre} » pour ${fcfa(a.prix)}, payé avec le porte-monnaie ?`)) return;
    try {
      await post(`/api/famille/enfants/${id}/tickets`, { activite: a.id });
      toast.success("Ticket acheté : votre enfant entre avec sa carte.");
      rafraichir("famille");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {data.map((a) => (
        <div key={a.id} className="flex flex-col gap-2 rounded-xl border border-border/80 bg-card p-4 shadow-carte">
          <div className="font-semibold">{a.titre}</div>
          <div className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />{date(a.date, { weekday: "long", day: "numeric", month: "long" })}{a.heure ? ` · ${a.heure.slice(0, 5)}` : ""}</span>
            {a.lieu ? <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{a.lieu}</span> : null}
          </div>
          {a.description ? <p className="text-sm">{a.description}</p> : null}
          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            <span className="font-semibold chiffres">{a.prix ? fcfa(a.prix) : "Gratuit"}</span>
            {a.ticket ? <Pastille ton={a.ticket.statut === "utilise" ? "gris" : "vert"}><Ticket className="size-3" /> {a.ticket.statut === "utilise" ? "Ticket utilisé" : "Ticket acheté"}</Pastille>
              : a.complet ? <Pastille ton="gris">Complet</Pastille>
              : a.achetable ? <Button size="sm" onClick={() => acheter(a)}><Ticket /> Acheter</Button>
              : <span className="text-xs text-muted-foreground">Ticket au guichet</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
