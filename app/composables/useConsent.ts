import { CONSENT_KEY, parseConsent, serializeConsent, type ConsentState } from '~~/server/utils/clipping/consent'

// Etat du consentement a la mesure d'audience, partage par le bandeau, le plugin d'analyse et les liens « Gerer mes cookies ».
// Variables au niveau du module : une seule instance pour toute l'application (cote navigateur).
const state = ref<ConsentState>('pending')
const ready = ref(false)

export function useConsent() {
  function load() {
    try { state.value = parseConsent(localStorage.getItem(CONSENT_KEY), Date.now()) } catch { state.value = 'pending' }
    ready.value = true
  }
  function set(value: 'granted' | 'denied') {
    state.value = value
    try { localStorage.setItem(CONSENT_KEY, serializeConsent(value, Date.now())) } catch { /* navigation privee : le choix dure jusqu'a la fermeture de l'onglet */ }
  }
  // « Gerer mes cookies » : on efface le choix, la mesure s'arrete et le bandeau revient.
  function reopen() {
    state.value = 'pending'
    try { localStorage.removeItem(CONSENT_KEY) } catch { /* rien a effacer */ }
  }
  return { state, ready, load, accept: () => set('granted'), refuse: () => set('denied'), reopen }
}
