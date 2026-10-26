// Client de l'API. Les jetons restent dans l'onglet (sessionStorage) ; ils sont liés à l'école
// côté serveur (claim `schema`), donc inutilisables sur une autre école.
import { espace } from "./ecole";

// Une clé par école : en mode chemin, plusieurs écoles partagent la même adresse (même sessionStorage).
const CLE = `nexus.jetons.${espace.code ?? "hote"}`;

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

/** Erreur de l'API, avec un message lisible tiré de la réponse Django REST Framework. */
export class ErreurApi extends Error {
  constructor(public status: number, public donnees: unknown) {
    super(messageDe(donnees) ?? `Erreur ${status}`);
  }
}

function messageDe(d: unknown): string | null {
  if (!d) return null;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return messageDe(d[0]);
  if (typeof d === "object") {
    const o = d as Record<string, unknown>;
    if ("detail" in o) return messageDe(o.detail);
    if ("non_field_errors" in o) return messageDe(o.non_field_errors);
    const [cle, val] = Object.entries(o)[0] ?? [];
    return cle ? `${cle} : ${messageDe(val)}` : null;
  }
  return String(d);
}

export const messageErreur = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function brut(chemin: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (espace.code) headers.set("X-Ecole", espace.code);
  if (jetons) headers.set("Authorization", `Bearer ${jetons.access}`);
  return fetch(chemin, { ...init, headers });
}

async function rafraichir(): Promise<boolean> {
  if (!jetons) return false;
  const r = await fetch("/api/auth/rafraichir", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(espace.code ? { "X-Ecole": espace.code } : {}) },
    body: JSON.stringify({ refresh: jetons.refresh }),
  });
  if (!r.ok) {
    sauver(null);
    window.dispatchEvent(new Event("nexus:deconnecte"));
    return false;
  }
  const d = await r.json();
  sauver({ access: d.access, refresh: d.refresh ?? jetons.refresh });
  return true;
}

export async function api<T = unknown>(chemin: string, init: RequestInit = {}): Promise<T> {
  let r = await brut(chemin, init);
  if (r.status === 401 && jetons && (await rafraichir())) r = await brut(chemin, init);
  const donnees = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new ErreurApi(r.status, donnees);
  return donnees as T;
}

const envoi = (methode: string) => <T = unknown>(chemin: string, corps?: unknown) =>
  api<T>(chemin, { method: methode, body: corps === undefined ? undefined : JSON.stringify(corps) });

export const post = envoi("POST");
export const patch = envoi("PATCH");
export const supprimer = envoi("DELETE");
export const remplacer = envoi("PUT");

export async function seConnecter(email: string, password: string) {
  sauver(null);
  sauver(await post<Jetons>("/api/auth/connexion", { email: email.trim().toLowerCase(), password }));
}

export const oublierJetons = () => sauver(null);
export const aDesJetons = () => jetons !== null;

/** Liste paginée de DRF. */
export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };
