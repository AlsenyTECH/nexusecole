import { useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban, Camera, CreditCard, Lock, Plus, Printer, RefreshCw, Square, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Champ, Choix, Liste, Pastille, Section } from "@/components/design";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, messageErreur, patch, post, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CATEGORIES_FRAIS, date, dateHeure, fcfa, MOYENS } from "@/lib/format";
import { reduirePhoto, usePhoto } from "@/lib/photo";
import { useRafraichir } from "@/lib/requetes";
import type { Eleve, Frais, Inscription } from "@/lib/types";
import { cn, ouvrirDocument } from "@/lib/utils";

type Souscription = { id: number; frais: number; frais_libelle: string; categorie: string; montant: number; periodicite: string; debut: string; fin: string | null };

/** Services à la carte de l'élève (transport, cantine…) : inscrire, arrêter. */
export function ServicesEleve({ inscription }: { inscription: Inscription }) {
  const { peut } = useAuth();
  const rafraichir = useRafraichir();
  const { data: souscriptions = [] } = useQuery({
    queryKey: ["souscriptions", inscription.id],
    queryFn: async () => (await api<Page<Souscription>>(`/api/souscriptions?inscription=${inscription.id}&en_cours=1`)).results,
  });
  const { data: services = [] } = useQuery({
    queryKey: ["frais", inscription.annee, "services"],
    queryFn: async () => (await api<Page<Frais>>(`/api/frais?annee=${inscription.annee}&page_size=200`)).results.filter((f) => !f.obligatoire && f.actif),
  });
  const [choix, setChoix] = useState("");
  const disponibles = services.filter((f) => !souscriptions.some((s) => s.frais === f.id));

  async function souscrire() {
    try {
      await post("/api/souscriptions", { inscription: inscription.id, frais: Number(choix) });
      toast.success("Service ajouté : ses échéances sont créées à partir de ce mois-ci.");
      setChoix("");
      rafraichir("souscriptions", "situation");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }
  async function arreter(s: Souscription) {
    if (!confirm(`Arrêter « ${s.frais_libelle} » ? Les mois à venir non payés seront retirés ; ce qui est échu reste dû.`)) return;
    try {
      const r = await post<{ echeances_retirees: number }>(`/api/souscriptions/${s.id}/arreter`);
      toast.success(`Service arrêté : ${r.echeances_retirees} échéance(s) à venir retirée(s).`);
      rafraichir("souscriptions", "situation");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }

  if (!services.length && !souscriptions.length) return null;
  return (
    <Section titre="Services">
      <Liste>
        {souscriptions.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1">
              <div className="font-medium">{s.frais_libelle}</div>
              <div className="text-xs text-muted-foreground">{CATEGORIES_FRAIS[s.categorie]} · {fcfa(s.montant)}{s.periodicite === "mensuel" ? " / mois" : ""} · depuis le {date(s.debut)}</div>
            </div>
            {peut("services.gerer") ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => arreter(s)}><Square /> Arrêter</Button> : null}
          </div>
        ))}
        {!souscriptions.length ? <p className="px-4 py-3 text-sm text-muted-foreground">Inscrit à aucun service.</p> : null}
        {peut("services.gerer") && disponibles.length ? (
          <div className="flex flex-wrap items-center gap-2 bg-muted/40 px-4 py-3">
            <Choix value={choix} onChange={(e) => setChoix(e.target.value)} className="h-9 min-w-56 flex-1" aria-label="Service">
              <option value="">Inscrire à un service…</option>
              {disponibles.map((f) => <option key={f.id} value={f.id}>{f.libelle} · {fcfa(f.montant)}{f.periodicite === "mensuel" ? "/mois" : ""}</option>)}
            </Choix>
            <Button size="sm" disabled={!choix} onClick={souscrire}><Plus /> Inscrire</Button>
          </div>
        ) : null}
      </Liste>
    </Section>
  );
}

type CarteInfo = {
  carte: { numero: string; version: number; active: boolean; emise_le: string; reemise_le: string | null; motif: string };
  a_photo: boolean;
  portefeuille?: { solde: number; bloque: boolean; plafond_journalier: number | null; plafond_effectif: number | null; depense_aujourdhui: number };
};
type Mouvement = { id: number; type: string; type_libelle: string; montant: number; solde_apres: number; libelle: string; moyen: string; par_nom: string | null; le: string };

/** Photo, carte scolaire et porte-monnaie de l'élève. */
export function CartePorteMonnaie({ eleve }: { eleve: Eleve }) {
  const { peut } = useAuth();
  const rafraichir = useRafraichir();
  const { data: c } = useQuery({ queryKey: ["carte", eleve.id], queryFn: () => api<CarteInfo>(`/api/eleves/${eleve.id}/carte`) });
  const photo = usePhoto(eleve.id, !!c?.a_photo);
  const fichier = useRef<HTMLInputElement>(null);
  const [recharge, setRecharge] = useState(false);
  const [historique, setHistorique] = useState(false);
  if (!c) return null;
  const p = c.portefeuille;

  async function envoyerPhoto(f: File | undefined) {
    if (!f) return;
    try {
      await api(`/api/eleves/${eleve.id}/photo`, { method: "PUT", body: JSON.stringify({ image: await reduirePhoto(f) }) });
      toast.success("Photo enregistrée");
      rafraichir("carte", "photo");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }
  async function reemettre() {
    const motif = prompt("Motif de la réémission (perte, vol, carte abîmée…) ? L'ancienne carte sera refusée partout.");
    if (!motif) return;
    try {
      await post(`/api/eleves/${eleve.id}/carte`, { motif });
      toast.success("Nouvelle carte émise : imprimez-la.");
      rafraichir("carte");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }
  async function activer(active: boolean) {
    try {
      await patch(`/api/eleves/${eleve.id}/carte`, { active });
      rafraichir("carte");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }
  async function regler(champs: { bloque?: boolean; plafond_journalier?: number | null }) {
    try {
      await patch(`/api/eleves/${eleve.id}/porte-monnaie`, champs);
      rafraichir("carte");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }

  return (
    <Section titre="Carte scolaire et porte-monnaie">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex gap-4 rounded-xl border border-border/80 bg-card p-4 shadow-carte">
          <div className="relative shrink-0">
            {photo ? <img src={photo} alt="" className="size-24 rounded-xl object-cover" /> : <Avatar prenom={eleve.prenom} nom={eleve.nom} taille="lg" className="size-24 rounded-xl text-2xl" />}
            {peut("cartes.gerer") ? (
              <>
                <input ref={fichier} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => envoyerPhoto(e.target.files?.[0])} />
                <button type="button" onClick={() => fichier.current?.click()} aria-label="Prendre ou choisir la photo"
                  className="absolute -bottom-2 -right-2 inline-flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-carte">
                  <Camera className="size-4" />
                </button>
              </>
            ) : null}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <CreditCard className="size-4 text-muted-foreground" />
              <span className="font-mono font-semibold tracking-wider">{c.carte.numero}</span>
              <Pastille ton={c.carte.active ? "vert" : "rouge"}>{c.carte.active ? "Active" : "Désactivée"}</Pastille>
              {c.carte.version > 1 ? <Pastille ton="gris">{c.carte.version}e carte</Pastille> : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {c.carte.reemise_le ? `Réémise le ${date(c.carte.reemise_le)} (${c.carte.motif})` : `Émise le ${date(c.carte.emise_le)}`}
              {!c.a_photo ? " · sans photo" : ""}
            </p>
            {peut("cartes.gerer") ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Button size="sm" variant="secondary" onClick={() => ouvrirDocument(`/cartes/impression?eleve=${eleve.id}`)}><Printer /> Imprimer</Button>
                <Button size="sm" variant="ghost" onClick={reemettre}><RefreshCw /> Réémettre</Button>
                <Button size="sm" variant="ghost" className={c.carte.active ? "text-destructive" : ""} onClick={() => activer(!c.carte.active)}>
                  <Ban /> {c.carte.active ? "Désactiver" : "Réactiver"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {p ? (
          <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-carte">
            <div className="flex items-start gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary-soft text-accent-foreground"><Wallet className="size-5" /></span>
              <div className="flex-1">
                <div className="font-heading text-2xl font-semibold chiffres">{fcfa(p.solde)}</div>
                <div className="text-xs text-muted-foreground">
                  dépensé aujourd'hui : {fcfa(p.depense_aujourdhui)}{p.plafond_effectif != null ? ` / plafond ${fcfa(p.plafond_effectif)}` : ""}
                </div>
              </div>
              {p.bloque ? <Pastille ton="rouge"><Lock className="size-3" /> Bloqué</Pastille> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {peut("portefeuille.recharger") ? <Button size="sm" onClick={() => setRecharge(true)}><Plus /> Recharger</Button> : null}
              <Button size="sm" variant="secondary" onClick={() => setHistorique(!historique)}>{historique ? "Masquer" : "Mouvements"}</Button>
              {peut("cartes.gerer") ? (
                <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={p.bloque} onCheckedChange={(v) => regler({ bloque: v })} /> Bloquer les achats
                </label>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      {historique ? <Mouvements eleve={eleve.id} /> : null}
      <Recharge eleve={eleve} ouvert={recharge} fermer={() => setRecharge(false)} />
    </Section>
  );
}

function Mouvements({ eleve }: { eleve: number }) {
  const { data = [] } = useQuery({ queryKey: ["carte", eleve, "mouvements"], queryFn: () => api<Mouvement[]>(`/api/eleves/${eleve}/porte-monnaie`) });
  return data.length ? (
    <Liste>
      {data.map((m) => (
        <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
          <div className="min-w-0 flex-1">
            <div className="truncate">{m.libelle}</div>
            <div className="text-xs text-muted-foreground">{dateHeure(m.le)} · {m.type_libelle}{m.moyen ? ` · ${MOYENS[m.moyen] ?? m.moyen}` : ""}{m.par_nom ? ` · ${m.par_nom}` : ""}</div>
          </div>
          <span className={cn("font-semibold chiffres", m.montant > 0 ? "text-primary" : "")}>{m.montant > 0 ? "+" : ""}{fcfa(m.montant)}</span>
        </div>
      ))}
    </Liste>
  ) : <p className="text-sm text-muted-foreground">Aucun mouvement.</p>;
}

function Recharge({ eleve, ouvert, fermer }: { eleve: Eleve; ouvert: boolean; fermer: () => void }) {
  const rafraichir = useRafraichir();
  const [montant, setMontant] = useState("");
  const [moyen, setMoyen] = useState("especes");
  const [reference, setReference] = useState("");
  async function valider(e: FormEvent) {
    e.preventDefault();
    try {
      await post(`/api/eleves/${eleve.id}/recharger`, { montant: Number(montant), moyen, reference });
      toast.success(`${fcfa(Number(montant))} ajoutés au porte-monnaie de ${eleve.prenom}`);
      rafraichir("carte");
      setMontant(""); setReference("");
      fermer();
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recharger le porte-monnaie de {eleve.prenom}</DialogTitle>
          <DialogDescription>Cet argent appartient à la famille jusqu'à ce qu'il soit dépensé : ce n'est pas une recette de l'école.</DialogDescription>
        </DialogHeader>
        <form onSubmit={valider} className="grid gap-4 sm:grid-cols-2">
          <Champ label="Montant"><Input type="number" min={1} required autoFocus value={montant} onChange={(e) => setMontant(e.target.value)} /></Champ>
          <Champ label="Reçu en">
            <Choix value={moyen} onChange={(e) => setMoyen(e.target.value)}>
              <option value="especes">Espèces</option><option value="wave">Wave</option><option value="orange_money">Orange Money</option><option value="free_money">Free Money</option>
            </Choix>
          </Champ>
          {moyen !== "especes" ? <Champ label="Référence de la transaction" className="sm:col-span-2"><Input required value={reference} onChange={(e) => setReference(e.target.value)} /></Champ> : null}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="secondary" onClick={fermer}>Annuler</Button>
            <Button type="submit"><Plus /> Recharger</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
