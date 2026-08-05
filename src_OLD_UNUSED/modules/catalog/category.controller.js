// CRUD for categories (supports parent_id self-reference for tree structure)
const ApiResponse = require('../../utils/apiResponse');
const { query } = require('../../config/db');

async function listCategories(req, res, next) {
  try {
    const result = await query(
      `SELECT * FROM categories WHERE status = 'active' ORDER BY parent_id NULLS FIRST, name`
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function getCategoryById(req, res, next) {
  try {
    const result = await query(`SELECT * FROM categories WHERE id = $1`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Category not found', 404);
    return ApiResponse.success(res, result.rows[0]);
  } catch (err) {
    next(err);
  }
}

function slugify(text) {
  return text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
}

async function createCategory(req, res, next) {
  try {
    const { name, description, parent_id, status } = req.body;
    if (!name) return ApiResponse.error(res, 'name is required', 400);

    const slug = slugify(name);

    const result = await query(
      `INSERT INTO categories (parent_id, name, slug, description, status)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [parent_id || null, name, slug, description, status || 'active']
    );
    return ApiResponse.success(res, result.rows[0], 'Category created', 201);
  } catch (err) {
    next(err);
  }
}

async function updateCategory(req, res, next) {
  try {
    const { name, description, parent_id, status } = req.body;
    const slug = name ? slugify(name) : undefined;

    const result = await query(
      `UPDATE categories SET
        name = COALESCE($1, name),
        slug = COALESCE($2, slug),
        description = COALESCE($3, description),
        parent_id = COALESCE($4, parent_id),
        status = COALESCE($5, status)
       WHERE id = $6 RETURNING *`,
      [name, slug, description, parent_id, status, req.params.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Category not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Category updated');
  } catch (err) {
    next(err);
  }
}

async function deleteCategory(req, res, next) {
  try {
    const result = await query(`DELETE FROM categories WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Category not found', 404);
    return ApiResponse.success(res, null, 'Category deleted');
  } catch (err) {
    next(err);
  }
}

module.exports = { listCategories, getCategoryById, createCategory, updateCategory, deleteCategory };