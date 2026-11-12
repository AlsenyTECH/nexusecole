import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus, Sparkles, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Champ, Choix, EnTete } from "@/components/design";
import { GrilleSemaine, JOURS } from "@/components/Grille";
import { GrilleDispo, versCases, versEnsemble } from "@/components/GrilleCases";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, messageErreur, patch, post, remplacer, supprimer, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAnneeActive, useClasses, useRafraichir } from "@/lib/requetes";
import type { Cours, Creneau, Disponibilite, GrilleEcole } from "@/lib/types";

export function EmploiDuTemps() {
  const { peut, moi } = useAuth();
  const prof = moi?.role === "enseignant";
  const gere = peut("emploi_du_temps.gerer");
  const { annee } = useAnneeActive();
  const { data: classes = [] } = useClasses(annee?.id);
  const [vue, setVue] = useState<"moi" | "classe" | "dispos">(gere ? "classe" : "moi");
  const [classe, setClasse] = useState("");
  useEffect(() => { if (!classe && classes.length) setClasse(String(classes[0].id)); }, [classes, classe]);
  const { data: planning = [] } = useQuery({ queryKey: ["creneaux", "moi"], enabled: vue === "moi", queryFn: () => api<Creneau[]>("/api/creneaux/mon-planning") });
  const { data: creneaux = [] } = useQuery({
    queryKey: ["creneaux", classe], enabled: vue === "classe" && !!classe, queryFn: () => api<Creneau[]>(`/api/creneaux?classe=${classe}`),
  });
  const [edition, setEdition] = useState<Creneau | "nouveau" | null>(null);

  return (
    <div className="space-y-6">
      <EnTete titre="Emploi du temps" sousTitre={annee ? `Semaine type · ${annee.libelle}` : undefined}
        actions={gere ? (
          <div className="flex gap-2">
            <Button asChild variant="secondary"><Link to="/emploi-du-temps/generateur"><Sparkles /> Générer automatiquement</Link></Button>
            {vue === "classe" && classe ? <Button onClick={() => setEdition("nouveau")}><Plus /> Ajouter un cours</Button> : null}
          </div>) : null} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-muted p-0.5 text-sm">
          {(["moi", "classe", ...(prof ? ["dispos" as const] : [])] as const).map((v) => (
            <button key={v} type="button" onClick={() => setVue(v)}
              className={v === vue ? "rounded-md bg-card px-3 py-1.5 font-semibold shadow-sm" : "rounded-md px-3 py-1.5 text-muted-foreground"}>
              {v === "moi" ? "Mon emploi du temps" : v === "classe" ? "Par classe" : "Mes disponibilités"}
            </button>
          ))}
        </div>
        {vue === "classe" ? (
          <Choix value={classe} onChange={(e) => setClasse(e.target.value)} className="w-56" aria-label="Classe">
            {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </Choix>
        ) : null}
      </div>
      {vue === "moi" ? <GrilleSemaine creneaux={planning} vue="enseignant" />
        : vue === "dispos" ? <MesDisponibilites />
        : <GrilleSemaine creneaux={creneaux} choisir={gere ? setEdition : undefined} />}
      {gere ? <EditionCreneau edition={edition} classe={classe} fermer={() => setEdition(null)} /> : null}
    </div>
  );
}

function EditionCreneau({ edition, classe, fermer }: { edition: Creneau | "nouveau" | null; classe: string; fermer: () => void }) {
  const rafraichir = useRafraichir();
  const existant = edition && edition !== "nouveau" ? edition : null;
  const { data: cours = [] } = useQuery({
    queryKey: ["cours", "classe", classe], enabled: !!edition && !!classe,
    queryFn: async () => (await api<Page<Cours>>(`/api/cours?classe=${classe}&page_size=100`)).results,
  });
  const [f, setF] = useState({ cours: "", jour: "1", debut: "08:00", fin: "10:00", salle: "" });
  useEffect(() => {
    if (existant) setF({ cours: String(existant.cours), jour: String(existant.jour), debut: existant.debut.slice(0, 5), fin: existant.fin.slice(0, 5), salle: existant.salle });
    else if (edition) setF((x) => ({ ...x, cours: "" }));
  }, [edition]); // eslint-disable-line react-hooks/exhaustive-deps
  const champ = (k: keyof typeof f) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });

  async function valider(e: FormEvent) {
    e.preventDefault();
    const corps = { ...f, cours: Number(f.cours), jour: Number(f.jour) };
    try {
      if (existant) await patch(`/api/creneaux/${existant.id}`, corps);
      else await post("/api/creneaux", corps);
      toast.success("Emploi du temps mis à jour");
      rafraichir("creneaux");
      fermer();
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }
  async function retirer() {
    try {
      await supprimer(`/api/creneaux/${existant!.id}`);
      rafraichir("creneaux");
      fermer();
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }

  return (
    <Dialog open={!!edition} onOpenChange={(o) => !o && fermer()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existant ? `${existant.matiere_nom} · ${JOURS[existant.jour - 1]}` : "Ajouter un cours"}</DialogTitle>
          <DialogDescription>Les chevauchements (même classe, même enseignant ou même salle) sont refusés.</DialogDescription>
        </DialogHeader>
        <form onSubmit={valider} className="grid gap-4 sm:grid-cols-2">
          <Champ label="Matière" className="sm:col-span-2" aide={cours.length ? undefined : "Aucun cours dans cette classe : attribuez d'abord les matières aux enseignants."}>
            <Choix required {...champ("cours")}>
              <option value="">Choisir…</option>
              {cours.map((c) => <option key={c.id} value={c.id}>{c.matiere_nom}{c.enseignant_nom ? ` · ${c.enseignant_nom}` : " · sans enseignant"}</option>)}
            </Choix>
          </Champ>
          <Champ label="Jour"><Choix {...champ("jour")}>{JOURS.map((j, i) => <option key={j} value={i + 1}>{j}</option>)}</Choix></Champ>
          <Champ label="Salle"><Input {...champ("salle")} placeholder="ex. B2" /></Champ>
          <Champ label="Début"><Input type="time" required {...champ("debut")} /></Champ>
          <Champ label="Fin"><Input type="time" required {...champ("fin")} /></Champ>
          <DialogFooter className="sm:col-span-2">
            {existant ? <Button type="button" variant="ghost" className="mr-auto text-destructive" onClick={retirer}><Trash2 /> Retirer</Button> : null}
            <Button type="button" variant="secondary" onClick={fermer}>Annuler</Button>
            <Button type="submit">Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Le professeur propose ses disponibilités ; elles comptent pour la génération une fois validées par la direction. */
function MesDisponibilites() {
  const rafraichir = useRafraichir();
  const { data } = useQuery({ queryKey: ["mes-dispos"], queryFn: () => api<Disponibilite & { grille: GrilleEcole }>("/api/edt/mes-disponibilites") });
  const [indispo, setIndispo] = useState<Set<string>>(new Set());
  const [prefere, setPrefere] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!data) return;
    const src = data.proposition ?? data;
    setIndispo(versEnsemble(src.indispo)); setPrefere(versEnsemble(src.prefere));
  }, [data]);
  if (!data) return null;
  async function proposer() {
    try {
      await remplacer("/api/edt/mes-disponibilites", { indispo: versCases(indispo), prefere: versCases(prefere) });
      toast.success("Proposition envoyée à la direction"); rafraichir("mes-dispos");
    } catch (e) { toast.error(messageErreur(e)); }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {data.proposition ? "Votre proposition attend la validation de la direction." :
          data.valide_le ? "Disponibilités validées par la direction. Vous pouvez proposer un changement." :
            "Indiquez les heures où vous ne pouvez pas enseigner, et celles que vous préférez."}
      </p>
      <GrilleDispo heures={data.grille.heures} ouverts={versEnsemble(data.grille.ouverts)} indispo={indispo} prefere={prefere}
        changer={(i, p) => { setIndispo(i); setPrefere(p); }} />
      <div className="flex justify-end"><Button onClick={proposer}><Check /> Proposer à la direction</Button></div>
    </div>
  );
}
