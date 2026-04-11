const authorize = (...roles) => {
  return (req, res, next) => {
    // The auth middleware should have already run and attached the user
    if (!req.user || !req.user.role) {
      return res.status(403).json({ message: 'Forbidden: User role not available.' });
    }

    // Check if the user's role is included in the list of allowed roles
    console.log('User role:', req.user.role);
    console.log('Allowed roles:', roles);
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: You do not have the required permissions.' });
    }

    next(); // User has the required role, proceed to the next middleware/route handler
  };
};

module.exports = authorize;
