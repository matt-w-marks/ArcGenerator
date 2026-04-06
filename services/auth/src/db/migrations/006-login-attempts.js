const { DataTypes } = require('sequelize');

async function up(queryInterface) {
  await queryInterface.createTable('login_attempts', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    email: { type: DataTypes.STRING(255), allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: true },
    ip_address: { type: DataTypes.STRING(45), allowNull: true },
    attempted_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    succeeded: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  });

  await queryInterface.addIndex('login_attempts', ['email', 'attempted_at'], {
    name: 'idx_login_attempts_email_time',
  });
  await queryInterface.addIndex('login_attempts', ['user_id'], {
    name: 'idx_login_attempts_user_id',
  });
}

async function down(queryInterface) {
  await queryInterface.dropTable('login_attempts');
}

module.exports = { up, down };
