import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Polices proposees au streamer pour le titre et les sous-titres. Le streamer choisit dans une liste (jamais un nom a saisir) :
// les fichiers sont fournis avec l'application (dossier public/fonts, licences libres) et donnes a ffmpeg au rendu ;
// les memes fichiers servent a l'apercu dans le navigateur, donc ce qu'il voit est ce qui est rendu.
export interface FontChoice {
  // Nom de famille de la police (valeur enregistree dans la DA et utilisee par ffmpeg).
  family: string
  // Ce que voit le streamer.
  label: string
  // Un mot sur le style.
  note: string
  // Fichier dans le dossier des polices ; absent = police deja installee sur le serveur (Lato).
  file?: string
}

export const FONT_CHOICES: FontChoice[] = [
  { family: 'Luckiest Guy', label: 'Luckiest Guy', note: 'Ludique, style bande dessinee (par defaut)', file: 'LuckiestGuy-Regular.ttf' },
  { family: 'Lato', label: 'Lato', note: 'Classique et lisible', file: 'Lato-Bold.ttf' },
  { family: 'Archivo Black', label: 'Archivo Black', note: 'Gras et moderne, tres lisible', file: 'ArchivoBlack-Regular.ttf' },
  { family: 'Poppins', label: 'Poppins', note: 'Rond et amical', file: 'Poppins-Bold.ttf' },
  { family: 'Anton', label: 'Anton', note: 'Epais et percutant, tres « YouTube »', file: 'Anton-Regular.ttf' },
  { family: 'Bebas Neue', label: 'Bebas Neue', note: 'Majuscules etroites, style affiche', file: 'BebasNeue-Regular.ttf' },
  { family: 'Barlow Condensed', label: 'Barlow Condensed', note: 'Etroit et energique', file: 'BarlowCondensed-Bold.ttf' }
]

export const bundledFontsDir = () => resolve(process.env.CLIPPEAK_FONTS_DIR || join(process.cwd(), 'public', 'fonts'))

// Lato est installee sur le serveur ; les autres ne sont proposees que si leur fichier est bien present (jamais de choix qui ne s'afficherait pas).
export function availableFonts(dir: string = bundledFontsDir()): FontChoice[] {
  return FONT_CHOICES.filter(font => font.family === 'Lato' || (font.file && existsSync(join(dir, font.file))))
}

export const isAvailableFont = (family: string, dir?: string) => availableFonts(dir).some(font => font.family === family)
