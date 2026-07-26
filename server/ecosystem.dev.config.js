module.exports = {
  apps: [
    {
      name: 'mymigo-dev',
      script: 'dist/server/src/index.js',
      interpreter: 'C:\\Program Files\\nodejs\\node.exe',
      cwd: 'C:\\apps\\FriendScape\\server',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
