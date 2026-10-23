// Códigos DIVIPOLA de departamento (COD_DEPTO)
export const DEPARTMENTS: Record<string, string> = {
  "05": "Antioquia",
  "08": "Atlántico",
  "11": "Bogotá D.C.",
  "13": "Bolívar",
  "15": "Boyacá",
  "17": "Caldas",
  "18": "Caquetá",
  "19": "Cauca",
  "20": "Cesar",
  "23": "Córdoba",
  "25": "Cundinamarca",
  "27": "Chocó",
  "41": "Huila",
  "44": "La Guajira",
  "47": "Magdalena",
  "50": "Meta",
  "52": "Nariño",
  "54": "Norte de Santander",
  "63": "Quindío",
  "66": "Risaralda",
  "68": "Santander",
  "70": "Sucre",
  "73": "Tolima",
  "76": "Valle del Cauca",
  "81": "Arauca",
  "85": "Casanare",
  "86": "Putumayo",
  "88": "San Andrés y Providencia",
  "91": "Amazonas",
  "94": "Guainía",
  "95": "Guaviare",
  "97": "Vaupés",
  "99": "Vichada",
};

// Rama de actividad CIIU Rev. 4 agrupada en 12 grupos (GRUPOS12)
export const SECTORS_GRUPOS12: Record<string, string> = {
  "01": "Agricultura, ganadería, caza, silvicultura y pesca",
  "02": "Minería",
  "03": "Industria manufacturera",
  "04": "Construcción",
  "05": "Comercio y reparación de vehículos automotores y motocicletas",
  "06": "Transporte y almacenamiento",
  "07": "Alojamiento y servicios de comida",
  "08": "Información y comunicaciones",
  "09": "Actividades inmobiliarias, profesionales y servicios administrativos",
  "10": "Educación",
  "11": "Actividades de atención a la salud humana y de asistencia social",
  "12": "Actividades artísticas, de entretenimiento, de recreación y otras actividades de servicios",
};

// Costos del mes anterior (módulo de costos, gastos y activos)
export const COST_LINES: Record<string, string> = {
  P3056_A: "Costo de mercancía vendida",
  P3056_B: "Insumos para la prestación del servicio",
  P3056_C: "Materias primas, materiales y empaques",
  P3056_D: "Costos de producción agropecuaria y extractiva",
  P3056_E: "Otros costos",
};

// Gastos mensuales (módulo de costos, gastos y activos)
export const EXPENSE_LINES: Record<string, string> = {
  P3017_A: "Arrendamiento",
  P3017_B: "Energía eléctrica",
  P3017_C: "Telecomunicaciones",
  P3017_D: "Agua y alcantarillado",
  P3017_E: "Combustibles",
  P3017_F: "Mantenimiento y reparaciones",
  P3017_G: "Transporte y fletes",
  P3017_H: "Publicidad y servicios profesionales",
  P3017_I: "Licencias y registros",
  P3017_J: "Impuestos",
  P3017_K: "Aseo, vigilancia y administración",
  P3017_L: "Otros pagos del proceso productivo",
};

// GASTOS_MES del DANE excluye licencias (P3017_I) e impuestos (P3017_J); se suman aparte
export const TAX_AND_LICENSE_CATEGORIES = [EXPENSE_LINES.P3017_I, EXPENSE_LINES.P3017_J];
