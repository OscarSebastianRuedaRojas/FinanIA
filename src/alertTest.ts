import "dotenv/config";
import { TwilioWhatsAppAlertAdapter } from "./adapters/notifications/TwilioWhatsAppAlertAdapter.js";
import { AlertError } from "./ports/AlertPort.js";

// Verifica la configuración de WhatsApp enviando una alerta de prueba
async function main(): Promise<number> {
  const message = process.argv.slice(2).join(" ").trim() || "Si recibís este mensaje, las alertas de FinanIA están funcionando.";
  try {
    const alerts = TwilioWhatsAppAlertAdapter.fromEnv();
    console.log(`📲 Enviando alerta de prueba a ${alerts.recipient.replace("whatsapp:", "")}...`);
    const { id } = await alerts.send({ severity: "INFO", title: "Alerta de prueba", message });
    console.log(`✅ Twilio aceptó la alerta (id ${id}). Revisá tu WhatsApp.`);
    return 0;
  } catch (error: any) {
    console.error(`❌ ${error instanceof AlertError ? `${error.code}: ` : ""}${error?.message ?? error}`);
    return 1;
  }
}

main().then((code) => {
  process.exitCode = code;
});
