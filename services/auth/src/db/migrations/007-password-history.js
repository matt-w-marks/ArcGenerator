const { DataTypes } = require('sequelize');

async function up(queryInterface) {
  await queryInterface.createTable('password_history', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    changed_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  await queryInterface.addIndex('password_history', ['user_id', 'changed_at'], {
    name: 'idx_password_history_user_id',
  });

  await queryInterface.addColumn('users', 'password_changed_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });
}

async function down(queryInterface) {
  await queryInterface.removeColumn('users', 'password_changed_at');
  await queryInterface.dropTable('password_history');
}

module.exports = { up, down };
