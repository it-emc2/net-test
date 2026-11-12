// All Mongoose models of the shared legacy database, one file per topic in ./models/.
// They stay in platform/ (not in a module) because most collections are read by many modules
// (offers: 7, products: 6, users: 6) — module-owned models would only create import cycles.
export * from "./models/catalog.js";
export * from "./models/user.js";
export * from "./models/config.js";
export * from "./models/offer.js";
export * from "./models/customer.js";
export * from "./models/logs.js";
export * from "./models/sending.js";
export * from "./models/signing.js";
export * from "./models/submission.js";
