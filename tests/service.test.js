"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildModels } = require("../models");
const { PurchaseService } = require("../services/purchaseService");
const {
  FarmerNotFoundError,
  InvalidPurchaseError,
  PurchaseNotFoundError,
} = require("../services/errors");

async function freshService() {
  const { sequelize, Farmer, Purchase } = buildModels();
  await sequelize.sync();
  return { sequelize, service: new PurchaseService({ Farmer, Purchase }), Farmer };
}

test("recordPurchase creates a purchase for an existing farmer", async () => {
  const { sequelize, service, Farmer } = await freshService();
  const farmer = await Farmer.create({ name: "Kessy Wamp", village: "Kotna" });

  const purchase = await service.recordPurchase({
    farmerId: farmer.id,
    weightKg: 42.5,
    pricePerKg: 8.5,
  });

  assert.equal(purchase.weightKg, 42.5);
  await sequelize.close();
});

test("recordPurchase throws FarmerNotFoundError for an unknown farmer", async () => {
  const { sequelize, service } = await freshService();

  await assert.rejects(
    () => service.recordPurchase({ farmerId: 9999, weightKg: 10, pricePerKg: 8 }),
    FarmerNotFoundError,
  );

  await sequelize.close();
});

test("recordPurchase throws InvalidPurchaseError for a non-positive weight", async () => {
  const { sequelize, service, Farmer } = await freshService();
  const farmer = await Farmer.create({ name: "Kessy Wamp", village: "Kotna" });

  await assert.rejects(
    () => service.recordPurchase({ farmerId: farmer.id, weightKg: -5, pricePerKg: 8 }),
    InvalidPurchaseError,
  );

  await sequelize.close();
});

test("recordPurchase throws InvalidPurchaseError for a non-positive price", async () => {
  const { sequelize, service, Farmer } = await freshService();
  const farmer = await Farmer.create({ name: "Kessy Wamp", village: "Kotna" });

  await assert.rejects(
    () => service.recordPurchase({ farmerId: farmer.id, weightKg: 10, pricePerKg: 0 }),
    InvalidPurchaseError,
  );

  await sequelize.close();
});

test("getTotalOwed sums all of a farmer's purchases", async () => {
  const { sequelize, service, Farmer } = await freshService();
  const farmer = await Farmer.create({ name: "Kessy Wamp", village: "Kotna" });

  await service.recordPurchase({ farmerId: farmer.id, weightKg: 42.5, pricePerKg: 8.5 });
  await service.recordPurchase({ farmerId: farmer.id, weightKg: 30, pricePerKg: 9.0 });

  assert.equal(await service.getTotalOwed(farmer.id), 631.25);
  await sequelize.close();
});

test("correctPurchaseWeight updates an existing purchase (the U in CRUD)", async () => {
  const { sequelize, service, Farmer } = await freshService();
  const farmer = await Farmer.create({ name: "Kessy Wamp", village: "Kotna" });
  const purchase = await service.recordPurchase({
    farmerId: farmer.id,
    weightKg: 42.5,
    pricePerKg: 8.5,
  });

  const corrected = await service.correctPurchaseWeight(purchase.id, 40);
  assert.equal(corrected.weightKg, 40);

  await sequelize.close();
});

test("voidPurchase deletes an existing purchase (the D in CRUD)", async () => {
  const { sequelize, service, Farmer } = await freshService();
  const farmer = await Farmer.create({ name: "Kessy Wamp", village: "Kotna" });
  const purchase = await service.recordPurchase({
    farmerId: farmer.id,
    weightKg: 42.5,
    pricePerKg: 8.5,
  });

  await service.voidPurchase(purchase.id);

  assert.equal(await service.getTotalOwed(farmer.id), 0);
  await sequelize.close();
});

test("voidPurchase throws PurchaseNotFoundError for an unknown purchase", async () => {
  const { sequelize, service } = await freshService();

  await assert.rejects(() => service.voidPurchase(9999), PurchaseNotFoundError);

  await sequelize.close();
});
