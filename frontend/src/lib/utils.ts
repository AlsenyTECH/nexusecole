import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { espace } from './ecole'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Ouvre un document (reçu, bulletin) dans un nouvel onglet en gardant la session :
 * window.open copie le sessionStorage de l'onglet courant, un lien target="_blank" rel="noreferrer" non.
 */
export function ouvrirDocument(chemin: string) {
  window.open(`${espace.base}${chemin}`, "_blank");
}
