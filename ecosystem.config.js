module.exports = {
    apps: [
        {
            name: 'devagent:3009',
            script: 'server/src/index.js',
            watch: ['server/src'],
            ignore_watch: ['node_modules', 'projects'],
            log_date_format: 'DD-MM-YYYY HH:mm:ss Z',
            env: {
                NODE_ENV: 'development',
                PORT: 3009
            }
        },
        {
            name: 'devagent:5173',
            cwd: 'client',
            script: 'node',
            args: 'node_modules/vite/bin/vite.js',
            watch: false,
            env: {
                NODE_ENV: 'development'
            }
        }
    ]
};
