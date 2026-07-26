module.exports = {
  apps: [
    {
      name: 'mymigo-beta',
      script: 'dist/server/src/index.js',
      interpreter: 'C:\\Program Files\\nodejs\\node.exe',
      cwd: 'C:\\apps\\FriendScape-beta\\server',
      watch: false,
      max_memory_restart: '500M',
    },
  ],
};
