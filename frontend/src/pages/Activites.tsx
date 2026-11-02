import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin, PartyPopper, Plus, Ticket, Users } from "lucide-react";
import { toast } from "sonner";
import { Champ, Choix, EnTete, Liste, Pastille } from "@/components/design";
import { QR } from "@/components/QR";
import { Scanner } from "@/components/Scanner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, messageErreur, patch, post, type Page } from "@/lib/api";
import { date, fcfa, pays } from "@/lib/format";
import { useAnneeActive, useClasses, useRafraichir } from "@/lib/requetes";
import { cn } from "@/lib/utils";

type Activite = {
  id: number; titre: string; description: string; date: string; heure: string | null; lieu: string; prix: number; places: number | null;
  niveaux: string[]; caisse: number; caisse_nom: string; comptabilisee: boolean; vente_en_ligne: boolean; ouverte: boolean;
  vendus: number; entres: number; recette: number;
};
type TicketT = { id: number; eleve_nom: string | null; beneficiaire: string; code: string; statut: string; statut_libelle: string; prix_paye: number; moyen: string; qr: string | null };
type Caisse = { id: number; nom: string; comptabilisee: boolean; active: boolean };

export function Activites() {
  const { data } = useQuery({ queryKey: ["activites"], queryFn: () => api<Page<Activite>>("/api/activites?page_size=100") });
  const [edition, setEdition] = useState<Activite | "nouvelle" | null>(null);
  const [guichet, setGuichet] = useState<Activite | null>(null);
  const activites = data?.results ?? [];

  return (
    <div className="space-y-6">
      <EnTete titre="Activités" sousTitre="Soirées, kermesses, sorties, tournois… Les parents achètent le ticket dans l'application ; l'élève entre avec sa carte."
        actions={<Button onClick={() => setEdition("nouvelle")}><Plus /> Nouvelle activité</Button>} />
      {activites.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {activites.map((a) => (
            <div key={a.id} className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-carte">
              <div className="flex items-start gap-3">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-or-soft text-[#7a5600]"><PartyPopper className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold">{a.titre}</span>
                    {!a.ouverte ? <Pastille ton="gris">Vente close</Pastille> : null}
                    <Pastille ton={a.comptabilisee ? "bleu" : "or"}>{a.caisse_nom}{a.comptabilisee ? "" : " · hors comptabilité"}</Pastille>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />{date(a.date, { weekday: "short", day: "numeric", month: "short" })}{a.heure ? ` · ${a.heure.slice(0, 5)}` : ""}</span>
                    {a.lieu ? <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{a.lieu}</span> : null}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-lg bg-muted/60 p-2"><div className="font-semibold chiffres">{a.prix ? fcfa(a.prix) : "Gratuit"}</div><div className="text-xs text-muted-foreground">le ticket</div></div>
                <div className="rounded-lg bg-muted/60 p-2"><div className="font-semibold chiffres">{a.vendus}{a.places ? ` / ${a.places}` : ""}</div><div className="text-xs text-muted-foreground">tickets · {a.entres} entrés</div></div>
                <div className="rounded-lg bg-muted/60 p-2"><div className="font-semibold chiffres">{fcfa(a.recette)}</div><div className="text-xs text-muted-foreground">recette</div></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setGuichet(a)}><Ticket /> Tickets</Button>
                <Button size="sm" variant="secondary" onClick={() => setEdition(a)}>Modifier</Button>
              </div>
            </div>
          ))}
        </div>
      ) : <EmptyState icon={PartyPopper} title="Aucune activité" description="Créez une activité payante : ses recettes vont dans la caisse de votre choix (par exemple le foyer des élèves, hors comptabilité de l'école)." />}
      <EditionActivite edition={edition} fermer={() => setEdition(null)} />
      <Guichet activite={guichet} fermer={() => setGuichet(null)} />
    </div>
  );
}

function EditionActivite({ edition, fermer }: { edition: Activite | "nouvelle" | null; fermer: () => void }) {
  const rafraichir = useRafraichir();
  const { annee } = useAnneeActive();
  const { data: classes = [] } = useClasses(annee?.id);
  const niveaux = [...new Set(classes.map((c) => c.niveau).filter(Boolean))];
  const { data: caisses = [] } = useQuery({ queryKey: ["caisses"], queryFn: () => api<Caisse[]>("/api/caisses") });
  const existante = edition && edition !== "nouvelle" ? edition : null;
  const vide = { titre: "", description: "", date: "", heure: "", lieu: "", prix: "0", places: "", niveaux: [] as string[], caisse: "", vente_en_ligne: true, ouverte: true };
  const [f, setF] = useState(vide);
  useEffect(() => {
    if (!edition) return;
    if (existante) setF({ ...existante, heure: existante.heure?.slice(0, 5) ?? "", prix: String(existante.prix), places: existante.places ? String(existante.places) : "", caisse: String(existante.caisse) });
    else setF({ ...vide, caisse: String(caisses.find((c) => !c.comptabilisee)?.id ?? caisses[0]?.id ?? "") });
  }, [edition]); // eslint-disable-line react-hooks/exhaustive-deps
  const champ = (k: "titre" | "description" | "date" | "heure" | "lieu" | "prix" | "places" | "caisse") =>
    ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });

  async function valider(e: FormEvent) {
    e.preventDefault();
    const corps = { ...f, prix: Number(f.prix) || 0, places: f.places ? Number(f.places) : null, heure: f.heure || null, caisse: Number(f.caisse) };
    try {
      if (existante) await patch(`/api/activites/${existante.id}`, corps);
      else await post("/api/activites", corps);
      toast.success(existante ? "Activité modifiée" : "Activité créée : les parents peuvent acheter les tickets.");
      rafraichir("activites");
      fermer();
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }
  const caisse = caisses.find((c) => String(c.id) === f.caisse);
  return (
    <Dialog open={!!edition} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{existante ? existante.titre : "Nouvelle activité"}</DialogTitle></DialogHeader>
        <form onSubmit={valider} className="grid gap-4 sm:grid-cols-2">
          <Champ label="Titre" className="sm:col-span-2"><Input required {...champ("titre")} placeholder="Soirée culturelle, kermesse, tournoi de foot…" /></Champ>
          <Champ label="Description" className="sm:col-span-2"><Textarea rows={2} {...champ("description")} /></Champ>
          <Champ label="Date"><Input type="date" required {...champ("date")} /></Champ>
          <Champ label="Heure"><Input type="time" {...champ("heure")} /></Champ>
          <Champ label="Lieu"><Input {...champ("lieu")} placeholder="Cour de l'école" /></Champ>
          <Champ label={`Prix du ticket (${pays.devise})`}><Input type="number" min={0} {...champ("prix")} /></Champ>
          <Champ label="Places" aide="Vide : sans limite"><Input type="number" min={1} {...champ("places")} /></Champ>
          <Champ label="Caisse des recettes" aide={caisse ? (caisse.comptabilisee ? "Recettes comptées dans la comptabilité de l'école." : "Hors comptabilité de l'école : l'argent revient aux élèves.") : undefined}>
            <Choix required {...champ("caisse")}>{caisses.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</Choix>
          </Champ>
          <Champ label="Niveaux invités" aide="Aucun sélectionné : toute l'école." className="sm:col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {niveaux.map((n) => (
                <button type="button" key={n} onClick={() => setF({ ...f, niveaux: f.niveaux.includes(n) ? f.niveaux.filter((x) => x !== n) : [...f.niveaux, n] })}
                  className={cn("rounded-full border px-3 py-1 text-sm", f.niveaux.includes(n) ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>{n}</button>
              ))}
            </div>
          </Champ>
          <label className="flex items-center gap-3 text-sm"><Switch checked={f.vente_en_ligne} onCheckedChange={(v) => setF({ ...f, vente_en_ligne: v })} /> Vente dans l'application des parents</label>
          <label className="flex items-center gap-3 text-sm"><Switch checked={f.ouverte} onCheckedChange={(v) => setF({ ...f, ouverte: v })} /> Vente ouverte</label>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="secondary" onClick={fermer}>Annuler</Button>
            <Button type="submit">Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Tickets d'une activité : liste, vente au guichet (carte de l'élève ou invité), annulation. */
function Guichet({ activite, fermer }: { activite: Activite | null; fermer: () => void }) {
  const rafraichir = useRafraichir();
  const { data: tickets = [] } = useQuery({
    queryKey: ["activites", activite?.id, "tickets"], enabled: !!activite,
    queryFn: () => api<TicketT[]>(`/api/activites/${activite!.id}/tickets`),
  });
  const [mode, setMode] = useState<"carte" | "invite">("carte");
  const [beneficiaire, setBeneficiaire] = useState("");
  const [moyen, setMoyen] = useState("especes");
  const [imprime, setImprime] = useState<TicketT | null>(null);
  if (!activite) return null;

  async function vendre(corps: object) {
    try {
      const t = await post<TicketT>(`/api/activites/${activite!.id}/tickets`, corps);
      toast.success(`Ticket ${t.code} vendu${t.eleve_nom ? ` à ${t.eleve_nom}` : ""}`);
      rafraichir("activites");
      if (t.qr) setImprime(t);
      setBeneficiaire("");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }
  async function annuler(t: TicketT) {
    if (!confirm(`Annuler le ticket ${t.code} ?${t.moyen === "portefeuille" ? " L'élève est remboursé sur sa carte." : " Rendez l'argent en main propre."}`)) return;
    try {
      await post(`/api/activites/${activite!.id}/tickets/${t.id}/annuler`);
      rafraichir("activites");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{activite.titre}</DialogTitle>
          <DialogDescription>{activite.vendus} ticket(s){activite.places ? ` sur ${activite.places}` : ""} · {fcfa(activite.recette)} · {activite.caisse_nom}</DialogDescription>
        </DialogHeader>
        {imprime?.qr ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border p-4 text-center">
            <QR texte={imprime.qr} taille={180} />
            <div className="font-semibold">{imprime.beneficiaire} · {activite.titre}</div>
            <div className="font-mono text-sm">{imprime.code}</div>
            <p className="text-xs text-muted-foreground">Ticket d'invité : à photographier ou imprimer, il sera scanné à l'entrée.</p>
            <Button size="sm" variant="secondary" onClick={() => setImprime(null)}>Fermer le ticket</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="inline-flex rounded-lg bg-muted p-0.5 text-sm">
              {(["carte", "invite"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} className={cn("rounded-md px-3 py-1.5", mode === m ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>
                  {m === "carte" ? "Élève (carte)" : "Invité sans carte"}
                </button>
              ))}
            </div>
            {mode === "carte" ? (
              <div className="space-y-2">
                <Choix value={moyen} onChange={(e) => setMoyen(e.target.value)} aria-label="Paiement">
                  <option value="portefeuille">Payé avec le porte-monnaie de la carte</option>
                  <option value="especes">Payé en espèces</option><option value="wave">Payé par Wave</option><option value="orange_money">Payé par Orange Money</option>
                  <option value="gratuit">Gratuit (invité d'honneur, organisateur…)</option>
                </Choix>
                <Scanner onLecture={(qr) => vendre({ qr, moyen })} />
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); vendre({ beneficiaire, moyen }); }} className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <Input required value={beneficiaire} onChange={(e) => setBeneficiaire(e.target.value)} placeholder="Nom de l'invité" />
                <Choix value={moyen} onChange={(e) => setMoyen(e.target.value)} className="sm:w-40" aria-label="Paiement">
                  <option value="especes">Espèces</option><option value="wave">Wave</option><option value="orange_money">Orange Money</option><option value="gratuit">Gratuit</option>
                </Choix>
                <Button type="submit"><Ticket /> Vendre</Button>
              </form>
            )}
          </div>
        )}
        {tickets.length ? (
          <Liste>
            {tickets.map((t) => (
              <div key={t.id} className={cn("flex items-center gap-3 px-3 py-2 text-sm", t.statut === "annule" && "opacity-50")}>
                <Users className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{t.eleve_nom ?? `${t.beneficiaire} (invité)`}</div>
                  <div className="text-xs text-muted-foreground"><span className="font-mono">{t.code}</span> · {t.prix_paye ? fcfa(t.prix_paye) : "gratuit"} · {t.moyen}</div></div>
                <Pastille ton={t.statut === "utilise" ? "vert" : t.statut === "annule" ? "gris" : "bleu"}>{t.statut_libelle}</Pastille>
                {t.qr ? <Button size="sm" variant="ghost" onClick={() => setImprime(t)}>QR</Button> : null}
                {t.statut === "valide" ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => annuler(t)}>Annuler</Button> : null}
              </div>
            ))}
          </Liste>
        ) : null}
        <DialogFooter><Button variant="secondary" onClick={fermer}>Fermer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
