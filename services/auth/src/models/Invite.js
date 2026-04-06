const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

const Invite = sequelize.define(
  'Invite',
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    token: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    role: { type: DataTypes.ENUM('ADMIN', 'OPERATOR', 'VIEWER'), allowNull: false },
    email: { type: DataTypes.STRING(255), allowNull: true },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    used_at: { type: DataTypes.DATE, allowNull: true },
    created_by: { type: DataTypes.UUID, allowNull: true },
  },
  { tableName: 'invites', underscored: true, updatedAt: false }
);

module.exports = Invite;
