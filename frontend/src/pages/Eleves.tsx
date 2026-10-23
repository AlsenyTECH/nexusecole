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
import { api, messageErreur, post, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAnneeActive, useClasses, useRafraichir } from "@/lib/requetes";
import type { Eleve } from "@/lib/types";

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
                <div className="text-xs text-muted-foreground">{e.matricule}{e.telephone_parent ? ` · ${e.telephone_parent}` : ""}</div>
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
  const { annee } = useAnneeActive();
  const { data: classes = [] } = useClasses(annee?.id);
  const vide = { matricule: "", prenom: "", nom: "", sexe: "F", date_naissance: "", telephone_parent: "", classe: "", reduction_pct: "0", motif_reduction: "" };
  const [f, setF] = useState(vide);
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => { if (ouvert) setF(vide); }, [ouvert]); // eslint-disable-line react-hooks/exhaustive-deps
  const champ = (k: keyof typeof vide) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });

  async function valider(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    try {
      const eleve = await post<Eleve>("/api/eleves", {
        matricule: f.matricule.trim(), prenom: f.prenom.trim(), nom: f.nom.trim(), sexe: f.sexe,
        date_naissance: f.date_naissance || null, telephone_parent: f.telephone_parent.trim(),
      });
      if (f.classe) {
        await post("/api/inscriptions", {
          eleve: eleve.id, classe: Number(f.classe), reduction_pct: Number(f.reduction_pct) || 0, motif_reduction: f.motif_reduction,
        });
      }
      toast.success(`${eleve.prenom} ${eleve.nom} ajouté${f.classe ? " et inscrit" : ""}`);
      rafraichir("eleves", "tableau-de-bord", "classes");
      navigate(`/eleves/${eleve.id}`);
    } catch (err) {
      toast.error(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nouvel élève</DialogTitle>
          <DialogDescription>Les échéances de frais sont créées automatiquement à l'inscription.</DialogDescription>
        </DialogHeader>
        <form onSubmit={valider} className="grid gap-4 sm:grid-cols-2">
          <Champ label="Prénom"><Input required {...champ("prenom")} /></Champ>
          <Champ label="Nom"><Input required {...champ("nom")} /></Champ>
          <Champ label="Matricule"><Input required {...champ("matricule")} placeholder="ex. 2026-001" /></Champ>
          <Champ label="Sexe">
            <Choix {...champ("sexe")}><option value="F">Fille</option><option value="M">Garçon</option></Choix>
          </Champ>
          <Champ label="Date de naissance"><Input type="date" {...champ("date_naissance")} /></Champ>
          <Champ label="Téléphone du parent"><Input type="tel" inputMode="tel" {...champ("telephone_parent")} placeholder="77 123 45 67" /></Champ>
          <Champ label={`Classe${annee ? ` (${annee.libelle})` : ""}`} className="sm:col-span-2"
            aide={annee ? "Laisser vide pour inscrire plus tard." : "Créez d'abord l'année scolaire active et ses classes."}>
            <Choix {...champ("classe")} disabled={!annee}>
              <option value="">— Ne pas inscrire maintenant —</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.niveau ? ` (${c.niveau})` : ""}</option>)}
            </Choix>
          </Champ>
          {f.classe ? (
            <>
              <Champ label="Réduction sur la scolarité (%)"><Input type="number" min={0} max={100} {...champ("reduction_pct")} /></Champ>
              <Champ label="Motif de la réduction"><Input {...champ("motif_reduction")} placeholder="Fratrie, bourse…" /></Champ>
            </>
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
