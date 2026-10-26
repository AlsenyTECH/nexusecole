import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CalendarRange, Plus, Settings2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Champ, Choix, EnTete, Pastille, Section } from "@/components/design";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, messageErreur, patch, post, supprimer, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date } from "@/lib/format";
import { useAnneeActive, useClasses, usePeriodes, useRafraichir } from "@/lib/requetes";
import type { Cours as TCours, Matiere, Personnel } from "@/lib/types";

type Parametres = { decoupage: string; poids_devoirs: number; poids_composition: number; validation_notes_surveillant: boolean };
type Surveillance = { id: number; classe: number; surveillant: number; surveillant_nom: string };

/** Paramétrage pédagogique : règles de calcul, trimestres, cours (matière + coef + enseignant), surveillants. */
export function Cours() {
  const { peut } = useAuth();
  const gerer = peut("scolarite.parametrer");
  const { annee } = useAnneeActive();
  const { data: classes = [] } = useClasses(annee?.id);
  const [classe, setClasse] = useState<number | null>(null);
  useEffect(() => { if (!classe && classes.length) setClasse(classes[0].id); }, [classes, classe]);
  // Personnel et enseignants servent aux choix de titulaires ; réservés à qui gère les comptes.
  const { data: personnel = [] } = useQuery({
    queryKey: ["personnel", "et-enseignants"],
    enabled: peut("utilisateurs.gerer"),
    queryFn: async () => {
      const [equipe, profs] = await Promise.all([
        api<Page<Personnel>>("/api/personnel?page_size=500"), api<Page<Personnel>>("/api/enseignants?page_size=500"),
      ]);
      return [...profs.results, ...equipe.results].filter((p) => p.is_active);
    },
  });

  return (
    <div className="space-y-7">
      <EnTete titre="Matières et cours" sousTitre="Qui enseigne quoi, avec quel coefficient ; règles de calcul des moyennes." />
      {gerer ? <Reglages annee={annee?.id ?? null} /> : null}
      <Section titre="Cours par classe" action={
        <Choix value={classe ?? ""} onChange={(e) => setClasse(Number(e.target.value))} className="h-9 w-40">
          {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.bareme === 10 ? " (/10)" : ""}</option>)}
        </Choix>}>
        {classe ? <CoursClasse classe={classe} gerer={gerer} personnel={personnel} /> : <EmptyState icon={BookOpen} title="Aucune classe" />}
      </Section>
    </div>
  );
}

function Reglages({ annee }: { annee: number | null }) {
  const rafraichir = useRafraichir();
  const { data: p } = useQuery({ queryKey: ["parametres"], queryFn: () => api<Parametres>("/api/pedagogie/parametres") });
  const { data: periodes } = usePeriodes(annee);
  const modifier = async (champs: Partial<Parametres>) => {
    try {
      await patch("/api/pedagogie/parametres", champs);
      rafraichir("parametres", "resultats");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  };
  const generer = async () => {
    try {
      await post("/api/periodes/generer", { annee });
      toast.success("Périodes créées");
      rafraichir("periodes");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  };
  if (!p) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4 rounded-xl border border-border/80 bg-card p-5 shadow-carte">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Settings2 className="size-4 text-primary" /> Calcul des moyennes</h2>
        <div className="grid grid-cols-2 gap-3">
          <Champ label="Poids des devoirs"><Input type="number" min={0} max={10} defaultValue={p.poids_devoirs} onBlur={(e) => modifier({ poids_devoirs: Number(e.target.value) })} /></Champ>
          <Champ label="Poids de la composition"><Input type="number" min={0} max={10} defaultValue={p.poids_composition} onBlur={(e) => modifier({ poids_composition: Number(e.target.value) })} /></Champ>
        </div>
        <p className="text-xs text-muted-foreground">
          Moyenne de matière = (moyenne des devoirs × {p.poids_devoirs} + composition × {p.poids_composition}) ÷ {p.poids_devoirs + p.poids_composition}
        </p>
        <label className="flex items-start gap-3 text-sm">
          <Switch checked={p.validation_notes_surveillant} onCheckedChange={(v) => modifier({ validation_notes_surveillant: v })} />
          <span>Les notes saisies par un surveillant doivent être <b>validées par l'enseignant</b> avant de compter.</span>
        </label>
      </div>
      <div className="space-y-3 rounded-xl border border-border/80 bg-card p-5 shadow-carte">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold"><CalendarRange className="size-4 text-primary" /> Périodes</h2>
          <Choix value={p.decoupage} onChange={(e) => modifier({ decoupage: e.target.value })} className="h-9 w-36" disabled={!!periodes?.length}>
            <option value="trimestre">Trimestres</option><option value="semestre">Semestres</option>
          </Choix>
        </div>
        {periodes?.length ? (
          <div className="space-y-1.5">
            {periodes.map((x) => (
              <div key={x.id} className="flex justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm"><span className="font-medium">{x.nom}</span><span className="text-muted-foreground">{date(x.debut)} → {date(x.fin)}</span></div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">L'année n'est pas encore découpée.</p>
            <Button size="sm" onClick={generer} disabled={!annee}>Créer les {p.decoupage === "trimestre" ? "3 trimestres" : "2 semestres"}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function CoursClasse({ classe, gerer, personnel }: { classe: number; gerer: boolean; personnel: Personnel[] }) {
  const rafraichir = useRafraichir();
  const { data: cours } = useQuery({ queryKey: ["cours", classe], queryFn: async () => (await api<Page<TCours>>(`/api/cours?classe=${classe}`)).results });
  const { data: surveillances = [] } = useQuery({
    queryKey: ["surveillances", classe],
    queryFn: async () => (await api<Page<Surveillance>>(`/api/surveillances?classe=${classe}`)).results,
  });
  const [ajout, setAjout] = useState(false);
  const enseignants = personnel.filter((p) => ["enseignant", "directeur", "surveillant"].includes(p.role));
  const surveillants = personnel.filter((p) => p.role === "surveillant" && !surveillances.some((s) => s.surveillant === p.id));

  const action = async (f: () => Promise<unknown>) => {
    try {
      await f();
      rafraichir("cours", "surveillances", "mes-cours");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  };
  const totalCoef = (cours ?? []).reduce((t, c) => t + Number(c.coefficient), 0);

  return (
    <div className="space-y-4">
      {cours?.length ? (
        <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-carte">
          <Table>
            <TableHeader><TableRow><TableHead>Matière</TableHead><TableHead className="w-24">Coef.</TableHead><TableHead>Enseignant</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
            <TableBody>
              {cours.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.matiere_nom}</TableCell>
                  <TableCell>
                    {gerer ? <Input type="number" min={0.5} step={0.5} defaultValue={Number(c.coefficient)} className="h-9 w-20"
                      onBlur={(e) => Number(e.target.value) !== Number(c.coefficient) && action(() => patch(`/api/cours/${c.id}`, { coefficient: e.target.value }))} />
                      : Number(c.coefficient)}
                  </TableCell>
                  <TableCell>
                    {gerer && enseignants.length ? (
                      <Choix value={c.enseignant ?? ""} className="h-9" onChange={(e) => action(() => patch(`/api/cours/${c.id}`, { enseignant: e.target.value ? Number(e.target.value) : null }))}>
                        <option value="">— non attribué —</option>
                        {enseignants.map((p) => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
                      </Choix>
                    ) : c.enseignant_nom || <span className="text-muted-foreground">non attribué</span>}
                  </TableCell>
                  <TableCell>{gerer ? <Button variant="ghost" size="icon" aria-label="Retirer" onClick={() => action(() => supprimer(`/api/cours/${c.id}`))}><Trash2 /></Button> : null}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">Total des coefficients : {totalCoef}</div>
        </div>
      ) : cours ? <EmptyState icon={BookOpen} title="Aucun cours dans cette classe" /> : null}
      {gerer ? <Button variant="secondary" onClick={() => setAjout(true)}><Plus /> Ajouter une matière</Button> : null}

      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-carte">
        <div className="mb-2 text-sm font-semibold">Surveillants de la classe</div>
        <p className="mb-3 text-xs text-muted-foreground">Ils peuvent faire l'appel et saisir les notes de cette classe.</p>
        <div className="flex flex-wrap items-center gap-2">
          {surveillances.map((s) => (
            <Pastille key={s.id} ton="bleu">
              {s.surveillant_nom}
              {gerer ? <button aria-label="Retirer" onClick={() => action(() => supprimer(`/api/surveillances/${s.id}`))}><X className="size-3" /></button> : null}
            </Pastille>
          ))}
          {!surveillances.length ? <span className="text-sm text-muted-foreground">Aucun.</span> : null}
          {gerer && surveillants.length ? (
            <Choix value="" className="h-8 w-48 text-xs" onChange={(e) => e.target.value && action(() => post("/api/surveillances", { classe, surveillant: Number(e.target.value) }))}>
              <option value="">+ Affecter un surveillant</option>
              {surveillants.map((p) => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
            </Choix>
          ) : null}
        </div>
      </div>
      <AjoutCours classe={classe} ouvert={ajout} fermer={() => setAjout(false)} enseignants={enseignants} />
    </div>
  );
}

function AjoutCours({ classe, ouvert, fermer, enseignants }: { classe: number; ouvert: boolean; fermer: () => void; enseignants: Personnel[] }) {
  const rafraichir = useRafraichir();
  const { data: matieres = [] } = useQuery({ queryKey: ["matieres"], queryFn: async () => (await api<Page<Matiere>>("/api/matieres?page_size=200")).results });
  const [f, setF] = useState({ matiere: "", nouvelle: "", coefficient: "2", enseignant: "" });
  async function valider(e: FormEvent) {
    e.preventDefault();
    try {
      const matiere = f.matiere === "nouvelle" ? (await post<Matiere>("/api/matieres", { nom: f.nouvelle.trim() })).id : Number(f.matiere);
      await post("/api/cours", { classe, matiere, coefficient: f.coefficient, enseignant: f.enseignant ? Number(f.enseignant) : null });
      rafraichir("cours", "matieres", "mes-cours");
      setF({ matiere: "", nouvelle: "", coefficient: "2", enseignant: "" });
      fermer();
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Ajouter une matière à la classe</DialogTitle></DialogHeader>
        <form onSubmit={valider} className="grid gap-4 sm:grid-cols-2">
          <Champ label="Matière" className="sm:col-span-2">
            <Choix required value={f.matiere} onChange={(e) => setF({ ...f, matiere: e.target.value })}>
              <option value="">Choisir…</option>
              {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
              <option value="nouvelle">+ Nouvelle matière…</option>
            </Choix>
          </Champ>
          {f.matiere === "nouvelle" ? <Champ label="Nom de la nouvelle matière" className="sm:col-span-2"><Input required value={f.nouvelle} onChange={(e) => setF({ ...f, nouvelle: e.target.value })} /></Champ> : null}
          <Champ label="Coefficient"><Input type="number" min={0.5} step={0.5} value={f.coefficient} onChange={(e) => setF({ ...f, coefficient: e.target.value })} /></Champ>
          <Champ label="Enseignant">
            <Choix value={f.enseignant} onChange={(e) => setF({ ...f, enseignant: e.target.value })}>
              <option value="">— plus tard —</option>
              {enseignants.map((p) => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
            </Choix>
          </Champ>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="secondary" onClick={fermer}>Annuler</Button>
            <Button type="submit">Ajouter</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
