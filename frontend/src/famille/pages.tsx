import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Banknote, CalendarClock, CalendarDays, ChevronRight, ClipboardList, FileText, ReceiptText, UserCheck } from "lucide-react";
import { Avatar, Bandeau, Indicateur, Liste, Pastille, Section } from "@/components/design";
import { GrilleSemaine } from "@/components/Grille";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, dateHeure, fcfa } from "@/lib/format";
import { note, rang } from "@/lib/requetes";
import type { Config, Creneau } from "@/lib/types";
import { cn, ouvrirDocument } from "@/lib/utils";

export type Enfant = {
  id: number; prenom: string; nom: string; matricule: string; sexe: "F" | "M"; date_naissance: string | null;
  classe: string | null; annee: string | null; lien: string;
};
export type Enfants = { modules: string[]; enfants: Enfant[] };
type NoteEval = { titre: string; type: string; date: string; sur: number; valeur: number | null; absent: boolean };
type Notes = {
  classe: string;
  periodes: { periode: string; bareme: number; moyenne: number | null; verrouille: boolean;
    matieres: { matiere: string; coefficient: number; enseignant: string; moyenne: number | null; notes: NoteEval[] }[] }[];
} | null;
type AVenir = { date: string; titre: string; type: string; matiere: string; sur: number }[] | null;
type BulletinResume = { id: number; periode: string; annee: string; classe: string; moyenne: number | null; bareme: number;
  rang: number | null; effectif: number; mention: string; emis_le: string }[] | null;
type Scolarite = {
  total: number; paye: number; reste: number; en_retard: number;
  echeances: { id: number; libelle: string; montant: number; date_limite: string; paye: number; reste: number }[];
  paiements: { id: number; numero_recu: string; montant: number; moyen: string; encaisse_le: string }[];
} | null;
type Absences = { date: string; creneau: string; type: "absence" | "retard"; justifiee: boolean; motif: string }[] | null;

const rubrique = <T,>(id: number | string, nom: string, actif = true) => ({
  queryKey: ["famille", id, nom], enabled: actif, queryFn: () => api<T>(`/api/famille/enfants/${id}/${nom}`),
});

export function AccueilFamille({ config, donnees }: { config: Config; donnees?: Enfants }) {
  const { moi } = useAuth();
  const jour = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div className="space-y-7">
      <Bandeau surtitre={jour} titre={`Bonjour ${moi?.prenom || ""}`.trim()}
        texte={`Suivez ici la scolarité de vos enfants à ${config.nom} : notes, évaluations prévues, emploi du temps, absences et paiements.`} />
      {donnees?.enfants.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {donnees.enfants.map((e) => <CarteEnfant key={e.id} enfant={e} notes={donnees.modules.includes("notes")} />)}
        </div>
      ) : donnees ? (
        <EmptyState icon={UserCheck} title="Aucun élève rattaché"
          description="L'école n'a pas encore rattaché d'élève à votre compte, ou l'accès a été retiré. Contactez le secrétariat." />
      ) : null}
    </div>
  );
}

function CarteEnfant({ enfant, notes }: { enfant: Enfant; notes: boolean }) {
  const { data: aVenir } = useQuery(rubrique<AVenir>(enfant.id, "a-venir", notes));
  const prochaine = aVenir?.[0];
  return (
    <Link to={`/enfants/${enfant.id}`} className="group flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-carte transition-colors hover:border-primary/50">
      <div className="flex items-center gap-3">
        <Avatar prenom={enfant.prenom} nom={enfant.nom} taille="lg" />
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold">{enfant.prenom} {enfant.nom}</div>
          <div className="text-sm text-muted-foreground">{enfant.classe ? `${enfant.classe} · ${enfant.annee}` : "Pas encore inscrit"} · {enfant.lien}</div>
        </div>
        <ChevronRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
      </div>
      {prochaine ? (
        <div className="flex items-center gap-2 rounded-lg bg-or-soft px-3 py-2 text-sm text-[#5c4100]">
          <CalendarClock className="size-4 shrink-0" />
          <span>Prochaine évaluation : <b>{prochaine.matiere}</b> — {prochaine.titre}, le {date(prochaine.date, { weekday: "long", day: "numeric", month: "long" })}</span>
        </div>
      ) : null}
    </Link>
  );
}

const ONGLETS = [
  { cle: "notes", libelle: "Notes", icone: ClipboardList, module: "notes" },
  { cle: "a-venir", libelle: "Évaluations prévues", icone: CalendarClock, module: "notes" },
  { cle: "emploi-du-temps", libelle: "Emploi du temps", icone: CalendarDays, module: "notes" },
  { cle: "bulletins", libelle: "Bulletins", icone: FileText, module: "notes" },
  { cle: "absences", libelle: "Absences", icone: UserCheck, module: "absences" },
  { cle: "scolarite", libelle: "Scolarité", icone: Banknote, module: "frais" },
];

export function FicheEnfant({ donnees }: { donnees?: Enfants }) {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const enfant = donnees?.enfants.find((e) => String(e.id) === id);
  if (!donnees) return <p className="text-muted-foreground">Chargement…</p>;
  if (!enfant) return <EmptyState icon={UserCheck} title="Élève introuvable" description="Cet élève n'est pas rattaché à votre compte." />;
  const onglets = ONGLETS.filter((o) => donnees.modules.includes(o.module));
  const actif = onglets.find((o) => o.cle === params.get("onglet")) ?? onglets[0];

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Mes enfants</Link>
      <div className="flex items-center gap-4">
        <Avatar prenom={enfant.prenom} nom={enfant.nom} taille="lg" />
        <div>
          <h1 className="text-2xl font-semibold md:text-[28px]">{enfant.prenom} {enfant.nom}</h1>
          <div className="text-sm text-muted-foreground">{enfant.classe ? `${enfant.classe} · ${enfant.annee}` : "Pas encore inscrit"} · matricule {enfant.matricule}</div>
        </div>
      </div>
      <div className="defilement-fin -mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist">
        {onglets.map((o) => (
          <button key={o.cle} type="button" role="tab" aria-selected={o === actif} onClick={() => setParams({ onglet: o.cle }, { replace: true })}
            className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm [&_svg]:size-4",
              o === actif ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>
            <o.icone /> {o.libelle}
          </button>
        ))}
      </div>
      {!enfant.classe ? <EmptyState icon={UserCheck} title="Pas encore inscrit pour l'année en cours" />
        : actif?.cle === "notes" ? <OngletNotes id={enfant.id} />
        : actif?.cle === "a-venir" ? <OngletAVenir id={enfant.id} />
        : actif?.cle === "emploi-du-temps" ? <OngletEmploiDuTemps id={enfant.id} />
        : actif?.cle === "bulletins" ? <OngletBulletins id={enfant.id} />
        : actif?.cle === "absences" ? <OngletAbsences id={enfant.id} />
        : actif?.cle === "scolarite" ? <OngletScolarite id={enfant.id} /> : null}
    </div>
  );
}

function OngletNotes({ id }: { id: number }) {
  const { data } = useQuery(rubrique<Notes>(id, "notes"));
  if (!data) return <p className="text-muted-foreground">Chargement…</p>;
  if (!data.periodes.length) return <EmptyState icon={ClipboardList} title="Pas encore de notes" />;
  return (
    <div className="space-y-6">
      {[...data.periodes].reverse().map((p) => (
        <Section key={p.periode} titre={p.periode}
          action={<span className="text-sm">{p.verrouille ? "Moyenne" : "Moyenne provisoire"} : <b className="chiffres">{note(p.moyenne)}</b> / {p.bareme}</span>}>
          <Liste>
            {p.matieres.map((m) => (
              <div key={m.matiere} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{m.matiere} <span className="text-xs font-normal text-muted-foreground">· coef. {m.coefficient}{m.enseignant ? ` · ${m.enseignant}` : ""}</span></div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {m.notes.length ? m.notes.map((n, i) => (
                      <span key={i} title={`${n.titre} · ${date(n.date)}`} className="rounded-md bg-muted px-2 py-0.5 text-xs chiffres">
                        {n.absent ? "Abs." : `${note(n.valeur)}/${n.sur}`}{n.type === "composition" ? " (compo.)" : ""}
                      </span>
                    )) : <span className="text-xs text-muted-foreground">Aucune note</span>}
                  </div>
                </div>
                <span className={cn("font-heading text-lg font-semibold chiffres", m.moyenne != null && m.moyenne < p.bareme / 2 && "text-[#a32b2b]")}>{note(m.moyenne)}</span>
              </div>
            ))}
          </Liste>
        </Section>
      ))}
      <p className="text-xs text-muted-foreground">Seules les notes validées sont affichées. Le rang et la moyenne définitive figurent sur le bulletin, après le conseil de classe.</p>
    </div>
  );
}

function OngletAVenir({ id }: { id: number }) {
  const { data } = useQuery(rubrique<AVenir>(id, "a-venir"));
  if (!data) return data === null ? null : <p className="text-muted-foreground">Chargement…</p>;
  if (!data.length) return <EmptyState icon={CalendarClock} title="Aucune évaluation prévue" />;
  return (
    <Liste>
      {data.map((e, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="w-28 shrink-0 text-sm font-semibold first-letter:uppercase">{date(e.date, { weekday: "short", day: "numeric", month: "short" })}</div>
          <div className="min-w-0 flex-1"><div className="font-medium">{e.matiere}</div><div className="text-xs text-muted-foreground">{e.titre} · sur {e.sur}</div></div>
          <Pastille ton={e.type === "composition" ? "or" : "bleu"}>{e.type === "composition" ? "Composition" : "Devoir"}</Pastille>
        </div>
      ))}
    </Liste>
  );
}

function OngletEmploiDuTemps({ id }: { id: number }) {
  const { data } = useQuery(rubrique<Creneau[] | null>(id, "emploi-du-temps"));
  return data ? <GrilleSemaine creneaux={data} /> : <p className="text-muted-foreground">Chargement…</p>;
}

function OngletBulletins({ id }: { id: number }) {
  const { data } = useQuery(rubrique<BulletinResume>(id, "bulletins"));
  if (!data) return <p className="text-muted-foreground">Chargement…</p>;
  if (!data.length) return <EmptyState icon={FileText} title="Aucun bulletin pour l'instant" description="Le bulletin apparaît ici dès que le conseil de classe s'est tenu." />;
  return (
    <Liste>
      {data.map((b) => (
        <div key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{b.periode} · {b.classe} <span className="font-normal text-muted-foreground">({b.annee})</span></div>
            <div className="text-xs text-muted-foreground">Émis le {date(b.emis_le)} · {b.mention}</div>
          </div>
          <span className="text-sm chiffres"><b>{note(b.moyenne)}</b>/{b.bareme} · {rang(b.rang)} sur {b.effectif}</span>
          <Button size="sm" variant="secondary" onClick={() => ouvrirDocument(`/bulletins/${b.id}`)}><FileText /> Voir</Button>
        </div>
      ))}
    </Liste>
  );
}

function OngletAbsences({ id }: { id: number }) {
  const { data } = useQuery(rubrique<Absences>(id, "absences"));
  if (!data) return <p className="text-muted-foreground">Chargement…</p>;
  const absences = data.filter((a) => a.type === "absence");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Indicateur icone={UserCheck} valeur={absences.length} libelle="absences" ton="rose" />
        <Indicateur icone={UserCheck} valeur={absences.filter((a) => a.justifiee).length} libelle="justifiées" />
        <Indicateur icone={CalendarClock} valeur={data.length - absences.length} libelle="retards" ton="or" />
      </div>
      {data.length ? (
        <Liste>
          {data.map((a, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1"><div className="font-medium first-letter:uppercase">{date(a.date, { weekday: "long", day: "numeric", month: "long" })} · {a.creneau}</div>
                {a.motif ? <div className="text-xs text-muted-foreground">{a.motif}</div> : null}</div>
              <Pastille ton={a.type === "retard" ? "or" : a.justifiee ? "vert" : "rouge"}>{a.type === "retard" ? "Retard" : a.justifiee ? "Justifiée" : "Non justifiée"}</Pastille>
            </div>
          ))}
        </Liste>
      ) : <EmptyState icon={UserCheck} title="Aucune absence" />}
    </div>
  );
}

function OngletScolarite({ id }: { id: number }) {
  const { data: s } = useQuery(rubrique<Scolarite>(id, "scolarite"));
  if (!s) return <p className="text-muted-foreground">Chargement…</p>;
  const aujourdhui = new Date().toLocaleDateString("sv-SE");
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicateur icone={ReceiptText} valeur={fcfa(s.total)} libelle="total de l'année" ton="bleu" />
        <Indicateur icone={Banknote} valeur={fcfa(s.paye)} libelle="payé" />
        <Indicateur icone={ReceiptText} valeur={fcfa(s.reste)} libelle="reste à payer" ton="or" />
        <Indicateur icone={ReceiptText} valeur={fcfa(s.en_retard)} libelle="en retard" ton="rose" />
      </div>
      <Section titre="Échéances">
        <Liste>
          {s.echeances.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1"><div className="font-medium">{e.libelle}</div><div className="text-xs text-muted-foreground">avant le {date(e.date_limite)}</div></div>
              <span className="text-sm chiffres">{fcfa(e.montant)}</span>
              {e.reste === 0 ? <Pastille ton="vert">Payée</Pastille> : e.date_limite < aujourdhui ? <Pastille ton="rouge">En retard</Pastille>
                : e.paye ? <Pastille ton="or">Partielle</Pastille> : <Pastille ton="gris">À venir</Pastille>}
            </div>
          ))}
        </Liste>
      </Section>
      <Section titre="Paiements">
        {s.paiements.length ? (
          <Liste>
            {s.paiements.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1"><div className="font-medium">{p.numero_recu} · {p.moyen}</div><div className="text-xs text-muted-foreground">{dateHeure(p.encaisse_le)}</div></div>
                <span className="font-semibold chiffres">{fcfa(p.montant)}</span>
                <Button size="sm" variant="ghost" onClick={() => ouvrirDocument(`/recus/${p.id}`)}>Reçu</Button>
              </div>
            ))}
          </Liste>
        ) : <EmptyState icon={Banknote} title="Aucun paiement" />}
      </Section>
    </div>
  );
}
