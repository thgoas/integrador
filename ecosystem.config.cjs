module.exports = {
  apps: [
    {
      name: 'integrador-api',
      script: 'dist/index.js',
      cwd: '/home/thiago/integrador/backend',
      interpreter: 'node',
      interpreter_args: '--experimental-sqlite --env-file=/home/thiago/integrador/backend/.env',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
