// Worker de rendu : process separe du serveur Nuxt. Demarrage manuel tant que le rendu reel n'existe pas :
//   npm run build:worker && pm2 start ecosystem.worker.config.cjs
module.exports = {
  apps: [
    {
      name: 'clippeak-worker',
      script: '.output/worker/index.cjs',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      kill_timeout: 30000,
      max_memory_restart: '600M',
      env: { NODE_ENV: 'production' }
    }
  ]
}
