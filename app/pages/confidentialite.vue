<script setup lang="ts">
useHead({ title: 'Politique de confidentialité – Clippeak' })
</script>

<template>
  <LegalLayout title="Politique de confidentialité" updated="28 octobre 2026">
    <p>Clippeak transforme les lives et les VODs Twitch d’un streamer en clips verticaux, que le streamer valide avant toute publication. Cette page explique quelles données Clippeak utilise, pourquoi, et comment les faire effacer.</p>

    <h2>Qui est responsable</h2>
    <p>Le service est édité par Clippeak (voir les <NuxtLink to="/conditions#editeur">informations sur l’éditeur</NuxtLink>). Pour toute question sur tes données : <a href="mailto:contact.clippeak@sassify.fr">contact.clippeak@sassify.fr</a>.</p>

    <h2>Les données que nous utilisons</h2>
    <ul>
      <li><strong>Connexion avec Twitch :</strong> ton pseudo et ton identifiant Twitch. Aucune autre permission n’est demandée et le jeton Twitch n’est pas conservé.</li>
      <li><strong>Ta chaîne Twitch :</strong> les lives et les VODs publics de ta chaîne, et le chat associé, pour repérer les bons moments.</li>
      <li><strong>Ce que tu déposes :</strong> clips de référence, photos, vidéos d’illustration (B-roll), sons, et tes réglages (titre, sous-titres, détection, plateformes choisies).</li>
      <li><strong>Les clips produits :</strong> les vidéos générées, leur titre, leur légende et ta décision (approuvé, refusé).</li>
      <li><strong>Technique :</strong> un cookie de session, indispensable pour rester connecté. Il n’est lu que par notre serveur.</li>
      <li><strong>Mesure d’audience :</strong> le site public utilise PostHog pour comprendre comment il est utilisé (pages vues, clics sur le parcours d’essai).</li>
    </ul>

    <h2>Tes photos et la reconnaissance du visage</h2>
    <p>Si tu ajoutes des photos, Clippeak compare ton visage à celui qui apparaît sur la vidéo pour te garder bien cadré. Ce calcul est fait sur nos propres serveurs : les photos ne sont envoyées à aucun service tiers pour cela. En déposant tes photos, tu consens à ce traitement. Tu peux les supprimer à tout moment depuis ton espace : le cadrage automatique est alors désactivé et un cadrage manuel est utilisé.</p>

    <h2>Pourquoi nous les utilisons</h2>
    <ul>
      <li>Te connecter et réserver ton espace.</li>
      <li>Analyser tes lives, produire tes clips et te les proposer pour validation.</li>
      <li>Apprendre ce qui fonctionne chez toi à partir de tes clips de référence.</li>
      <li>Publier un clip sur une plateforme que tu as connectée, uniquement quand tu l’as demandé.</li>
    </ul>

    <h2>Services tiers</h2>
    <ul>
      <li><strong>Twitch :</strong> connexion et lecture des données publiques de ta chaîne.</li>
      <li><strong>Hébergement :</strong> base de données (Neon) et serveur privé virtuel pour le calcul et le stockage des fichiers.</li>
      <li><strong>API Claude (Anthropic) :</strong> lorsque cette option est activée, des extraits de transcription et des images de tes clips peuvent être envoyés pour aider à noter les moments et analyser tes références.</li>
      <li><strong>PostHog :</strong> mesure d’audience du site public.</li>
    </ul>
    <p>Nous ne vendons pas tes données et ne les utilisons pas pour de la publicité.</p>

    <h2>Publication sur YouTube, TikTok et Instagram</h2>
    <p>Tu peux connecter ton compte YouTube (TikTok et Instagram arriveront plus tard). Clippeak ne publie qu’un clip que tu as approuvé, au moment que tu as choisi. Les accès obtenus sont stockés de manière chiffrée et ne servent qu’à publier tes clips. Tu peux déconnecter une plateforme à tout moment depuis « Tes plateformes » ; l’accès est alors supprimé de chez nous.</p>
    <p><strong>YouTube.</strong> Clippeak utilise les services d’API YouTube (YouTube API Services) pour envoyer sur ta chaîne les clips que tu as approuvés. En connectant YouTube, tu acceptes les <a href="https://www.youtube.com/t/terms" rel="noopener" target="_blank">conditions d’utilisation de YouTube</a>, et tes données sont aussi traitées selon les <a href="https://policies.google.com/privacy" rel="noopener" target="_blank">règles de confidentialité de Google</a>. Clippeak demande une seule autorisation : envoyer des vidéos sur ta chaîne. Il ne lit, ne modifie et ne supprime aucune vidéo, playlist, commentaire ni donnée de ta chaîne ; il conserve seulement le jeton d’accès chiffré et le nom du compte connecté, jamais partagés avec des tiers.</p>
    <p>Pour retirer l’accès de Clippeak à ton compte Google, en plus de « Déconnecter » dans Clippeak, tu peux passer par la <a href="https://security.google.com/settings/security/permissions" rel="noopener" target="_blank">page des autorisations de sécurité de Google</a>. Quand tu déconnectes YouTube ou supprimes ton compte, le jeton est révoqué chez Google et effacé de chez nous immédiatement ; les données obtenues via l’API YouTube ne sont jamais conservées plus de 30 jours après le retrait de l’accès.</p>

    <h2>Combien de temps nous gardons tes données</h2>
    <p>Tes données sont conservées tant que ton compte existe. Si ton invitation est retirée, tes sessions sont fermées et tes données restent en attente de ta demande de suppression. Tu peux exporter tes données ou supprimer ton compte toi-même dans le studio (menu du compte > « Mes données ») : la suppression efface ton compte, tes fichiers, tes réglages, tes clips et tes accès aux plateformes.</p>

    <h2>Tes droits</h2>
    <p>Tu peux demander l’accès à tes données, leur correction, leur export ou leur suppression, et retirer ton consentement pour les photos, en écrivant à <a href="mailto:contact.clippeak@sassify.fr">contact.clippeak@sassify.fr</a>. Tu peux aussi introduire une réclamation auprès de la CNIL.</p>

    <h2>Modifications</h2>
    <p>Si cette politique change de façon importante, la date ci-dessus sera mise à jour et les utilisateurs connectés seront prévenus.</p>
  </LegalLayout>
</template>
