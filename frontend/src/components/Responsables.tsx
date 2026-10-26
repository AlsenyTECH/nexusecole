import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Pencil, Phone, Plus, Search, Star, Trash2, UserPlus, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Champ, Choix, Liste, Pastille, Section } from "@/components/design";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, messageErreur, patch, post, supprimer, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateHeure } from "@/lib/format";
import { lienWhatsApp, useRafraichir } from "@/lib/requetes";
import type { Eleve, LienResponsable, Responsable } from "@/lib/types";
import { cn } from "@/lib/utils";

export const LIENS: Record<string, string> = { pere: "Père", mere: "Mère", tuteur: "Tuteur légal", autre: "Autre (oncle, tante, grand-parent…)" };

/** Saisie d'un parent / tuteur : une personne déjà connue (fratrie) ou une nouvelle. */
export type Saisie = {
  cle: number; responsable: Responsable | null; lien: string; prenom: string; nom: string; telephone: string; telephone2: string;
  email: string; profession: string; adresse: string; contact_principal: boolean; acces_app: boolean;
  ouvrir_acces: boolean; acces_email: string; acces_mdp: string;
};

let compteur = 0;
export const saisieVide = (lien = "pere"): Saisie => ({
  cle: ++compteur, responsable: null, lien, prenom: "", nom: "", telephone: "", telephone2: "", email: "", profession: "",
  adresse: "", contact_principal: false, acces_app: true, ouvrir_acces: false, acces_email: "", acces_mdp: "",
});

/** Corps attendu par l'API (création d'élève ou rattachement). */
export function versApi(s: Saisie) {
  const base = { lien: s.lien, contact_principal: s.contact_principal, acces_app: s.acces_app };
  const acces = s.ouvrir_acces ? { acces: { email: s.acces_email.trim() || s.email.trim(), mot_de_passe: s.acces_mdp } } : {};
  if (s.responsable) return { ...base, ...acces, responsable: s.responsable.id };
  return {
    ...base, ...acces, prenom: s.prenom.trim(), nom: s.nom.trim(), telephone: s.telephone.trim(), telephone2: s.telephone2.trim(),
    email: s.email.trim(), profession: s.profession.trim(), adresse: s.adresse.trim(),
  };
}

/** Recherche d'un parent déjà enregistré (frères et sœurs). */
function Recherche({ choisir }: { choisir: (r: Responsable) => void }) {
  const [q, setQ] = useState("");
  const { data } = useQuery({
    queryKey: ["responsables", q],
    enabled: q.trim().length >= 2,
    queryFn: async () => (await api<Page<Responsable>>(`/api/responsables?q=${encodeURIComponent(q.trim())}`)).results,
  });
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou téléphone du parent déjà inscrit" className="pl-9" />
      </div>
      {data?.length ? (
        <Liste>
          {data.map((r) => (
            <button key={r.id} type="button" onClick={() => choisir(r)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50">
              <Avatar prenom={r.prenom} nom={r.nom} taille="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{r.prenom} {r.nom} · {r.telephone}</span>
                <span className="block truncate text-xs text-muted-foreground">{r.enfants.map((e) => e.nom).join(", ") || "aucun élève"}</span>
              </span>
            </button>
          ))}
        </Liste>
      ) : q.trim().length >= 2 && data ? <p className="text-xs text-muted-foreground">Personne trouvée : saisissez-la comme nouveau parent.</p> : null}
    </div>
  );
}

/** Formulaire d'un parent / tuteur (utilisé dans « Nouvel élève » et sur la fiche de l'élève). */
export function SaisieResponsable({ s, changer, retirer, espaceParents }: {
  s: Saisie; changer: (s: Saisie) => void; retirer?: () => void; espaceParents: boolean;
}) {
  const [mode, setMode] = useState<"nouveau" | "existant">(s.responsable ? "existant" : "nouveau");
  const maj = (champs: Partial<Saisie>) => changer({ ...s, ...champs });
  const champ = (k: "prenom" | "nom" | "telephone" | "telephone2" | "email" | "profession" | "adresse" | "acces_email" | "acces_mdp") =>
    ({ value: s[k], onChange: (e: { target: { value: string } }) => maj({ [k]: e.target.value }) });

  return (
    <fieldset className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Choix value={s.lien} onChange={(e) => maj({ lien: e.target.value })} className="h-9 w-auto" aria-label="Lien avec l'élève">
          {Object.entries(LIENS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Choix>
        <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
          {(["nouveau", "existant"] as const).map((m) => (
            <button key={m} type="button" onClick={() => { setMode(m); if (m === "nouveau") maj({ responsable: null }); }}
              className={cn("rounded-md px-2.5 py-1.5", mode === m ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>
              {m === "nouveau" ? "Nouvelle personne" : "Déjà inscrit (fratrie)"}
            </button>
          ))}
        </div>
        {retirer ? <Button type="button" size="sm" variant="ghost" className="ml-auto text-destructive" onClick={retirer}><Trash2 /> Retirer</Button> : null}
      </div>

      {mode === "existant" ? (
        s.responsable ? (
          <div className="flex items-center gap-3 rounded-lg bg-primary-soft/50 px-3 py-2">
            <Avatar prenom={s.responsable.prenom} nom={s.responsable.nom} taille="sm" />
            <span className="flex-1 text-sm"><b>{s.responsable.prenom} {s.responsable.nom}</b> · {s.responsable.telephone}</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => maj({ responsable: null })}>Changer</Button>
          </div>
        ) : <Recherche choisir={(r) => maj({ responsable: r, email: r.email })} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Prénom"><Input {...champ("prenom")} /></Champ>
          <Champ label="Nom"><Input required {...champ("nom")} /></Champ>
          <Champ label="Téléphone"><Input type="tel" inputMode="tel" required {...champ("telephone")} placeholder="77 123 45 67" /></Champ>
          <Champ label="Autre téléphone"><Input type="tel" inputMode="tel" {...champ("telephone2")} /></Champ>
          <Champ label="Profession"><Input {...champ("profession")} /></Champ>
          <Champ label="Email"><Input type="email" {...champ("email")} /></Champ>
          <Champ label="Adresse" className="sm:col-span-2"><Input {...champ("adresse")} placeholder="Quartier, ville" /></Champ>
        </div>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2"><Checkbox checked={s.contact_principal} onCheckedChange={(v) => maj({ contact_principal: v === true })} /> Contact principal</label>
        <label className="flex items-center gap-2"><Checkbox checked={s.acces_app} onCheckedChange={(v) => maj({ acces_app: v === true })} /> Peut suivre l'élève dans l'application</label>
        {espaceParents && s.acces_app && !s.responsable?.acces ? (
          <label className="flex items-center gap-2"><Checkbox checked={s.ouvrir_acces} onCheckedChange={(v) => maj({ ouvrir_acces: v === true })} /> Lui créer son accès maintenant</label>
        ) : null}
      </div>
      {s.ouvrir_acces && s.acces_app ? (
        <div className="grid gap-3 rounded-lg bg-muted/50 p-3 sm:grid-cols-2">
          <Champ label="Email de connexion"><Input type="email" required placeholder={s.email || "parent@exemple.com"} {...champ("acces_email")} /></Champ>
          <Champ label="Mot de passe initial" aide="10 caractères minimum, à lui transmettre."><Input required minLength={10} {...champ("acces_mdp")} /></Champ>
        </div>
      ) : null}
    </fieldset>
  );
}

/** Section « Parents et tuteurs » de la fiche élève. */
export function ResponsablesEleve({ eleve, espaceParents }: { eleve: Eleve; espaceParents: boolean }) {
  const { peut } = useAuth();
  const rafraichir = useRafraichir();
  const gere = peut("responsables.gerer");
  const { data: liens } = useQuery({
    queryKey: ["responsables", "eleve", eleve.id],
    queryFn: () => api<LienResponsable[]>(`/api/eleves/${eleve.id}/responsables`),
  });
  const [ajout, setAjout] = useState(false);
  const [fiche, setFiche] = useState<Responsable | null>(null);
  const [acces, setAcces] = useState<Responsable | null>(null);

  async function modifierLien(l: LienResponsable, champs: Partial<LienResponsable>) {
    try {
      await patch(`/api/liens-responsables/${l.id}`, champs);
      rafraichir("responsables", "eleves");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }
  async function detacher(l: LienResponsable) {
    if (!confirm(`Détacher ${l.responsable.prenom} ${l.responsable.nom} de ${eleve.prenom} ? La personne reste enregistrée pour ses autres enfants.`)) return;
    try {
      await supprimer(`/api/liens-responsables/${l.id}`);
      rafraichir("responsables", "eleves");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }

  return (
    <Section titre="Parents et tuteurs" action={gere ? <Button size="sm" variant="secondary" onClick={() => setAjout(true)}><UserPlus /> Ajouter</Button> : null}>
      {liens?.length ? (
        <Liste>
          {liens.map((l) => {
            const r = l.responsable;
            const freres = r.enfants.filter((e) => e.eleve !== eleve.id);
            return (
              <div key={l.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar prenom={r.prenom} nom={r.nom} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{r.prenom} {r.nom}</span>
                      <Pastille ton="bleu">{l.lien_libelle}</Pastille>
                      {l.contact_principal ? <Pastille ton="or">Contact principal</Pastille> : null}
                      {r.acces ? <Pastille ton={r.acces.actif && l.acces_app ? "vert" : "gris"}>{r.acces.actif ? (l.acces_app ? "Accès à l'application" : "Accès retiré pour cet élève") : "Accès suspendu"}</Pastille> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[r.telephone, r.telephone2, r.profession, r.email].filter(Boolean).join(" · ")}
                      {freres.length ? ` · aussi parent de ${freres.map((e) => e.nom).join(", ")}` : ""}
                    </div>
                  </div>
                  {lienWhatsApp(r.telephone, "") ? (
                    <Button asChild size="sm" variant="ghost"><a href={lienWhatsApp(r.telephone, `Bonjour ${r.prenom || r.nom},`)!} target="_blank" rel="noreferrer"><Phone /> WhatsApp</a></Button>
                  ) : null}
                </div>
                {gere ? (
                  <div className="flex flex-wrap items-center gap-2 pl-[52px]">
                    {!l.contact_principal ? <Button size="sm" variant="ghost" onClick={() => modifierLien(l, { contact_principal: true })}><Star /> Contact principal</Button> : null}
                    <Button size="sm" variant="ghost" onClick={() => setFiche(r)}><Pencil /> Coordonnées</Button>
                    {espaceParents ? <Button size="sm" variant="ghost" onClick={() => setAcces(r)}><KeyRound /> {r.acces ? "Accès" : "Créer son accès"}</Button> : null}
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch checked={l.acces_app} onCheckedChange={(v) => modifierLien(l, { acces_app: v })} /> Suit cet élève
                    </label>
                    <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => detacher(l)}><Trash2 /> Détacher</Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </Liste>
      ) : liens ? <EmptyState icon={UsersRound} title="Aucun parent ou tuteur" description={gere ? "Ajoutez le père, la mère ou le tuteur légal de l'élève." : undefined} /> : null}

      <AjoutResponsable eleve={eleve} ouvert={ajout} fermer={() => setAjout(false)} espaceParents={espaceParents} />
      <CoordonneesResponsable responsable={fiche} fermer={() => setFiche(null)} />
      <AccesResponsable responsable={acces} fermer={() => setAcces(null)} />
    </Section>
  );
}

function AjoutResponsable({ eleve, ouvert, fermer, espaceParents }: { eleve: Eleve; ouvert: boolean; fermer: () => void; espaceParents: boolean }) {
  const rafraichir = useRafraichir();
  const [s, setS] = useState(saisieVide());
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => { if (ouvert) setS(saisieVide()); }, [ouvert]);
  async function valider(e: FormEvent) {
    e.preventDefault();
    if (!s.responsable && (!s.nom.trim() || !s.telephone.trim())) return toast.error("Choisissez un parent déjà inscrit, ou saisissez au moins son nom et son téléphone.");
    setEnvoi(true);
    try {
      await post(`/api/eleves/${eleve.id}/responsables`, versApi(s));
      toast.success("Parent / tuteur rattaché");
      rafraichir("responsables", "eleves");
      fermer();
    } catch (err) {
      toast.error(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Parent ou tuteur de {eleve.prenom}</DialogTitle>
          <DialogDescription>Le tuteur peut être l'un des parents ou une autre personne. Plusieurs personnes peuvent suivre le même élève.</DialogDescription>
        </DialogHeader>
        <form onSubmit={valider} className="space-y-4">
          <SaisieResponsable s={s} changer={setS} espaceParents={espaceParents} />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={fermer}>Annuler</Button>
            <Button type="submit" disabled={envoi}><Plus /> Rattacher</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CoordonneesResponsable({ responsable, fermer }: { responsable: Responsable | null; fermer: () => void }) {
  const rafraichir = useRafraichir();
  const [f, setF] = useState({ prenom: "", nom: "", telephone: "", telephone2: "", email: "", profession: "", adresse: "" });
  useEffect(() => {
    if (responsable) setF({ prenom: responsable.prenom, nom: responsable.nom, telephone: responsable.telephone, telephone2: responsable.telephone2,
      email: responsable.email, profession: responsable.profession, adresse: responsable.adresse });
  }, [responsable]);
  const champ = (k: keyof typeof f) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });
  async function valider(e: FormEvent) {
    e.preventDefault();
    try {
      await patch(`/api/responsables/${responsable!.id}`, f);
      toast.success("Coordonnées mises à jour (pour tous ses enfants)");
      rafraichir("responsables", "eleves");
      fermer();
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }
  return (
    <Dialog open={!!responsable} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>Coordonnées</DialogTitle></DialogHeader>
        <form onSubmit={valider} className="grid gap-3 sm:grid-cols-2">
          <Champ label="Prénom"><Input {...champ("prenom")} /></Champ>
          <Champ label="Nom"><Input required {...champ("nom")} /></Champ>
          <Champ label="Téléphone"><Input type="tel" required {...champ("telephone")} /></Champ>
          <Champ label="Autre téléphone"><Input type="tel" {...champ("telephone2")} /></Champ>
          <Champ label="Profession"><Input {...champ("profession")} /></Champ>
          <Champ label="Email"><Input type="email" {...champ("email")} /></Champ>
          <Champ label="Adresse" className="sm:col-span-2"><Input {...champ("adresse")} /></Champ>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="secondary" onClick={fermer}>Annuler</Button>
            <Button type="submit">Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Accès à l'application d'un parent : création, nouveau mot de passe, suspension. */
function AccesResponsable({ responsable, fermer }: { responsable: Responsable | null; fermer: () => void }) {
  const rafraichir = useRafraichir();
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  useEffect(() => { if (responsable) { setEmail(responsable.acces?.email ?? responsable.email); setMdp(""); } }, [responsable]);
  if (!responsable) return null;
  const a = responsable.acces;

  async function ouvrir(e: FormEvent) {
    e.preventDefault();
    try {
      await post(`/api/responsables/${responsable!.id}/acces`, { email, mot_de_passe: mdp });
      toast.success(`Accès prêt : transmettez l'email et le mot de passe à ${responsable!.prenom || responsable!.nom}.`);
      rafraichir("responsables");
      fermer();
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }
  async function suspendre(actif: boolean) {
    try {
      await patch(`/api/responsables/${responsable!.id}/acces`, { actif });
      toast.success(actif ? "Accès rétabli" : "Accès suspendu");
      rafraichir("responsables");
      fermer();
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && fermer()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accès de {responsable.prenom} {responsable.nom}</DialogTitle>
          <DialogDescription>
            {a ? `Compte ${a.email} · ${a.actif ? "actif" : "suspendu"} · dernière connexion : ${a.derniere_connexion ? dateHeure(a.derniere_connexion) : "jamais"}`
              : "Avec son accès, ce parent suit dans l'application les notes, l'emploi du temps, les évaluations prévues, les absences et la scolarité de ses enfants."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={ouvrir} className="space-y-3">
          <Champ label="Email de connexion"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Champ>
          <Champ label={a ? "Nouveau mot de passe" : "Mot de passe initial"} aide="10 caractères minimum.">
            <Input required minLength={10} value={mdp} onChange={(e) => setMdp(e.target.value)} />
          </Champ>
          <DialogFooter>
            {a ? <Button type="button" variant="ghost" className="mr-auto" onClick={() => suspendre(!a.actif)}>{a.actif ? "Suspendre l'accès" : "Rétablir l'accès"}</Button> : null}
            <Button type="button" variant="secondary" onClick={fermer}>Fermer</Button>
            <Button type="submit"><KeyRound /> {a ? "Changer le mot de passe" : "Créer l'accès"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
