export const DAILY_RESET_NOTICE =
  "This is a shared portfolio preview. Visitor-created data is cleared every day at 12:00 AM (Asia/Manila). Do not enter real or sensitive information.";

const commonPreview = {
  persistentNotice: true,
  noIndex: true,
  sharedEnvironment: true,
  warning: DAILY_RESET_NOTICE
};

const commonReset = {
  timezone: "Asia/Manila",
  localTime: "00:00",
  dispatcherCronUtc: "*/15 * * * *",
  dispatcherIntervalMinutes: 15,
  dataPolicy: "visitor-created-demo-data-is-disposable"
};

const disabledUploads = {
  enabled: false
};

const credential = (audience, fields) => ({
  audience,
  ...fields,
  immutable: true,
  enforcement: ["ui", "api", "database"]
});

const contracts = [
  {
    id: "cn",
    name: "CN Class Management",
    hostname: "cn-demo.pauuu.dev",
    preview: commonPreview,
    reset: {
      ...commonReset,
      protectedDefaults: ["devpau", "testteacher", "teststudent"]
    },
    credentials: [
      credential("Administrator", { username: "devpau", password: "password" }),
      credential("Teacher", { username: "testteacher", password: "password" }),
      credential("Student", { username: "teststudent", password: "password" })
    ],
    uploads: {
      enabled: true,
      private: true,
      maxFileBytes: 2 * 1024 * 1024,
      maxFilesPerReport: 5,
      maxFilesPerSessionPerDay: 20,
      maxTotalBytes: 100 * 1024 * 1024
    }
  },
  {
    id: "rcmi",
    name: "RCMI Attendance Checker",
    hostname: "rcmi-demo.pauuu.dev",
    preview: commonPreview,
    reset: {
      ...commonReset,
      protectedDefaults: ["administrator-password"]
    },
    credentials: [
      credential("Administrator page", { password: "password" })
    ],
    uploads: disabledUploads
  },
  {
    id: "hours",
    name: "Hours Tracker",
    hostname: "hours-demo.pauuu.dev",
    preview: commonPreview,
    reset: {
      ...commonReset,
      protectedDefaults: ["default-password"]
    },
    credentials: [
      credential("Default access", { password: "password" })
    ],
    uploads: disabledUploads
  },
  {
    id: "payroll",
    name: "Payroll Splitter",
    hostname: "payroll-demo.pauuu.dev",
    preview: commonPreview,
    reset: {
      ...commonReset,
      protectedDefaults: []
    },
    credentials: [],
    uploads: disabledUploads
  },
  {
    id: "travels",
    name: "P Travels",
    hostname: "travels-demo.pauuu.dev",
    preview: commonPreview,
    reset: {
      ...commonReset,
      protectedDefaults: []
    },
    credentials: [],
    uploads: disabledUploads
  }
];

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nestedValue of Object.values(value)) {
      deepFreeze(nestedValue);
    }
  }
  return value;
}

function validateCredential(projectId, entry) {
  if (!entry.audience || entry.immutable !== true) {
    throw new TypeError("Invalid credential contract for " + projectId + ".");
  }
  if (!entry.username && !entry.password) {
    throw new TypeError("Credential contract has no public demo field for " + projectId + ".");
  }
  if (
    !Array.isArray(entry.enforcement) ||
    ["ui", "api", "database"].some((layer) => !entry.enforcement.includes(layer))
  ) {
    throw new TypeError("Credential immutability layers are incomplete for " + projectId + ".");
  }
}

function validateContract(contract) {
  if (!/^[a-z][a-z0-9-]*$/.test(contract.id)) {
    throw new TypeError("Invalid demo contract id.");
  }
  if (contract.hostname !== contract.id + "-demo.pauuu.dev") {
    throw new TypeError("Unexpected demo hostname for " + contract.id + ".");
  }
  if (
    contract.preview?.persistentNotice !== true ||
    contract.preview?.noIndex !== true ||
    contract.preview?.warning !== DAILY_RESET_NOTICE
  ) {
    throw new TypeError("Preview warning contract is incomplete for " + contract.id + ".");
  }
  if (
    contract.reset?.timezone !== "Asia/Manila" ||
    contract.reset?.localTime !== "00:00" ||
    contract.reset?.dispatcherIntervalMinutes !== 15
  ) {
    throw new TypeError("Reset timing contract is incomplete for " + contract.id + ".");
  }
  for (const entry of contract.credentials) {
    validateCredential(contract.id, entry);
  }
}

for (const contract of contracts) {
  validateContract(contract);
}

export const DEMO_CONTRACTS = deepFreeze(
  Object.fromEntries(contracts.map((contract) => [contract.id, contract]))
);

export function listDemoContracts() {
  return Object.values(DEMO_CONTRACTS);
}

export function getDemoContract(projectId) {
  const contract = DEMO_CONTRACTS[projectId];
  if (!contract) {
    throw new RangeError("Unknown demo project id.");
  }
  return contract;
}

export function validateDemoContracts() {
  const allContracts = listDemoContracts();
  const ids = new Set(allContracts.map((contract) => contract.id));
  const hostnames = new Set(allContracts.map((contract) => contract.hostname));

  if (allContracts.length !== 5 || ids.size !== 5 || hostnames.size !== 5) {
    throw new TypeError("Exactly five unique demo contracts are required.");
  }

  for (const contract of allContracts) {
    validateContract(contract);
  }

  return {
    valid: true,
    count: allContracts.length
  };
}
