const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const authService = require('../services/authService');

async function seed() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.warn('ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin seed');
    return;
  }

  const existing = await User.findOne({ where: { email: adminEmail } });
  if (existing) return;

  const password_hash = await authService.hashPassword(adminPassword);
  await User.create({ id: uuidv4(), email: adminEmail, password_hash, role: 'ADMIN' });
  console.log(`Admin user seeded: ${adminEmail}`);
}

module.exports = { seed };
