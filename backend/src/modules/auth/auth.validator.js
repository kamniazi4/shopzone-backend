// Simple manual validators (no external validation library required)
function validateRegisterInput({ name, email, password }) {
  const errors = [];
  if (!name || name.trim().length < 2) errors.push('Name must be at least 2 characters');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Valid email is required');
  if (!password || password.length < 6) errors.push('Password must be at least 6 characters');
  return errors;
}

function validateLoginInput({ email, password }) {
  const errors = [];
  if (!email) errors.push('Email is required');
  if (!password) errors.push('Password is required');
  return errors;
}

module.exports = { validateRegisterInput, validateLoginInput };