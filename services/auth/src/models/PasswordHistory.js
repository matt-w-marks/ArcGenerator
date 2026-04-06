const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

const PasswordHistory = sequelize.define(
  'PasswordHistory',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    user_id: { type: DataTypes.UUID, allowNull: false },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    changed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { tableName: 'password_history', underscored: true, timestamps: false }
);

module.exports = PasswordHistory;
