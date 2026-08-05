// Re-exports address handlers from user.controller to keep a dedicated file
// per the folder structure while avoiding duplicated logic.
const {
  listMyAddresses, addAddress, updateAddress, deleteAddress,
} = require('./user.controller');

module.exports = { listMyAddresses, addAddress, updateAddress, deleteAddress };