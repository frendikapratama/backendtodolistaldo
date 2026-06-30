import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import pino from "pino";
import path from "path";

const AUTH_DIR = path.join(process.cwd(), "wa-auth");
const logger = pino({ level: "silent" });

let sock = null;
let isConnecting = false;
let readyPromiseResolve = null;
let readyPromise = new Promise((resolve) => {
  readyPromiseResolve = resolve;
});

const connectWhatsApp = async () => {
  if (isConnecting) return;
  isConnecting = true;

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n📱 Scan QR berikut untuk login WhatsApp:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("✓ WhatsApp connected");
      isConnecting = false;
      readyPromiseResolve(sock);
    }

    if (connection === "close") {
      isConnecting = false;
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(
        `✗ WhatsApp disconnected (code: ${statusCode}). Reconnect: ${shouldReconnect}`,
      );

      if (shouldReconnect) {
        readyPromise = new Promise((resolve) => {
          readyPromiseResolve = resolve;
        });
        connectWhatsApp();
      } else {
        console.log(
          "WhatsApp logged out. Hapus folder wa-auth lalu scan ulang.",
        );
      }
    }
  });
};

export const initWhatsApp = () => {
  connectWhatsApp().catch((err) =>
    console.error("Gagal init WhatsApp:", err.message),
  );
};

// Format nomor lokal (08xx / 8xx / +62xx) -> 62xxxxxxxxxx@s.whatsapp.net
const toJid = (noHp) => {
  let num = String(noHp).replace(/\D/g, "");
  if (num.startsWith("0")) num = "62" + num.slice(1);
  if (!num.startsWith("62")) num = "62" + num;
  return `${num}@s.whatsapp.net`;
};

export const sendWhatsAppMessage = async (noHp, message) => {
  if (!noHp) return { success: false, reason: "no noHp" };

  try {
    const socket = await readyPromise; // tunggu sampai koneksi siap
    const jid = toJid(noHp);
    await socket.sendMessage(jid, { text: message });
    return { success: true };
  } catch (error) {
    console.error(`✗ WA gagal kirim ke ${noHp}:`, error.message);
    return { success: false, reason: error.message };
  }
};
