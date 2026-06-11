/**
 * User management routes — admin-only CRUD on user accounts.
 *
 * All routes require authentication + admin role.
 *
 *   GET    /         — list all users (paginated)
 *   GET    /:id      — get a single user
 *   PUT    /:id      — update user
 *   DELETE /:id      — delete user
 */

const express = require("express");
const router = express.Router();

const userController = require("../controllers/userController");
const { protect, authorize } = require("../middlewares/auth");

// All routes below require authentication + admin role
router.use(protect);
router.use(authorize("admin"));

router.route("/")
  .get(userController.getAllUsers);

router.route("/:id")
  .get(userController.getUserById)
  .put(userController.updateUser)
  .delete(userController.deleteUser);

module.exports = router;
