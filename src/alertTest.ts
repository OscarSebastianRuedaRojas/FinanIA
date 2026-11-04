import "dotenv/config";
import { createAlertChannelFromEnv } from "./adapters/notifications/createAlertChannel.js";
import { NtfyAlertAdapter } from "./adapters/notifications/NtfyAlertAdapter.js";
import { TwilioWhatsAppAlertAdapter } from "./adapters/notifications/TwilioWhatsAppAlertAdapter.js";
import { AlertError } from "./ports/AlertPort.js";

// Verifica la configuración de alertas enviando una alerta de prueba por el canal del .env
async function main(): Promise<number> {
  const message = process.argv.slice(2).join(" ").trim() || "Si recibís este mensaje, las alertas de FinanIA están funcionando.";
  try {
    const alerts = createAlertChannelFromEnv();
    const channel =
      alerts instanceof NtfyAlertAdapter
        ? `ntfy (${alerts.destination})`
        : alerts instanceof TwilioWhatsAppAlertAdapter
          ? `WhatsApp (${alerts.recipient.replace("whatsapp:", "")})`
          : "canal configurado";
    console.log(`📲 Enviando alerta de prueba por ${channel}...`);
    const { id } = await alerts.send({ severity: "INFO", title: "Alerta de prueba", message });
    console.log(`✅ Alerta aceptada (id ${id}). Revisá tu celular.`);
    return 0;
  } catch (error: any) {
    console.error(`❌ ${error instanceof AlertError ? `${error.code}: ` : ""}${error?.message ?? error}`);
    return 1;
  }
}

main().then((code) => {
  process.exitCode = code;
});
