// Micronegocio real de la Encuesta de Micronegocios (EMICRON) del DANE
export interface MicroBusinessProfile {
  id: string;
  departmentCode: string;
  departmentName: string;
  sectorCode: string;
  sectorName: string;
  referenceMonth: string;
}

// Cifras mensuales y anuales reportadas por el propietario (pesos colombianos)
export interface MonthlyFigures {
  salesLastMonth: number;
  salesSameMonthLastYear: number;
  salesLastYear: number;
  costsLastMonth: number;
  costsLastYear: number;
  expensesLastMonth: number;
  taxesAndLicensesLastMonth: number;
  monthsOperatedLastYear: number;
}

export interface FinancialLine {
  kind: "COST" | "EXPENSE";
  category: string;
  amount: number;
}

export interface PeerFigures {
  businessId: string;
  salesLastMonth: number;
  costsLastMonth: number;
  expensesLastMonth: number;
  taxesAndLicensesLastMonth: number;
}
