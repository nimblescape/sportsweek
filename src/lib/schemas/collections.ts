/** Single source of truth for collection names — never build a path from a string literal. */
export const COLLECTIONS = {
  users: "users",
  seasons: "seasons",
  events: "events",
  programs: "programs",
  requiredEquipmentItems: "requiredEquipmentItems",
  classOptions: "classOptions",
  skillLevels: "skillLevels",
  busPickupPoints: "busPickupPoints",
  foodOptions: "foodOptions",
  seasonPassOptions: "seasonPassOptions",
  studentMasterData: "studentMasterData",
  emergencyContacts: "emergencyContacts",
  equipmentRentalItems: "equipmentRentalItems",
  savedReportFilters: "savedReportFilters",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
