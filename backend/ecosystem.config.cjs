module.exports = {
  apps: [
    {
      name: 'integrador-backend',
      script: 'dist/index.js',
      cwd: __dirname,
      node_args: '--experimental-sqlite',
      restart_delay: 3000,
      max_restarts: 5,
    },
  ],
}
