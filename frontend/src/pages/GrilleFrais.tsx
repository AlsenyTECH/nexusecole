import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { Champ, Choix, EnTete, Pastille, Section } from "@/components/design";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, messageErreur, patch, post, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CATEGORIES_FRAIS, CATEGORIES_SERVICES, date, fcfa, pays } from "@/lib/format";
import { useAnneeActive, useClasses, useRafraichir } from "@/lib/requetes";
import type { Frais } from "@/lib/types";
import { cn } from "@/lib/utils";

export function GrilleFrais() {
  const { peut } = useAuth();
  const { annee } = useAnneeActive();
  const { data: frais = [] } = useQuery({
    queryKey: ["frais", annee?.id],
    enabled: !!annee,
    queryFn: async () => (await api<Page<Frais>>(`/api/frais?annee=${annee!.id}`)).results,
  });
  const [edition, setEdition] = useState<Frais | "nouveau" | null>(null);

  return (
    <div className="space-y-6">
      <EnTete titre="Grille des frais" sousTitre={annee ? `Année ${annee.libelle} · appliquée aux nouvelles inscriptions` : "Aucune année active"}
        actions={peut("frais.parametrer") && annee ? <Button onClick={() => setEdition("nouveau")}><Plus /> Ajouter un frais</Button> : null} />
      {frais.length ? (
        <>
          <TableFrais titre="Frais obligatoires" aide="Dus par tous les élèves des niveaux concernés, dès l'inscription."
            frais={frais.filter((f) => f.obligatoire)} modifier={peut("frais.parametrer") ? setEdition : undefined} />
          <TableFrais titre="Services à la carte" aide="Transport, cantine, études… Dus seulement par les élèves inscrits au service (depuis leur fiche)."
            frais={frais.filter((f) => !f.obligatoire)} modifier={peut("frais.parametrer") ? setEdition : undefined} />
        </>
      ) : (
        <EmptyState icon={ReceiptText} title="La grille est vide"
          description="Ajoutez les frais d'inscription, les mensualités par niveau, puis les services à la carte : transport, cantine, études surveillées…" />
      )}
      {annee ? <EditionFrais annee={annee.id} frais={edition} fermer={() => setEdition(null)} /> : null}
    </div>
  );
}

function TableFrais({ titre, aide, frais, modifier }: { titre: string; aide: string; frais: Frais[]; modifier?: (f: Frais) => void }) {
  const totalAnnuel = (f: Frais) => f.montant * f.nombre_echeances;
  return (
    <Section titre={titre} action={<span className="text-xs text-muted-foreground">{aide}</span>}>
      {frais.length ? (
        <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-carte">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Frais</TableHead><TableHead>Niveaux</TableHead><TableHead className="text-right">Montant</TableHead>
              <TableHead>Échéances</TableHead><TableHead className="text-right">Total / an</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {frais.map((f) => (
                <TableRow key={f.id} className={f.actif ? "" : "opacity-50"}>
                  <TableCell><div className="font-medium">{f.libelle}</div><div className="text-xs text-muted-foreground">{CATEGORIES_FRAIS[f.categorie]}{f.actif ? "" : " · désactivé"}</div></TableCell>
                  <TableCell>{f.niveaux.length ? <div className="flex flex-wrap gap-1">{f.niveaux.map((n) => <Pastille key={n} ton="bleu">{n}</Pastille>)}</div> : <span className="text-muted-foreground">Tous</span>}</TableCell>
                  <TableCell className="text-right chiffres">{fcfa(f.montant)}</TableCell>
                  <TableCell className="text-sm">{f.periodicite === "mensuel" ? `${f.nombre_echeances} mois dès le ${date(f.premiere_echeance)}` : `le ${date(f.premiere_echeance)}`}</TableCell>
                  <TableCell className="text-right font-semibold chiffres">{fcfa(totalAnnuel(f))}</TableCell>
                  <TableCell>{modifier ? <Button variant="ghost" size="icon" onClick={() => modifier(f)} aria-label="Modifier"><Pencil /></Button> : null}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Aucun pour l'instant.</p>}
    </Section>
  );
}

function EditionFrais({ annee, frais, fermer }: { annee: number; frais: Frais | "nouveau" | null; fermer: () => void }) {
  const rafraichir = useRafraichir();
  const { data: classes = [] } = useClasses(annee);
  const niveaux = [...new Set(classes.map((c) => c.niveau).filter(Boolean))];
  const debut = `${new Date().getFullYear()}-10-05`;
  const vide = { libelle: "", categorie: "scolarite", montant: "", periodicite: "mensuel", nombre_echeances: "10", premiere_echeance: debut, niveaux: [] as string[], obligatoire: true, actif: true };
  const [f, setF] = useState(vide);
  useEffect(() => {
    if (frais === "nouveau") setF(vide);
    else if (frais) setF({ ...frais, montant: String(frais.montant), nombre_echeances: String(frais.nombre_echeances) });
  }, [frais]); // eslint-disable-line react-hooks/exhaustive-deps

  async function valider(e: FormEvent) {
    e.preventDefault();
    const corps = { ...f, annee, montant: Number(f.montant), nombre_echeances: Number(f.nombre_echeances) };
    try {
      if (frais === "nouveau") await post("/api/frais", corps);
      else if (frais) await patch(`/api/frais/${frais.id}`, corps);
      toast.success("Grille enregistrée");
      rafraichir("frais");
      fermer();
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }
  const basculerNiveau = (n: string) => setF({ ...f, niveaux: f.niveaux.includes(n) ? f.niveaux.filter((x) => x !== n) : [...f.niveaux, n] });

  return (
    <Dialog open={!!frais} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{frais === "nouveau" ? "Ajouter un frais" : "Modifier le frais"}</DialogTitle>
          <DialogDescription>Les élèves déjà inscrits gardent leurs échéances : la grille s'applique aux nouvelles inscriptions.</DialogDescription>
        </DialogHeader>
        <form onSubmit={valider} className="grid gap-4 sm:grid-cols-2">
          <Champ label="Libellé" className="sm:col-span-2"><Input required value={f.libelle} onChange={(e) => setF({ ...f, libelle: e.target.value })} placeholder="ex. Mensualité collège" /></Champ>
          <Champ label="Catégorie">
            <Choix value={f.categorie} onChange={(e) => setF({ ...f, categorie: e.target.value,
              ...(frais === "nouveau" ? { obligatoire: !CATEGORIES_SERVICES.includes(e.target.value) } : {}) })}>
              {Object.entries(CATEGORIES_FRAIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Choix>
          </Champ>
          <Champ label="Qui doit le payer ?" className="sm:col-span-2">
            <div className="grid gap-2 sm:grid-cols-2">
              {([[true, "Tous les élèves concernés", "Dû dès l'inscription (inscription, mensualités, APE…)"],
                [false, "Service à la carte", "Seulement les élèves inscrits au service (transport, cantine…)"]] as const).map(([v, t, d]) => (
                <button type="button" key={t} onClick={() => setF({ ...f, obligatoire: v })} aria-pressed={f.obligatoire === v}
                  className={cn("rounded-xl border p-3 text-left text-sm", f.obligatoire === v ? "border-primary bg-primary-soft/60" : "border-border hover:bg-muted/50")}>
                  <div className="font-medium">{t}</div><div className="text-xs text-muted-foreground">{d}</div>
                </button>
              ))}
            </div>
          </Champ>
          <Champ label={`Montant par échéance (${pays.devise})`}><Input type="number" min={1} required value={f.montant} onChange={(e) => setF({ ...f, montant: e.target.value })} /></Champ>
          <Champ label="Paiement">
            <Choix value={f.periodicite} onChange={(e) => setF({ ...f, periodicite: e.target.value })}>
              <option value="mensuel">Mensuel</option><option value="unique">En une fois</option>
            </Choix>
          </Champ>
          {f.periodicite === "mensuel" ? (
            <Champ label="Nombre de mois"><Input type="number" min={1} max={12} value={f.nombre_echeances} onChange={(e) => setF({ ...f, nombre_echeances: e.target.value })} /></Champ>
          ) : <div className="hidden sm:block" />}
          <Champ label={f.periodicite === "mensuel" ? "Date limite du 1er mois" : "Date limite"}>
            <Input type="date" required value={f.premiere_echeance} onChange={(e) => setF({ ...f, premiere_echeance: e.target.value })} />
          </Champ>
          <Champ label="Niveaux concernés" aide="Aucun sélectionné = tous les niveaux." className="sm:col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {niveaux.length ? niveaux.map((n) => (
                <button type="button" key={n} onClick={() => basculerNiveau(n)}
                  className={cn("rounded-full border px-3 py-1 text-sm", f.niveaux.includes(n) ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>{n}</button>
              )) : <span className="text-sm text-muted-foreground">Créez d'abord des classes pour choisir des niveaux.</span>}
            </div>
          </Champ>
          {frais !== "nouveau" ? (
            <label className="flex items-center gap-3 text-sm sm:col-span-2"><Switch checked={f.actif} onCheckedChange={(v) => setF({ ...f, actif: v })} /> Actif</label>
          ) : null}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="secondary" onClick={fermer}>Annuler</Button>
            <Button type="submit">Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
