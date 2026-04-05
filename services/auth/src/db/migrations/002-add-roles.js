/**
 * Add OPERATOR and VIEWER roles to the users role enum.
 * PostgreSQL enums can only be extended with ADD VALUE (not removed).
 */

async function up(queryInterface) {
  // PostgreSQL ALTER TYPE ... ADD VALUE is not transactional,
  // so we use raw sequelize query (Sequelize has no ORM method for ALTER TYPE).
  const seq = queryInterface.sequelize;
  await seq.query("ALTER TYPE \"enum_users_role\" ADD VALUE IF NOT EXISTS 'OPERATOR'");
  await seq.query("ALTER TYPE \"enum_users_role\" ADD VALUE IF NOT EXISTS 'VIEWER'");
}

async function down() {
  // PostgreSQL does not support removing values from an enum.
  // Downgrade would require recreating the type, which is destructive.
  // Intentionally no-op.
}

module.exports = { up, down };
