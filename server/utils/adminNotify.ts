import { readEnv } from './env'
import { notifiersFromEnv } from './clipping/notifier'

// Message court a l'admin (Telegram / Discord) depuis le site, avec les memes variables que le worker. Ne bloque ni ne fait jamais echouer
// la requete du visiteur : sans canal configure ou en cas d'erreur, rien n'est envoye. Les erreurs ne contiennent aucun secret.
export async function notifyAdmin(text: string): Promise<void> {
  try {
    const { notifiers } = notifiersFromEnv(readEnv)
    for (const notifier of notifiers) {
      try {
        await notifier.sendText(text)
      } catch (error) {
        console.error(`[site] message ${notifier.name} en echec : ${error instanceof Error ? error.message : 'erreur'}`)
      }
    }
  } catch {
    // Configuration illisible : on ignore.
  }
}
