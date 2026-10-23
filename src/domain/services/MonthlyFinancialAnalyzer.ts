export class MonthlyFinancialAnalyzer {
  static round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  // Porcentaje de part sobre total; null cuando el total no es positivo
  static pct(part: number, total: number): number | null {
    return total > 0 ? this.round2((part / total) * 100) : null;
  }

  static operatingProfit(figures: {
    salesLastMonth: number;
    costsLastMonth: number;
    expensesLastMonth: number;
    taxesAndLicensesLastMonth: number;
  }): number {
    return figures.salesLastMonth - figures.costsLastMonth - figures.expensesLastMonth - figures.taxesAndLicensesLastMonth;
  }

  static median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  // Porcentaje de valores menores o iguales a value
  static percentile(value: number, values: number[]): number {
    if (values.length === 0) return 0;
    return this.round2((values.filter((v) => v <= value).length / values.length) * 100);
  }
}
