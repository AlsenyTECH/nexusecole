import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CalendarRange, Layers, Plus } from "lucide-react";
import { toast } from "sonner";
import { Champ, EnTete, Liste, Pastille, Section } from "@/components/design";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { messageErreur, patch, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date } from "@/lib/format";
import { useAnnees, useClasses, useRafraichir } from "@/lib/requetes";
import { cn } from "@/lib/utils";

export function Classes() {
  const { peut } = useAuth();
  const gerer = peut("scolarite.parametrer");
  const rafraichir = useRafraichir();
  const { data: annees = [] } = useAnnees();
  const [choisie, setChoisie] = useState<number | null>(null);
  useEffect(() => {
    if (!choisie && annees.length) setChoisie((annees.find((a) => a.active) ?? annees[0]).id);
  }, [annees, choisie]);
  const { data: classes = [] } = useClasses(choisie);
  const [nouvelleAnnee, setNouvelleAnnee] = useState(false);
  const [nouvelleClasse, setNouvelleClasse] = useState(false);

  async function activer(id: number) {
    try {
      await patch(`/api/annees/${id}`, { active: true });
      rafraichir("annees", "tableau-de-bord");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }

  return (
    <div className="space-y-7">
      <EnTete titre="Classes et années" sousTitre="L'année active sert aux inscriptions, aux frais et au tableau de bord." />

      <Section titre="Années scolaires" action={gerer ? <Button size="sm" variant="secondary" onClick={() => setNouvelleAnnee(true)}><Plus /> Année</Button> : null}>
        {annees.length ? (
          <div className="flex flex-wrap gap-2">
            {annees.map((a) => (
              <button key={a.id} onClick={() => setChoisie(a.id)}
                className={cn("flex items-center gap-3 rounded-xl border px-4 py-3 text-left shadow-carte transition-colors",
                  choisie === a.id ? "border-primary bg-primary-soft" : "border-border/80 bg-card hover:bg-muted/50")}>
                <CalendarRange className="size-5 text-primary" />
                <div>
                  <div className="font-heading font-semibold">{a.libelle}</div>
                  <div className="text-xs text-muted-foreground">{date(a.debut)} → {date(a.fin)}</div>
                </div>
                {a.active ? <Pastille ton="vert">Active</Pastille>
                  : gerer ? <span onClick={(e) => { e.stopPropagation(); activer(a.id); }} className="text-xs font-medium text-primary hover:underline">Activer</span> : null}
              </button>
            ))}
          </div>
        ) : <EmptyState icon={CalendarRange} title="Aucune année scolaire" description="Créez l'année en cours pour commencer." />}
      </Section>

      {choisie ? (
        <Section titre="Classes" action={gerer ? <Button size="sm" onClick={() => setNouvelleClasse(true)}><Plus /> Classe</Button> : null}>
          {classes.length ? (
            <Liste>
              {classes.map((c) => (
                <Link key={c.id} to={`/eleves?classe=${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                  <span className="inline-flex size-10 items-center justify-center rounded-xl bg-[#e6eefb] text-[#1f4e99]"><Layers className="size-5" /></span>
                  <div className="flex-1">
                    <div className="font-medium">{c.nom}</div>
                    <div className="text-xs text-muted-foreground">{c.niveau || "Niveau non précisé"}</div>
                  </div>
                  <span className="text-sm text-muted-foreground chiffres">{c.effectif} élève{c.effectif > 1 ? "s" : ""}</span>
                </Link>
              ))}
            </Liste>
          ) : <EmptyState icon={Layers} title="Aucune classe pour cette année" />}
        </Section>
      ) : null}

      <NouvelleAnnee ouvert={nouvelleAnnee} fermer={() => setNouvelleAnnee(false)} />
      {choisie ? <NouvelleClasse annee={choisie} ouvert={nouvelleClasse} fermer={() => setNouvelleClasse(false)} /> : null}
    </div>
  );
}

function NouvelleAnnee({ ouvert, fermer }: { ouvert: boolean; fermer: () => void }) {
  const rafraichir = useRafraichir();
  const an = new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const [f, setF] = useState({ libelle: `${an}-${an + 1}`, debut: `${an}-10-01`, fin: `${an + 1}-07-31`, active: true });
  async function valider(e: FormEvent) {
    e.preventDefault();
    try {
      await post("/api/annees", f);
      toast.success(`Année ${f.libelle} créée`);
      rafraichir("annees", "tableau-de-bord");
      fermer();
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouvelle année scolaire</DialogTitle></DialogHeader>
        <form onSubmit={valider} className="grid gap-4 sm:grid-cols-2">
          <Champ label="Libellé" className="sm:col-span-2"><Input required value={f.libelle} onChange={(e) => setF({ ...f, libelle: e.target.value })} /></Champ>
          <Champ label="Début"><Input type="date" required value={f.debut} onChange={(e) => setF({ ...f, debut: e.target.value })} /></Champ>
          <Champ label="Fin"><Input type="date" required value={f.fin} onChange={(e) => setF({ ...f, fin: e.target.value })} /></Champ>
          <label className="flex items-center gap-3 text-sm sm:col-span-2">
            <Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} /> Année active (remplace l'année active actuelle)
          </label>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="secondary" onClick={fermer}>Annuler</Button>
            <Button type="submit">Créer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const NIVEAUX = ["CI", "CP", "CE1", "CE2", "CM1", "CM2", "6e", "5e", "4e", "3e", "Seconde", "Première", "Terminale"];

function NouvelleClasse({ annee, ouvert, fermer }: { annee: number; ouvert: boolean; fermer: () => void }) {
  const rafraichir = useRafraichir();
  const [nom, setNom] = useState("");
  const [niveau, setNiveau] = useState("6e");
  async function valider(e: FormEvent) {
    e.preventDefault();
    try {
      await post("/api/classes", { annee, nom: nom.trim(), niveau });
      toast.success(`Classe ${nom} créée`);
      rafraichir("classes", "tableau-de-bord");
      setNom("");
      fermer();
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouvelle classe</DialogTitle></DialogHeader>
        <form onSubmit={valider} className="space-y-4">
          <Champ label="Niveau" aide="Sert à appliquer la bonne grille de frais.">
            <div className="flex flex-wrap gap-1.5">
              {NIVEAUX.map((n) => (
                <button type="button" key={n} onClick={() => setNiveau(n)}
                  className={cn("rounded-full border px-3 py-1 text-sm", niveau === n ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>{n}</button>
              ))}
            </div>
          </Champ>
          <Champ label="Nom de la classe"><Input required value={nom} onChange={(e) => setNom(e.target.value)} placeholder={`ex. ${niveau} A`} /></Champ>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={fermer}>Annuler</Button>
            <Button type="submit">Créer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
