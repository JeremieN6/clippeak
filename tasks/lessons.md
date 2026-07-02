# Lessons Learned

> Ce fichier est mis a jour apres CHAQUE correction faite par l utilisateur.
> But : ne plus refaire les memes erreurs. Relu au debut de chaque session.

---

## Format

### [DATE] Titre du probleme
**Probleme** : Description de ce qui a mal tourne.
**Cause racine** : Pourquoi c est arrive.
**Solution** : Ce qui a ete fait pour corriger.
**Regle** : La regle a suivre desormais pour eviter ce cas.

---

## Lecons

<!-- Les entrees seront ajoutees ici au fil du temps -->

### [2026-07-02] Landing non conforme au brief
**Probleme** : La landing a ete livree en monolithe et ne respectait pas la structure sectionnelle demandee.
**Cause racine** : Priorite mise sur la livraison rapide au lieu d un alignement strict avec le brief et les contraintes UX explicites.
**Solution** : Refactor complet en 1 composant par section, navbar avec ancres de navigation + CTA principal, et validation build/erreurs avant livraison.
**Regle** : Pour toute landing detaillee, implementer la structure exacte du brief section par section des la premiere passe, puis verifier les erreurs IDE avant de presenter le resultat.
