const { DataTypes } = require('sequelize');

async function up(queryInterface) {
  await queryInterface.createTable('invites', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    token: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    role: {
      type: DataTypes.ENUM('ADMIN', 'OPERATOR', 'VIEWER'),
      allowNull: false,
    },
    email: { type: DataTypes.STRING(255), allowNull: true },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    used_at: { type: DataTypes.DATE, allowNull: true },
    created_by: { type: DataTypes.UUID, allowNull: true },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  await queryInterface.addIndex('invites', ['token'], { name: 'idx_invites_token' });
}

async function down(queryInterface) {
  await queryInterface.dropTable('invites');
}

module.exports = { up, down };
