// Page « Prochainement » : regles de vote, sans acces base (testables). Un bloc oppose 2 fonctions ; un vote = +1 ;
// les votes conserves d'une fonction qui a deja perdu un bloc comptent en plus (carriedVotes).

export interface Tally { a: number, b: number }
export type Outcome = 'a' | 'b' | 'tie'

// Totaux d'un bloc : votes du bloc + votes reportes de chaque fonction.
export function tally(votes: Array<{ featureId: string }>, featureAId: string, featureBId: string, carriedA = 0, carriedB = 0): Tally {
  return {
    a: carriedA + votes.filter(v => v.featureId === featureAId).length,
    b: carriedB + votes.filter(v => v.featureId === featureBId).length
  }
}

// Egalite (y compris zero vote des deux cotes) : personne ne gagne tout seul, l'admin tranche.
export function outcome(t: Tally): Outcome {
  if (t.a === t.b) return 'tie'
  return t.a > t.b ? 'a' : 'b'
}

export const isDue = (endsAt: Date, now = new Date()) => endsAt.getTime() <= now.getTime()

// Pas plus de 5 idees par chaine et par jour.
export const IDEAS_PER_DAY = 5

export const FEATURE_STATUSES = ['backlog', 'voting', 'building', 'waiting_access', 'delivered'] as const
export type FeatureStatus = typeof FEATURE_STATUSES[number]

export const STATUS_LABELS: Record<FeatureStatus, string> = {
  backlog: 'Dans la liste',
  voting: 'En vote',
  building: 'En cours',
  waiting_access: 'En attente d’accès',
  delivered: 'Livré'
}
