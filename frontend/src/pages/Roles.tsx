import { Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { EnTete } from "@/components/design";
import { Checkbox } from "@/components/ui/checkbox";
import { api, messageErreur, patch } from "@/lib/api";

type Role = { code: string; nom: string; permissions: string[]; modifiable: boolean };
type Donnees = { permissions: Record<string, string>; roles: Role[] };

const GROUPES: [string, string][] = [
  ["scolarite", "Scolarité"], ["eleves", "Scolarité"], ["inscriptions", "Scolarité"],
  ["frais", "Frais scolaires"], ["notes", "Pédagogie"], ["absences", "Pédagogie"],
  ["utilisateurs", "Administration"], ["roles", "Administration"],
];
const groupe = (p: string) => GROUPES.find(([prefixe]) => p.startsWith(prefixe + "."))?.[1] ?? "Autres";
// Parents et élèves auront leur propre espace : pas de droits de gestion.
const COLONNES = ["directeur", "secretaire", "comptable", "enseignant", "surveillant"];

/** Matrice rôles × permissions, modifiable par l'administrateur de l'école. */
export function Roles() {
  const client = useQueryClient();
  const { data } = useQuery({ queryKey: ["roles"], queryFn: () => api<Donnees>("/api/roles") });
  if (!data) return <p className="text-muted-foreground">Chargement…</p>;
  const roles = COLONNES.map((c) => data.roles.find((r) => r.code === c)).filter(Boolean) as Role[];
  const parGroupe = Object.keys(data.permissions).reduce<Record<string, string[]>>((acc, p) => {
    (acc[groupe(p)] ??= []).push(p);
    return acc;
  }, {});

  async function basculer(role: Role, permission: string, actif: boolean) {
    const permissions = actif ? [...role.permissions, permission] : role.permissions.filter((p) => p !== permission);
    client.setQueryData<Donnees>(["roles"], (d) => d && { ...d, roles: d.roles.map((r) => (r.code === role.code ? { ...r, permissions } : r)) });
    try {
      await patch(`/api/roles/${role.code}`, { permissions });
    } catch (e) {
      toast.error(messageErreur(e));
      client.invalidateQueries({ queryKey: ["roles"] });
    }
  }

  return (
    <div className="space-y-6">
      <EnTete titre="Rôles et droits" sousTitre="Cochez ce que chaque rôle peut faire. Le changement s'applique immédiatement (à la prochaine action de la personne)." />
      <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-carte">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="p-3 text-left font-medium text-muted-foreground">Permission</th>
              {roles.map((r) => (
                <th key={r.code} className="p-3 text-center font-semibold">
                  {r.nom}
                  {!r.modifiable ? <Lock className="ml-1 inline size-3.5 text-muted-foreground" aria-label="tous les droits" /> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(parGroupe).map(([titre, permissions]) => (
              <Fragment key={titre}>
                <tr className="bg-muted/50"><td colSpan={roles.length + 1} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{titre}</td></tr>
                {permissions.map((p) => (
                  <tr key={p} className="border-b border-border/60 last:border-0">
                    <td className="p-3">{data.permissions[p]}</td>
                    {roles.map((r) => (
                      <td key={r.code} className="p-3 text-center">
                        <Checkbox checked={r.permissions.includes(p)} disabled={!r.modifiable}
                          onCheckedChange={(v) => basculer(r, p, v === true)} aria-label={`${r.nom} : ${data.permissions[p]}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground"><Lock className="mr-1 inline size-3" />Le directeur a toujours tous les droits, pour ne jamais perdre l'accès à l'administration.</p>
    </div>
  );
}
