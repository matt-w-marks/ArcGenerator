const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

const LoginAttempt = sequelize.define(
  'LoginAttempt',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    email: { type: DataTypes.STRING(255), allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: true },
    ip_address: { type: DataTypes.STRING(45), allowNull: true },
    attempted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    succeeded: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { tableName: 'login_attempts', underscored: true, timestamps: false }
);

module.exports = LoginAttempt;
