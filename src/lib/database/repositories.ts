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
  productCategoryFromRow,
  productCategoryToRowFields,
  productBrandFromRow,
  productBrandToRowFields,
  unitFromRow,
  unitToRowFields,
  unitConversionFromRow,
  unitConversionToRowFields,
  productSupplierFromRow,
  productSupplierToRowFields,
  warehouseFromRow,
  warehouseToRowFields,
  productLotFromRow,
  productLotToRowFields,
  salesRepresentativeFromRow,
  salesRepresentativeToRowFields,
  priceListFromRow,
  priceListToRowFields,
  priceListItemFromRow,
  priceListItemToRowFields,
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

export const productCategoriesTable = createTableRepository({
  table: "product_categories",
  entityLabel: "Categoria de produto",
  searchColumns: ["code", "name"],
  defaultSort: "created_at",
  fromRow: productCategoryFromRow,
  toRowFields: productCategoryToRowFields,
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
      message: "Esta categoria possui subcategorias vinculadas. Utilize a inativação.",
    },
  ],
});

export const productBrandsTable = createTableRepository({
  table: "product_brands",
  entityLabel: "Marca de produto",
  searchColumns: ["name"],
  defaultSort: "created_at",
  fromRow: productBrandFromRow,
  toRowFields: productBrandToRowFields,
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

export const unitsTable = createTableRepository({
  table: "units",
  entityLabel: "Unidade de medida",
  searchColumns: ["code", "name"],
  defaultSort: "created_at",
  fromRow: unitFromRow,
  toRowFields: unitToRowFields,
  labelOf: (item) => item.codigo,
  dependents: [
    {
      table: "products",
      column: "unit_id",
      matchValue: (item) => item.id,
      message: "Esta unidade está vinculada a produtos cadastrados. Utilize a inativação.",
    },
  ],
});

export const unitConversionsTable = createTableRepository({
  table: "unit_conversions",
  entityLabel: "Conversão de unidade",
  searchColumns: [],
  defaultSort: "created_at",
  fromRow: unitConversionFromRow,
  toRowFields: unitConversionToRowFields,
  labelOf: (item) => `${item.unidadeOrigemId} -> ${item.unidadeDestinoId}`,
});

export const productSuppliersTable = createTableRepository({
  table: "product_suppliers",
  entityLabel: "Fornecedor do produto",
  searchColumns: ["supplier_sku"],
  defaultSort: "created_at",
  fromRow: productSupplierFromRow,
  toRowFields: productSupplierToRowFields,
  labelOf: (item) => item.produtoId,
});

export const warehousesTable = createTableRepository({
  table: "warehouses",
  entityLabel: "Depósito",
  searchColumns: ["code", "name"],
  defaultSort: "created_at",
  fromRow: warehouseFromRow,
  toRowFields: warehouseToRowFields,
  labelOf: (item) => item.nome,
  dependents: [
    {
      table: "warehouse_locations",
      column: "warehouse_id",
      matchValue: (item) => item.id,
      message: "Este depósito possui locais de estoque vinculados. Utilize a inativação.",
    },
  ],
});

export const productLotsTable = createTableRepository({
  table: "product_lots",
  entityLabel: "Lote de produto",
  searchColumns: ["lot_number"],
  defaultSort: "created_at",
  fromRow: productLotFromRow,
  toRowFields: productLotToRowFields,
  labelOf: (item) => item.numeroLote,
});

export const salesRepresentativesTable = createTableRepository({
  table: "sales_representatives",
  entityLabel: "Vendedor",
  searchColumns: ["code", "name", "document"],
  defaultSort: "created_at",
  fromRow: salesRepresentativeFromRow,
  toRowFields: salesRepresentativeToRowFields,
  labelOf: (item) => item.nome,
});

export const priceListsTable = createTableRepository({
  table: "price_lists",
  entityLabel: "Tabela de preço",
  searchColumns: ["code", "name"],
  defaultSort: "created_at",
  fromRow: priceListFromRow,
  toRowFields: priceListToRowFields,
  labelOf: (item) => item.nome,
  dependents: [
    {
      table: "price_list_items",
      column: "price_list_id",
      matchValue: (item) => item.id,
      message: "Esta tabela de preço possui itens cadastrados. Utilize a inativação.",
    },
  ],
});

export const priceListItemsTable = createTableRepository({
  table: "price_list_items",
  entityLabel: "Item de tabela de preço",
  searchColumns: [],
  defaultSort: "created_at",
  fromRow: priceListItemFromRow,
  toRowFields: priceListItemToRowFields,
  labelOf: (item) => item.produtoId,
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
  "product-categories": productCategoriesTable,
  "product-brands": productBrandsTable,
  units: unitsTable,
  "unit-conversions": unitConversionsTable,
  "product-suppliers": productSuppliersTable,
  warehouses: warehousesTable,
  "product-lots": productLotsTable,
  "sales-representatives": salesRepresentativesTable,
  "price-lists": priceListsTable,
  "price-list-items": priceListItemsTable,
} as const;

export type EntityRoute = keyof typeof tablesByEntity;
