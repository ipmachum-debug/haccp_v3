const bcrypt = require('bcryptjs');
const { execSync } = require('child_process');

async function main() {
  const hash = await bcrypt.hash('asdf1004!', 10);
  console.log('New hash:', hash);
  const cmd = `mysql -u root -pGolden1004 haccp_tenant_db -e "UPDATE users SET password_hash='${hash}' WHERE email='sysk0707@naver.com'" 2>/dev/null`;
  execSync(cmd);
  console.log('Password updated for sysk0707@naver.com');
}
main();
