import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarCog, Check, CheckCircle2, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Champ, Choix, EnTete, Pastille, Section } from "@/components/design";
import { GrilleSemaine } from "@/components/Grille";
import { cle, GrilleCases, GrilleDispo, STYLE, versCases, versEnsemble } from "@/components/GrilleCases";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, messageErreur, patch, post, remplacer, supprimer, type Page } from "@/lib/api";
import { useAnneeActive, useClasses, useRafraichir } from "@/lib/requetes";
import type {
  Cours, Creneau, Diagnostic, Disponibilite, GenerationEDT, GrilleEcole, Matiere, Placement, Proposition, SalleSpecialisee,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const ETAPES = [
  { id: "grille", titre: "1. Grille de l'école" },
  { id: "volumes", titre: "2. Heures par matière" },
  { id: "salles", titre: "3. Salles spécialisées" },
  { id: "dispos", titre: "4. Disponibilités" },
  { id: "generer", titre: "5. Générer et publier" },
] as const;
type Etape = (typeof ETAPES)[number]["id"];

export const useGrille = () => useQuery({ queryKey: ["edt-grille"], queryFn: () => api<GrilleEcole>("/api/edt/grille") });

/** Générateur automatique : on prépare les données, l'application propose plusieurs emplois du temps. */
export function GenerateurEDT() {
  const [etape, setEtape] = useState<Etape>("grille");
  const { annee } = useAnneeActive();
  return (
    <div className="space-y-6">
      <EnTete titre="Générer les emplois du temps" sousTitre={annee ? `Année ${annee.libelle}` : "Aucune année active"}
        actions={<Button asChild variant="secondary"><Link to="/emploi-du-temps">Voir l'emploi du temps</Link></Button>} />
      <nav className="flex flex-wrap gap-1.5" aria-label="Étapes">
        {ETAPES.map((e) => (
          <button key={e.id} type="button" onClick={() => setEtape(e.id)}
            className={cn("rounded-lg px-3 py-1.5 text-sm", e.id === etape ? "bg-primary font-semibold text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>
            {e.titre}
          </button>
        ))}
      </nav>
      {etape === "grille" ? <EtapeGrille /> : null}
      {etape === "volumes" ? <EtapeVolumes annee={annee?.id ?? null} /> : null}
      {etape === "salles" ? <EtapeSalles /> : null}
      {etape === "dispos" ? <EtapeDispos /> : null}
      {etape === "generer" ? <EtapeGenerer annee={annee?.id ?? null} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function EtapeGrille() {
  const rafraichir = useRafraichir();
  const { data: g } = useGrille();
  const [heures, setHeures] = useState("");
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  useEffect(() => { if (g) { setHeures(g.heures.join(" ")); setOuverts(versEnsemble(g.ouverts)); } }, [g]);
  if (!g) return null;
  const liste = heures.split(/[\s,;]+/).filter(Boolean);
  const basculer = (j: number, i: number) => { const s = new Set(ouverts); const k = cle(j, i); if (s.has(k)) s.delete(k); else s.add(k); setOuverts(s); };
  const jour = (j: number) => {
    const s = new Set(ouverts); const tous = g.heures.every((_, i) => s.has(cle(j, i)));
    g.heures.forEach((_, i) => (tous ? s.delete(cle(j, i)) : s.add(cle(j, i)))); setOuverts(s);
  };
  async function enregistrer() {
    try {
      const memes = liste.join() === g!.heures.join();
      const r = await remplacer<GrilleEcole>("/api/edt/grille", { heures: liste, ouverts: memes ? versCases(ouverts) : [] });
      toast.success(memes ? "Grille enregistrée" : "Heures changées : cochez maintenant les créneaux ouverts");
      setOuverts(versEnsemble(r.ouverts));
      rafraichir("edt-grille", "edt-diagnostic");
    } catch (e) { toast.error(messageErreur(e)); }
  }
  return (
    <Section titre="Créneaux d'une heure où l'école fait cours">
      <div className="space-y-4">
        <Champ label="Heures de début des créneaux" aide="Séparées par des espaces, ex. 08:00 09:00 10:00 11:00 12:00 15:00 16:00. Avant 13 h = matin.">
          <Input value={heures} onChange={(e) => setHeures(e.target.value)} />
        </Champ>
        <GrilleCases heures={g.heures} cliquer={basculer} cliquerJour={jour}
          rendu={(j, i) => ouverts.has(cle(j, i)) ? { classe: STYLE.ouvert, texte: "Cours" } : { classe: STYLE.ferme, texte: "Fermé" }} />
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{ouverts.size} créneaux ouverts par semaine. Cliquez un jour pour l'ouvrir ou le fermer en entier.</p>
          <Button onClick={enregistrer}><Check /> Enregistrer</Button>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
function EtapeVolumes({ annee }: { annee: number | null }) {
  const rafraichir = useRafraichir();
  const { data: classes = [] } = useClasses(annee);
  const [classe, setClasse] = useState<number | "toutes">("toutes");
  const { data: cours = [] } = useQuery({
    queryKey: ["cours", "edt", annee], enabled: !!annee,
    queryFn: async () => (await api<Page<Cours>>("/api/cours?page_size=1000")).results,
  });
  const { data: matieres = [] } = useQuery({ queryKey: ["matieres"], queryFn: async () => (await api<Page<Matiere>>("/api/matieres?page_size=200")).results });
  const { data: salles = [] } = useSalles();
  const ids = new Set(classes.map((c) => c.id));
  const visibles = cours.filter((c) => ids.has(c.classe) && (classe === "toutes" || c.classe === classe));
  const total = (id: number) => cours.filter((c) => c.classe === id).reduce((s, c) => s + (c.volume_horaire ?? 0), 0);

  async function changerCours(c: Cours, champs: Partial<Cours>) {
    try { await patch(`/api/cours/${c.id}`, champs); rafraichir("cours", "edt-diagnostic"); }
    catch (e) { toast.error(messageErreur(e)); rafraichir("cours"); }
  }
  async function changerMatiere(m: Matiere, champs: Partial<Matiere>) {
    try { await patch(`/api/matieres/${m.id}`, champs); rafraichir("matieres", "edt-salles"); } catch (e) { toast.error(messageErreur(e)); }
  }

  return (
    <div className="space-y-6">
      <Section titre="Matières" action={<span className="text-xs text-muted-foreground">Lourde = de préférence le matin</span>}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {matieres.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border/80 bg-card p-2.5">
              <span className="flex-1 text-sm font-medium">{m.nom}</span>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch checked={m.lourde} onCheckedChange={(v) => changerMatiere(m, { lourde: v })} aria-label={`${m.nom} lourde`} /> Lourde
              </label>
              <Choix className="h-8 w-32 text-xs" value={m.salle ?? ""} aria-label={`Salle de ${m.nom}`}
                onChange={(e) => changerMatiere(m, { salle: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Salle de classe</option>
                {salles.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </Choix>
            </div>
          ))}
        </div>
      </Section>
      <Section titre="Heures par semaine" action={
        <Choix className="h-9 w-40" value={classe} onChange={(e) => setClasse(e.target.value === "toutes" ? "toutes" : Number(e.target.value))}>
          <option value="toutes">Toutes les classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.nom} · {total(c.id)} h</option>)}
        </Choix>}>
        {visibles.length ? (
          <div className="overflow-x-auto rounded-xl border border-border/80 bg-card">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Classe</TableHead><TableHead>Matière</TableHead><TableHead>Enseignant</TableHead>
                <TableHead className="w-28">Heures</TableHead><TableHead className="w-36">Séances</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {visibles.map((c) => <LigneVolume key={`${c.id}-${c.volume_horaire}-${c.decoupage}`} c={c} changer={changerCours} />)}
              </TableBody>
            </Table>
          </div>
        ) : <EmptyState icon={CalendarCog} title="Aucun cours" description="Attribuez d'abord les matières aux classes (Matières et cours, ou fiche enseignant)." />}
      </Section>
    </div>
  );
}

function LigneVolume({ c, changer }: { c: Cours; changer: (c: Cours, champs: Partial<Cours>) => void }) {
  const [volume, setVolume] = useState(c.volume_horaire ? String(c.volume_horaire) : "");
  const [decoupage, setDecoupage] = useState(c.decoupage);
  const sauver = () => {
    const v = volume ? Number(volume) : null;
    if (v === c.volume_horaire && decoupage === c.decoupage) return;
    const d = decoupage && v && decoupage.split("+").reduce((s, x) => s + Number(x), 0) === v ? decoupage : "";
    changer(c, { volume_horaire: v, decoupage: d });
  };
  return (
    <TableRow>
      <TableCell className="font-medium">{c.classe_nom}</TableCell>
      <TableCell>{c.matiere_nom}</TableCell>
      <TableCell className={c.enseignant_nom ? "" : "text-destructive"}>{c.enseignant_nom || "Sans enseignant"}</TableCell>
      <TableCell><Input type="number" min={0} max={20} className="h-8" value={volume} aria-label={`Heures ${c.matiere_nom} ${c.classe_nom}`}
        onChange={(e) => setVolume(e.target.value)} onBlur={sauver} /></TableCell>
      <TableCell><Input className="h-8" placeholder={volume ? Array(Number(volume)).fill(1).join("+") : "ex. 2+2+1"} value={decoupage}
        aria-label={`Séances ${c.matiere_nom} ${c.classe_nom}`} onChange={(e) => setDecoupage(e.target.value.replace(/[^0-9+]/g, ""))} onBlur={sauver} /></TableCell>
    </TableRow>
  );
}

/* ------------------------------------------------------------------ */
const useSalles = () => useQuery({ queryKey: ["edt-salles"], queryFn: () => api<SalleSpecialisee[]>("/api/edt/salles") });

function EtapeSalles() {
  const rafraichir = useRafraichir();
  const { data: salles = [] } = useSalles();
  const [nom, setNom] = useState(""); const [nombre, setNombre] = useState("1");
  const agir = async (f: () => Promise<unknown>) => { try { await f(); rafraichir("edt-salles", "matieres", "edt-diagnostic"); } catch (e) { toast.error(messageErreur(e)); } };
  return (
    <Section titre="Salles partagées entre les classes">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Chaque classe garde sa salle. Indiquez ici les salles partagées (laboratoire, salle informatique, terrain) et combien l'école en a ;
          rattachez-y les matières à l'étape 2. Deux classes ne pourront pas y être en même temps au-delà de ce nombre.
        </p>
        <div className="space-y-2">
          {salles.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/80 bg-card p-3">
              <span className="font-medium">{s.nom}</span>
              <Input type="number" min={1} max={20} className="h-8 w-20" defaultValue={s.nombre} aria-label={`Nombre de ${s.nom}`}
                onBlur={(e) => Number(e.target.value) !== s.nombre && agir(() => patch(`/api/edt/salles/${s.id}`, { nombre: Number(e.target.value) }))} />
              <span className="flex-1 text-sm text-muted-foreground">{s.matieres.length ? s.matieres.join(", ") : "Aucune matière rattachée"}</span>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => agir(() => supprimer(`/api/edt/salles/${s.id}`))}><Trash2 /></Button>
            </div>
          ))}
        </div>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); agir(() => post("/api/edt/salles", { nom, nombre: Number(nombre) })).then(() => setNom("")); }}>
          <Champ label="Nouvelle salle"><Input required value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex. Laboratoire" /></Champ>
          <Champ label="Nombre"><Input type="number" min={1} max={20} className="w-24" value={nombre} onChange={(e) => setNombre(e.target.value)} /></Champ>
          <Button type="submit"><Plus /> Ajouter</Button>
        </form>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
function EtapeDispos() {
  const rafraichir = useRafraichir();
  const { data: g } = useGrille();
  const { data: profs = [] } = useQuery({ queryKey: ["edt-dispos"], queryFn: () => api<Disponibilite[]>("/api/edt/disponibilites") });
  const [choisi, setChoisi] = useState<number | null>(null);
  useEffect(() => { if (!choisi && profs.length) setChoisi((profs.find((p) => p.proposition) ?? profs[0]).enseignant); }, [profs, choisi]);
  const prof = profs.find((p) => p.enseignant === choisi);
  const [indispo, setIndispo] = useState<Set<string>>(new Set());
  const [prefere, setPrefere] = useState<Set<string>>(new Set());
  useEffect(() => { setIndispo(versEnsemble(prof?.indispo)); setPrefere(versEnsemble(prof?.prefere)); }, [prof]);
  if (!g) return null;
  const agir = async (f: () => Promise<unknown>, ok: string) => {
    try { await f(); toast.success(ok); rafraichir("edt-dispos", "edt-diagnostic"); } catch (e) { toast.error(messageErreur(e)); }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <div className="space-y-1.5">
        {profs.map((p) => (
          <button key={p.enseignant} type="button" onClick={() => setChoisi(p.enseignant)}
            className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm", p.enseignant === choisi ? "bg-primary-soft font-semibold" : "hover:bg-muted")}>
            <span>{p.nom}{p.statut === "vacataire" ? <span className="text-xs text-muted-foreground"> · vacataire</span> : null}</span>
            {p.proposition ? <Pastille ton="or">À valider</Pastille> : p.indispo.length ? <span className="text-xs text-muted-foreground">{p.indispo.length} h indispo.</span> : null}
          </button>
        ))}
        {!profs.length ? <p className="text-sm text-muted-foreground">Aucun enseignant actif.</p> : null}
      </div>
      {prof ? (
        <div className="space-y-4">
          {prof.proposition ? (
            <div className="space-y-3 rounded-xl border border-[#e9a812]/50 bg-or-soft/40 p-4">
              <p className="text-sm"><b>{prof.nom}</b> a proposé ses disponibilités : {prof.proposition.indispo.length} h indisponibles, {prof.proposition.prefere.length} h préférées.</p>
              <GrilleDispo lecture heures={g.heures} ouverts={versEnsemble(g.ouverts)} indispo={versEnsemble(prof.proposition.indispo)} prefere={versEnsemble(prof.proposition.prefere)} />
              <div className="flex gap-2">
                <Button onClick={() => agir(() => post(`/api/edt/disponibilites/${prof.enseignant}`, {}), "Proposition validée")}><Check /> Valider</Button>
                <Button variant="secondary" onClick={() => agir(() => post(`/api/edt/disponibilites/${prof.enseignant}`, { refuser: true }), "Proposition refusée")}><X /> Refuser</Button>
              </div>
            </div>
          ) : null}
          <Section titre={`Disponibilités retenues · ${prof.nom}`}>
            <div className="space-y-3">
              <GrilleDispo heures={g.heures} ouverts={versEnsemble(g.ouverts)} indispo={indispo} prefere={prefere}
                changer={(i, p) => { setIndispo(i); setPrefere(p); }} />
              <div className="flex justify-end">
                <Button onClick={() => agir(() => remplacer(`/api/edt/disponibilites/${prof.enseignant}`, { indispo: versCases(indispo), prefere: versCases(prefere) }),
                  "Disponibilités enregistrées")}><Check /> Enregistrer</Button>
              </div>
            </div>
          </Section>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function versCreneaux(placements: Placement[], heures: string[]): Creneau[] {
  return placements.map((p, n) => {
    const debut = heures[p.heure];
    const fin = `${String(Number(debut.slice(0, 2)) + p.duree).padStart(2, "0")}${debut.slice(2)}`;
    return { id: n, cours: p.cours, classe: 0, classe_nom: p.classe, matiere_nom: p.matiere, enseignant_nom: p.prof_nom, jour: p.jour, debut, fin, salle: p.salle };
  });
}

function EtapeGenerer({ annee }: { annee: number | null }) {
  const rafraichir = useRafraichir();
  const { data: diag } = useQuery({ queryKey: ["edt-diagnostic", annee], enabled: !!annee, queryFn: () => api<Diagnostic>("/api/edt/diagnostic") });
  const { data: generations = [] } = useQuery({
    queryKey: ["edt-generations", annee], enabled: !!annee,
    queryFn: () => api<GenerationEDT[]>(`/api/edt/generations?annee=${annee}`),
    refetchInterval: (q) => (q.state.data?.some((g) => g.statut === "en_cours") ? 2000 : false),
  });
  const gen = generations[0];
  const enCours = gen?.statut === "en_cours";
  useEffect(() => { if (gen && !enCours) rafraichir("edt-diagnostic"); }, [gen?.id, enCours]); // eslint-disable-line react-hooks/exhaustive-deps

  async function lancer() {
    try { await post("/api/edt/generations", { annee }); rafraichir("edt-generations"); } catch (e) { toast.error(messageErreur(e)); }
  }
  if (!annee) return <EmptyState icon={CalendarCog} title="Aucune année active" />;
  return (
    <div className="space-y-6">
      {diag ? <BlocDiagnostic diag={diag} /> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={lancer} disabled={enCours || !!diag?.erreurs.length}>
          {enCours ? <Loader2 className="animate-spin" /> : <Sparkles />} {enCours ? "Calcul en cours…" : "Générer 3 propositions"}
        </Button>
        {enCours ? (
          <div className="flex min-w-48 flex-1 items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${Math.max(5, gen.progression)}%` }} /></div>
            <span className="text-xs chiffres text-muted-foreground">{gen.progression} %</span>
          </div>
        ) : <span className="text-sm text-muted-foreground">Le calcul prend de quelques secondes à une minute et demie.</span>}
      </div>
      {gen && !enCours ? (
        gen.statut === "terminee" ? <Propositions gen={gen} /> : (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p className="font-semibold text-destructive">{gen.message}</p>
            {gen.diagnostic?.erreurs?.length ? <ul className="mt-2 list-disc pl-5">{gen.diagnostic.erreurs.map((e) => <li key={e}>{e}</li>)}</ul> : null}
          </div>
        )
      ) : null}
    </div>
  );
}

function BlocDiagnostic({ diag }: { diag: Diagnostic }) {
  const c = diag.charge;
  return (
    <Section titre="Vérification avant calcul">
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {c.classes} classe(s), {c.professeurs} professeur(s), {c.seances} séances ({c.heures} h) à placer sur {c.creneaux_ouverts} créneaux par semaine.
        </p>
        {diag.erreurs.length ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <p className="mb-1 flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="size-4" /> Impossible en l'état : corrigez d'abord</p>
            <ul className="list-disc pl-5">{diag.erreurs.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        ) : <p className="flex items-center gap-2 font-medium text-[#0b6b0b]"><CheckCircle2 className="size-4" /> Aucune impossibilité détectée.</p>}
        {[...diag.alertes, ...(diag.propositions_en_attente ? [`${diag.propositions_en_attente} proposition(s) de disponibilités en attente de validation (étape 4) : elles ne comptent pas encore.`] : [])].map((a) => (
          <p key={a} className="flex items-start gap-2 text-[#7a5600]"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {a}</p>
        ))}
      </div>
    </Section>
  );
}

function Propositions({ gen }: { gen: GenerationEDT }) {
  const rafraichir = useRafraichir();
  const [numero, setNumero] = useState(gen.publiee ?? 1);
  const [vue, setVue] = useState<"classe" | "prof">("classe");
  const prop: Proposition | undefined = gen.propositions.find((p) => p.numero === numero) ?? gen.propositions[0];
  const heures = gen.diagnostic.heures ?? [];
  const classes = useMemo(() => [...new Set(gen.propositions[0]?.placements.map((p) => p.classe))].sort(), [gen]);
  const profs = useMemo(() => [...new Map(gen.propositions[0]?.placements.filter((p) => p.prof).map((p) => [p.prof, p.prof_nom])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1])), [gen]);
  const [qui, setQui] = useState("");
  useEffect(() => { setQui(vue === "classe" ? classes[0] ?? "" : String(profs[0]?.[0] ?? "")); }, [vue, classes, profs]);
  if (!prop) return null;
  const affiches = prop.placements.filter((p) => (vue === "classe" ? p.classe === qui : String(p.prof) === qui));

  async function publier() {
    if (!window.confirm(`Publier la proposition ${prop!.numero} ? Elle remplace l'emploi du temps actuel de toutes les classes.`)) return;
    try {
      const r = await post<{ detail: string }>(`/api/edt/generations/${gen.id}/publier`, { proposition: prop!.numero });
      toast.success(r.detail); rafraichir("edt-generations", "creneaux");
    } catch (e) { toast.error(messageErreur(e)); }
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {gen.propositions.map((p) => (
          <button key={p.numero} type="button" onClick={() => setNumero(p.numero)}
            className={cn("rounded-xl border bg-card p-3 text-left shadow-carte", p.numero === prop.numero ? "border-primary ring-2 ring-primary/30" : "border-border/80")}>
            <div className="flex items-center justify-between">
              <span className="font-semibold">Proposition {p.numero}</span>
              {gen.publiee === p.numero ? <Pastille ton="vert">Publiée</Pastille> : <Pastille ton={p.score === 0 ? "vert" : p.score < 15 ? "bleu" : "or"}>{p.score} pt{p.score > 1 ? "s" : ""}</Pastille>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{p.faiblesses.length ? `${p.faiblesses.length} point(s) faible(s)` : "Aucun point faible"}</p>
          </button>
        ))}
      </div>
      {prop.faiblesses.length ? (
        <details className="rounded-lg border border-border/80 bg-card p-3 text-sm">
          <summary className="cursor-pointer font-medium">Points faibles de la proposition {prop.numero} (moins de points = meilleur)</summary>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground">{prop.faiblesses.map((f) => <li key={f}>{f}</li>)}</ul>
        </details>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-muted p-0.5 text-sm">
          {(["classe", "prof"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setVue(v)}
              className={v === vue ? "rounded-md bg-card px-3 py-1.5 font-semibold shadow-sm" : "rounded-md px-3 py-1.5 text-muted-foreground"}>
              {v === "classe" ? "Par classe" : "Par professeur"}
            </button>
          ))}
        </div>
        <Choix className="h-9 w-56" value={qui} onChange={(e) => setQui(e.target.value)} aria-label="Afficher">
          {vue === "classe" ? classes.map((c) => <option key={c} value={c}>{c}</option>) : profs.map(([id, nom]) => <option key={id} value={String(id)}>{nom}</option>)}
        </Choix>
        <Button className="ml-auto" onClick={publier}><Check /> Publier la proposition {prop.numero}</Button>
      </div>
      <GrilleSemaine creneaux={versCreneaux(affiches, heures)} vue={vue === "classe" ? "classe" : "enseignant"} />
      <p className="text-xs text-muted-foreground">Après publication, vous pouvez encore déplacer un cours à la main dans « Emploi du temps » : les conflits restent refusés.</p>
    </div>
  );
}
