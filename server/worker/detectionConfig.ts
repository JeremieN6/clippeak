import { readEnv } from '../utils/env'

// Reglages de la detection par le contenu, lus a chaque appel (le worker lit .env.local via readEnv).
// Repli sur Whisper local : OFF par defaut. Le serveur n'a que 2 coeurs et une tranche locale peut durer 20 minutes pendant lesquelles aucun clip
// n'est rendu ; on ne l'active qu'a la demande (WORKER_LOCAL_FALLBACK=1).
export const localFallbackEnabled = () => readEnv('WORKER_LOCAL_FALLBACK') === '1'
export const groqKey = () => readEnv('GROQ_API_KEY') || ''
// Il faut un moyen de transcrire : la cle Groq, ou le repli local autorise.
export const transcriptionConfigured = () => Boolean(groqKey()) || localFallbackEnabled()
// Sans moyen de transcrire, la detection par le contenu ne tourne pas : le chat seul fait le travail, comme avant.
export const contentDetectionEnabled = () => readEnv('WORKER_CONTENT_DETECTION') !== '0' && transcriptionConfigured()
