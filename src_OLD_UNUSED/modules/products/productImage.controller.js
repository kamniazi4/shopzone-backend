// Handles product_images
const ApiResponse = require('../../utils/apiResponse');
const { query } = require('../../config/db');

async function listProductImages(req, res, next) {
  try {
    const result = await query(
      `SELECT * FROM product_images WHERE product_id = $1 ORDER BY sort_order`,
      [req.params.productId]
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function addProductImage(req, res, next) {
  try {
    const { variant_id, image_url, is_featured, sort_order } = req.body;
    if (!image_url) return ApiResponse.error(res, 'image_url is required', 400);

    const result = await query(
      `INSERT INTO product_images (product_id, variant_id, image_url, is_featured, sort_order)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.productId, variant_id || null, image_url, is_featured || false, sort_order || 0]
    );
    return ApiResponse.success(res, result.rows[0], 'Image added', 201);
  } catch (err) {
    next(err);
  }
}

async function setFeaturedImage(req, res, next) {
  const { query: dbQuery, getClient } = require('../../config/db');
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE product_images SET is_featured = FALSE WHERE product_id = $1`,
      [req.params.productId]
    );
    const result = await client.query(
      `UPDATE product_images SET is_featured = TRUE WHERE id = $1 AND product_id = $2 RETURNING *`,
      [req.params.id, req.params.productId]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiResponse.error(res, 'Image not found', 404);
    }
    await client.query('COMMIT');
    return ApiResponse.success(res, result.rows[0], 'Featured image updated');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function deleteProductImage(req, res, next) {
  try {
    const result = await query(
      `DELETE FROM product_images WHERE id = $1 AND product_id = $2 RETURNING id`,
      [req.params.id, req.params.productId]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Image not found', 404);
    return ApiResponse.success(res, null, 'Image deleted');
  } catch (err) {
    next(err);
  }
}

// Handles actual file upload from vendor panel and saves the record with the file's path
async function uploadProductImage(req, res, next) {
  try {
    if (!req.file) {
      return ApiResponse.error(res, 'No image file provided', 400);
    }

    const { variant_id, is_featured, sort_order, category } = req.body;
    const relativePath = `/uploads/categories/${category || 'general'}/${req.file.filename}`;

    const result = await query(
      `INSERT INTO product_images (product_id, variant_id, image_url, is_featured, sort_order)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.productId, variant_id || null, relativePath, is_featured === 'true', sort_order || 0]
    );

    return ApiResponse.success(res, result.rows[0], 'Image uploaded successfully', 201);
  } catch (err) {
    next(err);
  }
}

module.exports = { listProductImages, addProductImage, setFeaturedImage, deleteProductImage, uploadProductImage };