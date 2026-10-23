export const fcfa = (n: number | null | undefined) =>
  n == null ? "…" : new Intl.NumberFormat("fr-FR").format(n).replace(/ /g, " ") + " FCFA";

export const date = (iso: string | null | undefined, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("fr-FR", options) : "—";

export const dateHeure = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export const aujourdhui = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-JJ, heure locale

export const MOYENS: Record<string, string> = {
  especes: "Espèces", wave: "Wave", orange_money: "Orange Money", free_money: "Free Money",
  virement: "Virement", cheque: "Chèque",
};

export const ROLES: Record<string, string> = {
  directeur: "Directeur", secretaire: "Secrétariat", comptable: "Comptable / Caissier", enseignant: "Enseignant",
  surveillant: "Surveillant", parent: "Parent", eleve: "Élève", superadmin: "Super-admin",
};

export const CATEGORIES_FRAIS: Record<string, string> = {
  inscription: "Inscription", scolarite: "Scolarité", tenue: "Tenue", assurance: "Assurance", ape: "APE", autre: "Autre",
};
