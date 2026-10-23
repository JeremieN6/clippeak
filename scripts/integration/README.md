# Tests d'integration (base jetable)

Ils rejouent **toutes les migrations** du depot sur un Postgres en memoire (PGlite) : rien n'est ecrit sur Neon.

```bash
npm i --no-save @electric-sql/pglite @electric-sql/pglite-socket   # sans modifier package.json
npm run test:integration
```

- `db-it.mjs` : stores Prisma (prise en charge d'une VOD, lots de 4, file de rendu, contexte d'un clip, resultat, banque de reference, preflight).
- `api-it.mjs` : vrai serveur Nitro (`npx nuxt build` avant) et routes `/api/studio/*` : authentification, validation, depots de fichiers, videos a jeton signe (Range), validation humaine. L'import de la banque de reference appelle la vraie API Twitch si `TWITCH_CLIENT_ID` et `TWITCH_CLIENT_SECRET` sont definis.

PGlite n'accepte qu'une connexion a la fois : `api-it.mjs` utilise le SQL direct pour preparer et verifier les donnees, et `pgbouncer=true` cote serveur pour eviter les requetes preparees nommees.
