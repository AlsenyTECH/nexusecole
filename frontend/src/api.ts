// Client API minimal. Les jetons restent en mémoire + sessionStorage (onglet courant) :
// ils sont liés à l'école côté serveur (claim `schema`), donc inutilisables ailleurs.
const CLE = "nexus.jetons";

type Jetons = { access: string; refresh: string };

let jetons: Jetons | null = (() => {
  try {
    return JSON.parse(sessionStorage.getItem(CLE) || "null");
  } catch {
    return null;
  }
})();

function sauver(j: Jetons | null) {
  jetons = j;
  try {
    if (j) sessionStorage.setItem(CLE, JSON.stringify(j));
    else sessionStorage.removeItem(CLE);
  } catch {
    /* stockage indisponible : on reste en mémoire */
  }
}

export class ErreurApi extends Error {
  constructor(public status: number, public donnees: unknown) {
    super(typeof donnees === "object" && donnees && "detail" in donnees ? String((donnees as { detail: unknown }).detail) : `Erreur ${status}`);
  }
}

async function brut(chemin: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (jetons) headers.set("Authorization", `Bearer ${jetons.access}`);
  return fetch(chemin, { ...init, headers });
}

async function rafraichir(): Promise<boolean> {
  if (!jetons) return false;
  const r = await fetch("/api/auth/rafraichir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: jetons.refresh }),
  });
  if (!r.ok) {
    sauver(null);
    return false;
  }
  const d = await r.json();
  sauver({ access: d.access, refresh: d.refresh ?? jetons.refresh });
  return true;
}

export async function api<T = unknown>(chemin: string, init: RequestInit = {}): Promise<T> {
  let r = await brut(chemin, init);
  if (r.status === 401 && (await rafraichir())) r = await brut(chemin, init);
  const donnees = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new ErreurApi(r.status, donnees);
  return donnees as T;
}

export const post = <T = unknown>(chemin: string, corps: unknown) =>
  api<T>(chemin, { method: "POST", body: JSON.stringify(corps) });

export async function connexion(email: string, password: string) {
  sauver(null);
  sauver(await post<Jetons>("/api/auth/connexion", { email, password }));
}

export const deconnexion = () => sauver(null);
export const estConnecte = () => jetons !== null;

export const fcfa = (n: number) => new Intl.NumberFormat("fr-SN").format(n) + " FCFA";
