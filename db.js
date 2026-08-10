"use strict";

const { Sequelize } = require("sequelize");

// Carried over unchanged from Week 3 — the connection is not business logic,
// so it does not move into the service layer.
function createConnection(storage = ":memory:") {
  return new Sequelize({
    dialect: "sqlite",
    storage,
    logging: false,
  });
}

module.exports = { createConnection };
