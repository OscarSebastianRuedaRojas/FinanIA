import path from "node:path";
import { ingestEmicron } from "./EmicronIngestor.js";

export const DEFAULT_EMICRON_RAW_DIR = path.resolve(process.cwd(), "data", "raw", "emicron");
export const DEFAULT_EMICRON_DB_PATH = path.resolve(process.cwd(), "data", "emicron.sqlite");

const rawDir = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : DEFAULT_EMICRON_RAW_DIR;

try {
  console.log(`📥 Ingestando EMICRON desde ${rawDir}...`);
  const { businesses } = ingestEmicron(rawDir, DEFAULT_EMICRON_DB_PATH);
  console.log(`✅ ${businesses} micronegocios cargados en ${DEFAULT_EMICRON_DB_PATH}`);
  console.log("Fuente: Departamento Administrativo Nacional de Estadística: www.dane.gov.co");
} catch (error: any) {
  console.error(`❌ ${error.message}`);
  process.exitCode = 1;
}
