const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');
const User = require('./User');

const RefreshToken = sequelize.define(
  'RefreshToken',
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    token_hash: { type: DataTypes.STRING(64), allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: 'refresh_tokens', underscored: true, updatedAt: false }
);

RefreshToken.belongsTo(User, { foreignKey: 'user_id' });
User.hasMany(RefreshToken, { foreignKey: 'user_id' });

module.exports = RefreshToken;
