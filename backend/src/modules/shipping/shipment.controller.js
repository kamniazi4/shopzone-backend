// Handles shipments, shipment_items, shipment_tracking_events, delivery_proofs
const ApiResponse = require('../../utils/apiResponse');
const { query, getClient } = require('../../config/db');

async function listShipmentsByOrder(req, res, next) {
  try {
    const result = await query(
      `SELECT s.*, sp.name AS provider_name
       FROM shipments s
       LEFT JOIN shipping_providers sp ON sp.id = s.shipping_provider_id
       WHERE s.order_id = $1 ORDER BY s.id`,
      [req.params.orderId]
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function getShipmentById(req, res, next) {
  try {
    const shipmentResult = await query(`SELECT * FROM shipments WHERE id = $1`, [req.params.id]);
    if (shipmentResult.rows.length === 0) return ApiResponse.error(res, 'Shipment not found', 404);

    const [items, events, proof] = await Promise.all([
      query(
        `SELECT si.*, oi.name AS item_name, oi.sku
         FROM shipment_items si
         JOIN order_items oi ON oi.id = si.order_item_id
         WHERE si.shipment_id = $1`,
        [req.params.id]
      ),
      query(
        `SELECT * FROM shipment_tracking_events WHERE shipment_id = $1 ORDER BY event_timestamp DESC`,
        [req.params.id]
      ),
      query(`SELECT * FROM delivery_proofs WHERE shipment_id = $1`, [req.params.id]),
    ]);

    const shipment = shipmentResult.rows[0];
    shipment.items = items.rows;
    shipment.tracking_events = events.rows;
    shipment.delivery_proof = proof.rows[0] || null;

    return ApiResponse.success(res, shipment);
  } catch (err) {
    next(err);
  }
}

// Creates a shipment for an order (or part of it) and links specific order_items to it
async function createShipment(req, res, next) {
  const client = await getClient();
  try {
    const { shipping_provider_id, tracking_number, estimated_delivery, order_item_ids } = req.body;

    if (!Array.isArray(order_item_ids) || order_item_ids.length === 0) {
      return ApiResponse.error(res, 'order_item_ids array is required', 400);
    }

    await client.query('BEGIN');

    const shipmentResult = await client.query(
      `INSERT INTO shipments (order_id, shipping_provider_id, tracking_number, status, estimated_delivery)
       VALUES ($1,$2,$3,'pending',$4) RETURNING *`,
      [req.params.orderId, shipping_provider_id, tracking_number, estimated_delivery]
    );
    const shipment = shipmentResult.rows[0];

    for (const orderItemId of order_item_ids) {
      const itemResult = await client.query(
        `SELECT quantity FROM order_items WHERE id = $1 AND order_id = $2`,
        [orderItemId, req.params.orderId]
      );
      if (itemResult.rows.length === 0) continue;

      await client.query(
        `INSERT INTO shipment_items (shipment_id, order_item_id, quantity) VALUES ($1,$2,$3)`,
        [shipment.id, orderItemId, itemResult.rows[0].quantity]
      );
    }

    await client.query(
      `INSERT INTO shipment_tracking_events (shipment_id, description, status, event_timestamp)
       VALUES ($1, 'Shipment created', 'pending', CURRENT_TIMESTAMP)`,
      [shipment.id]
    );

    await client.query('COMMIT');
    return ApiResponse.success(res, shipment, 'Shipment created', 201);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// Updates shipment status and stamps shipped_at / delivered_at as appropriate
async function updateShipmentStatus(req, res, next) {
  const client = await getClient();
  try {
    const { status, location, description } = req.body;
    const validStatuses = ['pending', 'shipped', 'in_transit', 'delivered'];
    if (!validStatuses.includes(status)) {
      return ApiResponse.error(res, 'Invalid shipment status', 400);
    }

    await client.query('BEGIN');

    let timestampField = '';
    if (status === 'shipped') timestampField = ', shipped_at = CURRENT_TIMESTAMP';
    if (status === 'delivered') timestampField = ', delivered_at = CURRENT_TIMESTAMP';

    const result = await client.query(
      `UPDATE shipments SET status = $1 ${timestampField} WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiResponse.error(res, 'Shipment not found', 404);
    }

    await client.query(
      `INSERT INTO shipment_tracking_events (shipment_id, location, description, status, event_timestamp)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [req.params.id, location, description || `Status changed to ${status}`, status]
    );

    await client.query('COMMIT');
    return ApiResponse.success(res, result.rows[0], 'Shipment status updated');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ---- delivery_proofs ----

async function uploadDeliveryProof(req, res, next) {
  try {
    const { proof_type, file_url, signed_by } = req.body;
    if (!file_url) return ApiResponse.error(res, 'file_url is required', 400);

    const result = await query(
      `INSERT INTO delivery_proofs (shipment_id, proof_type, file_url, signed_by)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (shipment_id) DO UPDATE
         SET proof_type = EXCLUDED.proof_type, file_url = EXCLUDED.file_url, signed_by = EXCLUDED.signed_by
       RETURNING *`,
      [req.params.id, proof_type, file_url, signed_by]
    );
    return ApiResponse.success(res, result.rows[0], 'Delivery proof uploaded', 201);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listShipmentsByOrder, getShipmentById, createShipment, updateShipmentStatus, uploadDeliveryProof,
};