// src/models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  whatsappSessions: [
    // Array objek untuk menyimpan detail sesi WhatsApp
    {
      phoneNumber: { type: String, required: true },
      secretToken: { type: String, required: true, unique: true, sparse: true }, // Secret token unik per sesi
      status: { type: String, default: "LOADING" }, // Status sesi (LOADING, QR_READY, READY, etc.)
      lastUpdated: { type: Date, default: Date.now },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

UserSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model("User", UserSchema);

module.exports = User;

