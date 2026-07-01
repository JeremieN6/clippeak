CLIPPEAK — Brief de développement V1
Tu vas construire Clippeak, un outil de clipping automatique pour VODs Twitch. Pour cette V1, l'objectif est de valider le concept : c'est une landing page interactive avec un flow simulé (fake processing) pour tester l'intérêt avant de construire le vrai backend.
Stack

Nuxt 3, Vue 3, Tailwind CSS. Pas de backend réel pour cette V1, tout est simulé côté client.
Design / DA

Fond très sombre quasi noir (#0a0a0f)
Halo violet flou au centre du hero (effet lumière qui émane, texture en arrière plan, blur CSS)
Accent principal violet Twitch (#7c3aed)
Typographie bold, grandes tailles, peu de mots
Ambiance : dark avec accents vifs, TikTok energy, hype et punchy
Ton copywriting : court, percutant, viral

Structure de la page

Hero

Logo + nom "Clippeak"
Tagline : "Tes meilleurs moments. En clips. Automatiquement."
Input URL avec validation fake : vérifier que c'est bien un domaine twitch.tv et que l'URL contient /videos/ suivi d'un identifiant numérique. Afficher un message d'erreur clair si ce n'est pas le cas, un message de succès vert si c'est valide.
Bouton "Générer des clips viraux"


Flow de traitement (s'affiche après soumission de l'URL)

Message : "Ne ferme pas cet onglet pendant que Clippeak travaille. Tu seras notifié dès que tes clips sont prêts."
Barre de progression globale
Étapes affichées séquentiellement avec statut (en attente / en cours / terminé) :

Analyse de la VOD (faux pourcentage qui monte vite, genre 0→100% en 4s pour impressionner, donner l'impression que l'outil est puissant car il traite un long stream est peu de temps)
Téléchargement du chat Twitch
Détection des pics d'activité
Extraction des séquences vidéo
Création du ZIP


Estimation du temps restant (fake, mais crédible)
Durée totale simulée : environ 60 secondes (Applique une durée que tu estimes adapté)


Résultat

Message de succès
Nombre de clips détectés (nombre aléatoire entre 8 et 15)
Bouton "Télécharger mes clips (.zip)" — le clic déclenche un téléchargement d'un vrai fichier ZIP vide (ou avec un fichier texte readme.txt dedans expliquant que c'est la version bêta)
Transition fluide depuis l'écran de traitement


Section feedback (juste en dessous du bouton téléchargement)

Titre : "Aide-nous à construire la suite"
5-6 questions :

"Tu es ?" — Streamer / Clippeur (personne chargée de clipper pour un streamer) / Les deux
"Préférerais-tu recevoir le ZIP par mail ?" (Oui / Non)
"Préférerais-tu un outil 100% automatisé ? (le processus se lance seul après ton live, pas besoin de récupérer l'URL de la VOD à la main)" (Oui / Non / Peut-être)
"Sur quelle plateforme voudrais-tu recevoir tes clips ?" (Discord / Telegram / Mail / Autre)
"Combien de VODs traites-tu par mois environ ?" (1-2 / 3-5 / 6-10 / 10+)
Que manque t il à cet outil pour que tu l'utilises à sa sortie ? (Rien je suis chaud de l'utiliser / "Champs Libre") 

Ajoute une base PostgreSQL via Neon.tech pour stocker les feedbacks. Crée la table feedbacks avec les champs [colle la structure ci-dessus]. Utilise Prisma comme ORM. Crée une route API Nuxt /api/feedback en POST pour insérer les réponses. Ajoute une page /admin protégée par un mot de passe simple (défini en variable d'environnement ADMIN_PASSWORD) affichant les feedbacks en tableau avec les métriques clés : nombre total de réponses, pourcentage "oui" pour l'automatisation, répartition des plateformes, répartition des profils.


Champ email : "Je veux accéder en avant-première quand c'est prêt"
Bouton submit
Après submit : message de confirmation simple



Comportement général

Tout le processing est simulé avec des setTimeout et des timers progressifs
L'UI doit donner l'impression que l'outil est puissant et rapide
Responsive mobile
Pas d'auth, pas de compte, pas de backend
Les réponses du formulaire ne sont pas envoyées nulle part pour cette V1 (juste confirmation visuelle)


La table feedback
feedbacks
- id (uuid, primary key)
- version (varchar) -- 'v1', 'v2' etc.
- zip_par_mail (boolean)
- outil_automatise (enum: 'oui', 'non', 'peut-être')
- plateforme_reception (varchar) -- 'discord', 'telegram', 'mail', 'autre'
- plateforme_autre (varchar, nullable) -- si 'autre' précisé
- vods_par_mois (varchar) -- '1-2', '3-5', '6-10', '10+'
- profil (varchar) -- 'streamer', 'clippeur', 'les deux'
- manque (text, nullable) -- champ libre
- email (varchar, nullable)
- created_at (timestamp)