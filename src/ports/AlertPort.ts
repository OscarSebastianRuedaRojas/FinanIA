export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface Alert {
  severity: AlertSeverity;
  title: string;
  message: string;
}

export type AlertErrorCode =
  | "ALERT_NOT_CONFIGURED"
  | "ALERT_RECIPIENT_NOT_JOINED"
  | "ALERT_RATE_LIMITED"
  | "ALERT_DELIVERY_FAILED";

export class AlertError extends Error {
  constructor(public readonly code: AlertErrorCode, message: string) {
    super(message);
    this.name = "AlertError";
  }
}

// Canal para avisarle al operador (WhatsApp hoy; el agente no depende del proveedor)
export interface AlertPort {
  // Lanza AlertError cuando no se pudo entregar
  send(alert: Alert): Promise<{ id: string }>;
}
