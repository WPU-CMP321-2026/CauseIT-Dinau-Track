"use strict";

const { DataTypes } = require("sequelize");

// Unchanged from Week 3.
function definePurchase(sequelize) {
  return sequelize.define("Purchase", {
    weightKg: {
      type: DataTypes.FLOAT,
      allowNull: false,
      validate: { min: 0.01 },
    },
    pricePerKg: {
      type: DataTypes.FLOAT,
      allowNull: false,
      validate: { min: 0.01 },
    },
    purchasedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });
}

module.exports = { definePurchase };
