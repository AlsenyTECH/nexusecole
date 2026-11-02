import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Archive, CalendarRange, CopyPlus, Layers, Plus, Power, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Champ, EnTete, Liste, Pastille, Section } from "@/components/design";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { messageErreur, post } from "@/lib/api";
import type { Annee } from "@/lib/types";
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

  const annee = annees.find((a) => a.id === choisie);
  const [reconduction, setReconduction] = useState(false);

  async function changerStatut(statut: string, message: string) {
    if (!annee) return;
    if (statut !== "preparation" && !confirm(message)) return;
    try {
      await post(`/api/annees/${annee.id}/statut`, { statut });
      toast.success("Statut de l'année mis à jour");
      rafraichir("annees", "tableau-de-bord", "classes");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }

  return (
    <div className="space-y-7">
      <EnTete titre="Classes et années" sousTitre="L'année active sert partout (inscriptions, frais, notes, cartes…). Préparez la suivante sans la rendre active, puis activez-la à la rentrée." />

      <Section titre="Années scolaires" action={gerer ? (
        <div className="flex gap-2">
          {annee ? <Button size="sm" onClick={() => setReconduction(true)}><CopyPlus /> Préparer l'année suivante</Button> : null}
          <Button size="sm" variant="secondary" onClick={() => setNouvelleAnnee(true)}><Plus /> Année vide</Button>
        </div>
      ) : null}>
        {annees.length ? (
          <div className="flex flex-wrap gap-2">
            {annees.map((a) => (
              <button key={a.id} onClick={() => setChoisie(a.id)}
                className={cn("flex items-center gap-3 rounded-xl border px-4 py-3 text-left shadow-carte transition-colors",
                  choisie === a.id ? "border-primary bg-primary-soft" : "border-border/80 bg-card hover:bg-muted/50", a.statut === "cloturee" && "opacity-75")}>
                <CalendarRange className="size-5 text-primary" />
                <div>
                  <div className="font-heading font-semibold">{a.libelle}</div>
                  <div className="text-xs text-muted-foreground">{date(a.debut)} → {date(a.fin)}</div>
                </div>
                <Pastille ton={a.statut === "active" ? "vert" : a.statut === "preparation" ? "or" : "gris"}>{a.statut_libelle}</Pastille>
              </button>
            ))}
          </div>
        ) : <EmptyState icon={CalendarRange} title="Aucune année scolaire" description="Créez l'année en cours pour commencer." />}
        {annee && gerer ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 px-4 py-3 text-sm">
            <span className="mr-auto text-muted-foreground">Année {annee.libelle} :</span>
            {annee.statut !== "active" ? (
              <Button size="sm" onClick={() => changerStatut("active", `Activer ${annee.libelle} ? L'année active actuelle sera clôturée et toute l'application passera sur ${annee.libelle}.`)}>
                <Power /> Activer
              </Button>
            ) : null}
            {annee.statut !== "preparation" ? (
              <Button size="sm" variant="secondary" onClick={() => changerStatut("preparation", "")}><Undo2 /> Remettre en préparation</Button>
            ) : null}
            {annee.statut !== "cloturee" ? (
              <Button size="sm" variant="ghost" onClick={() => changerStatut("cloturee", `Clôturer ${annee.libelle} ? Elle restera consultable (notes, bulletins, paiements) mais on n'y inscrira plus d'élèves.`)}>
                <Archive /> Clôturer
              </Button>
            ) : null}
          </div>
        ) : null}
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
      {annee ? <Reconduction source={annee} ouvert={reconduction} fermer={(id) => { setReconduction(false); if (id) setChoisie(id); }} /> : null}
      {choisie ? <NouvelleClasse annee={choisie} ouvert={nouvelleClasse} fermer={() => setNouvelleClasse(false)} /> : null}
    </div>
  );
}

/** Préparer l'année suivante en reconduisant ce qu'on veut de l'année choisie. */
function Reconduction({ source, ouvert, fermer }: { source: Annee; ouvert: boolean; fermer: (nouvelle?: number) => void }) {
  const rafraichir = useRafraichir();
  const an = Number(source.debut.slice(0, 4)) + 1;
  const decale = (d: string) => `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;
  const [f, setF] = useState({ libelle: "", debut: "", fin: "", classes: true, frais: true, cours: true, periodes: true });
  useEffect(() => {
    if (ouvert) setF({ libelle: `${an}-${an + 1}`, debut: decale(source.debut), fin: decale(source.fin), classes: true, frais: true, cours: true, periodes: true });
  }, [ouvert]); // eslint-disable-line react-hooks/exhaustive-deps
  async function valider(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await post<{ annee: Annee; bilan: Record<string, number> }>(`/api/annees/${source.id}/reconduire`, f);
      toast.success(`${r.annee.libelle} préparée : ${r.bilan.classes} classes, ${r.bilan.frais} frais, ${r.bilan.cours} cours, ${r.bilan.periodes} périodes.`);
      rafraichir("annees", "classes", "frais");
      fermer(r.annee.id);
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }
  const choix: [keyof typeof f, string, string][] = [
    ["classes", "Les classes", "mêmes noms, niveaux et barèmes"],
    ["frais", "La grille des frais et services", "mêmes montants, dates décalées d'un an (à ajuster si besoin)"],
    ["cours", "Les matières et coefficients", "sans les enseignants : leurs affectations repartent de zéro"],
    ["periodes", "Les trimestres / semestres", "découpés automatiquement"],
  ];
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Préparer l'année suivante</DialogTitle>
          <DialogDescription>
            À partir de {source.libelle}. La nouvelle année reste « en préparation » : l'école continue sur l'année active
            jusqu'à ce que vous l'activiez. Élèves, familles, personnel et enseignants (avec leurs accès) sont conservés.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={valider} className="grid gap-4 sm:grid-cols-3">
          <Champ label="Libellé"><Input required value={f.libelle} onChange={(e) => setF({ ...f, libelle: e.target.value })} /></Champ>
          <Champ label="Début"><Input type="date" required value={f.debut} onChange={(e) => setF({ ...f, debut: e.target.value })} /></Champ>
          <Champ label="Fin"><Input type="date" required value={f.fin} onChange={(e) => setF({ ...f, fin: e.target.value })} /></Champ>
          <fieldset className="space-y-2.5 rounded-xl border border-border p-3 sm:col-span-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reconduire</legend>
            {choix.map(([cle, titre, aide]) => (
              <label key={cle} className="flex cursor-pointer items-start gap-3 text-sm">
                <Checkbox className="mt-0.5" checked={f[cle] as boolean} onCheckedChange={(v) => setF({ ...f, [cle]: v === true })} />
                <span><span className="font-medium">{titre}</span><span className="block text-xs text-muted-foreground">{aide}</span></span>
              </label>
            ))}
          </fieldset>
          <DialogFooter className="sm:col-span-3">
            <Button type="button" variant="secondary" onClick={() => fermer()}>Annuler</Button>
            <Button type="submit"><CopyPlus /> Préparer {f.libelle}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NouvelleAnnee({ ouvert, fermer }: { ouvert: boolean; fermer: () => void }) {
  const rafraichir = useRafraichir();
  const { data: annees = [] } = useAnnees();
  // Préparer l'année suivante ne doit pas la rendre active : l'école continue de travailler sur l'année en cours
  const derniere = Math.max(0, ...annees.map((a) => Number(a.debut.slice(0, 4))));
  const an = derniere ? derniere + 1 : new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const vide = { libelle: `${an}-${an + 1}`, debut: `${an}-10-01`, fin: `${an + 1}-07-31`, active: !annees.some((a) => a.active) };
  const [f, setF] = useState(vide);
  useEffect(() => { if (ouvert) setF(vide); }, [ouvert]); // eslint-disable-line react-hooks/exhaustive-deps
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
            <Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} /> Rendre active maintenant
          </label>
          {f.active && annees.some((a) => a.active) ? (
            <p className="text-xs text-[#7a5600] sm:col-span-2">
              Attention : l'année active actuelle sera remplacée. Inscriptions, frais, notes, cartes… passeront sur la nouvelle année,
              qui n'a pas encore de classes. Pour préparer la rentrée, laissez-la inactive et activez-la le jour venu.
            </p>
          ) : null}
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
      const primaire = ["CI", "CP", "CE1", "CE2", "CM1", "CM2"].includes(niveau);
      await post("/api/classes", { annee, nom: nom.trim(), niveau, bareme: primaire ? 10 : 20 });
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
          <Champ label="Niveau" aide="Sert à appliquer la bonne grille de frais et le barème (/10 à l'élémentaire, /20 ensuite).">
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
