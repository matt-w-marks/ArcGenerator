const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

const User = sequelize.define(
  'User',
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: true },
    role: { type: DataTypes.ENUM('ADMIN', 'OPERATOR', 'VIEWER'), allowNull: false, defaultValue: 'OPERATOR' },
    first_name: { type: DataTypes.STRING(64), allowNull: true },
    last_name: { type: DataTypes.STRING(64), allowNull: true },
    phone: { type: DataTypes.STRING(32), allowNull: true },
    failed_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    locked_until: { type: DataTypes.DATE, allowNull: true },
    password_changed_at: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: 'users', underscored: true }
);

module.exports = User;
