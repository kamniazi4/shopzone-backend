// CRUD for suppliers and supplier_products
const ApiResponse = require('../../utils/apiResponse');
const { query } = require('../../config/db');
const { getPagination, buildPaginationMeta } = require('../../utils/pagination');

async function listSuppliers(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req.query);

    const countResult = await query(`SELECT COUNT(*) FROM suppliers`);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    const result = await query(
      `SELECT * FROM suppliers ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return ApiResponse.paginated(res, result.rows, buildPaginationMeta(page, limit, totalCount));
  } catch (err) {
    next(err);
  }
}

async function getSupplierById(req, res, next) {
  try {
    const result = await query(`SELECT * FROM suppliers WHERE id = $1`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Supplier not found', 404);
    return ApiResponse.success(res, result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function createSupplier(req, res, next) {
  try {
    const { supplier_name, contact_name, email, phone, address } = req.body;
    if (!supplier_name) return ApiResponse.error(res, 'supplier_name is required', 400);

    const result = await query(
      `INSERT INTO suppliers (supplier_name, contact_name, email, phone, address)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [supplier_name, contact_name, email, phone, address]
    );
    return ApiResponse.success(res, result.rows[0], 'Supplier created', 201);
  } catch (err) {
    next(err);
  }
}

async function updateSupplier(req, res, next) {
  try {
    const { supplier_name, contact_name, email, phone, address } = req.body;
    const result = await query(
      `UPDATE suppliers SET
        supplier_name = COALESCE($1, supplier_name),
        contact_name = COALESCE($2, contact_name),
        email = COALESCE($3, email),
        phone = COALESCE($4, phone),
        address = COALESCE($5, address)
       WHERE id = $6 RETURNING *`,
      [supplier_name, contact_name, email, phone, address, req.params.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Supplier not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Supplier updated');
  } catch (err) {
    next(err);
  }
}

async function deleteSupplier(req, res, next) {
  try {
    const result = await query(`DELETE FROM suppliers WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Supplier not found', 404);
    return ApiResponse.success(res, null, 'Supplier deleted');
  } catch (err) {
    next(err);
  }
}

// ---- supplier_products ----

async function listSupplierProducts(req, res, next) {
  try {
    const result = await query(
      `SELECT sp.*, pv.sku AS variant_sku, pv.price AS variant_price
       FROM supplier_products sp
       JOIN product_variants pv ON pv.id = sp.variant_id
       WHERE sp.supplier_id = $1`,
      [req.params.id]
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function linkSupplierProduct(req, res, next) {
  try {
    const { variant_id, supplier_sku, supply_cost } = req.body;
    if (!variant_id) return ApiResponse.error(res, 'variant_id is required', 400);

    const result = await query(
      `INSERT INTO supplier_products (supplier_id, variant_id, supplier_sku, supply_cost)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (supplier_id, variant_id) DO UPDATE
         SET supplier_sku = EXCLUDED.supplier_sku, supply_cost = EXCLUDED.supply_cost
       RETURNING *`,
      [req.params.id, variant_id, supplier_sku, supply_cost]
    );
    return ApiResponse.success(res, result.rows[0], 'Supplier product linked', 201);
  } catch (err) {
    next(err);
  }
}

async function unlinkSupplierProduct(req, res, next) {
  try {
    await query(
      `DELETE FROM supplier_products WHERE supplier_id = $1 AND variant_id = $2`,
      [req.params.id, req.params.variantId]
    );
    return ApiResponse.success(res, null, 'Supplier product unlinked');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listSuppliers, getSupplierById, createSupplier, updateSupplier, deleteSupplier,
  listSupplierProducts, linkSupplierProduct, unlinkSupplierProduct,
};