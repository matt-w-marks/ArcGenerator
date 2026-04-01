const { DataTypes } = require('sequelize');
const sequelize = require('./sequelize');
const migrations = require('./migrations');

// ORM model for migration tracking — no raw SQL
const AuthMigration = sequelize.define(
  'AuthMigration',
  {
    name: { type: DataTypes.STRING(256), primaryKey: true },
    run_at: { type: DataTypes.DATE, allowNull: false },
  },
  { tableName: 'auth_migrations', timestamps: false }
);

async function migrate() {
  // Create meta table if absent (ORM sync — does not drop/alter existing tables)
  await AuthMigration.sync();

  const completed = await AuthMigration.findAll({ attributes: ['name'] });
  const done = new Set(completed.map((m) => m.name));

  const qi = sequelize.getQueryInterface();
  for (const migration of migrations) {
    if (!done.has(migration.name)) {
      await migration.up(qi);
      await AuthMigration.create({ name: migration.name, run_at: new Date() });
      console.log(`[migrate] applied: ${migration.name}`);
    }
  }
}

module.exports = { migrate };
