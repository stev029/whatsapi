// src/services/whatsappService.js
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  // Tambahkan ini untuk pairing code
  isJidBroadcast, // Untuk memeriksa apakah JID adalah broadcast
  isJidGroup, // Untuk memeriksa apakah JID adalah grup
  makeInMemoryStore, // Berguna untuk menyimpan data chat sementara jika Anda mau
} = require("baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const path = require("path");
const fs = require("fs-extra");
const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");
const logger = require("../config/logger");

// Objek untuk menyimpan semua klien Baileys yang aktif
const clients = {}; // { phoneNumber: BaileysSocketInstance }
const qrCodes = {}; // { phoneNumber: qrData }
const pairingCodes = {}; // { phoneNumber: pairingCode } <-- Tambahkan ini
const clientStatuses = {}; // { phoneNumber: 'CONNECTING' | 'QR_READY' | 'PAIRING_READY' | 'READY' | 'LOGOUT' | 'CLOSED' | 'AUTH_FAILURE' | 'ERROR' | 'DISCONNECTED' }
const qrTimeouts = {}; // { phoneNumber: TimeoutInstance }

// Baileys logger
const loggerBaileys = pino({ level: "info", stream: process.stdout });

// Lokasi penyimpanan sesi Baileys
const SESSIONS_DIR = path.resolve(__dirname, "../../whatsapp_sessions");

// Fungsi untuk menghasilkan secret token sesi
function generateSessionToken(userId, phoneNumber) {
  return jwt.sign({ userId, phoneNumber }, config.sessionSecret, {
    expiresIn: "1y",
  });
}

// Fungsi untuk menghapus sesi secara paksa (dari memori, DB, dan disk)
async function destroySession(phoneNumber, userId, io, reason = "Timeout") {
  logger.info(`Destroying session for ${phoneNumber} due to: ${reason}`);

  const sock = clients[phoneNumber];
  if (sock) {
    try {
      await sock.logout(); // Logout dari WhatsApp
      logger.info(`Baileys client for ${phoneNumber} logged out.`);
    } catch (err) {
      logger.error(
        `Error logging out Baileys client for ${phoneNumber}: ${err.message}`,
        err.stack,
      );
    } finally {
      delete clients[phoneNumber];
    }
  }

  delete qrCodes[phoneNumber];
  delete pairingCodes[phoneNumber]; // <-- Hapus pairing code
  delete clientStatuses[phoneNumber];
  if (qrTimeouts[phoneNumber]) {
    clearTimeout(qrTimeouts[phoneNumber]);
    delete qrTimeouts[phoneNumber];
  }
  // Hapus folder sesi dari disk
  const sessionPath = path.join(SESSIONS_DIR, phoneNumber);
  try {
    if (await fs.pathExists(sessionPath)) {
      await fs.remove(sessionPath);
      logger.info(
        `Session directory for ${phoneNumber} (${sessionPath}) removed.`,
      );
    }
  } catch (fsErr) {
    logger.error(
      `Error removing session directory ${sessionPath}: ${fsErr.message}`,
      fsErr.stack,
    );
  }

  // Update status di database User (hapus entri sesi)
  try {
    const user = await User.findById(userId);
    if (user) {
      user.whatsappSessions = user.whatsappSessions.filter(
        (s) => s.phoneNumber !== phoneNumber,
      );
      await user.save();
      logger.info(
        `Session entry for ${phoneNumber} removed from user ${userId}'s DB record.`,
      );
    } else {
      logger.warn(
        `User with ID ${userId} not found when trying to destroy session ${phoneNumber}.`,
      );
    }
  } catch (dbError) {
    logger.error(
      `Error removing session ${phoneNumber} from DB for user ${userId}: ${dbError.message}`,
      dbError.stack,
    );
  }

  if (io)
    io.emit("client_status", {
      phoneNumber,
      status: "DESTROYED",
      reason,
      userId,
    });
}

// Fungsi untuk membuat dan menginisialisasi klien Baileys baru
// Tambahkan parameter `usePairingCode`
async function createClient(userId, phoneNumber, io, usePairingCode = true) {
  logger.info(
    `Attempting to create/restore client for ${phoneNumber} (User ID: ${userId}). Via Pairing Code: ${usePairingCode}.`,
  );

  const user = await User.findById(userId);
  if (!user) {
    logger.error(
      `User with ID ${userId} not found during createClient for ${phoneNumber}.`,
    );
    throw new Error("User not found.");
  }

  let sessionEntry = user.whatsappSessions.find(
    (s) => s.phoneNumber === phoneNumber,
  );
  if (sessionEntry) {
    if (clientStatuses[phoneNumber] === "READY") {
      logger.info(`Client for ${phoneNumber} already ready in memory.`);
      return {
        success: true,
        message: "Client is already ready.",
        sessionToken: sessionEntry.secretToken,
      };
    }
    if (
      clientStatuses[phoneNumber] === "CONNECTING" ||
      clientStatuses[phoneNumber] === "QR_READY" ||
      clientStatuses[phoneNumber] === "PAIRING_READY"
    ) {
      logger.info(
        `Client for ${phoneNumber} is already initializing in memory.`,
      );
      // Jika sudah ada QR atau Pairing Code yang dihasilkan, kirim ulang ke frontend
      if (qrCodes[phoneNumber]) {
        io.emit("qr_code", {
          phoneNumber,
          qr: qrCodes[phoneNumber],
          userId,
          secretToken: sessionEntry.secretToken,
        });
      } else if (pairingCodes[phoneNumber]) {
        io.emit("pairing_code", {
          phoneNumber,
          code: pairingCodes[phoneNumber],
          userId,
          secretToken: sessionEntry.secretToken,
        });
      }
      return {
        success: true,
        message: "Client is already initializing.",
        sessionToken: sessionEntry.secretToken,
      };
    }
  } else {
    if (user.whatsappSessions.length >= config.maxSessionsPerUser) {
      logger.warn(
        `User ${userId} reached max sessions (${config.maxSessionsPerUser}) for ${phoneNumber}.`,
      );
      throw new Error(
        `You have reached the maximum limit of ${config.maxSessionsPerUser} WhatsApp sessions.`,
      );
    }
    sessionEntry = {
      phoneNumber,
      secretToken: generateSessionToken(userId, phoneNumber),
      status: "CONNECTING",
    };
    user.whatsappSessions.push(sessionEntry);
    await user.save();
    logger.info(`New session entry created for ${phoneNumber} in DB.`);
  }

  // Pastikan direktori sesi ada
  const sessionPath = path.join(SESSIONS_DIR, phoneNumber);
  await fs.ensureDir(sessionPath);

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  logger.debug(
    `Multi-file auth state loaded/created for ${phoneNumber} in ${sessionPath}.`,
  );

  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger.info(
    `Using WA v${version.join(".")}, isLatest: ${isLatest} for ${phoneNumber}.`,
  );

  const sock = makeWASocket({
    version: version,
    logger: loggerBaileys,
    printQRInTerminal: !usePairingCode, // Selalu false karena kita handle di sini
    auth: state,
    generateHighQualityLinkPreview: true,
    syncFullHistory: true,
    // browser: ["Ubuntu", "Chrome", "20.0.04"], // Sesuaikan dengan browser yang Anda inginkan
    // Konfigurasi untuk pairing code
  });

  if (usePairingCode && !sock.authState.creds.registered) {
    // Jika ada pairing code yang diberikan, kita set statusnya
    pairingCodes[phoneNumber] = phoneNumber; // Simpan pairing code di memori
    try {
      const pairingCode = await sock.requestPairingCode(phoneNumber);

      logger.info(`Pairing code set for ${phoneNumber}: ${pairingCode}`);
      clientStatuses[phoneNumber] = "PAIRING_READY";
      io.emit("pairing_code", {
        phoneNumber,
        code: pairingCode,
        userId,
        secretToken: sessionEntry.secretToken,
      });
    } catch (error) {
      logger.error("Error requesting pairing code:", error);
    }
  }

  clients[phoneNumber] = sock;
  clientStatuses[phoneNumber] = "CONNECTING";

  await User.updateOne(
    { _id: userId, "whatsappSessions.phoneNumber": phoneNumber },
    {
      $set: {
        "whatsappSessions.$.status": "CONNECTING",
        "whatsappSessions.$.lastUpdated": Date.now(),
      },
    },
  );
  logger.info(`Baileys client instance created for ${phoneNumber}.`);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    logger.info(`Connection Update for ${phoneNumber}: ${connection}`);

    if (qr) {
      // Ini akan ter-trigger HANYA JIKA usePairingCode = false
      logger.info(`QR RECEIVED for ${phoneNumber}.`);
      qrCodes[phoneNumber] = qr;
      clientStatuses[phoneNumber] = "QR_READY";
      io.emit("qr_code", {
        phoneNumber,
        qr,
        userId,
        secretToken: sessionEntry.secretToken,
      });

      if (qrTimeouts[phoneNumber]) clearTimeout(qrTimeouts[phoneNumber]);
      qrTimeouts[phoneNumber] = setTimeout(
        async () => {
          if (clientStatuses[phoneNumber] !== "READY") {
            logger.warn(`QR timeout for ${phoneNumber}. Destroying session.`);
            await destroySession(phoneNumber, userId, io, "QR_TIMEOUT");
          }
        },
        config.qrTimeoutMinutes * 60 * 1000,
      );

      User.updateOne(
        { _id: userId, "whatsappSessions.phoneNumber": phoneNumber },
        {
          $set: {
            "whatsappSessions.$.status": "QR_READY",
            "whatsappSessions.$.lastUpdated": Date.now(),
          },
        },
      ).exec();
    }

    if (connection === "close") {
      const reason =
        new Boom(lastDisconnect?.error)?.output?.statusCode ||
        DisconnectReason.connectionClosed;
      logger.error(
        `Connection closed for ${phoneNumber}. Reason: ${reason}. Error: ${lastDisconnect?.error?.message || "Unknown"}`,
      );

      delete clients[phoneNumber];
      delete qrCodes[phoneNumber]; // Hapus QR jika ada
      delete pairingCodes[phoneNumber]; // Hapus Pairing Code jika ada

      if (qrTimeouts[phoneNumber]) {
        clearTimeout(qrTimeouts[phoneNumber]);
        delete qrTimeouts[phoneNumber];
      }

      if (
        reason === DisconnectReason.badSession ||
        reason === DisconnectReason.loggedOut
      ) {
        clientStatuses[phoneNumber] = "AUTH_FAILURE";
        io.emit("client_status", {
          phoneNumber,
          status: "AUTH_FAILURE",
          message: lastDisconnect?.error?.message,
          userId,
          secretToken: sessionEntry.secretToken,
        });
        logger.warn(
          `Authentication failure for ${phoneNumber}. Destroying session.`,
        );
        await destroySession(
          phoneNumber,
          userId,
          io,
          `AUTH_FAILURE: ${lastDisconnect?.error?.message || reason}`,
        );
      } else if (
        reason === DisconnectReason.connectionClosed ||
        reason === DisconnectReason.connectionLost
      ) {
        clientStatuses[phoneNumber] = "DISCONNECTED";
        io.emit("client_status", {
          phoneNumber,
          status: "DISCONNECTED",
          reason: "Connection Lost/Closed",
          userId,
          secretToken: sessionEntry.secretToken,
        });
        logger.info(
          `Connection lost/closed for ${phoneNumber}. Attempting reconnect in 5 seconds...`,
        );
        setTimeout(() => {
          createClient(userId, phoneNumber, io, usePairingCode).catch((e) =>
            logger.error(
              `Error during reconnect attempt for ${phoneNumber}: ${e.message}`,
              e.stack,
            ),
          );
        }, 5000);
      } else {
        clientStatuses[phoneNumber] = "ERROR";
        io.emit("client_status", {
          phoneNumber,
          status: "ERROR",
          message: lastDisconnect?.error?.message,
          userId,
          secretToken: sessionEntry.secretToken,
        });
        logger.error(
          `Unhandled disconnection reason for ${phoneNumber}: ${lastDisconnect?.error?.message || reason}. Destroying session.`,
        );
        await destroySession(
          phoneNumber,
          userId,
          io,
          `UNHANDLED_DISCONNECT: ${lastDisconnect?.error?.message || reason}`,
        );
      }

      await User.updateOne(
        { _id: userId, "whatsappSessions.phoneNumber": phoneNumber },
        {
          $set: {
            "whatsappSessions.$.status": clientStatuses[phoneNumber],
            "whatsappSessions.$.lastUpdated": Date.now(),
          },
        },
      );
    } else if (connection === "open") {
      if (sock.user) {
        logger.info(
          `Client ${phoneNumber} is READY! sock.user: ${sock.user.id.user}`,
        );
        clientStatuses[phoneNumber] = "READY";
        delete qrCodes[phoneNumber];
        delete pairingCodes[phoneNumber]; // <-- Hapus pairing code setelah terhubung
        if (qrTimeouts[phoneNumber]) {
          clearTimeout(qrTimeouts[phoneNumber]);
          delete qrTimeouts[phoneNumber];
        }
        const info = {
          pushname: sock.user.name,
          number: sock.user.id.user,
        };
        io.emit("client_status", {
          phoneNumber,
          status: "READY",
          userId,
          secretToken: sessionEntry.secretToken,
          info,
        });

        await User.updateOne(
          { _id: userId, "whatsappSessions.phoneNumber": phoneNumber },
          {
            $set: {
              "whatsappSessions.$.status": "READY",
              "whatsappSessions.$.lastUpdated": Date.now(),
            },
          },
        );
      } else {
        logger.error(
          `sock.user is undefined after connection 'open' event for ${phoneNumber}!`,
        );
        await destroySession(phoneNumber, userId, io, "sock.user_UNDEFINED");
      }
    } else {
      clientStatuses[phoneNumber] = connection?.toUpperCase();
      User.updateOne(
        { _id: userId, "whatsappSessions.phoneNumber": phoneNumber },
        {
          $set: {
            "whatsappSessions.$.status": connection?.toUpperCase(),
            "whatsappSessions.$.lastUpdated": Date.now(),
          },
        },
      ).exec();
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type === "notify") {
      for (const msg of messages) {
        if (
          msg.key.fromMe ||
          isJidGroup(msg.key.remoteJid) ||
          isJidBroadcast(msg.key.remoteJid)
        ) {
          continue;
        }

        const senderJid = msg.key.remoteJid;
        const messageText =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          "";

        logger.info(
          `New message from ${senderJid} on ${phoneNumber}: ${messageText}`,
        );
        io.emit("new_message", {
          phoneNumber,
          message: messageText,
          from: senderJid,
          userId,
          secretToken: sessionEntry.secretToken,
        });

        if (messageText.toLowerCase() === "halo") {
          await sock.sendMessage(senderJid, {
            text: "Halo kembali! Ini adalah balasan otomatis dari sistem.",
          });
          logger.info(
            `Auto-replied "Halo kembali!" to ${senderJid} from ${phoneNumber}.`,
          );
        } else if (messageText.toLowerCase() === "!status") {
          const statusText = `Status: Connected as ${sock.user.name || sock.user.id.user} on ${phoneNumber}.`;
          await sock.sendMessage(senderJid, { text: statusText });
          logger.info(
            `Auto-replied status to ${senderJid} from ${phoneNumber}.`,
          );
        }
      }
    }
  });

  sock.ev.on("messages.delete", async (item) => {
    logger.info(`Message deleted event for ${phoneNumber}:`, item);
  });

  return {
    success: true,
    message: "Client initialization started.",
    sessionToken: sessionEntry.secretToken,
  };
}

// Fungsi untuk memuat ulang semua sesi yang sudah ada saat server restart
async function restoreSessions(io) {
  logger.info("Starting session restoration process with Baileys...");
  await fs.ensureDir(SESSIONS_DIR);

  const allUsers = await User.find({});

  for (const user of allUsers) {
    for (const sessionEntry of user.whatsappSessions) {
      const phoneNumber = sessionEntry.phoneNumber;
      const sessionPath = path.join(SESSIONS_DIR, phoneNumber);

      // Cek apakah direktori sesi untuk nomor ini ada di disk
      // Jika ada, kita asumsikan sesi valid dan mencoba restore.
      // Tidak perlu usePairingCode di sini karena ini restore sesi yang sudah ada.
      if ((await fs.pathExists(sessionPath)) && !clients[phoneNumber]) {
        logger.info(
          `Attempting to restore session for ${phoneNumber} from disk (owned by user ${user._id})...`,
        );
        try {
          await createClient(user._id, phoneNumber, io, true); // false = tidak pakai pairing code saat restore
          logger.info(`Restore process initiated for ${phoneNumber}.`);
        } catch (error) {
          logger.error(
            `Error during restore for ${phoneNumber}: ${error.message}`,
            error.stack,
          );
          await destroySession(
            phoneNumber,
            user._id,
            io,
            `RESTORE_FAILED: ${error.message}`,
          );
        }
      } else if (!(await fs.pathExists(sessionPath))) {
        logger.warn(
          `Skipping restore for ${phoneNumber}: Session directory not found at ${sessionPath}. Consider destroying this session entry from DB.`,
        );
      } else if (clients[phoneNumber]) {
        logger.info(
          `Session for ${phoneNumber} already in memory. Skipping restore.`,
        );
      }
    }
  }
  logger.info("Session restoration process completed.");
}

// Fungsi baru untuk mendapatkan pairing code
function getPairingCode(phoneNumber) {
  return pairingCodes[phoneNumber];
}

// Fungsi untuk mendapatkan status klien, disaring berdasarkan pengguna
async function getClientStatusForUser(userId) {
  const user = await User.findById(userId);
  if (!user) return {};

  const statuses = {};
  for (const session of user.whatsappSessions) {
    const phoneNumber = session.phoneNumber;
    const sock = clients[phoneNumber]; // Ambil instance Baileys dari cache memori
    const info =
      sock && sock.user
        ? {
            pushname: sock.user.name,
            number: sock.user.id.user,
          }
        : null;

    statuses[phoneNumber] = {
      status: clientStatuses[phoneNumber] || session.status || "NOT_FOUND",
      qr: qrCodes[phoneNumber] || null,
      info: info,
      secretToken: session.secretToken,
    };
  }
  return statuses;
}

// Fungsi untuk mengirim pesan teks
async function sendMessage(senderPhoneNumber, targetNumber, message) {
  const sock = clients[senderPhoneNumber];
  if (!sock || clientStatuses[senderPhoneNumber] !== "READY") {
    throw new Error(
      `Client for ${senderPhoneNumber} is not ready or does not exist. Status: ${clientStatuses[senderPhoneNumber] || "Unknown"}`,
    );
  }

  const jid = jidNormalizedUser(`${targetNumber}@s.whatsapp.net`); // Baileys menggunakan format ini
  try {
    const result = await sock.sendMessage(jid, { text: message });
    return { success: true, id: result.key.id };
  } catch (error) {
    console.error(
      `Error sending message from ${senderPhoneNumber} to ${targetNumber}:`,
      error,
    );
    throw new Error(`Failed to send message: ${error.message}`);
  }
}

// Fungsi untuk mengirim media (belum lengkap, perlu penanganan file yang diupload ke server)
async function sendMedia(
  senderPhoneNumber,
  targetNumber,
  filePath,
  caption = "",
) {
  const sock = clients[senderPhoneNumber];
  if (!sock || clientStatuses[senderPhoneNumber] !== "READY") {
    throw new Error(
      `Client for ${senderPhoneNumber} is not ready or does not exist. Status: ${clientStatuses[senderPhoneNumber] || "Unknown"}`,
    );
  }

  const jid = jidNormalizedUser(`${targetNumber}@s.whatsapp.net`);

  // Ini hanya contoh, Anda perlu mekanisme upload/streaming file yang sebenarnya
  // Jika filePath adalah URL, Anda mungkin perlu mengunduhnya dulu
  // atau jika filePath adalah path lokal, pastikan itu bisa diakses oleh server Baileys
  try {
    let messageType;
    let mediaContent;

    if (filePath.endsWith(".mp4") || filePath.endsWith(".mov")) {
      messageType = "video";
      mediaContent = { video: { url: filePath }, caption: caption };
    } else if (
      filePath.endsWith(".jpg") ||
      filePath.endsWith(".jpeg") ||
      filePath.endsWith(".png")
    ) {
      messageType = "image";
      mediaContent = { image: { url: filePath }, caption: caption };
    } else {
      messageType = "document"; // Contoh untuk jenis file lain
      mediaContent = {
        document: { url: filePath, mimetype: "application/octet-stream" },
        fileName: path.basename(filePath),
      };
    }

    const result = await sock.sendMessage(jid, mediaContent);
    return { success: true, id: result.key.id };
  } catch (error) {
    console.error(
      `Error sending media from ${senderPhoneNumber} to ${targetNumber}:`,
      error,
    );
    throw new Error(`Failed to send media: ${error.message}`);
  }
}

module.exports = {
  createClient,
  getClientStatusForUser,
  sendMessage,
  sendMedia,
  restoreSessions,
  destroySession,
};
