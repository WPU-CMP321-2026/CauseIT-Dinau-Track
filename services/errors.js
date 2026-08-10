"use strict";

// Custom exception types name WHAT went wrong so callers can decide WHAT TO
// DO about it, instead of pattern-matching generic Error messages.
class FarmerNotFoundError extends Error {
  constructor(farmerId) {
    super(`No farmer with id ${farmerId}`);
    this.name = "FarmerNotFoundError";
    this.farmerId = farmerId;
  }
}

class InvalidPurchaseError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidPurchaseError";
  }
}

class PurchaseNotFoundError extends Error {
  constructor(purchaseId) {
    super(`No purchase with id ${purchaseId}`);
    this.name = "PurchaseNotFoundError";
    this.purchaseId = purchaseId;
  }
}

module.exports = { FarmerNotFoundError, InvalidPurchaseError, PurchaseNotFoundError };
