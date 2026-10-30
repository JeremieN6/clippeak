# Sauvegardes de Clippeak

Dernière mise à jour : 2026-10-30. Script : `scripts/ops/backup-data.sh` (testé en local : archive, exclusions, chiffrement, refus d'envoyer en clair, erreurs).

## Ce qui existe, ce qui est protégé
| Donnée | Où | Protégée par |
|---|---|---|
| Base de données (comptes, clips, votes, publications, jetons chiffrés) | Neon | Restauration à un instant donné de Neon : **6 h sur l'offre gratuite**, 1 jour (réglable jusqu'à 7) sur l'offre Launch, 30 jours sur Scale ([doc Neon](https://neon.com/docs/postgres/backup-restore/history-window)). Sur l'offre gratuite, une erreur découverte le lendemain est donc **irrécupérable** sans sauvegarde à nous. |
| Fichiers (photos, sons, illustrations, clips rendus) | `/srv/saas/clippeak-data` sur le VPS | **Rien** avant ce script. |
| Code | GitHub | Dépôt. |
| Extraits de VOD, modèles de reconnaissance | `sources`, `hf`, `models` | Recréables : exclus de la sauvegarde. |

## Ce que fait le script (chaque nuit à 3 h 30)
1. Archive des fichiers (≈ 100 Mo aujourd'hui) puis `pg_dump` de la base, via l'adresse **directe** de Neon (l'adresse « -pooler » ne convient pas à `pg_dump`).
2. **Chiffrement AES-256** (openssl) quand une phrase secrète est configurée : les photos montrent des visages, elles ne quittent jamais le serveur en clair.
3. Rotation locale : 7 jours gardés dans `/var/backups/clippeak`.
4. Copie hors serveur (si un « remote » rclone est configuré) : uniquement des fichiers chiffrés. Sans phrase secrète, l'envoi est **refusé** et le script sort en erreur.
5. Toute erreur est écrite dans `/var/log/clippeak-backup.log` et le script sort avec un code non nul.

Sans copie hors serveur, les archives protègent d'une erreur de suppression ou d'un bug, **pas de la perte du serveur**.

## État au 2026-10-30
- **Installé sur le VPS** : script `/usr/local/sbin/clippeak-backup-data.sh`, réglages root-only dans `/etc/clippeak-backup/`, tâche cron à 3 h 30, premier essai réussi (archive chiffrée des fichiers, 96 Mo, relecture vérifiée).
- **Pas encore sauvegardée : la base.** Neon tourne en **PostgreSQL 18.6** et le serveur n'a que `pg_dump` 16 : `pg_dump` refuse ("server version mismatch"). Il faut installer `postgresql-client-18` depuis le dépôt officiel PostgreSQL (PGDG), ce qui ajoute une source de paquets au serveur partagé : l'assistant a été **bloqué** par le contrôle de sécurité quand il a voulu le faire. Commandes à lancer soi-même en root :
  ```bash
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main" > /etc/apt/sources.list.d/pgdg.list
  apt-get update && apt-get install -y postgresql-client-18
  /usr/local/sbin/clippeak-backup-data.sh   # doit maintenant afficher « base : … »
  ```
  (Le script choisit tout seul le `pg_dump` le plus récent installé. Le client n'installe aucun serveur et ne touche pas au `pg_dump` 16 existant.)
- **Pas encore de copie hors serveur** (choix de la destination en cours).
- La phrase secrète est dans `secrets-local/clippeak-backup-phrase.txt` sur le PC du porteur (hors git) : à copier dans un gestionnaire de mots de passe puis à supprimer du PC.

## Installation sur le VPS (à faire une fois, en root)
```bash
# 1. dossier de réglages DEDIE, lisible par root seulement (ne pas utiliser /etc/clippeak : le worker y lit worker.env)
install -d -m 700 /etc/clippeak-backup
# 2. phrase secrète : 40 caractères aléatoires. À COPIER AUSSI DANS TON GESTIONNAIRE DE MOTS DE PASSE :
#    sans elle, les sauvegardes chiffrées sont illisibles.
openssl rand -base64 30 > /etc/clippeak-backup/backup.pass && chmod 600 /etc/clippeak-backup/backup.pass
# 3. réglages
cat > /etc/clippeak-backup/backup.env <<'EOF'
BACKUP_PASSPHRASE_FILE=/etc/clippeak-backup/backup.pass
# RCLONE_REMOTE=r2:clippeak-backups   (à activer après l'installation de rclone, voir plus bas)
EOF
chmod 600 /etc/clippeak-backup/backup.env
# 4. essai à la main : doit finir par « fichiers : … » et « base : … », sans ERREUR
/usr/local/sbin/clippeak-backup-data.sh
ls -la /var/backups/clippeak
# 5. planification (copie du script hors du dossier deploye : un deploiement ne la change pas)
install -m 755 /srv/saas/clippeak/scripts/ops/backup-data.sh /usr/local/sbin/clippeak-backup-data.sh
( crontab -l 2>/dev/null; echo '30 3 * * * /usr/local/sbin/clippeak-backup-data.sh >> /var/log/clippeak-backup.log 2>&1' ) | crontab -
```
La phrase secrète doit être **sauvegardée ailleurs** (gestionnaire de mots de passe) au moment de sa création : `cat /etc/clippeak-backup/backup.pass`.

## Copie hors serveur : Cloudflare R2 ou Backblaze B2 (via rclone)
Les deux ont un quota gratuit récurrent de 10 Go, largement suffisant pour des archives chiffrées de quelques centaines de Mo (R2 : 10 Go-mois gratuits, sortie de données gratuite ; B2 : 10 Go gratuits, puis environ 6 $ le To et par mois). À confirmer sur les pages de prix au moment de créer le compte.
1. Créer le compte et un **bucket privé** `clippeak-backups`, puis une **clé d'accès limitée à ce bucket** (lecture et écriture, rien d'autre).
2. Sur le VPS : `apt install rclone` ; `rclone config` > nouveau remote `r2` (type S3, fournisseur Cloudflare) ou `b2` ; coller l'identifiant et la clé.
3. Test : `rclone lsd r2:` doit afficher le bucket.
4. Décommenter `RCLONE_REMOTE=r2:clippeak-backups` dans `/etc/clippeak-backup/backup.env`, relancer le script à la main et vérifier « copie hors serveur ».
5. **Tester une restauration** (voir plus bas) avant de considérer que c'est fini.

## Restaurer
```bash
# fichiers (sur un dossier vide, jamais sur le dossier vivant sans arrêter le worker)
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:/etc/clippeak-backup/backup.pass -in files-AAAAMMJJ-HHMM.tar.gz.enc | tar -xzf - -C /srv/saas/clippeak-data-restauration
# base (vers une base VIDE, par exemple une branche Neon créée pour l'occasion)
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:/etc/clippeak-backup/backup.pass -in db-AAAAMMJJ-HHMM.sql.gz.enc | gunzip | psql "<adresse de la base vide>"
```
Faire cet essai une première fois **maintenant** sur une base vide : une sauvegarde jamais restaurée n'est pas une sauvegarde.

## Conservation (décisions)
- Archives locales : 7 jours. Copie hors serveur : 7 jours (le script ne copie que les archives récentes ; réglable avec `BACKUP_KEEP_DAYS`).
- Vidéos des clips refusés ou en échec : supprimées après 14 jours (`server/worker/retention.ts`).
- Compte supprimé par le streamer : tout est effacé du serveur et de la base tout de suite ; **ses données restent dans les archives jusqu'à 7 jours** (à dire dans la politique de confidentialité si on veut être exact).
