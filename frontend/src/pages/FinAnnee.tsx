import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCheck, GraduationCap, Save, Sparkles, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Choix, EnTete, Pastille } from "@/components/design";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, messageErreur, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { note, useAnnees, useClasses, useRafraichir } from "@/lib/requetes";
import { cn } from "@/lib/utils";

const DECISIONS: Record<string, string> = { passe: "Passe", redouble: "Redouble", exclu: "Exclu", depart: "Quitte l'école" };
const TONS: Record<string, "vert" | "or" | "rouge" | "gris"> = { passe: "vert", redouble: "or", exclu: "rouge", depart: "gris" };

type LigneDecision = { inscription: number; eleve: string; matricule: string; moyenne_annuelle: number | null; suggestion: string | null; decision: string | null; commentaire: string };
type LigneReinscription = {
  eleve: number; nom: string; matricule: string; ancienne_classe: string; decision: string | null; moyenne_annuelle: number | null;
  classe_proposee: number | null; deja_inscrit: string | null;
};

/** Fin d'année : décisions du conseil (passe, redouble…) puis réinscriptions proposées pour l'année suivante. */
export function FinAnnee() {
  const { peut } = useAuth();
  const [onglet, setOnglet] = useState<"decisions" | "reinscriptions">(peut("notes.valider") ? "decisions" : "reinscriptions");
  return (
    <div className="space-y-6">
      <EnTete titre="Fin d'année et réinscriptions"
        sousTitre="1. Le conseil décide pour chaque élève. 2. Les réinscriptions dans l'année suivante sont proposées d'après ces décisions : il reste à valider." />
      <div className="inline-flex rounded-lg bg-muted p-0.5 text-sm">
        {peut("notes.valider") ? <button type="button" onClick={() => setOnglet("decisions")} className={cn("rounded-md px-3 py-1.5", onglet === "decisions" ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>1. Décisions du conseil</button> : null}
        {peut("inscriptions.gerer") ? <button type="button" onClick={() => setOnglet("reinscriptions")} className={cn("rounded-md px-3 py-1.5", onglet === "reinscriptions" ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>2. Réinscriptions</button> : null}
      </div>
      {onglet === "decisions" ? <Decisions /> : <Reinscriptions />}
    </div>
  );
}

function Decisions() {
  const rafraichir = useRafraichir();
  const { data: annees = [] } = useAnnees();
  const [anneeId, setAnneeId] = useState<number | null>(null);
  useEffect(() => { if (!anneeId && annees.length) setAnneeId((annees.find((a) => a.active) ?? annees[0]).id); }, [annees, anneeId]);
  const { data: classes = [] } = useClasses(anneeId);
  const [classe, setClasse] = useState("");
  useEffect(() => { if (classes.length && !classes.some((c) => String(c.id) === classe)) setClasse(String(classes[0].id)); }, [classes, classe]);
  const { data } = useQuery({
    queryKey: ["decisions", classe], enabled: !!classe,
    queryFn: () => api<{ classe: string; bareme: number; eleves: LigneDecision[] }>(`/api/decisions?classe=${classe}`),
  });
  const [choix, setChoix] = useState<Record<number, string>>({});
  useEffect(() => { setChoix(Object.fromEntries((data?.eleves ?? []).map((e) => [e.inscription, e.decision ?? ""]))); }, [data]);
  const [envoi, setEnvoi] = useState(false);

  const appliquerSuggestions = () => setChoix((c) => ({ ...c, ...Object.fromEntries((data?.eleves ?? []).filter((e) => !c[e.inscription] && e.suggestion).map((e) => [e.inscription, e.suggestion!])) }));
  async function enregistrer() {
    setEnvoi(true);
    try {
      const r = await api<{ enregistrees: number }>("/api/decisions", { method: "PUT", body: JSON.stringify({
        classe: Number(classe), decisions: Object.entries(choix).map(([inscription, decision]) => ({ inscription: Number(inscription), decision })) }) });
      toast.success(`${r.enregistrees} décision(s) enregistrée(s)`);
      rafraichir("decisions", "reinscriptions");
    } catch (e) {
      toast.error(messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  }
  const compte = Object.values(choix).reduce<Record<string, number>>((t, d) => (d ? { ...t, [d]: (t[d] ?? 0) + 1 } : t), {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Choix value={anneeId ?? ""} onChange={(e) => { setAnneeId(Number(e.target.value)); setClasse(""); }} className="w-44" aria-label="Année">
          {annees.map((a) => <option key={a.id} value={a.id}>{a.libelle}</option>)}
        </Choix>
        <Choix value={classe} onChange={(e) => setClasse(e.target.value)} className="w-44" aria-label="Classe">
          {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </Choix>
        <div className="ml-auto flex flex-wrap gap-2">
          {Object.entries(compte).map(([d, n]) => <Pastille key={d} ton={TONS[d]}>{n} {DECISIONS[d].toLowerCase()}</Pastille>)}
        </div>
      </div>
      {data?.eleves.length ? (
        <>
          <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-carte">
            <Table>
              <TableHeader><TableRow><TableHead>Élève</TableHead><TableHead className="text-right">Moyenne annuelle</TableHead><TableHead>Proposition</TableHead><TableHead>Décision</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.eleves.map((e) => (
                  <TableRow key={e.inscription}>
                    <TableCell><div className="font-medium">{e.eleve}</div><div className="text-xs text-muted-foreground">{e.matricule}</div></TableCell>
                    <TableCell className="text-right font-semibold chiffres">{note(e.moyenne_annuelle)}<span className="font-normal text-muted-foreground"> / {data.bareme}</span></TableCell>
                    <TableCell>{e.suggestion ? <Pastille ton={TONS[e.suggestion]}>{DECISIONS[e.suggestion]}</Pastille> : <span className="text-xs text-muted-foreground">pas de notes</span>}</TableCell>
                    <TableCell>
                      <Choix value={choix[e.inscription] ?? ""} onChange={(ev) => setChoix({ ...choix, [e.inscription]: ev.target.value })} className="h-9 w-44" aria-label={`Décision pour ${e.eleve}`}>
                        <option value="">— à décider —</option>
                        {Object.entries(DECISIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </Choix>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={appliquerSuggestions}><Sparkles /> Reprendre les propositions (moyenne ≥ {data.bareme / 2} : passe)</Button>
            <Button onClick={enregistrer} disabled={envoi}><Save /> Enregistrer les décisions</Button>
          </div>
        </>
      ) : <EmptyState icon={GraduationCap} title="Aucun élève inscrit dans cette classe" />}
    </div>
  );
}

function Reinscriptions() {
  const rafraichir = useRafraichir();
  const { data: annees = [] } = useAnnees();
  // Année à préparer : par défaut, celle en préparation la plus récente
  const cibles = annees.filter((a) => a.statut !== "cloturee");
  const [cible, setCible] = useState<number | null>(null);
  useEffect(() => {
    if (!cible && cibles.length) setCible((cibles.find((a) => a.statut === "preparation") ?? cibles[0]).id);
  }, [cibles, cible]);
  const { data: classes = [] } = useClasses(cible);
  const { data } = useQuery({
    queryKey: ["reinscriptions", cible], enabled: !!cible,
    queryFn: () => api<{ source: { libelle: string } | null; lignes: LigneReinscription[] }>(`/api/reinscriptions?annee=${cible}`),
  });
  const [classesChoisies, setClassesChoisies] = useState<Record<number, string>>({});
  const [coches, setCoches] = useState<Set<number>>(new Set());
  const [filtre, setFiltre] = useState("");
  useEffect(() => {
    const lignes = data?.lignes ?? [];
    setClassesChoisies(Object.fromEntries(lignes.map((l) => [l.eleve, l.classe_proposee ? String(l.classe_proposee) : ""])));
    setCoches(new Set(lignes.filter((l) => !l.deja_inscrit && l.classe_proposee).map((l) => l.eleve)));
  }, [data]);
  const [envoi, setEnvoi] = useState(false);
  const lignes = useMemo(() => (data?.lignes ?? []).filter((l) => !filtre || l.ancienne_classe === filtre), [data, filtre]);
  const anciennes = [...new Set((data?.lignes ?? []).map((l) => l.ancienne_classe))];
  const aValider = lignes.filter((l) => coches.has(l.eleve) && !l.deja_inscrit && classesChoisies[l.eleve]);

  async function valider() {
    setEnvoi(true);
    try {
      const r = await post<{ reinscrits: number }>("/api/reinscriptions", {
        annee: cible, lignes: aValider.map((l) => ({ eleve: l.eleve, classe: Number(classesChoisies[l.eleve]) })) });
      toast.success(`${r.reinscrits} élève(s) réinscrit(s) : leurs échéances sont créées.`);
      rafraichir("reinscriptions", "classes", "inscriptions", "tableau-de-bord");
    } catch (e) {
      toast.error(messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  }
  const basculer = (id: number, oui: boolean) => setCoches((s) => { const n = new Set(s); if (oui) n.add(id); else n.delete(id); return n; });

  if (!cibles.length) return <EmptyState icon={UserCheck} title="Aucune année à préparer" description="Préparez d'abord l'année suivante dans « Classes et années »." />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{data?.source ? data.source.libelle : "…"}</span><ArrowRight className="size-4 text-muted-foreground" />
        <Choix value={cible ?? ""} onChange={(e) => setCible(Number(e.target.value))} className="w-60" aria-label="Année à préparer">
          {cibles.map((a) => <option key={a.id} value={a.id}>{a.libelle} ({a.statut_libelle.toLowerCase()})</option>)}
        </Choix>
        <Choix value={filtre} onChange={(e) => setFiltre(e.target.value)} className="w-44" aria-label="Ancienne classe">
          <option value="">Toutes les classes</option>
          {anciennes.map((c) => <option key={c} value={c}>{c}</option>)}
        </Choix>
      </div>
      {!data?.source ? <EmptyState icon={UserCheck} title="Pas d'année précédente" description="Les réinscriptions partent des élèves de l'année précédente." />
        : !classes.length ? <EmptyState icon={UserCheck} title="L'année à préparer n'a pas de classes" description="Créez-les, ou préparez l'année en reconduisant les classes." />
        : lignes.length ? (
          <>
            <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-carte">
              <Table>
                <TableHeader><TableRow><TableHead className="w-10" /><TableHead>Élève</TableHead><TableHead>{data.source.libelle}</TableHead><TableHead>Décision</TableHead><TableHead>Classe proposée</TableHead></TableRow></TableHeader>
                <TableBody>
                  {lignes.map((l) => (
                    <TableRow key={l.eleve} className={l.deja_inscrit ? "opacity-60" : ""}>
                      <TableCell>{l.deja_inscrit ? <CheckCheck className="size-4 text-primary" /> :
                        <Checkbox checked={coches.has(l.eleve)} onCheckedChange={(v) => basculer(l.eleve, v === true)} aria-label={`Réinscrire ${l.nom}`} />}</TableCell>
                      <TableCell><div className="font-medium">{l.nom}</div><div className="text-xs text-muted-foreground">{l.matricule}</div></TableCell>
                      <TableCell>{l.ancienne_classe}{l.moyenne_annuelle != null ? <span className="text-xs text-muted-foreground"> · {note(l.moyenne_annuelle)}</span> : null}</TableCell>
                      <TableCell>{l.decision ? <Pastille ton={TONS[l.decision]}>{DECISIONS[l.decision]}</Pastille> : <span className="text-xs text-muted-foreground">non décidée</span>}</TableCell>
                      <TableCell>
                        {l.deja_inscrit ? <span className="text-sm">Réinscrit en <b>{l.deja_inscrit}</b></span> : (
                          <Choix value={classesChoisies[l.eleve] ?? ""} onChange={(e) => { setClassesChoisies({ ...classesChoisies, [l.eleve]: e.target.value }); if (e.target.value) basculer(l.eleve, true); }}
                            className="h-9 w-40" aria-label={`Classe pour ${l.nom}`}>
                            <option value="">—</option>
                            {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                          </Choix>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={valider} disabled={envoi || !aValider.length}><UserCheck /> Valider {aValider.length} réinscription{aValider.length > 1 ? "s" : ""}</Button>
              <span className="text-xs text-muted-foreground">Les élèves exclus ou qui quittent l'école ne sont pas proposés : choisissez une classe pour les réinscrire quand même.</span>
            </div>
          </>
        ) : <EmptyState icon={UserCheck} title="Aucun élève dans l'année précédente" />}
    </div>
  );
}
