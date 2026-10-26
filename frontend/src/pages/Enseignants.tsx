import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck, GraduationCap, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Champ, Choix, EnTete, Pastille, Squelette } from "@/components/design";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, messageErreur, patch, post, remplacer, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAnneeActive, useClasses, useMatieres, useRafraichir, useRoles } from "@/lib/requetes";
import type { Cours, Enseignant } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUTS: Record<Enseignant["statut"], string> = { permanent: "Permanent", vacataire: "Vacataire", stagiaire: "Stagiaire" };

export function Enseignants() {
  const { peut } = useAuth();
  const rafraichir = useRafraichir();
  const { data: enseignants, isLoading } = useQuery({
    queryKey: ["enseignants"],
    queryFn: async () => (await api<Page<Enseignant>>("/api/enseignants?page_size=200")).results,
  });
  const { data: matieres = [] } = useMatieres();
  const [fiche, setFiche] = useState<Enseignant | "nouveau" | null>(null);
  const [classes, setClasses] = useState<Enseignant | null>(null);

  async function activer(e: Enseignant, actif: boolean) {
    try {
      await patch(`/api/enseignants/${e.id}`, { is_active: actif });
      rafraichir("enseignants");
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }

  return (
    <div className="space-y-6">
      <EnTete titre="Enseignants"
        sousTitre="Chaque enseignant ne voit que les classes qui lui sont attribuées : ses élèves, ses notes, son appel, son emploi du temps."
        actions={<Button onClick={() => setFiche("nouveau")}><Plus /> Nouvel enseignant</Button>} />

      {isLoading ? <Squelette lignes={4} /> : enseignants?.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {enseignants.map((e) => {
            const nomsMatieres = matieres.filter((m) => e.matieres.includes(m.id)).map((m) => m.nom);
            const parClasse = e.affectations.reduce<Record<string, string[]>>((acc, a) => ((acc[a.classe_nom] ??= []).push(a.matiere_nom), acc), {});
            return (
              <div key={e.id} className={cn("flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-carte", !e.is_active && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <Avatar prenom={e.prenom} nom={e.nom || e.email} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold">{e.prenom} {e.nom}</span>
                      <Pastille ton={e.statut === "permanent" ? "vert" : "or"}>{STATUTS[e.statut]}</Pastille>
                      {e.role_nom !== "Enseignant" ? <Pastille ton="bleu">{e.role_nom}</Pastille> : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{e.email}{e.telephone ? ` · ${e.telephone}` : ""}{e.diplome ? ` · ${e.diplome}` : ""}</div>
                    {nomsMatieres.length ? <div className="mt-1 text-sm text-muted-foreground">Enseigne : {nomsMatieres.join(", ")}</div> : null}
                  </div>
                  <Switch checked={e.is_active} onCheckedChange={(v) => activer(e, v)} aria-label="Compte actif" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(parClasse).length ? Object.entries(parClasse).map(([classe, mats]) => (
                    <span key={classe} className="rounded-lg bg-muted px-2 py-1 text-xs"><b>{classe}</b> · {mats.join(", ")}</span>
                  )) : <span className="text-sm text-muted-foreground">Aucune classe attribuée pour l'année en cours.</span>}
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  {peut("scolarite.parametrer") ? <Button size="sm" onClick={() => setClasses(e)}><BookOpenCheck /> Classes et matières</Button> : null}
                  <Button size="sm" variant="secondary" onClick={() => setFiche(e)}><Pencil /> Fiche</Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={GraduationCap} title="Aucun enseignant" description="Créez la fiche de chaque enseignant, puis attribuez-lui ses classes et ses matières." />
      )}

      <FicheEnseignant fiche={fiche} fermer={() => setFiche(null)} />
      <Affectations enseignant={classes} fermer={() => setClasses(null)} />
    </div>
  );
}

function FicheEnseignant({ fiche, fermer }: { fiche: Enseignant | "nouveau" | null; fermer: () => void }) {
  const rafraichir = useRafraichir();
  const { data: matieres = [] } = useMatieres();
  const { data: roles = [] } = useRoles();
  const rolesEnseignant = roles.filter((r) => r.code === "enseignant" || !r.systeme);
  const existant = fiche && fiche !== "nouveau" ? fiche : null;
  const vide = { prenom: "", nom: "", email: "", telephone: "", statut: "permanent", diplome: "", date_arrivee: "", role_ecole: "", mot_de_passe: "" };
  const [f, setF] = useState(vide);
  const [choisies, setChoisies] = useState<number[]>([]);
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => {
    if (!fiche) return;
    if (existant) {
      setF({ prenom: existant.prenom, nom: existant.nom, email: existant.email, telephone: existant.telephone, statut: existant.statut,
        diplome: existant.diplome, date_arrivee: existant.date_arrivee ?? "", role_ecole: String(existant.role_ecole ?? ""), mot_de_passe: "" });
      setChoisies(existant.matieres);
    } else {
      setF({ ...vide, role_ecole: String(roles.find((r) => r.code === "enseignant")?.id ?? "") });
      setChoisies([]);
    }
  }, [fiche]); // eslint-disable-line react-hooks/exhaustive-deps
  const champ = (k: keyof typeof vide) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });

  async function valider(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    const corps = {
      prenom: f.prenom.trim(), nom: f.nom.trim(), email: f.email.trim(), telephone: f.telephone.trim(), statut: f.statut,
      diplome: f.diplome.trim(), date_arrivee: f.date_arrivee || null, matieres: choisies,
      ...(f.role_ecole ? { role_ecole: Number(f.role_ecole) } : {}), ...(f.mot_de_passe ? { mot_de_passe: f.mot_de_passe } : {}),
    };
    try {
      if (existant) await patch(`/api/enseignants/${existant.id}`, corps);
      else await post("/api/enseignants", corps);
      toast.success(existant ? "Fiche mise à jour" : `${f.prenom} est enregistré : attribuez-lui maintenant ses classes.`);
      rafraichir("enseignants", "roles", "cours", "personnel");
      fermer();
    } catch (err) {
      toast.error(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Dialog open={!!fiche} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{existant ? `${existant.prenom} ${existant.nom}` : "Nouvel enseignant"}</DialogTitle>
          <DialogDescription>Son compte lui permet de saisir ses notes, faire l'appel et consulter son emploi du temps.</DialogDescription>
        </DialogHeader>
        <form onSubmit={valider} className="grid gap-4 sm:grid-cols-2">
          <Champ label="Prénom"><Input required {...champ("prenom")} /></Champ>
          <Champ label="Nom"><Input required {...champ("nom")} /></Champ>
          <Champ label="Email (identifiant de connexion)"><Input type="email" required {...champ("email")} /></Champ>
          <Champ label="Téléphone"><Input type="tel" inputMode="tel" {...champ("telephone")} placeholder="77 123 45 67" /></Champ>
          <Champ label="Statut">
            <Choix {...champ("statut")}>{Object.entries(STATUTS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Choix>
          </Champ>
          <Champ label="Date d'arrivée"><Input type="date" {...champ("date_arrivee")} /></Champ>
          <Champ label="Diplôme" className="sm:col-span-2"><Input {...champ("diplome")} placeholder="CAES, Licence de mathématiques…" /></Champ>
          <Champ label="Matières enseignées" className="sm:col-span-2" aide={matieres.length ? undefined : "Créez d'abord les matières dans « Matières et cours »."}>
            <div className="flex flex-wrap gap-1.5">
              {matieres.map((m) => {
                const oui = choisies.includes(m.id);
                return (
                  <button key={m.id} type="button" aria-pressed={oui}
                    onClick={() => setChoisies(oui ? choisies.filter((x) => x !== m.id) : [...choisies, m.id])}
                    className={cn("rounded-full border px-3 py-1 text-sm transition-colors", oui ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted")}>
                    {m.nom}
                  </button>
                );
              })}
            </div>
          </Champ>
          <Champ label="Rôle" aide="« Enseignant » par défaut ; un rôle créé par l'école (ex. Professeur principal) peut donner plus de droits.">
            <Choix {...champ("role_ecole")}>{rolesEnseignant.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}</Choix>
          </Champ>
          <Champ label={existant ? "Nouveau mot de passe (facultatif)" : "Mot de passe initial"} aide="10 caractères minimum.">
            <Input type="text" required={!existant} minLength={10} {...champ("mot_de_passe")} />
          </Champ>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="secondary" onClick={fermer}>Annuler</Button>
            <Button type="submit" disabled={envoi}>{existant ? "Enregistrer" : "Créer l'enseignant"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Classes et matières d'un enseignant pour l'année active. */
function Affectations({ enseignant, fermer }: { enseignant: Enseignant | null; fermer: () => void }) {
  const rafraichir = useRafraichir();
  const { annee } = useAnneeActive();
  const { data: classes = [] } = useClasses(annee?.id);
  const { data: matieres = [] } = useMatieres();
  const { data: cours = [] } = useQuery({
    queryKey: ["cours", "tous"],
    enabled: !!enseignant,
    queryFn: async () => (await api<Page<Cours>>("/api/cours?page_size=500")).results,
  });
  const [lignes, setLignes] = useState<{ classe: number; matiere: number }[]>([]);
  const [classe, setClasse] = useState("");
  const [matiere, setMatiere] = useState("");
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => {
    if (enseignant) setLignes(enseignant.affectations.map((a) => ({ classe: a.classe, matiere: a.matiere })));
    setClasse(""); setMatiere("");
  }, [enseignant]);
  if (!enseignant) return null;

  const nomClasse = (id: number) => classes.find((c) => c.id === id)?.nom ?? "?";
  const nomMatiere = (id: number) => matieres.find((m) => m.id === id)?.nom ?? "?";
  const titulaire = (c: number, m: number) => cours.find((x) => x.classe === c && x.matiere === m && x.enseignant && x.enseignant !== enseignant.id)?.enseignant_nom;
  // Ses matières en premier dans la liste
  const triees = [...matieres].sort((a, b) => Number(enseignant.matieres.includes(b.id)) - Number(enseignant.matieres.includes(a.id)));

  function ajouter() {
    const l = { classe: Number(classe), matiere: Number(matiere) };
    if (!l.classe || !l.matiere || lignes.some((x) => x.classe === l.classe && x.matiere === l.matiere)) return;
    setLignes([...lignes, l]);
    setMatiere("");
  }

  async function enregistrer() {
    setEnvoi(true);
    try {
      await remplacer(`/api/enseignants/${enseignant!.id}/affectations`, { affectations: lignes });
      toast.success("Classes et matières enregistrées");
      rafraichir("enseignants", "cours");
      fermer();
    } catch (err) {
      toast.error(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Classes de {enseignant.prenom} {enseignant.nom}</DialogTitle>
          <DialogDescription>
            {annee ? `Année ${annee.libelle}. Un cours qui n'existe pas encore dans la classe est créé (coefficient 1, modifiable dans « Matières et cours »).`
              : "Activez d'abord une année scolaire."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {lignes.length ? lignes.map((l) => {
            const autre = titulaire(l.classe, l.matiere);
            return (
              <div key={`${l.classe}-${l.matiere}`} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                <span className="flex-1 text-sm"><b>{nomClasse(l.classe)}</b> · {nomMatiere(l.matiere)}
                  {autre ? <span className="block text-xs text-[#7a5600]">Actuellement assuré par {autre} : il lui sera retiré.</span> : null}
                </span>
                <Button size="icon" variant="ghost" aria-label="Retirer" onClick={() => setLignes(lignes.filter((x) => x !== l))}><Trash2 /></Button>
              </div>
            );
          }) : <p className="text-sm text-muted-foreground">Aucune classe pour l'instant.</p>}
        </div>
        <div className="grid gap-2 rounded-xl bg-muted/50 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Champ label="Classe">
            <Choix value={classe} onChange={(e) => setClasse(e.target.value)}>
              <option value="">Choisir…</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </Choix>
          </Champ>
          <Champ label="Matière">
            <Choix value={matiere} onChange={(e) => setMatiere(e.target.value)}>
              <option value="">Choisir…</option>
              {triees.map((m) => <option key={m.id} value={m.id}>{m.nom}{enseignant.matieres.includes(m.id) ? " ★" : ""}</option>)}
            </Choix>
          </Champ>
          <Button type="button" variant="secondary" onClick={ajouter} disabled={!classe || !matiere}><Plus /> Ajouter</Button>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={fermer}>Annuler</Button>
          <Button onClick={enregistrer} disabled={envoi || !annee}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
