module.exports = {
  apps: [{
    name: 'haccp_v3',
    script: './dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      DATABASE_URL: 'mysql://root:Golden1004@49.50.130.101:3306/haccp_tenant_db?charset=utf8mb4'
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
