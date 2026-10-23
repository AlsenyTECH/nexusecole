import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck2, Save, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Choix, EnTete, Liste, Pastille, Section } from "@/components/design";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, messageErreur, patch, post, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { aujourdhui, date } from "@/lib/format";
import { useAnneeActive, useClasses, useRafraichir } from "@/lib/requetes";
import type { Cours } from "@/lib/types";
import { cn } from "@/lib/utils";

type Etat = "present" | "absence" | "retard";
type DonneesAppel = { classe: string; fait: boolean; eleves: { inscription: number; eleve: string; matricule: string; etat: Etat }[] };
type AbsenceLigne = { id: number; eleve: string; classe: string; date: string; creneau: string; type: string; justifiee: boolean; motif: string };

const ETATS: [Etat, string, string][] = [
  ["present", "Présent", "bg-[#e2f4e2] text-[#0b6b0b] border-[#0ca30c]/40"],
  ["absence", "Absent", "bg-[#fbe6e6] text-[#a32b2b] border-[#d03b3b]/40"],
  ["retard", "Retard", "bg-or-soft text-[#7a5600] border-or/50"],
];

export function Appel() {
  const { peut } = useAuth();
  const rafraichir = useRafraichir();
  const { annee } = useAnneeActive();
  const { data: toutes = [] } = useClasses(annee?.id);
  const { data: mesCours = [] } = useQuery({ queryKey: ["mes-cours"], queryFn: () => api<Cours[]>("/api/cours/mes-cours") });
  // La direction voit toutes les classes ; enseignants et surveillants, celles qui leur sont attribuées.
  const classes = peut("notes.saisir_toutes") ? toutes : toutes.filter((c) => mesCours.some((m) => m.classe === c.id));
  const [classe, setClasse] = useState<number | null>(null);
  const [jour, setJour] = useState(aujourdhui());
  const [creneau, setCreneau] = useState(new Date().getHours() < 13 ? "matin" : "apres_midi");
  useEffect(() => { if (!classe && classes.length) setClasse(classes[0].id); }, [classes, classe]);

  const { data } = useQuery({
    queryKey: ["appel", classe, jour, creneau],
    enabled: !!classe,
    queryFn: () => api<DonneesAppel>(`/api/appel?classe=${classe}&date=${jour}&creneau=${creneau}`),
  });
  const initial = useMemo(() => Object.fromEntries((data?.eleves ?? []).map((e) => [e.inscription, e.etat])), [data]) as Record<number, Etat>;
  // Choix en cours gardés à part : un rechargement ne les efface pas ; remis à zéro au changement de classe/date.
  const [choix, setChoix] = useState<Record<number, Etat>>({});
  useEffect(() => setChoix({}), [classe, jour, creneau]);
  const etats = { ...initial, ...choix };
  const [envoi, setEnvoi] = useState(false);

  async function enregistrer() {
    setEnvoi(true);
    try {
      const r = await post<{ absence: number; retard: number }>("/api/appel", {
        classe, date: jour, creneau, eleves: Object.entries(etats).map(([inscription, etat]) => ({ inscription: Number(inscription), etat })),
      });
      toast.success(`Appel enregistré : ${r.absence} absent(s), ${r.retard} retard(s)`);
      rafraichir("appel", "absences", "resultats");
      setChoix({});
    } catch (err) {
      toast.error(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }

  const compte = (e: Etat) => Object.values(etats).filter((x) => x === e).length;

  return (
    <div className="space-y-6">
      <EnTete titre="Appel" sousTitre="Marquez les absents et les retards ; les présents n'ont rien à cocher." />
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <Choix value={classe ?? ""} onChange={(e) => setClasse(Number(e.target.value))}>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </Choix>
        <Input type="date" value={jour} max={aujourdhui()} onChange={(e) => setJour(e.target.value)} />
        <div className="flex rounded-lg border border-border bg-card p-0.5">
          {[["matin", "Matin"], ["apres_midi", "Après-midi"]].map(([v, l]) => (
            <button key={v} onClick={() => setCreneau(v)} className={cn("flex-1 rounded-md px-3 py-1.5 text-sm font-medium", creneau === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{l}</button>
          ))}
        </div>
      </div>

      {!classes.length ? <EmptyState icon={UserCheck} title="Aucune classe attribuée" description="La direction vous attribue vos classes dans « Matières et cours »." /> : null}

      {data ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {data.fait ? <Pastille ton="vert">Appel déjà fait</Pastille> : <Pastille ton="gris">Appel à faire</Pastille>}
            <span className="text-muted-foreground">{data.eleves.length} élèves · {compte("absence")} absent(s) · {compte("retard")} retard(s)</span>
          </div>
          <Liste>
            {data.eleves.map((e) => (
              <div key={e.inscription} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <Avatar prenom={e.eleve.split(" ")[0]} nom={e.eleve.split(" ").slice(1).join(" ")} taille="sm" />
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{e.eleve}</div></div>
                <div className="grid w-full grid-cols-3 gap-1 sm:flex sm:w-auto">
                  {ETATS.map(([etat, libelle, couleur]) => (
                    <button key={etat} onClick={() => setChoix({ ...choix, [e.inscription]: etat })}
                      className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold",
                        etats[e.inscription] === etat ? couleur : "border-border text-muted-foreground hover:bg-muted")}>
                      {libelle}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </Liste>
          <div className="sticky bottom-20 flex justify-end md:bottom-4">
            <Button size="lg" onClick={enregistrer} disabled={envoi} className="shadow-haute"><Save /> Enregistrer l'appel</Button>
          </div>
        </>
      ) : null}

      {classe ? <AbsencesClasse classe={classe} /> : null}
    </div>
  );
}

function AbsencesClasse({ classe }: { classe: number }) {
  const rafraichir = useRafraichir();
  const { data } = useQuery({
    queryKey: ["absences", classe],
    queryFn: async () => (await api<Page<AbsenceLigne>>(`/api/absences?classe=${classe}`)).results.slice(0, 15),
  });
  async function justifier(a: AbsenceLigne, justifiee: boolean) {
    try {
      await patch(`/api/absences/${a.id}`, { justifiee });
      rafraichir("absences", "resultats");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }
  if (!data?.length) return null;
  return (
    <Section titre="Absences et retards récents">
      <Liste>
        {data.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <CalendarCheck2 className="size-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{a.eleve}</div>
              <div className="text-xs text-muted-foreground">{date(a.date)} · {a.creneau === "matin" ? "matin" : "après-midi"}</div>
            </div>
            <Pastille ton={a.type === "retard" ? "or" : "rouge"}>{a.type === "retard" ? "Retard" : "Absence"}</Pastille>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={a.justifiee} onCheckedChange={(v) => justifier(a, v)} /> Justifiée
            </label>
          </div>
        ))}
      </Liste>
    </Section>
  );
}
