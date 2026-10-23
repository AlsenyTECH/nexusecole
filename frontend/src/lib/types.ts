export type Config = {
  nom: string; ville: string; logo_url: string; couleur_primaire: string; couleur_secondaire: string;
  modules: string[]; statut: string; lecture_seule: boolean;
};
export type Moi = { id: number; email: string; prenom: string; nom: string; telephone: string; role: string; permissions?: string[] };
export type Annee = { id: number; libelle: string; debut: string; fin: string; active: boolean };
export type Classe = { id: number; annee: number; nom: string; niveau: string; bareme: number; effectif: number };
export type Eleve = {
  id: number; matricule: string; prenom: string; nom: string; sexe: "F" | "M"; date_naissance: string | null;
  classe: number | null; classe_nom: string | null; telephone_parent: string; actif: boolean;
};
export type Inscription = {
  id: number; eleve: number; eleve_nom: string; classe: number; classe_nom: string; annee: number;
  date_inscription: string; statut: string; reduction_pct: number; motif_reduction: string;
};
export type Echeance = { id: number; libelle: string; montant: number; date_limite: string; paye: number; reste: number };
export type Situation = {
  inscription: number; eleve: string; classe: string; total: number; paye: number; reste: number; en_retard: number;
  echeances: Echeance[];
};
export type Paiement = {
  id: number; numero_recu: string; inscription: number; eleve: string; montant: number; moyen: string; reference: string;
  observation: string; encaisse_par_nom: string; encaisse_le: string; annule: boolean; motif_annulation: string; annule_le: string | null;
};
export type Frais = {
  id: number; annee: number; libelle: string; categorie: string; montant: number; periodicite: "unique" | "mensuel";
  nombre_echeances: number; premiere_echeance: string; niveaux: string[]; actif: boolean;
};
export type Personnel = {
  id: number; email: string; prenom: string; nom: string; telephone: string; role: string; is_active: boolean; last_login: string | null;
};
export type Periode = { id: number; annee: number; nom: string; ordre: number; debut: string; fin: string };
export type Matiere = { id: number; nom: string; code: string };
export type Cours = {
  id: number; classe: number; classe_nom: string; matiere: number; matiere_nom: string; coefficient: string;
  enseignant: number | null; enseignant_nom: string;
};
export type Evaluation = {
  id: number; cours: number; periode: number; type: "devoir" | "composition"; titre: string; date: string; sur: number;
  nb_notes: number; a_valider: number;
};
export type LigneNote = { inscription: number; eleve: string; matricule: string; valeur: number | null; absent: boolean; statut: string | null };
export type ResultatMatiere = {
  cours: number; matiere: string; coefficient: number; enseignant: string; devoirs: number | null; composition: number | null;
  moyenne: number | null; points: number | null; rang: number | null;
};
export type ResultatEleve = {
  inscription: number; eleve: string; matricule: string; prenom: string; nom: string; matieres: ResultatMatiere[];
  moyenne: number | null; rang: number | null; mention: string; absences: number; absences_justifiees: number; retards: number;
};
export type Resultats = {
  classe: string; periode: string; annee: string; bareme: number; effectif: number; verrouille: boolean;
  statistiques: { moyenne_classe: number | null; plus_forte: number | null; plus_faible: number | null; admis: number };
  eleves: ResultatEleve[];
};
export type Bulletin = {
  id: number; inscription: number; periode: number; empreinte: string; code: string; emis_le: string;
  contenu: Omit<ResultatEleve, "inscription" | "prenom" | "nom"> & {
    ecole: string; annee: string; periode: string; classe: string; effectif: number; bareme: number;
    statistiques: Resultats["statistiques"];
  };
};
