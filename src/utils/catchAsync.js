/**
 * Wraps an async route handler so thrown errors are forwarded
 * to Express's next() instead of crashing the process.
 *
 * Usage:  router.get("/", catchAsync(myController));
 */

const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = catchAsync;
