const WHATSAPP_PHONE_NUMBER_ID = "949676744905520";

// Keep this file out of any public documentation. Rotate if exposed.
const WHATSAPP_ACCESS_TOKEN =
  "EAAPhu6LJO5EBQ7vEVVoxdm7jwinhySCeZCqB1ZCagi2nKCaAO5TE2jehO2Ol7nyKUVzwvfRxxekD59AZCWnizn5hPUuGZB8xyomMUqttFn4zBYQ55Tf1YiTDLy6lzhhEdYKAwNPQBcugMsB5R7Cf6AlHAZAluvtr4M73jgHxZBHkfh5r0BMx3bwo18tJQAZDZD";

export function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendWhatsAppOtp(phone: string, otp: string) {
  const response = await fetch(
    `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: {
          body: `Your PartsWale OTP is: ${otp}\n\nDo not share this with anyone.`,
        },
      }),
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "WhatsApp OTP send failed");
  }

  return payload;
}
