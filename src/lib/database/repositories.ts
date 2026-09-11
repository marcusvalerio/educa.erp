import "server-only";

import { createTableRepository } from "./table";
import {
  productFromRow,
  productToRowFields,
  customerFromRow,
  customerToRowFields,
  supplierFromRow,
  supplierToRowFields,
  carrierFromRow,
  carrierToRowFields,
  driverFromRow,
  driverToRowFields,
  vehicleFromRow,
  vehicleToRowFields,
  userFromRow,
  userToRowFields,
  warehouseLocationFromRow,
  warehouseLocationToRowFields,
  categoryFromRow,
  categoryToRowFields,
  brandFromRow,
  brandToRowFields,
} from "./mappers";

export const productsTable = createTableRepository({
  table: "products",
  entityLabel: "Produto",
  searchColumns: ["code", "sku", "barcode", "name"],
  defaultSort: "created_at",
  fromRow: productFromRow,
  toRowFields: productToRowFields,
  labelOf: (item) => item.codigo,
});

export const customersTable = createTableRepository({
  table: "customers",
  entityLabel: "Cliente",
  searchColumns: ["code", "name", "document"],
  defaultSort: "created_at",
  fromRow: customerFromRow,
  toRowFields: customerToRowFields,
  labelOf: (item) => item.nome,
});

export const suppliersTable = createTableRepository({
  table: "suppliers",
  entityLabel: "Fornecedor",
  searchColumns: ["code", "legal_name", "document"],
  defaultSort: "created_at",
  fromRow: supplierFromRow,
  toRowFields: supplierToRowFields,
  labelOf: (item) => item.razaoSocial,
  dependents: [
    {
      table: "products",
      column: "supplier_id",
      matchValue: (item) => item.id,
      message: "Este fornecedor está vinculado a produtos cadastrados. Utilize a inativação.",
    },
  ],
});

export const carriersTable = createTableRepository({
  table: "carriers",
  entityLabel: "Transportadora",
  searchColumns: ["code", "legal_name", "document"],
  defaultSort: "created_at",
  fromRow: carrierFromRow,
  toRowFields: carrierToRowFields,
  labelOf: (item) => item.razaoSocial,
  dependents: [
    {
      table: "drivers",
      column: "carrier_id",
      matchValue: (item) => item.id,
      message: "Esta transportadora possui motoristas ou veículos vinculados. Utilize a inativação.",
    },
    {
      table: "vehicles",
      column: "carrier_id",
      matchValue: (item) => item.id,
      message: "Esta transportadora possui motoristas ou veículos vinculados. Utilize a inativação.",
    },
  ],
});

export const driversTable = createTableRepository({
  table: "drivers",
  entityLabel: "Motorista",
  searchColumns: ["code", "name", "document", "cnh_number"],
  defaultSort: "created_at",
  fromRow: driverFromRow,
  toRowFields: driverToRowFields,
  labelOf: (item) => item.nome,
  dependents: [
    {
      table: "vehicles",
      column: "driver_id",
      matchValue: (item) => item.id,
      message: "Este motorista é o condutor principal de um veículo cadastrado. Utilize a inativação.",
    },
  ],
});

export const vehiclesTable = createTableRepository({
  table: "vehicles",
  entityLabel: "Veículo",
  searchColumns: ["code", "plate", "model"],
  defaultSort: "created_at",
  fromRow: vehicleFromRow,
  toRowFields: vehicleToRowFields,
  labelOf: (item) => item.placa,
});

export const usersTable = createTableRepository({
  table: "users",
  entityLabel: "Usuário",
  searchColumns: ["code", "name", "email", "login"],
  defaultSort: "created_at",
  fromRow: userFromRow,
  toRowFields: userToRowFields,
  labelOf: (item) => item.nome,
});

export const warehouseLocationsTable = createTableRepository({
  table: "warehouse_locations",
  entityLabel: "Local de estoque",
  searchColumns: ["code", "name"],
  defaultSort: "created_at",
  fromRow: warehouseLocationFromRow,
  toRowFields: warehouseLocationToRowFields,
  labelOf: (item) => item.codigoLocal,
  dependents: [
    {
      table: "products",
      column: "default_location_code",
      matchValue: (item) => item.codigoLocal,
      message: "Este local está definido como localização padrão de produtos cadastrados. Utilize a inativação.",
    },
  ],
});

export const categoriesTable = createTableRepository({
  table: "product_categories",
  entityLabel: "Categoria",
  searchColumns: ["code", "name"],
  defaultSort: "created_at",
  fromRow: categoryFromRow,
  toRowFields: categoryToRowFields,
  labelOf: (item) => item.nome,
  dependents: [
    {
      table: "products",
      column: "category_id",
      matchValue: (item) => item.id,
      message: "Esta categoria está vinculada a produtos cadastrados. Utilize a inativação.",
    },
    {
      table: "product_categories",
      column: "parent_id",
      matchValue: (item) => item.id,
      message: "Esta categoria possui subcategorias vinculadas. Remova ou reclassifique-as primeiro.",
    },
  ],
});

export const brandsTable = createTableRepository({
  table: "product_brands",
  entityLabel: "Marca",
  searchColumns: ["code", "name"],
  defaultSort: "created_at",
  fromRow: brandFromRow,
  toRowFields: brandToRowFields,
  labelOf: (item) => item.nome,
  dependents: [
    {
      table: "products",
      column: "brand_id",
      matchValue: (item) => item.id,
      message: "Esta marca está vinculada a produtos cadastrados. Utilize a inativação.",
    },
  ],
});

export const tablesByEntity = {
  products: productsTable,
  customers: customersTable,
  suppliers: suppliersTable,
  carriers: carriersTable,
  drivers: driversTable,
  vehicles: vehiclesTable,
  users: usersTable,
  "warehouse-locations": warehouseLocationsTable,
  categories: categoriesTable,
  brands: brandsTable,
} as const;

export type EntityRoute = keyof typeof tablesByEntity;
