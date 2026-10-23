import { useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpenCheck, CheckCheck, ClipboardList, Lock, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { Champ, Choix, EnTete, Liste, Pastille } from "@/components/design";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { api, messageErreur, post, type Page } from "@/lib/api";
import { date } from "@/lib/format";
import { periodeCourante, useAnneeActive, usePeriodes, useRafraichir } from "@/lib/requetes";
import type { Cours, Evaluation, LigneNote } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Notes() {
  const [params, setParams] = useSearchParams();
  const { annee } = useAnneeActive();
  const { data: periodes } = usePeriodes(annee?.id);
  const { data: mesCours } = useQuery({ queryKey: ["mes-cours"], queryFn: () => api<Cours[]>("/api/cours/mes-cours") });
  const coursId = Number(params.get("cours")) || null;
  const periodeId = Number(params.get("periode")) || periodeCourante(periodes)?.id || null;
  const evaluationId = Number(params.get("evaluation")) || null;
  const cours = mesCours?.find((c) => c.id === coursId) ?? null;
  const aller = (p: Record<string, string | number | null>) => {
    const suivant = new URLSearchParams(params);
    Object.entries(p).forEach(([k, v]) => (v == null ? suivant.delete(k) : suivant.set(k, String(v))));
    setParams(suivant);
  };

  if (evaluationId) return <SaisieNotes evaluation={evaluationId} retour={() => aller({ evaluation: null })} />;

  if (!cours) {
    const parClasse = (mesCours ?? []).reduce<Record<string, Cours[]>>((acc, c) => ((acc[c.classe_nom] ??= []).push(c), acc), {});
    return (
      <div className="space-y-6">
        <EnTete titre="Notes" sousTitre="Choisissez un cours pour créer une évaluation et saisir les notes." />
        {mesCours && !mesCours.length ? (
          <EmptyState icon={ClipboardList} title="Aucun cours attribué"
            description="La direction vous attribue vos cours (enseignant) ou vos classes (surveillant) dans « Matières et cours »." />
        ) : null}
        {Object.entries(parClasse).map(([classe, liste]) => (
          <section key={classe} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{classe}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {liste.map((c) => (
                <button key={c.id} onClick={() => aller({ cours: c.id })}
                  className="flex items-center gap-3 rounded-xl border border-border/80 bg-card p-4 text-left shadow-carte transition-colors hover:border-primary">
                  <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary-soft text-accent-foreground"><BookOpenCheck className="size-5" /></span>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.matiere_nom}</div>
                    <div className="text-xs text-muted-foreground">coef. {Number(c.coefficient)} · {c.enseignant_nom || "sans enseignant"}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button onClick={() => aller({ cours: null })} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Mes cours
      </button>
      <EnTete titre={`${cours.matiere_nom} · ${cours.classe_nom}`} sousTitre={`Coefficient ${Number(cours.coefficient)}${cours.enseignant_nom ? ` · ${cours.enseignant_nom}` : ""}`}
        actions={
          <Choix value={periodeId ?? ""} onChange={(e) => aller({ periode: e.target.value })} className="w-48">
            {periodes?.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </Choix>
        } />
      {periodeId ? <Evaluations cours={cours} periode={periodeId} ouvrir={(id) => aller({ evaluation: id })} />
        : <EmptyState icon={ClipboardList} title="Aucune période" description="La direction doit d'abord découper l'année (Matières et cours)." />}
    </div>
  );
}

function Evaluations({ cours, periode, ouvrir }: { cours: Cours; periode: number; ouvrir: (id: number) => void }) {
  const rafraichir = useRafraichir();
  const { data: evaluations } = useQuery({
    queryKey: ["evaluations", cours.id, periode],
    queryFn: async () => (await api<Page<Evaluation>>(`/api/evaluations?cours=${cours.id}&periode=${periode}`)).results,
  });
  const [nouvelle, setNouvelle] = useState(false);
  const [f, setF] = useState({ titre: "", type: "devoir", date: new Date().toLocaleDateString("sv-SE"), sur: "20" });

  async function creer(e: FormEvent) {
    e.preventDefault();
    try {
      const ev = await post<Evaluation>("/api/evaluations", { ...f, sur: Number(f.sur), cours: cours.id, periode });
      rafraichir("evaluations");
      setNouvelle(false);
      ouvrir(ev.id);
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }

  return (
    <>
      <div className="flex justify-end"><Button onClick={() => setNouvelle(true)}><Plus /> Nouvelle évaluation</Button></div>
      {evaluations?.length ? (
        <Liste>
          {evaluations.map((ev) => (
            <button key={ev.id} onClick={() => ouvrir(ev.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50">
              <span className={cn("inline-flex size-10 items-center justify-center rounded-xl", ev.type === "composition" ? "bg-[#ece8fb] text-[#4f3aa3]" : "bg-[#e6eefb] text-[#1f4e99]")}>
                <ClipboardList className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{ev.titre}</div>
                <div className="text-xs text-muted-foreground">{ev.type === "composition" ? "Composition" : "Devoir"} · {date(ev.date)} · sur {ev.sur}</div>
              </div>
              {ev.a_valider ? <Pastille ton="or">{ev.a_valider} à valider</Pastille> : null}
              <span className="text-sm text-muted-foreground chiffres">{ev.nb_notes} note{ev.nb_notes > 1 ? "s" : ""}</span>
            </button>
          ))}
        </Liste>
      ) : evaluations ? <EmptyState icon={ClipboardList} title="Aucune évaluation pour cette période" /> : null}

      <Dialog open={nouvelle} onOpenChange={setNouvelle}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouvelle évaluation</DialogTitle></DialogHeader>
          <form onSubmit={creer} className="grid gap-4 sm:grid-cols-2">
            <Champ label="Titre" className="sm:col-span-2"><Input required value={f.titre} onChange={(e) => setF({ ...f, titre: e.target.value })} placeholder="ex. Devoir n°1" /></Champ>
            <Champ label="Type">
              <Choix value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                <option value="devoir">Devoir / interrogation</option><option value="composition">Composition</option>
              </Choix>
            </Champ>
            <Champ label="Noté sur"><Input type="number" min={1} max={100} value={f.sur} onChange={(e) => setF({ ...f, sur: e.target.value })} /></Champ>
            <Champ label="Date"><Input type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Champ>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="secondary" onClick={() => setNouvelle(false)}>Annuler</Button>
              <Button type="submit">Créer et saisir les notes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

type Saisie = { valeur: string; absent: boolean };
type DonneesSaisie = { evaluation: Evaluation; peut_saisir: boolean; peut_valider: boolean; eleves: LigneNote[] };

function SaisieNotes({ evaluation, retour }: { evaluation: number; retour: () => void }) {
  const rafraichir = useRafraichir();
  const client = useQueryClient();
  const { data } = useQuery({ queryKey: ["notes", evaluation], queryFn: () => api<DonneesSaisie>(`/api/evaluations/${evaluation}/notes`) });
  // Les modifications du professeur sont gardées à part : un rechargement des données (focus, rafraîchissement)
  // ne doit jamais effacer des notes tapées mais pas encore enregistrées.
  const [modifs, setModifs] = useState<Record<number, Saisie>>({});
  const [envoi, setEnvoi] = useState(false);
  const champs = useRef<(HTMLInputElement | null)[]>([]);

  const initiales = useMemo(() => Object.fromEntries((data?.eleves ?? []).map((e) => [e.inscription,
    { valeur: e.valeur == null ? "" : String(e.valeur).replace(".", ","), absent: e.absent }])), [data]) as Record<number, Saisie>;
  const saisies = { ...initiales, ...modifs };
  const changer = (inscription: number, s: Saisie) => setModifs((m) => ({ ...m, [inscription]: s }));

  if (!data) return <p className="text-muted-foreground">Chargement…</p>;
  const ev = data.evaluation;
  const modifiees = data.eleves.filter((e) => JSON.stringify(saisies[e.inscription]) !== JSON.stringify(initiales[e.inscription]));
  const horsBornes = data.eleves.some((e) => {
    const v = Number((saisies[e.inscription]?.valeur ?? "").replace(",", "."));
    return saisies[e.inscription]?.valeur && (Number.isNaN(v) || v < 0 || v > ev.sur);
  });

  async function enregistrer() {
    setEnvoi(true);
    try {
      const r = await post<{ modifiees: number }>(`/api/evaluations/${evaluation}/notes`, {
        notes: modifiees.map((e) => ({ inscription: e.inscription, valeur: saisies[e.inscription].valeur || null, absent: saisies[e.inscription].absent })),
      });
      toast.success(`${r.modifiees} note${r.modifiees > 1 ? "s" : ""} enregistrée${r.modifiees > 1 ? "s" : ""}`);
      await client.invalidateQueries({ queryKey: ["notes", evaluation] });
      setModifs({});
      rafraichir("evaluations", "resultats");
    } catch (err) {
      toast.error(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }

  async function valider() {
    try {
      const r = await post<{ validees: number }>(`/api/evaluations/${evaluation}/valider`, {});
      toast.success(`${r.validees} note(s) validée(s)`);
      rafraichir("notes", "evaluations", "resultats");
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }

  const saisies_ = data.eleves.filter((e) => saisies[e.inscription]?.valeur);
  const moyenne = saisies_.length
    ? saisies_.reduce((t, e) => t + Number(saisies[e.inscription].valeur.replace(",", ".")), 0) / saisies_.length : null;

  return (
    <div className="space-y-5">
      <button onClick={() => (!modifiees.length || confirm("Des notes ne sont pas enregistrées. Quitter quand même ?")) && retour()}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Évaluations</button>
      <EnTete titre={ev.titre} sousTitre={`${ev.type === "composition" ? "Composition" : "Devoir"} du ${date(ev.date)} · noté sur ${ev.sur}${moyenne != null ? ` · moyenne ${moyenne.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}` : ""}`}
        actions={<>
          {data.peut_valider && ev.a_valider ? <Button variant="secondary" onClick={valider}><CheckCheck /> Valider {ev.a_valider} note(s)</Button> : null}
          {data.peut_saisir ? <Button onClick={enregistrer} disabled={envoi || !modifiees.length || horsBornes}><Save /> Enregistrer{modifiees.length ? ` (${modifiees.length})` : ""}</Button> : null}
        </>} />
      {!data.peut_saisir ? (
        <p className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground"><Lock className="size-4" /> Lecture seule : période verrouillée ou cours non attribué.</p>
      ) : null}
      <Liste>
        {data.eleves.map((e, i) => {
          const s = saisies[e.inscription] ?? { valeur: "", absent: false };
          const v = Number(s.valeur.replace(",", "."));
          const invalide = !!s.valeur && (Number.isNaN(v) || v < 0 || v > ev.sur);
          return (
            <div key={e.inscription} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-6 text-right text-xs text-muted-foreground chiffres">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{e.eleve}</div>
                <div className="text-xs text-muted-foreground">{e.matricule}</div>
              </div>
              {e.statut === "a_valider" ? <Pastille ton="or" className="hidden sm:inline-flex">à valider</Pastille> : null}
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox checked={s.absent} disabled={!data.peut_saisir}
                  onCheckedChange={(c) => changer(e.inscription, { valeur: c ? "" : s.valeur, absent: c === true })} /> Abs.
              </label>
              <Input
                ref={(el) => { champs.current[i] = el; }}
                inputMode="decimal" value={s.valeur} disabled={!data.peut_saisir || s.absent} aria-label={`Note de ${e.eleve}`}
                onChange={(x) => changer(e.inscription, { ...s, valeur: x.target.value })}
                onKeyDown={(x) => { if (x.key === "Enter") { x.preventDefault(); champs.current[i + 1]?.focus(); } }}
                className={cn("w-20 text-center text-base font-semibold chiffres", invalide && "border-destructive text-destructive")}
              />
              <span className="w-8 text-xs text-muted-foreground">/{ev.sur}</span>
            </div>
          );
        })}
      </Liste>
      {horsBornes ? <p className="text-sm text-destructive">Une note doit être comprise entre 0 et {ev.sur}.</p> : null}
    </div>
  );
}
