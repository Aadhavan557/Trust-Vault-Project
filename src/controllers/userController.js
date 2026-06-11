/**
 * User management controller — admin operations on user accounts.
 */

const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const catchAsync = require("../utils/catchAsync");

/**
 * @route   GET /api/v1/users
 * @desc    List all users (paginated)
 * @access  Private/Admin
 */
const getAllUsers = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(),
  ]);

  ApiResponse.ok(
    {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
    "Users retrieved"
  ).send(res);
});

/**
 * @route   GET /api/v1/users/:id
 * @desc    Get a single user by ID
 * @access  Private/Admin
 */
const getUserById = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound("User not found");

  ApiResponse.ok(user, "User retrieved").send(res);
});

/**
 * @route   PUT /api/v1/users/:id
 * @desc    Update user (admin can change role, kycStatus, etc.)
 * @access  Private/Admin
 */
const updateUser = catchAsync(async (req, res) => {
  // Prevent password update through this route
  const { password, ...updateData } = req.body;

  const user = await User.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!user) throw ApiError.notFound("User not found");

  ApiResponse.ok(user, "User updated").send(res);
});

/**
 * @route   DELETE /api/v1/users/:id
 * @desc    Delete a user
 * @access  Private/Admin
 */
const deleteUser = catchAsync(async (req, res) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw ApiError.notFound("User not found");

  ApiResponse.ok(null, "User deleted").send(res);
});

module.exports = { getAllUsers, getUserById, updateUser, deleteUser };
