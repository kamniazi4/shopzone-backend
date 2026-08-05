// Handles vendor_wallets and vendor_transactions
const ApiResponse = require('../../utils/apiResponse');
const { query, getClient } = require('../../config/db');
const { getPagination, buildPaginationMeta } = require('../../utils/pagination');

async function getWallet(req, res, next) {
  try {
    const result = await query(`SELECT * FROM vendor_wallets WHERE vendor_id = $1`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Wallet not found', 404);
    return ApiResponse.success(res, result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function listTransactions(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req.query);

    const countResult = await query(
      `SELECT COUNT(*) FROM vendor_transactions WHERE vendor_id = $1`,
      [req.params.id]
    );
    const totalCount = parseInt(countResult.rows[0].count, 10);

    const result = await query(
      `SELECT * FROM vendor_transactions WHERE vendor_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    );

    return ApiResponse.paginated(res, result.rows, buildPaginationMeta(page, limit, totalCount));
  } catch (err) {
    next(err);
  }
}

// Credits or debits a vendor wallet and logs the transaction atomically
async function createTransaction(req, res, next) {
  const client = await getClient();
  try {
    const { amount, type, description, reference_id } = req.body;
    if (!amount || !['credit', 'debit'].includes(type)) {
      return ApiResponse.error(res, 'amount and valid type (credit/debit) are required', 400);
    }

    await client.query('BEGIN');

    const delta = type === 'credit' ? amount : -amount;

    const walletResult = await client.query(
      `UPDATE vendor_wallets
       SET balance = balance + $1, withdrawable_balance = withdrawable_balance + $1, updated_at = CURRENT_TIMESTAMP
       WHERE vendor_id = $2 RETURNING *`,
      [delta, req.params.id]
    );

    if (walletResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiResponse.error(res, 'Vendor wallet not found', 404);
    }

    const txnResult = await client.query(
      `INSERT INTO vendor_transactions (vendor_id, amount, type, description, reference_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.id, amount, type, description, reference_id]
    );

    await client.query('COMMIT');
    return ApiResponse.success(res, {
      wallet: walletResult.rows[0],
      transaction: txnResult.rows[0],
    }, 'Transaction recorded', 201);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { getWallet, listTransactions, createTransaction };