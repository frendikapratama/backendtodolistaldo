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

let reconnectDelay = 3000; // 3 detik
const MAX_RECONNECT_DELAY = 60000; // maksimal 1 menit
let reconnectTimer = null;

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

      reconnectDelay = 3000; // reset delay

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      isConnecting = false;
      readyPromiseResolve(sock);
    }

    // if (connection === "close") {
    //   isConnecting = false;

    //   const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
    //   const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

    //   console.log(
    //     `✗ WhatsApp disconnected (code: ${statusCode}). Reconnect: ${shouldReconnect}`,
    //   );

    //   if (!shouldReconnect) {
    //     console.log(
    //       "WhatsApp logged out. Hapus folder wa-auth lalu scan ulang.",
    //     );
    //     return;
    //   }

    //   readyPromise = new Promise((resolve) => {
    //     readyPromiseResolve = resolve;
    //   });

    //   if (reconnectTimer) clearTimeout(reconnectTimer);

    //   console.log(`Reconnect dalam ${reconnectDelay / 1000} detik...`);

    //   reconnectTimer = setTimeout(() => {
    //     reconnectTimer = null;
    //     connectWhatsApp();
    //   }, reconnectDelay);

    //   reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    // }
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
  if (!noHp) {
    console.log("Nomor kosong");
    return { success: false, reason: "Nomor kosong" };
  }

  try {
    console.log("Menunggu socket...");
    const socket = await readyPromise;

    console.log("Socket siap");

    const jid = toJid(noHp);
    console.log("JID :", jid);

    // Cek apakah nomor terdaftar di WhatsApp
    const exists = await socket.onWhatsApp(jid);
    console.log("onWhatsApp :", exists);

    if (!exists.length || !exists[0].exists) {
      console.log(`✗ ${jid} tidak terdaftar di WhatsApp`);

      return {
        success: false,
        reason: "Nomor tidak terdaftar",
      };
    }

    const result = await socket.sendMessage(jid, {
      text: message,
    });

    // console.log("WA Result :", result);

    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error("WA Error :", error);

    return {
      success: false,
      reason: error.message,
    };
  }
};
