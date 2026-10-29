import dotenv from "dotenv";
dotenv.config();

const WA_API_URL =
  process.env.WA_API_URL || "https://wifi.itvault.cloud/post-data";
const WA_API_KEY = process.env.WA_API_KEY;

// Format nomor lokal (08xx / 8xx / +62xx) -> 62xxxxxxxxxx
const formatPhone = (noHp) => {
  let num = String(noHp).replace(/\D/g, "");
  if (num.startsWith("0")) num = "62" + num.slice(1);
  if (!num.startsWith("62")) num = "62" + num;
  return num;
};
/*

  Kirim pesan WhatsApp via HTTP API (pengganti Baileys).
 
  Endpoint : POST WA_API_URL
  Header   : Content-Type: application/json, x-api-key: WA_API_KEY
  Body     : { messages: [{ to: "628xxx", text: "..." }] }
*/
export const sendWhatsAppMessage = async (noHp, message) => {
  if (!noHp) {
    console.log("Nomor kosong");
    return { success: false, reason: "Nomor kosong" };
  }

  if (!WA_API_KEY) {
    console.error("WA_API_KEY belum diset di .env");
    return { success: false, reason: "WA_API_KEY belum dikonfigurasi" };
  }

  const phone = formatPhone(noHp);

  try {
    console.log(`📤 Mengirim WA API ke ${phone}...`);

    const response = await fetch(WA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": WA_API_KEY,
      },
      body: JSON.stringify({
        messages: [
          {
            to: phone,
            text: message,
          },
        ],
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const reason = data?.message || data?.error || `HTTP ${response.status}`;
      console.error(`✗ WA API error → ${phone}: ${reason}`);
      return { success: false, reason };
    }

    console.log(`✓ WA API terkirim → ${phone}`);
    return { success: true, result: data };
  } catch (error) {
    console.error(`✗ WA API exception → ${phone}:`, error.message);
    return { success: false, reason: error.message };
  }
};
