const app = require('./app');
const { migrate } = require('./db/migrate');
const { seed } = require('./db/seed');

const PORT = process.env.PORT || 3001;

async function main() {
  await migrate();
  await seed();
  app.listen(PORT, () => {
    console.log(`Auth service running on :${PORT}`);
  });
}

main().catch((err) => {
  console.error('Auth service failed to start:', err.message);
  process.exit(1);
});
