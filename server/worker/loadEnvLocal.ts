import { resolve } from 'node:path'
import { loadEnvFile } from '../utils/clipping/loadEnvFile'

// Module a importer EN PREMIER par le point d'entree du worker : charge les reglages autorises de .env.local dans
// process.env (WHISPER_PYTHON, CLIPPEAK_DATA_DIR...), que le reste du code lit directement. Sous un utilisateur dedie sans acces
// a .env.local, c'est le fichier d'environnement du processus (--env-file) qui les fournit et ce chargement est sans effet.
loadEnvFile(resolve(process.cwd(), '.env.local'))
