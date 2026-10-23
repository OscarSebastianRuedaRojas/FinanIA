import { FinancialLine, MicroBusinessProfile, MonthlyFigures, PeerFigures } from "../domain/entities/MicroBusiness.js";

// Falla de infraestructura al consultar la fuente de datos (base ausente, corrupta, etc.)
export class DataSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataSourceError";
  }
}

export interface MicroBusinessDataPort {
  getProfile(businessId: string): Promise<MicroBusinessProfile | null>;
  getMonthlyFigures(businessId: string): Promise<MonthlyFigures | null>;
  getFinancialLines(businessId: string): Promise<FinancialLine[]>;
  // Pares con ventas positivas del mismo sector; departmentCode null = alcance nacional
  getSectorPeers(sectorCode: string, departmentCode: string | null, excludeBusinessId: string): Promise<PeerFigures[]>;
  // Micronegocio al azar con ventas positivas (null si la base está vacía)
  getRandomBusinessId(): Promise<string | null>;
}
