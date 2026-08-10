"use strict";

const { createConnection } = require("../db");
const { defineFarmer } = require("./farmer");
const { definePurchase } = require("./purchase");

function buildModels(storage = ":memory:") {
  const sequelize = createConnection(storage);

  const Farmer = defineFarmer(sequelize);
  const Purchase = definePurchase(sequelize);

  Farmer.hasMany(Purchase, { foreignKey: "farmerId" });
  Purchase.belongsTo(Farmer, { foreignKey: "farmerId" });

  return { sequelize, Farmer, Purchase };
}

module.exports = { buildModels };
