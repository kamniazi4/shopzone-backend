// Handles reviews and review_media
const ApiResponse = require('../../utils/apiResponse');
const { query, getClient } = require('../../config/db');
const { getPagination, buildPaginationMeta } = require('../../utils/pagination');

async function listProductReviews(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req.query);

    const countResult = await query(
      `SELECT COUNT(*) FROM reviews WHERE product_id = $1 AND status = 'approved'`,
      [req.params.productId]
    );
    const totalCount = parseInt(countResult.rows[0].count, 10);

    const result = await query(
      `SELECT r.*, u.name AS user_name
       FROM reviews r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.product_id = $1 AND r.status = 'approved'
       ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`,
      [req.params.productId, limit, offset]
    );

    // Attach media for each review
    for (const review of result.rows) {
      const mediaResult = await query(`SELECT * FROM review_media WHERE review_id = $1`, [review.id]);
      review.media = mediaResult.rows;
    }

    return ApiResponse.paginated(res, result.rows, buildPaginationMeta(page, limit, totalCount));
  } catch (err) {
    next(err);
  }
}

// Creates a review. Checks if the reviewing user actually purchased the product (verified purchase flag).
async function createReview(req, res, next) {
  const client = await getClient();
  try {
    const { rating, title, comment, media_urls } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return ApiResponse.error(res, 'rating must be between 1 and 5', 400);
    }

    await client.query('BEGIN');

    const purchaseCheck = await client.query(
      `SELECT 1 FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN product_variants pv ON pv.id = oi.variant_id
       WHERE o.user_id = $1 AND pv.product_id = $2 AND o.status = 'delivered'
       LIMIT 1`,
      [req.user.id, req.params.productId]
    );
    const isVerifiedPurchase = purchaseCheck.rows.length > 0;

    const reviewResult = await client.query(
      `INSERT INTO reviews (product_id, user_id, rating, title, comment, is_verified_purchase, status)
       VALUES ($1,$2,$3,$4,$5,$6,'approved') RETURNING *`,
      [req.params.productId, req.user.id, rating, title, comment, isVerifiedPurchase]
    );
    const review = reviewResult.rows[0];

    if (Array.isArray(media_urls)) {
      for (const url of media_urls) {
        await client.query(
          `INSERT INTO review_media (review_id, media_type, media_url) VALUES ($1, 'image', $2)`,
          [review.id, url]
        );
      }
    }

    // Recalculate product rating summary
    const summaryResult = await client.query(
      `SELECT AVG(rating) AS avg_rating, COUNT(*) AS total FROM reviews WHERE product_id = $1 AND status = 'approved'`,
      [req.params.productId]
    );

    await client.query(
      `INSERT INTO product_rating_summary (product_id, average_rating, total_reviews)
       VALUES ($1, $2, $3)
       ON CONFLICT (product_id) DO UPDATE
         SET average_rating = EXCLUDED.average_rating, total_reviews = EXCLUDED.total_reviews`,
      [req.params.productId, parseFloat(summaryResult.rows[0].avg_rating).toFixed(2), summaryResult.rows[0].total]
    );

    await client.query('COMMIT');
    return ApiResponse.success(res, review, 'Review submitted', 201);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function updateReviewStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!['approved', 'pending', 'rejected'].includes(status)) {
      return ApiResponse.error(res, 'Invalid status value', 400);
    }

    const result = await query(
      `UPDATE reviews SET status = $1 WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Review not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Review status updated');
  } catch (err) {
    next(err);
  }
}

async function deleteReview(req, res, next) {
  try {
    const result = await query(
      `DELETE FROM reviews WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Review not found', 404);
    return ApiResponse.success(res, null, 'Review deleted');
  } catch (err) {
    next(err);
  }
}

module.exports = { listProductReviews, createReview, updateReviewStatus, deleteReview };