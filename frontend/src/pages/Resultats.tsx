import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Award, FileText, Gavel, Lock, TrendingDown, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import { Choix, EnTete, Indicateur, Pastille } from "@/components/design";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ouvrirDocument } from "@/lib/utils";
import { api, messageErreur, post, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { note, periodeCourante, rang, useAnneeActive, useClasses, usePeriodes, useRafraichir } from "@/lib/requetes";
import type { Bulletin, Resultats as TResultats } from "@/lib/types";

export function Resultats() {
  const { peut } = useAuth();
  const rafraichir = useRafraichir();
  const { annee } = useAnneeActive();
  const { data: classes = [] } = useClasses(annee?.id);
  const { data: periodes } = usePeriodes(annee?.id);
  const [classe, setClasse] = useState<number | null>(null);
  const [periode, setPeriode] = useState<number | null>(null);
  useEffect(() => { if (!classe && classes.length) setClasse(classes[0].id); }, [classes, classe]);
  useEffect(() => { if (!periode && periodes?.length) setPeriode(periodeCourante(periodes)!.id); }, [periodes, periode]);

  const { data: r } = useQuery({
    queryKey: ["resultats", classe, periode],
    enabled: !!classe && !!periode,
    queryFn: () => api<TResultats>(`/api/resultats?classe=${classe}&periode=${periode}`),
  });
  const { data: bulletins = [] } = useQuery({
    queryKey: ["bulletins", classe, periode],
    enabled: !!r?.verrouille,
    queryFn: async () => (await api<Page<Bulletin>>(`/api/bulletins?classe=${classe}&periode=${periode}&page_size=200`)).results,
  });
  const [conseil, setConseil] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  async function tenirConseil() {
    setEnvoi(true);
    try {
      const x = await post<{ bulletins: number }>("/api/conseils", { classe, periode });
      toast.success(`Période verrouillée : ${x.bulletins} bulletins émis et signés`);
      rafraichir("resultats", "bulletins", "notes", "evaluations");
      setConseil(false);
    } catch (e) {
      toast.error(messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  }

  const bulletinDe = (inscription: number) => bulletins.find((b) => b.inscription === inscription);
  const matieres = r?.eleves[0]?.matieres ?? [];

  return (
    <div className="space-y-6">
      <EnTete titre="Résultats et bulletins" sousTitre="Moyennes, rangs et mentions ; conseil de classe et bulletins signés."
        actions={<>
          <Choix value={classe ?? ""} onChange={(e) => setClasse(Number(e.target.value))} className="w-40">
            {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </Choix>
          <Choix value={periode ?? ""} onChange={(e) => setPeriode(Number(e.target.value))} className="w-44">
            {periodes?.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </Choix>
        </>} />

      {periodes && !periodes.length ? <EmptyState icon={FileText} title="L'année n'a pas encore de trimestres" description="Créez-les dans « Matières et cours »." /> : null}

      {r ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicateur icone={Users} valeur={note(r.statistiques.moyenne_classe)} libelle={`moyenne de la classe /${r.bareme}`} />
            <Indicateur icone={TrendingUp} valeur={note(r.statistiques.plus_forte)} libelle="plus forte moyenne" ton="bleu" />
            <Indicateur icone={TrendingDown} valeur={note(r.statistiques.plus_faible)} libelle="plus faible moyenne" ton="rose" />
            <Indicateur icone={Award} valeur={`${r.statistiques.admis} / ${r.effectif}`} libelle={`moyenne ≥ ${r.bareme / 2}`} ton="or" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-carte">
            {r.verrouille ? (
              <div className="flex items-center gap-2 text-sm"><Lock className="size-4 text-primary" /><b>Conseil tenu</b> : notes verrouillées, bulletins émis et signés.</div>
            ) : (
              <div className="text-sm text-muted-foreground">Après le conseil de classe, verrouillez la période : les notes ne pourront plus changer et les bulletins seront émis.</div>
            )}
            {!r.verrouille && peut("notes.valider") ? <Button onClick={() => setConseil(true)}><Gavel /> Tenir le conseil</Button> : null}
          </div>

          <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-carte">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Rang</TableHead><TableHead>Élève</TableHead>
                  {matieres.map((m) => <TableHead key={m.cours} className="hidden text-center xl:table-cell" title={m.matiere}>{m.matiere.slice(0, 4)}.</TableHead>)}
                  <TableHead className="text-right">Moyenne</TableHead><TableHead>Mention</TableHead><TableHead className="hidden sm:table-cell">Abs.</TableHead><TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.eleves.map((e) => {
                  const b = bulletinDe(e.inscription);
                  return (
                    <TableRow key={e.inscription}>
                      <TableCell className="font-heading font-semibold">{rang(e.rang)}</TableCell>
                      <TableCell><div className="font-medium">{e.prenom} {e.nom}</div><div className="text-xs text-muted-foreground">{e.matricule}</div></TableCell>
                      {e.matieres.map((m) => <TableCell key={m.cours} className="hidden text-center text-sm chiffres xl:table-cell">{note(m.moyenne)}</TableCell>)}
                      <TableCell className="text-right font-heading text-base font-semibold chiffres">{note(e.moyenne)}</TableCell>
                      <TableCell>{e.mention ? <Pastille ton={e.moyenne != null && e.moyenne >= r.bareme / 2 ? "vert" : "rouge"}>{e.mention}</Pastille> : "—"}</TableCell>
                      <TableCell className="hidden text-sm sm:table-cell">{e.absences}{e.retards ? ` · ${e.retards} ret.` : ""}</TableCell>
                      <TableCell>{b ? <Button variant="ghost" size="sm" onClick={() => ouvrirDocument(`/bulletins/${b.id}`)}><FileText /> Bulletin</Button> : null}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      ) : null}

      <Dialog open={conseil} onOpenChange={setConseil}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tenir le conseil de classe</DialogTitle>
            <DialogDescription>
              {r?.classe} · {r?.periode}. Les notes seront définitivement verrouillées et un bulletin signé (avec QR code de vérification)
              sera émis pour chacun des {r?.effectif} élèves. Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConseil(false)}>Retour</Button>
            <Button onClick={tenirConseil} disabled={envoi}><Gavel /> Verrouiller et émettre</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
