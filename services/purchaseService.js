"use strict";

const { ValidationError } = require("sequelize");
const {
  FarmerNotFoundError,
  InvalidPurchaseError,
  PurchaseNotFoundError,
} = require("./errors");

// The Service Layer (Fowler): callers — a route handler, a CLI, a test —
// talk to ONE object that knows the business rules. They never touch
// Farmer/Purchase (the ORM models) or SQL directly. That boundary is the
// whole point: swap the storage engine later and this file's public API
// does not have to change.
class PurchaseService {
  constructor({ Farmer, Purchase }) {
    this.Farmer = Farmer;
    this.Purchase = Purchase;
  }

  // ---- Create ----------------------------------------------------------
  async recordPurchase({ farmerId, weightKg, pricePerKg }) {
    const farmer = await this.Farmer.findByPk(farmerId);
    if (!farmer) {
      throw new FarmerNotFoundError(farmerId);
    }

    try {
      return await this.Purchase.create({ farmerId, weightKg, pricePerKg });
    } catch (error) {
      // Translate the ORM's validation error into a business-layer
      // exception. Callers of this service should never need to know
      // Sequelize exists.
      if (error instanceof ValidationError) {
        throw new InvalidPurchaseError(error.errors.map((e) => e.message).join("; "));
      }
      throw error;
    }
  }

  // ---- Read --------------------------------------------------------------
  async getTotalOwed(farmerId) {
    const farmer = await this.Farmer.findByPk(farmerId);
    if (!farmer) {
      throw new FarmerNotFoundError(farmerId);
    }

    const purchases = await this.Purchase.findAll({ where: { farmerId } });
    return Number(
      purchases.reduce((sum, p) => sum + p.weightKg * p.pricePerKg, 0).toFixed(2),
    );
  }

  async listPurchases(farmerId) {
    const farmer = await this.Farmer.findByPk(farmerId);
    if (!farmer) {
      throw new FarmerNotFoundError(farmerId);
    }
    return this.Purchase.findAll({ where: { farmerId } });
  }

  // ---- Update --------------------------------------------------------------
  async correctPurchaseWeight(purchaseId, weightKg) {
    const purchase = await this.Purchase.findByPk(purchaseId);
    if (!purchase) {
      throw new PurchaseNotFoundError(purchaseId);
    }

    try {
      purchase.weightKg = weightKg;
      await purchase.save();
      return purchase;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new InvalidPurchaseError(error.errors.map((e) => e.message).join("; "));
      }
      throw error;
    }
  }

  // ---- Delete --------------------------------------------------------------
  async voidPurchase(purchaseId) {
    const purchase = await this.Purchase.findByPk(purchaseId);
    if (!purchase) {
      throw new PurchaseNotFoundError(purchaseId);
    }
    await purchase.destroy();
  }
}

module.exports = { PurchaseService };
