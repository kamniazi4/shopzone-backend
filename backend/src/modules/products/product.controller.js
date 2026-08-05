// CRUD for products, product_categories, product_attribute_sets,
// product_status_history, product_rating_summary, vendor_products
const ApiResponse = require('../../utils/apiResponse');
const { query, getClient } = require('../../config/db');
const { getPagination, buildPaginationMeta } = require('../../utils/pagination');

function slugify(text) {
  return text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
}

async function listProducts(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const {
      status, vendor_id, category_id, search,
      brand, gender, min_price, max_price, size, color,
    } = req.query;

    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`p.status = $${params.length}`);
    }
    if (vendor_id) {
      params.push(vendor_id);
      conditions.push(`p.vendor_id = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`p.name ILIKE $${params.length}`);
    }
    if (category_id) {
      params.push(category_id);
      conditions.push(`EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id = $${params.length})`);
    }
    if (brand) {
      params.push(brand);
      conditions.push(`p.brand = $${params.length}`);
    }
    if (gender) {
      params.push(gender);
      conditions.push(`p.gender = $${params.length}`);
    }
    if (min_price) {
      params.push(min_price);
      conditions.push(`EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.price >= $${params.length})`);
    }
    if (max_price) {
      params.push(max_price);
      conditions.push(`EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.price <= $${params.length})`);
    }
    if (size) {
      params.push(size);
      conditions.push(`EXISTS (
        SELECT 1 FROM product_variants pv
        JOIN variant_attribute_values vav ON vav.variant_id = pv.id
        JOIN attribute_values av ON av.id = vav.attribute_value_id
        JOIN attributes a ON a.id = av.attribute_id
        WHERE pv.product_id = p.id AND a.name = 'Shoe Size' AND av.value = $${params.length}
      )`);
    }
    if (color) {
      params.push(color);
      conditions.push(`EXISTS (
        SELECT 1 FROM product_variants pv
        JOIN variant_attribute_values vav ON vav.variant_id = pv.id
        JOIN attribute_values av ON av.id = vav.attribute_value_id
        JOIN attributes a ON a.id = av.attribute_id
        WHERE pv.product_id = p.id AND a.name = 'Color' AND av.value = $${params.length}
      )`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(`SELECT COUNT(*) FROM products p ${whereClause}`, params);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const result = await query(
      `SELECT p.*, v.business_name AS vendor_name,
        (SELECT MIN(price) FROM product_variants WHERE product_id = p.id) AS min_price,
        (SELECT image_url FROM product_images WHERE product_id = p.id AND is_featured = TRUE LIMIT 1) AS featured_image
       FROM products p
       LEFT JOIN vendors v ON v.id = p.vendor_id
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return ApiResponse.paginated(res, result.rows, buildPaginationMeta(page, limit, totalCount));
  } catch (err) {
    next(err);
  }
}

// Returns the available filter options (brands, genders, sizes, colors, price range)
// for a given category, computed dynamically from actual product data.
async function getProductFilters(req, res, next) {
  try {
    const { category_id } = req.query;
    if (!category_id) return ApiResponse.error(res, 'category_id is required', 400);

    const brandsResult = await query(
      `SELECT DISTINCT p.brand
       FROM products p
       JOIN product_categories pc ON pc.product_id = p.id
       WHERE pc.category_id = $1 AND p.brand IS NOT NULL AND p.status = 'published'
       ORDER BY p.brand`,
      [category_id]
    );

    const gendersResult = await query(
      `SELECT DISTINCT p.gender
       FROM products p
       JOIN product_categories pc ON pc.product_id = p.id
       WHERE pc.category_id = $1 AND p.gender IS NOT NULL AND p.status = 'published'
       ORDER BY p.gender`,
      [category_id]
    );

    const sizesResult = await query(
      `SELECT DISTINCT av.value
       FROM products p
       JOIN product_categories pc ON pc.product_id = p.id
       JOIN product_variants pv ON pv.product_id = p.id
       JOIN variant_attribute_values vav ON vav.variant_id = pv.id
       JOIN attribute_values av ON av.id = vav.attribute_value_id
       JOIN attributes a ON a.id = av.attribute_id
       WHERE pc.category_id = $1 AND a.name = 'Shoe Size' AND p.status = 'published'
       ORDER BY av.value`,
      [category_id]
    );

    const colorsResult = await query(
      `SELECT DISTINCT av.value
       FROM products p
       JOIN product_categories pc ON pc.product_id = p.id
       JOIN product_variants pv ON pv.product_id = p.id
       JOIN variant_attribute_values vav ON vav.variant_id = pv.id
       JOIN attribute_values av ON av.id = vav.attribute_value_id
       JOIN attributes a ON a.id = av.attribute_id
       WHERE pc.category_id = $1 AND a.name = 'Color' AND p.status = 'published'
       ORDER BY av.value`,
      [category_id]
    );

    const priceRangeResult = await query(
      `SELECT MIN(pv.price) AS min_price, MAX(pv.price) AS max_price
       FROM products p
       JOIN product_categories pc ON pc.product_id = p.id
       JOIN product_variants pv ON pv.product_id = p.id
       WHERE pc.category_id = $1 AND p.status = 'published'`,
      [category_id]
    );

    return ApiResponse.success(res, {
      brands: brandsResult.rows.map((r) => r.brand),
      genders: gendersResult.rows.map((r) => r.gender),
      sizes: sizesResult.rows.map((r) => r.value),
      colors: colorsResult.rows.map((r) => r.value),
      price_range: priceRangeResult.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

// Fetch a product with its full nested details: variants, images, categories, rating
async function getProductById(req, res, next) {
  try {
    const productResult = await query(`SELECT * FROM products WHERE id = $1`, [req.params.id]);
    if (productResult.rows.length === 0) return ApiResponse.error(res, 'Product not found', 404);
    const product = productResult.rows[0];

    const [variants, images, categories, rating] = await Promise.all([
      query(`SELECT * FROM product_variants WHERE product_id = $1 ORDER BY id`, [req.params.id]),
      query(`SELECT * FROM product_images WHERE product_id = $1 ORDER BY sort_order`, [req.params.id]),
      query(
        `SELECT c.id, c.name, c.slug FROM categories c
         JOIN product_categories pc ON pc.category_id = c.id
         WHERE pc.product_id = $1`,
        [req.params.id]
      ),
      query(`SELECT * FROM product_rating_summary WHERE product_id = $1`, [req.params.id]),
    ]);

    product.variants = variants.rows;
    product.images = images.rows;
    product.categories = categories.rows;
    product.rating = rating.rows[0] || { average_rating: 0, total_reviews: 0 };

    return ApiResponse.success(res, product);
  } catch (err) {
    next(err);
  }
}

// Creates a product along with its first variant, categories, and images in one transaction
async function createProduct(req, res, next) {
  const client = await getClient();
  try {
    const {
      vendor_id, name, description, short_description,
      sku, price, category_ids, images, brand, gender,
    } = req.body;

    if (!vendor_id || !name || !price) {
      return ApiResponse.error(res, 'vendor_id, name and price are required', 400);
    }

    await client.query('BEGIN');

    const slug = `${slugify(name)}-${Date.now()}`;

    const productResult = await client.query(
      `INSERT INTO products (vendor_id, name, slug, sku, description, short_description, brand, gender, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft') RETURNING *`,
      [vendor_id, name, slug, sku, description, short_description, brand || null, gender || null]
    );
    const product = productResult.rows[0];

    // Default variant carries the base price
    const variantResult = await client.query(
      `INSERT INTO product_variants (product_id, sku, price)
       VALUES ($1, $2, $3) RETURNING *`,
      [product.id, sku || `${slug}-default`, price]
    );

    if (Array.isArray(category_ids)) {
      for (const catId of category_ids) {
        await client.query(
          `INSERT INTO product_categories (product_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [product.id, catId]
        );
      }
    }

    if (Array.isArray(images)) {
      for (let i = 0; i < images.length; i++) {
        await client.query(
          `INSERT INTO product_images (product_id, image_url, is_featured, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [product.id, images[i], i === 0, i]
        );
      }
    }

    await client.query(
      `INSERT INTO vendor_products (vendor_id, product_id, is_approved) VALUES ($1, $2, FALSE)`,
      [vendor_id, product.id]
    );

    await client.query(
      `INSERT INTO product_rating_summary (product_id) VALUES ($1)`,
      [product.id]
    );

    await client.query(
      `INSERT INTO product_status_history (product_id, status, changed_by) VALUES ($1, 'draft', $2)`,
      [product.id, req.user.id]
    );

    await client.query('COMMIT');

    product.default_variant = variantResult.rows[0];
    return ApiResponse.success(res, product, 'Product created', 201);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function updateProduct(req, res, next) {
  try {
    const { name, description, short_description, sku, brand, gender } = req.body;
    const slug = name ? `${slugify(name)}-${req.params.id}` : undefined;

    const result = await query(
      `UPDATE products SET
        name = COALESCE($1, name),
        slug = COALESCE($2, slug),
        description = COALESCE($3, description),
        short_description = COALESCE($4, short_description),
        sku = COALESCE($5, sku),
        brand = COALESCE($6, brand),
        gender = COALESCE($7, gender),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 RETURNING *`,
      [name, slug, description, short_description, sku, brand, gender, req.params.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Product not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Product updated');
  } catch (err) {
    next(err);
  }
}

// Updates product status and logs the change to product_status_history
async function updateProductStatus(req, res, next) {
  const client = await getClient();
  try {
    const { status, notes } = req.body;
    if (!['draft', 'published', 'disabled'].includes(status)) {
      return ApiResponse.error(res, 'Invalid status value', 400);
    }

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE products SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiResponse.error(res, 'Product not found', 404);
    }

    await client.query(
      `INSERT INTO product_status_history (product_id, status, notes, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [req.params.id, status, notes, req.user.id]
    );

    await client.query('COMMIT');
    return ApiResponse.success(res, result.rows[0], 'Product status updated');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function approveVendorProduct(req, res, next) {
  try {
    const result = await query(
      `UPDATE vendor_products SET is_approved = TRUE
       WHERE product_id = $1 AND vendor_id = $2 RETURNING *`,
      [req.params.id, req.body.vendor_id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Vendor product link not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Product approved for vendor');
  } catch (err) {
    next(err);
  }
}

async function deleteProduct(req, res, next) {
  try {
    const result = await query(`DELETE FROM products WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Product not found', 404);
    return ApiResponse.success(res, null, 'Product deleted');
  } catch (err) {
    next(err);
  }
}

async function getProductStatusHistory(req, res, next) {
  try {
    const result = await query(
      `SELECT psh.*, u.name AS changed_by_name
       FROM product_status_history psh
       LEFT JOIN users u ON u.id = psh.changed_by
       WHERE psh.product_id = $1 ORDER BY psh.created_at DESC`,
      [req.params.id]
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listProducts, getProductById, createProduct, updateProduct,
  updateProductStatus, approveVendorProduct, deleteProduct, getProductStatusHistory,
  getProductFilters,
};