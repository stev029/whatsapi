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
  refreshToken: { // Tambahkan field untuk menyimpan refresh token
    type: String,
    select: false, // Jangan sertakan secara default saat query
  },
  whatsappSessions: [
    {
      phoneNumber: { type: String, required: true },
      secretToken: { type: String, required: true, unique: true, sparse: true }, // Token unik untuk otentikasi sesi
      status: { type: String, default: "LOADING" }, // Status sesi (CONNECTING, QR_READY, READY, LOGOUT, CLOSED)
      lastUpdated: { type: Date, default: Date.now },
      webhookUrl: { type: String, required: false },
      usePairingCode: { type: Boolean, default: false },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

UserSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model("User", UserSchema);

module.exports = User;
