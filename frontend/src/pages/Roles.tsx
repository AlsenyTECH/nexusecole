import { Fragment, useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Lock, Pencil, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Champ, Choix, EnTete } from "@/components/design";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, messageErreur, patch, post, supprimer } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Droit, RoleEcole } from "@/lib/types";
import { cn } from "@/lib/utils";

type Donnees = { permissions: Droit[]; roles: RoleEcole[] };
type Edition = RoleEcole | "nouveau" | { copie: RoleEcole } | null;

const parGroupe = (droits: Droit[]) => {
  const groupes = new Map<string, Droit[]>();
  for (const d of droits) groupes.set(d.groupe, [...(groupes.get(d.groupe) ?? []), d]);
  return [...groupes.entries()];
};

/**
 * Rôles et droits : chaque rôle est un ensemble de droits, fonctionnalité par fonctionnalité.
 * Les rôles d'origine restent ; l'école peut en créer d'autres (économe, censeur, bibliothécaire…)
 * et les attribuer dans Personnel ou Enseignants.
 */
export function Roles() {
  const client = useQueryClient();
  const { moi } = useAuth();
  const { data } = useQuery({ queryKey: ["roles"], queryFn: () => api<Donnees>("/api/roles") });
  const [edition, setEdition] = useState<Edition>(null);
  if (!data) return <p className="text-muted-foreground">Chargement…</p>;

  async function retirer(r: RoleEcole) {
    if (r.nb_comptes) return toast.error(`Ce rôle est attribué à ${r.nb_comptes} compte(s) : donnez-leur d'abord un autre rôle.`);
    if (!confirm(`Supprimer le rôle « ${r.nom} » ?`)) return;
    try {
      await supprimer(`/api/roles/${r.id}`);
      toast.success("Rôle supprimé");
      client.invalidateQueries({ queryKey: ["roles"] });
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }

  return (
    <div className="space-y-6">
      <EnTete titre="Rôles et droits"
        sousTitre="Chaque rôle donne des droits, fonctionnalité par fonctionnalité. Le rôle de chacun se choisit dans Personnel ou Enseignants."
        actions={<Button onClick={() => setEdition("nouveau")}><Plus /> Nouveau rôle</Button>} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.roles.map((r) => (
          <div key={r.id} className={cn("flex h-full flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-carte",
            moi?.role_nom === r.nom && "ring-2 ring-primary/40")}>
            <div className="flex items-start gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-accent-foreground"><ShieldCheck className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold">{r.nom}</span>
                  {r.systeme ? <Badge variant="outline">d'origine</Badge> : null}
                  {moi?.role_nom === r.nom ? <Badge variant="secondary">votre rôle</Badge> : null}
                </div>
                {r.description ? <p className="mt-0.5 text-sm text-muted-foreground">{r.description}</p> : null}
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span><b className="text-foreground">{r.tous_droits ? "Tous les" : r.permissions.length}</b> droit{r.tous_droits || r.permissions.length > 1 ? "s" : ""}</span>
              <span className="inline-flex items-center gap-1"><Users className="size-4" /> {r.nb_comptes} compte{r.nb_comptes > 1 ? "s" : ""}</span>
            </div>
            <div className="mt-auto flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEdition(r)}>
                {r.tous_droits ? <><ShieldCheck /> Voir les droits</> : <><Pencil /> Modifier</>}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEdition({ copie: r })}><Copy /> Copier</Button>
              {!r.systeme ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => retirer(r)} aria-label={`Supprimer ${r.nom}`}><Trash2 /></Button> : null}
            </div>
          </div>
        ))}
      </div>

      <h2 className="pt-2 text-lg font-semibold">Qui peut quoi</h2>
      <Matrice roles={data.roles} droits={data.permissions} />
      <p className="text-xs text-muted-foreground"><Lock className="mr-1 inline size-3" />Le directeur a toujours tous les droits, pour ne jamais perdre l'accès à l'administration. Les parents et tuteurs ont leur propre espace, sans droits de gestion.</p>

      <RoleForm edition={edition} fermer={() => setEdition(null)} donnees={data} />
    </div>
  );
}

/** Tableau des droits (lignes) par rôle (colonnes). */
function Matrice({ roles, droits }: { roles: RoleEcole[]; droits: Droit[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-carte">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left">
            <th className="sticky left-0 z-10 bg-muted px-3 py-2 font-semibold">Droit</th>
            {roles.map((r) => <th key={r.id} className="px-2 py-2 text-center text-xs font-semibold">{r.nom}</th>)}
          </tr>
        </thead>
        <tbody>
          {parGroupe(droits).map(([groupe, liste]) => (
            <Fragment key={groupe}>
              <tr className="bg-primary-soft/60"><td colSpan={roles.length + 1} className="sticky left-0 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent-foreground">{groupe}</td></tr>
              {liste.map((d) => (
                <tr key={d.code} className="border-b border-border/60 last:border-0">
                  <td className="sticky left-0 z-10 bg-card px-3 py-2">{d.libelle}</td>
                  {roles.map((r) => (
                    <td key={r.id} className="px-2 py-2 text-center">
                      {r.permissions.includes(d.code) ? <Check className="mx-auto size-4 text-primary" aria-label="oui" /> : <span className="text-muted-foreground/50" aria-label="non">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoleForm({ edition, fermer, donnees }: { edition: Edition; fermer: () => void; donnees: Donnees }) {
  const client = useQueryClient();
  const { moi } = useAuth();
  const existant = edition && edition !== "nouveau" && !("copie" in edition) ? edition : null;
  const fige = !!existant?.tous_droits;
  const mesDroits = new Set(moi?.permissions ?? []);
  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (!edition) return;
    if (edition === "nouveau") {
      setNom(""); setDescription(""); setChoisis(new Set());
    } else if ("copie" in edition) {
      // Une copie ne garde que les droits qu'on a soi-même
      setNom(`${edition.copie.nom} (copie)`); setDescription(edition.copie.description);
      setChoisis(new Set(edition.copie.permissions.filter((p) => mesDroits.has(p))));
    } else {
      setNom(edition.nom); setDescription(edition.description); setChoisis(new Set(edition.permissions));
    }
  }, [edition]); // eslint-disable-line react-hooks/exhaustive-deps

  function basculer(code: string, oui: boolean) {
    setChoisis((s) => {
      const n = new Set(s);
      if (oui) n.add(code); else n.delete(code);
      return n;
    });
  }
  function partirDe(id: string) {
    const r = donnees.roles.find((x) => String(x.id) === id);
    if (r) setChoisis(new Set(r.permissions.filter((p) => mesDroits.has(p))));
  }

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    if (existant?.nb_comptes && !confirm(`Ce rôle est attribué à ${existant.nb_comptes} compte(s) : leurs accès changent tout de suite. Continuer ?`)) return;
    setEnvoi(true);
    const corps = { ...(existant?.systeme ? {} : { nom: nom.trim() }), description: description.trim(), permissions: [...choisis] };
    try {
      if (existant) await patch(`/api/roles/${existant.id}`, corps);
      else await post("/api/roles", corps);
      toast.success(existant ? "Rôle modifié" : "Rôle créé");
      client.invalidateQueries({ queryKey: ["roles"] });
      fermer();
    } catch (err) {
      toast.error(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Dialog open={!!edition} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{fige ? existant?.nom : existant ? `Modifier « ${existant.nom} »` : "Nouveau rôle"}</DialogTitle>
          <DialogDescription>
            {fige ? "Le directeur a toujours tous les droits, y compris ceux qui seront ajoutés plus tard."
              : "Cochez ce que ce rôle permet de faire. Vous ne pouvez donner que des droits que vous avez vous-même."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enregistrer} className="grid gap-4">
          {!fige ? (
            <>
              <Champ label="Nom du rôle" aide={existant?.systeme ? "Le nom d'un rôle d'origine ne change pas." : undefined}>
                <Input required maxLength={60} value={nom} disabled={existant?.systeme} placeholder="Économe, Censeur, Bibliothécaire…" onChange={(e) => setNom(e.target.value)} />
              </Champ>
              <Champ label="Description (facultatif)"><Textarea rows={2} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} /></Champ>
              {edition === "nouveau" ? (
                <Champ label="Partir des droits d'un rôle existant">
                  <Choix defaultValue="" onChange={(e) => partirDe(e.target.value)}>
                    <option value="">— Aucun —</option>
                    {donnees.roles.filter((r) => !r.tous_droits).map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
                  </Choix>
                </Champ>
              ) : null}
            </>
          ) : null}
          <div className="space-y-4">
            {parGroupe(donnees.permissions).map(([groupe, liste]) => (
              <fieldset key={groupe} className="rounded-xl border border-border p-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{groupe}</legend>
                <div className="space-y-2.5">
                  {liste.map((d) => {
                    const pasLeMien = !mesDroits.has(d.code) && !choisis.has(d.code);
                    return (
                      <label key={d.code} className={cn("flex items-start gap-3 text-sm", fige || pasLeMien ? "cursor-default" : "cursor-pointer")}>
                        <Checkbox className="mt-0.5" checked={fige || choisis.has(d.code)} disabled={fige || pasLeMien}
                          onCheckedChange={(v) => basculer(d.code, v === true)} />
                        <span className="min-w-0">
                          <span className="font-medium">{d.libelle}</span>
                          {pasLeMien && !fige ? <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Lock className="size-3" /> vous n'avez pas ce droit</span> : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="sticky -bottom-6 -mx-6 -mb-6 flex items-center justify-between gap-2 border-t border-border bg-card/95 px-6 py-3 backdrop-blur">
            <span className="text-sm text-muted-foreground">{fige ? "Tous les droits" : `${choisis.size} droit${choisis.size > 1 ? "s" : ""}`}</span>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={fermer}>{fige ? "Fermer" : "Annuler"}</Button>
              {!fige ? <Button type="submit" disabled={envoi || !nom.trim()}>Enregistrer</Button> : null}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
