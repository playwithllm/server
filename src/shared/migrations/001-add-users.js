const User = require("../../services/business/domains/admin/user/schema");
const bcrypt = require("bcrypt");
const config = require("../configs");
const { ROLES } = require("./constants");

async function insert(user) {
  try {
    // check if user already exists by email
    const exists = await User.findOne({ email: user.email });
    if (exists) {
      console.log(`${user.displayName} already exists: ${user.email}`);
      return;
    }

    const result = await User.create(user);
    console.log(`Inserted ${user.displayName}`);
    return result;
  } catch (error) {
    console.error(`Error inserting ${user.displayName}:`, error);
    throw error;
  }
}

async function runMigration() {
  console.log("Running migration: 001-add-users");

  try {
    if (!config.SUPERADMIN_PASSWORD || !config.SUPERADMIN_EMAIL) {
      throw new Error(
        "SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD environment variables are required"
      );
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(config.SUPERADMIN_PASSWORD, salt);

    const superAdminUser = {
      email: config.SUPERADMIN_EMAIL,
      displayName: "Super Administrator",
      authType: "local",
      local: {
        username: config.SUPERADMIN_EMAIL,
        password: hashedPassword,
      },
      isDemo: false,
      isVerified: true,
      isAdmin: true,
      isSuperAdmin: true,
      role: "superadmin",
    };

    await insert(superAdminUser);

    const adminUser = {
      email: "admin@example.com",
      displayName: "Admin User",
      authType: "local",
      local: {
        username: "admin@example.com",
        password: await bcrypt.hash("password", salt),
      },
      isDemo: true,
      isVerified: true,
      isAdmin: true,
      role: ROLES.ADMIN,
    };

    await insert(adminUser);

    const visitorUser = {
      email: "visitor@example.com",
      displayName: "Visitor User",
      authType: "local",
      local: {
        username: "visitor@example.com",
        password: await bcrypt.hash("password", salt),
      },
      isDemo: true,
      isVerified: true,
      isAdmin: false,
      role: ROLES.VISITOR,
    };

    await insert(visitorUser);

    console.log("Successfully completed migration - 001-add-users");
  } catch (error) {
    console.error("Failed to complete migration - 001-add-users", error);
    throw error;
  }
}

module.exports = { runMigration };
