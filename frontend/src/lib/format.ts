// Pays de l'école (fixé au chargement de sa configuration) : monnaie et indicatif téléphonique.
// Par défaut, et dans la console éditeur : Sénégal, FCFA.
export const pays = { devise: "FCFA", indicatif: "221", chiffres: 9 };
export function definirPays(c: { devise?: string; indicatif?: string; chiffres_telephone?: number }) {
  if (c.devise) pays.devise = c.devise;
  if (c.indicatif) pays.indicatif = c.indicatif;
  if (c.chiffres_telephone) pays.chiffres = c.chiffres_telephone;
}

/** Montant dans la monnaie de l'école (FCFA, GNF, GMD, MRU…). */
export const fcfa = (n: number | null | undefined) =>
  n == null ? "…" : new Intl.NumberFormat("fr-FR").format(n).replace(/ /g, " ") + "\u00a0" + pays.devise;

export const date = (iso: string | null | undefined, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("fr-FR", options) : "—";

export const dateHeure = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export const aujourdhui = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-JJ, heure locale

export const MOYENS: Record<string, string> = {
  portefeuille: "Porte-monnaie de la carte",
  especes: "Espèces", wave: "Wave", orange_money: "Orange Money", free_money: "Free Money",
  virement: "Virement", cheque: "Chèque",
};

export const ROLES: Record<string, string> = {
  directeur: "Directeur", secretaire: "Secrétariat", comptable: "Comptable / Caissier", enseignant: "Enseignant",
  surveillant: "Surveillant", parent: "Parent", eleve: "Élève", superadmin: "Super-admin",
};

export const CATEGORIES_FRAIS: Record<string, string> = {
  inscription: "Inscription", scolarite: "Scolarité (mensualités)", transport: "Transport scolaire", cantine: "Cantine",
  etudes: "Études surveillées / renfort", garderie: "Garderie", club: "Activités périscolaires / clubs", tenue: "Tenue / uniforme",
  fournitures: "Fournitures / manuels", assurance: "Assurance", ape: "Cotisation APE", examen: "Frais d'examen",
  sortie: "Sortie pédagogique", medical: "Visite médicale", carte: "Carte scolaire (remplacement)", autre: "Autre",
};
/** Catégories proposées par défaut comme services à la carte (l'école décide). */
export const CATEGORIES_SERVICES = ["transport", "cantine", "etudes", "garderie", "club", "sortie"];
