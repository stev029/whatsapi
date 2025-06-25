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
const axios = require("axios"); // Pastikan axios sudah diimpor
const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");
const logger = require("../config/logger");

// --- Constants ---
const SESSIONS_DIR = path.resolve(__dirname, "../../whatsapp_sessions");
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 5000;
const QR_TIMEOUT_MINUTES = config.qrTimeoutMinutes || 1;

// --- In-Memory Session Storage ---
/**
 * @type {Map<string, {
 *   sock: import('baileys').WASocket | null,
 *   qr: string | null,
 *   pairingCode: string | null,
 *   status: string,
 *   qrTimeout: NodeJS.Timeout | null,
 *   reconnectAttempts: number,
 *   userId: string,
 *   usePairingCode: boolean
 * }>}
 */
const sessions = new Map();

// Baileys logger
const loggerBaileys = pino({ level: "info", stream: process.stdout });

// Fungsi untuk menghasilkan secret token sesi
function generateSessionToken(userId, phoneNumber) {
  return jwt.sign({ userId, phoneNumber }, config.sessionSecret, {
    expiresIn: "1y",
  });
}

// Fungsi untuk menghapus sesi secara paksa (dari memori, DB, dan disk)
async function destroySession(phoneNumber, userId, io, reason = "Timeout") {
  const session = sessions.get(phoneNumber);
  logger.info(`Destroying session for ${phoneNumber} (User: ${userId}) due to: ${reason}`);

  if (session) {
    try {
      // Using sock.ws.close() is often faster and more reliable for immediate shutdown
      // than sock.logout() which can sometimes hang.
      session.sock?.ws?.close();
      logger.info(`Baileys client connection for ${phoneNumber} closed.`);
    } catch (err) {
      logger.error(
        `Error logging out Baileys client for ${phoneNumber}: ${err.message}`,
        err.stack,
      );
    }
    if (session.qrTimeout) clearTimeout(session.qrTimeout);
    sessions.delete(phoneNumber);
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

  // Hapus entri sesi dari record User di DB
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

// Fungsi untuk mendapatkan pairing code
async function getPairingCode(phoneNumber, io) {
  const session = sessions.get(phoneNumber);
  if (!session) return null;
  for (let i = 1; i < 5; i++) {
    // This is a fire-and-forget promise, but it's self-contained.
    // No need for complex error handling here as connection.update will handle failures.
    try {
      logger.info(`Requesting pairing code for ${phoneNumber}...`);
      await new Promise((resolve, _) => setTimeout(resolve, 1000))
      const code = await session.sock.requestPairingCode(phoneNumber)
      if (code) {
        logger.info(`Pairing code for ${phoneNumber}: ${code}`);
        session.pairingCode = code;
        session.status = "PAIRING_READY";
        io.emit("pairing_code", { phoneNumber, code, userId: session.userId, secretToken: session.secretToken });
        updateSessionStatusInDB(session.userId, phoneNumber, "PAIRING_READY");
        break
      }
    } catch (err) {
      logger.error(`Failed to request pairing code for ${phoneNumber}: ${err.message}`);
      continue
      // The connection will likely close, which is handled by the 'connection.update' event.
    };
  }
  return session.pairingCode
}

async function createClient(userId, phoneNumber, io, usePairingCode = true) {
  logger.info(
    `Attempting to create/restore client for ${phoneNumber} (User ID: ${userId}). Via Pairing Code: ${usePairingCode}.`,
  );

  // --- 1. Check for existing session in memory ---
  if (sessions.has(phoneNumber)) {
    const existingSession = sessions.get(phoneNumber);
    if (existingSession.status === "READY") {
      logger.info(`Client for ${phoneNumber} already ready in memory.`);
      return { success: true, message: "Client is already ready." };
    }
    if (["CONNECTING", "QR_READY", "PAIRING_READY"].includes(existingSession.status)) {
      logger.info(`Client for ${phoneNumber} is already initializing in memory.`);
      return { success: true, message: "Client is already initializing." };
    }
  }

  // --- 2. Validate user and session limits from DB ---
  const user = await User.findById(userId).lean(); // .lean() for faster, non-mongoose-doc object
  if (!user) throw new Error(`User with ID ${userId} not found.`);

  let sessionEntry = user.whatsappSessions.find(
    (s) => s.phoneNumber === phoneNumber,
  );
  if (sessionEntry) {
    logger.info(`Found existing session entry for ${phoneNumber} in DB.`);
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
      usePairingCode,
      status: "CONNECTING",
    };
    // Atomically push the new session to the user's document
    await User.updateOne({ _id: userId }, { $push: { whatsappSessions: sessionEntry } });
    logger.info(`New session entry created for ${phoneNumber} in DB.`);
  }

  // --- 3. Setup session in memory and on disk ---
  const session = {
    sock: null,
    qr: null,
    pairingCode: null,
    status: "CONNECTING",
    qrTimeout: null,
    reconnectAttempts: 0,
    userId,
    usePairingCode,
    secretToken: sessionEntry.secretToken,
  };
  sessions.set(phoneNumber, session);

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

  // --- 4. Create Baileys socket and attach event handlers ---
  const sock = makeWASocket({
    version: version,
    logger: loggerBaileys,
    printQRInTerminal: !usePairingCode, // Selalu false karena kita handle di sini
    auth: state,
    generateHighQualityLinkPreview: true,
    syncFullHistory: true,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
  });

  session.sock = sock;

  if (usePairingCode && !sock.authState.creds.registered) {
    getPairingCode(phoneNumber, io)
  }

  // --- 6. Attach Event Handlers ---
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async (update) => handleConnectionUpdate(update, phoneNumber, io));
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type === "notify") {
      for (const msg of messages) {
        if (
          // msg.key.fromMe ||
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

        // Mengambil webhookUrl dari database
        const currentUser = await User.findById(userId);
        const currentSession = currentUser?.whatsappSessions.find((s) => s.phoneNumber === phoneNumber);
        const webhookUrl = currentSession?.webhookUrl;

        if (webhookUrl) {
          const webhookData = {
            event: "new_message",
            phoneNumber: phoneNumber, // Nomor WhatsApp yang menerima pesan
            from: senderJid, // Pengirim pesan
            message: messageText, // Isi pesan
            messageObject: msg, // Objek pesan lengkap dari Baileys
            timestamp: Date.now(),
            userId: userId
          };
          await sendWebhook(webhookUrl, webhookData);
        } else {
          logger.info(`No webhook URL configured for ${phoneNumber}. Skipping webhook delivery.`);
        }

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

  logger.info(`Baileys client instance created for ${phoneNumber}.`);
  updateSessionStatusInDB(userId, phoneNumber, "CONNECTING");

  return {
    success: true,
    message: "Client initialization started.",
    sessionToken: sessionEntry.secretToken,
  };
}

async function handleConnectionUpdate(update, phoneNumber, io) {
  const session = sessions.get(phoneNumber);
  if (!session) return;

  const { userId, usePairingCode } = session;
  const { connection, lastDisconnect, qr } = update;
  logger.info(`Connection Update for ${phoneNumber}: ${connection}`);

  if (qr) {
    logger.info(`QR RECEIVED for ${phoneNumber}.`);
    session.qr = qr;
    session.status = "QR_READY";
    io.emit("qr_code", { phoneNumber, qr, userId });

    if (session.qrTimeout) clearTimeout(session.qrTimeout);
    session.qrTimeout = setTimeout(
      () => {
        if (session.status !== "READY") {
          logger.warn(`QR timeout for ${phoneNumber}. Destroying session.`);
          destroySession(phoneNumber, userId, io, "QR_TIMEOUT");
        }
      },
      QR_TIMEOUT_MINUTES * 60 * 1000,
    );
    updateSessionStatusInDB(userId, phoneNumber, "QR_READY");
    return;
  }

  if (connection === "open") {
    session.status = "READY";
    session.reconnectAttempts = 0;
    session.qr = null;
    session.pairingCode = null;
    if (session.qrTimeout) clearTimeout(session.qrTimeout);

    const info = {
      pushname: session.sock.user.name,
      number: jidNormalizedUser(session.sock.user.id),
    };
    io.emit("client_status", { phoneNumber, status: "READY", userId, info });
    updateSessionStatusInDB(userId, phoneNumber, "READY");
    logger.info(`Client ${phoneNumber} is READY! Connected as ${info.pushname} (${info.number}).`);
    return;
  }

  if (connection === "close") {
    const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
    const reason = DisconnectReason[statusCode] || "UNKNOWN";
    logger.error(`Connection closed for ${phoneNumber}. Reason: ${reason} (${statusCode}), Error: ${lastDisconnect?.error?.message}`);
    sessions.delete(phoneNumber);

    if (session.qrTimeout) clearTimeout(session.qrTimeout);

    let shouldReconnect = true;
    let status = "DISCONNECTED";

    if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
      logger.warn(`Authentication failure for ${phoneNumber}. Destroying session.`);
      status = "AUTH_FAILURE";
      shouldReconnect = false;
      destroySession(phoneNumber, userId, io, `AUTH_FAILURE: ${reason}`);
    }

    if (shouldReconnect) {
      if (session.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        session.reconnectAttempts++;
        logger.info(`Attempting reconnect #${session.reconnectAttempts} for ${phoneNumber} in ${RECONNECT_DELAY_MS / 1000}s...`);
        setTimeout(() => {
          createClient(userId, phoneNumber, io, usePairingCode).catch((e) =>
            logger.error(`Error during reconnect attempt for ${phoneNumber}: ${e.message}`, e.stack)
          );
        }, RECONNECT_DELAY_MS);
      } else {
        logger.error(`Max reconnect attempts reached for ${phoneNumber}. Destroying session.`);
        destroySession(phoneNumber, userId, io, "MAX_RECONNECTS_REACHED");
      }
    }
    return;
  }

  // For other states like 'connecting', 'pairing', etc.
  if (connection) {
    session.status = connection.toUpperCase();
    io.emit("client_status", { phoneNumber, status: session.status, userId });
    updateSessionStatusInDB(userId, phoneNumber, session.status);
  }
}

async function getAuthentication(phoneNumber, io, usePairingCode = true) {
  const session = sessions.get(phoneNumber);
  if (!session) {
    throw new Error(`No active session found for ${phoneNumber}. Please start a new session.`);
  }

  if (usePairingCode) {
    const code = session.pairingCode || await getPairingCode(phoneNumber, io);
    io.emit('pairing_code', { userId: session.userId, phoneNumber, code });
    return code
  } else {
    io.emit('qr_code', { userId: session.userId, phoneNumber, qr: session.qr });
    return session.qr;
  }
}

function updateSessionStatusInDB(userId, phoneNumber, status) {
  User.updateOne({ _id: userId, "whatsappSessions.phoneNumber": phoneNumber }, { $set: { "whatsappSessions.$.status": status, "whatsappSessions.$.lastUpdated": new Date() } }).exec();
}
// Fungsi untuk memuat ulang semua sesi yang sudah ada saat server restart
async function restoreSessions(io) {
  logger.info("Starting session restoration process with Baileys...");
  await fs.ensureDir(SESSIONS_DIR);

  const allUsers = await User.find({});

  for (const user of allUsers) {
    for (const sessionEntry of user.whatsappSessions) {
      const { phoneNumber, usePairingCode } = sessionEntry;
      const sessionPath = path.join(SESSIONS_DIR, phoneNumber);

      // Cek apakah direktori sesi untuk nomor ini ada di disk
      // Jika ada, kita asumsikan sesi valid dan mencoba restore.
      // Tidak perlu usePairingCode di sini karena ini restore sesi yang sudah ada.
      if ((await fs.pathExists(sessionPath)) && !sessions.has(phoneNumber)) {
        logger.info(
          `Attempting to restore session for ${phoneNumber} from disk (owned by user ${user._id})...`,
        );
        try {
          await createClient(user._id, phoneNumber, io, usePairingCode);
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
      } else if (sessions.has(phoneNumber)) {
        logger.info(
          `Session for ${phoneNumber} already in memory. Skipping restore.`,
        );
      }
    }
  }
  logger.info("Session restoration process completed.");
}

// Fungsi untuk mengirim data ke webhook URL
async function sendWebhook(webhookUrl, data) {
  try {
    const response = await axios.get(webhookUrl, data, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000, // Timeout 10 detik
    });
    logger.info(`Webhook sent successfully to ${webhookUrl}. Status: ${response.status}`);
    return { success: true, status: response.status, data: response.data };
  } catch (error) {
    logger.error(`Failed to send webhook to ${webhookUrl}. Error: ${error.message}`);
    if (error.response) {
      logger.error(`Webhook error response status: ${error.response.status}`);
      logger.error(`Webhook error response data: ${JSON.stringify(error.response.data)}`);
      throw new Error(`Webhook failed with status ${error.response.status}: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      logger.error(`No response received for webhook to ${webhookUrl}.`);
      throw new Error(`No response received for webhook: ${error.message}`);
    } else {
      logger.error(`Error setting up webhook request to ${webhookUrl}: ${error.message}`);
      throw new Error(`Error setting up webhook request: ${error.message}`);
    }
  }
}

async function setWebhookUrl(userId, phoneNumber, webhookUrl) {
  try {
    // Cek apakah URL valid (contoh sederhana)
    if (webhookUrl && !/^https?:\/\//i.test(webhookUrl)) {
      throw new Error('Invalid webhook URL format. Must start with http:// or https://');
    }

    const result = await User.updateOne(
      { _id: userId, 'whatsappSessions.phoneNumber': phoneNumber },
      { '$set': { 'whatsappSessions.$.webhookUrl': webhookUrl } }
    );

    if (result.matchedCount === 0) {
      return { success: false, message: 'WhatsApp session not found for this user.' };
    }
    if (result.modifiedCount === 0) {
      return { success: true, message: 'Webhook URL not changed (already set to the same value or no update needed).' };
    }
    logger.info(`Webhook URL for ${phoneNumber} set to: ${webhookUrl || 'null'}.`);
    return { success: true, message: 'Webhook URL updated successfully.' };
  } catch (error) {
    logger.error(`Error setting webhook URL for ${phoneNumber}: ${error.message}`, error.stack);
    throw error;
  }
}

// Fungsi untuk mendapatkan status klien, disaring berdasarkan pengguna
async function getClientStatusForUser(userId) {
  const user = await User.findById(userId);
  if (!user) {
    return [];
  }

  // Menggunakan map untuk transformasi yang lebih fungsional dan mengembalikan array objek
  const statuses = user.whatsappSessions.map(session => {
    const phoneNumber = session.phoneNumber;
    const memSession = sessions.get(phoneNumber);
    let info = null;
    if (memSession?.sock?.user) {
      info = {
        pushname: memSession.sock.user.name,
        number: jidNormalizedUser(memSession.sock.user.id),
      };
    }

    return {
      phoneNumber, // Menambahkan phoneNumber ke dalam objek
      status: memSession?.status || session.status || "NOT_FOUND",
      qr: memSession?.qr || null,
      info,
      secretToken: session.secretToken,
      webhookUrl: session.webhookUrl || null,
      usePairingCode: session.usePairingCode,
    };
  });
  return statuses;
}

// Fungsi untuk mengirim pesan teks
async function sendMessage(senderPhoneNumber, targetNumber, message) {
  const session = sessions.get(senderPhoneNumber);
  if (!session?.sock || session.status !== "READY") {
    throw new Error(
      `Client for ${senderPhoneNumber} is not ready or does not exist. Status: ${session?.status || "Unknown"}`,
    );
  }

  const jid = jidNormalizedUser(`${targetNumber}@s.whatsapp.net`); // Baileys menggunakan format ini
  try {
    const result = await session.sock.sendMessage(jid, { text: message });
    return { success: true, id: result.key.id };
  } catch (error) {
    console.error(
      `Error sending message from ${senderPhoneNumber} to ${targetNumber}:`,
      error,
    );
    throw new Error(`Failed to send message: ${error.message}`);
  }
}

async function sendMedia(
  senderPhoneNumber,
  targetNumber,
  filePath,
  caption = "",
) {
  const session = sessions.get(senderPhoneNumber);
  if (!session?.sock || session.status !== "READY") {
    throw new Error(
      `Client for ${senderPhoneNumber} is not ready or does not exist. Status: ${session?.status || "Unknown"}`,
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

    const result = await session.sock.sendMessage(jid, mediaContent);
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
  getAuthentication,
  setWebhookUrl,
  sendMessage,
  sendMedia,
  restoreSessions,
  destroySession,
  sendWebhook
};
