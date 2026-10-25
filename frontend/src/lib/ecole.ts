/**
 * Où sommes-nous ? Deux façons d'identifier l'école :
 * - sous-domaine (production) : lycee-x.nexusecole.sn, console sur admin.nexusecole.sn ;
 * - chemin (hébergement gratuit, une seule adresse) : /e/lycee-x/…, console sur /console/….
 *   L'interface envoie alors l'en-tête X-Ecole à l'API.
 */
export type Espace = {
  type: "ecole" | "console" | "portail";
  /** Code envoyé dans l'en-tête X-Ecole (mode chemin uniquement). */
  code: string | null;
  /** Préfixe des routes de l'application (« /e/lycee-x », « /console » ou « »). */
  base: string;
};

function detecter(): Espace {
  const { hostname, pathname } = window.location;
  const ecole = pathname.match(/^\/e\/([a-z0-9-]{1,40})(?=\/|$)/);
  if (ecole) return { type: "ecole", code: ecole[1], base: `/e/${ecole[1]}` };
  if (/^\/console(?=\/|$)/.test(pathname)) return { type: "console", code: "admin", base: "/console" };
  if (hostname.startsWith("admin.")) return { type: "console", code: null, base: "" };
  // Compilé pour l'hébergement à adresse unique : la racine présente le choix de l'école
  if (import.meta.env.VITE_MODE_CHEMIN === "1") return { type: "portail", code: null, base: "" };
  return { type: "ecole", code: null, base: "" };
}

export const espace = detecter();

/** Adresse complète d'une école, selon le mode (pour les liens de la console). */
export function adresseEcole(domaine: string) {
  if (espace.code === "admin") return `${location.origin}/e/${domaine.split(".")[0]}`;
  return `${location.protocol}//${domaine}${location.port ? `:${location.port}` : ""}`;
}
