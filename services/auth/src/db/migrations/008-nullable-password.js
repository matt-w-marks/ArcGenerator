async function up(queryInterface) {
  await queryInterface.sequelize.query(
    'ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL'
  );
}

async function down(queryInterface) {
  await queryInterface.sequelize.query(
    'ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL'
  );
}

module.exports = { up, down };
