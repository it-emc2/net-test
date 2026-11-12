// legacy services/configService.js → v2 BusinessConfig (resolved at call time)
import { documentsContext } from "../context.js";
export default { get: (key: string, fallback?: unknown) => documentsContext().businessConfig.get(key, fallback) };
