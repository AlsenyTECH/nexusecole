import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, GraduationCap, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Champ, Choix, EnTete, Liste, Pastille, Squelette } from "@/components/design";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saisieVide, SaisieResponsable, versApi, type Saisie } from "@/components/Responsables";
import { api, messageErreur, post, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAnneeActive, useClasses, useRafraichir } from "@/lib/requetes";
import type { Config, Eleve } from "@/lib/types";

export function Eleves() {
  const { peut } = useAuth();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [classe, setClasse] = useState("");
  const { annee } = useAnneeActive();
  const { data: classes = [] } = useClasses(annee?.id);
  const { data, isLoading } = useQuery({
    queryKey: ["eleves", q, classe],
    queryFn: () => api<Page<Eleve>>(`/api/eleves?${new URLSearchParams({ ...(q ? { q } : {}), ...(classe ? { classe } : {}) })}`),
  });
  const nouveau = params.get("nouveau") === "1";

  return (
    <div className="space-y-6">
      <EnTete titre="Élèves" sousTitre={data ? `${data.count} élève${data.count > 1 ? "s" : ""}` : undefined}
        actions={peut("eleves.gerer") ? <Button onClick={() => setParams({ nouveau: "1" })}><Plus /> Nouvel élève</Button> : null} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, prénom ou matricule" className="pl-9" />
        </div>
        <Choix value={classe} onChange={(e) => setClasse(e.target.value)} className="sm:w-56">
          <option value="">Toutes les classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </Choix>
      </div>

      {isLoading ? <Squelette /> : data?.results.length ? (
        <Liste>
          {data.results.map((e) => (
            <Link key={e.id} to={`/eleves/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
              <Avatar prenom={e.prenom} nom={e.nom} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{e.prenom} {e.nom}</div>
                <div className="text-xs text-muted-foreground">{e.matricule}{e.telephone_contact ? ` · ${e.telephone_contact}` : ""}</div>
              </div>
              {e.classe_nom ? <Pastille ton="bleu">{e.classe_nom}</Pastille> : <Pastille ton="gris">Non inscrit</Pastille>}
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </Liste>
      ) : (
        <EmptyState icon={GraduationCap} title={q || classe ? "Aucun élève trouvé" : "Aucun élève pour l'instant"}
          description={q || classe ? "Essayez une autre recherche." : "Ajoutez le premier élève et inscrivez-le dans sa classe."} />
      )}

      <NouvelEleve ouvert={nouveau} fermer={() => setParams({})} />
    </div>
  );
}

function NouvelEleve({ ouvert, fermer }: { ouvert: boolean; fermer: () => void }) {
  const navigate = useNavigate();
  const rafraichir = useRafraichir();
  const { peut } = useAuth();
  const { annee } = useAnneeActive();
  const { data: classes = [] } = useClasses(annee?.id);
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: () => api<Config>("/api/ecole/config") });
  const espaceParents = !!config?.modules.includes("parents");
  const vide = {
    matricule: "", prenom: "", nom: "", sexe: "F", date_naissance: "", lieu_naissance: "", nationalite: "Sénégalaise", adresse: "",
    ancien_etablissement: "", date_entree: "", informations_medicales: "", classe: "", reduction_pct: "0", motif_reduction: "",
  };
  const [f, setF] = useState(vide);
  const [responsables, setResponsables] = useState<Saisie[]>([]);
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => {
    if (ouvert) { setF(vide); setResponsables(peut("responsables.gerer") ? [saisieVide("pere"), saisieVide("mere")] : []); }
  }, [ouvert]); // eslint-disable-line react-hooks/exhaustive-deps
  const champ = (k: keyof typeof vide) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });
  // Une saisie de parent laissée vide est ignorée (on peut ne connaître qu'un des deux)
  const remplies = responsables.filter((r) => r.responsable || r.nom.trim() || r.telephone.trim());

  async function valider(e: FormEvent) {
    e.preventDefault();
    if (remplies.some((r) => !r.responsable && (!r.nom.trim() || !r.telephone.trim()))) {
      return toast.error("Pour chaque parent ou tuteur, indiquez au moins son nom et son téléphone.");
    }
    setEnvoi(true);
    try {
      const eleve = await post<Eleve>("/api/eleves", {
        matricule: f.matricule.trim(), prenom: f.prenom.trim(), nom: f.nom.trim(), sexe: f.sexe,
        date_naissance: f.date_naissance || null, lieu_naissance: f.lieu_naissance.trim(), nationalite: f.nationalite.trim(),
        adresse: f.adresse.trim(), ancien_etablissement: f.ancien_etablissement.trim(), date_entree: f.date_entree || null,
        informations_medicales: f.informations_medicales.trim(),
        ...(remplies.length ? { responsables: remplies.map(versApi) } : {}),
      });
      if (f.classe) {
        await post("/api/inscriptions", {
          eleve: eleve.id, classe: Number(f.classe), reduction_pct: Number(f.reduction_pct) || 0, motif_reduction: f.motif_reduction,
        });
      }
      toast.success(`${eleve.prenom} ${eleve.nom} ajouté${f.classe ? " et inscrit" : ""} · matricule ${eleve.matricule}`);
      rafraichir("eleves", "tableau-de-bord", "classes", "responsables");
      navigate(`/eleves/${eleve.id}`);
    } catch (err) {
      toast.error(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }

  const titre = (t: string) => <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:col-span-2">{t}</h3>;
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nouvel élève</DialogTitle>
          <DialogDescription>Les échéances de frais sont créées automatiquement à l'inscription.</DialogDescription>
        </DialogHeader>
        <form onSubmit={valider} className="grid gap-4 sm:grid-cols-2">
          {titre("Identité")}
          <Champ label="Prénom"><Input required {...champ("prenom")} /></Champ>
          <Champ label="Nom"><Input required {...champ("nom")} /></Champ>
          <Champ label="Sexe">
            <Choix {...champ("sexe")}><option value="F">Fille</option><option value="M">Garçon</option></Choix>
          </Champ>
          <Champ label="Matricule" aide="Laisser vide : il est attribué automatiquement."><Input {...champ("matricule")} placeholder="ex. 2026-0001" /></Champ>
          <Champ label="Date de naissance"><Input type="date" {...champ("date_naissance")} /></Champ>
          <Champ label="Lieu de naissance"><Input {...champ("lieu_naissance")} placeholder="Dakar, Thiès…" /></Champ>
          <Champ label="Nationalité"><Input {...champ("nationalite")} /></Champ>
          <Champ label="Adresse"><Input {...champ("adresse")} placeholder="Quartier, ville" /></Champ>

          {titre("Scolarité")}
          <Champ label={`Classe${annee ? ` (${annee.libelle})` : ""}`}
            aide={annee ? "Laisser vide pour inscrire plus tard." : "Créez d'abord l'année scolaire active et ses classes."}>
            <Choix {...champ("classe")} disabled={!annee}>
              <option value="">— Ne pas inscrire maintenant —</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.niveau ? ` (${c.niveau})` : ""}</option>)}
            </Choix>
          </Champ>
          <Champ label="Date d'arrivée dans l'école"><Input type="date" {...champ("date_entree")} /></Champ>
          {f.classe ? (
            <>
              <Champ label="Réduction sur la scolarité (%)"><Input type="number" min={0} max={100} {...champ("reduction_pct")} /></Champ>
              <Champ label="Motif de la réduction"><Input {...champ("motif_reduction")} placeholder="Fratrie, bourse…" /></Champ>
            </>
          ) : null}
          <Champ label="Établissement précédent" className="sm:col-span-2"><Input {...champ("ancien_etablissement")} /></Champ>

          {titre("Santé")}
          <Champ label="Informations médicales (facultatif)" className="sm:col-span-2" aide="Allergies, traitement, maladie à connaître en cas d'urgence.">
            <Textarea rows={2} {...champ("informations_medicales")} />
          </Champ>

          {peut("responsables.gerer") ? (
            <div className="space-y-3 sm:col-span-2">
              {titre("Parents et tuteurs")}
              <p className="text-xs text-muted-foreground">Le tuteur peut être l'un des parents ou une autre personne. Laissez vide ce que vous ne connaissez pas encore.</p>
              {responsables.map((r, i) => (
                <SaisieResponsable key={r.cle} s={r} espaceParents={espaceParents}
                  changer={(n) => setResponsables(responsables.map((x, j) => (j === i ? n : n.contact_principal ? { ...x, contact_principal: false } : x)))}
                  retirer={() => setResponsables(responsables.filter((_, j) => j !== i))} />
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={() => setResponsables([...responsables, saisieVide("tuteur")])}>
                <Plus /> Ajouter un parent ou un tuteur
              </Button>
            </div>
          ) : null}

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="secondary" onClick={fermer}>Annuler</Button>
            <Button type="submit" disabled={envoi}>{envoi ? "Enregistrement…" : "Enregistrer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
