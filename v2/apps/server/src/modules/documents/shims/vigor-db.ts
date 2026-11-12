// legacy external/vigorDb.js → v2 vigor connection (read-only)
import { getVigorDb as v2GetVigorDb } from "../../../integrations/vigor.js";
import { documentsContext } from "../context.js";
export const getVigorDb = (): Promise<any> => v2GetVigorDb(documentsContext().vigorUri);
export default getVigorDb;
