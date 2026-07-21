export {
  DAILY_RESET_NOTICE,
  DEMO_CONTRACTS,
  getDemoContract,
  listDemoContracts,
  validateDemoContracts
} from "./contracts.js";

export {
  DEMO_DEPLOYMENT_NOTICE,
  GENERATED_SAMPLE_NOTICE,
  PAYROLL_HOURS_BEHAVIOR,
  PERSISTENT_DEMO_BASELINES,
  getPersistentDemoBaseline,
  validatePersistentDemoBaselines
} from "./baselines.js";

export {
  DEMO_NOTICE_ELEMENT,
  ROBOTS_DIRECTIVE,
  applyDemoDocumentGuards,
  buildDemoNoticeModel,
  defineDemoNotice
} from "./demo-notice.js";

import { defineDemoNotice } from "./demo-notice.js";

defineDemoNotice();
