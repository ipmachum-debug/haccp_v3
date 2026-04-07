module.exports = {
  apps: [{
    name: 'haccpone',
    script: './dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: '3001',
      DATABASE_URL: 'mysql://root:G0ld3n!T1004%23Sec@127.0.0.1:3306/haccp_tenant_db?charset=utf8mb4',
      OPSCORE_DATABASE_URL: 'mysql://root:G0ld3n!T1004%23Sec@127.0.0.1:3306/opscore_db?charset=utf8mb4'
    },
    error_file: '/root/.pm2/logs/haccp-v3-error.log',
    out_file: '/root/.pm2/logs/haccp-v3-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s',
    listen_timeout: 10000,
    kill_timeout: 5000
  }]
};
