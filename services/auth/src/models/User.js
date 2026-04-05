const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

const User = sequelize.define(
  'User',
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    role: { type: DataTypes.ENUM('ADMIN', 'OPERATOR', 'VIEWER'), allowNull: false, defaultValue: 'OPERATOR' },
    failed_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    locked_until: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: 'users', underscored: true }
);

module.exports = User;
