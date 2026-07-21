export const GENERATED_SAMPLE_NOTICE =
  "Sample records are fictional, generated for this portfolio preview, and restored after the daily reset.";

export const DEMO_DEPLOYMENT_NOTICE =
  "Demo hosting: frontend on Netlify; backend and database on Supabase.";

const cnBaseline = {
  projectId: "cn",
  timezone: "Asia/Manila",
  dateStrategy: "relative-to-logical-reset-date",
  resetPolicy: "restore-protected-baseline-after-visitor-data-purge",
  generated: true,
  accounts: {
    administrator: {
      username: "admin",
      password: "password",
      role: "admin",
      protected: true,
      master: false,
      visibleData: [
        "teachers",
        "students",
        "schedules",
        "reports",
        "remaining-classes",
        "receipts",
        "annual-report",
        "activity-logs"
      ],
      hiddenRoutes: [
        "/remaining-classes/permissions",
        "/remaining-classes/devtools",
        "/security"
      ],
      deniedCapabilities: [
        "admin-permissions.read",
        "admin-permissions.write",
        "developer-tools.use",
        "security-dashboard.read",
        "security-dashboard.write"
      ]
    },
    teacher: {
      username: "testteacher",
      password: "password",
      role: "teacher",
      protected: true
    },
    student: {
      username: "teststudent",
      password: "password",
      role: "student",
      protected: true
    }
  },
  noMasterAccountSeeded: true,
  reservedMasterUsernames: ["devpau"],
  teachers: [
    {
      key: "teacher-default",
      username: "testteacher",
      displayName: "Preview Teacher A",
      color: "#2563eb",
      loginEnabled: true
    },
    {
      key: "teacher-b",
      username: "preview-teacher-b",
      displayName: "Preview Teacher B",
      color: "#7c3aed",
      loginEnabled: false
    },
    {
      key: "teacher-c",
      username: "preview-teacher-c",
      displayName: "Preview Teacher C",
      color: "#059669",
      loginEnabled: false
    }
  ],
  students: [
    {
      key: "student-default",
      username: "teststudent",
      displayName: "Preview Student A",
      notes: "Generated sample student for portfolio preview.",
      loginEnabled: true
    },
    {
      key: "student-b",
      displayName: "Preview Student B",
      notes: "Generated sample student for portfolio preview.",
      loginEnabled: false
    },
    {
      key: "student-c",
      displayName: "Preview Student C",
      notes: "Generated sample student for portfolio preview.",
      loginEnabled: false
    },
    {
      key: "student-d",
      displayName: "Preview Student D",
      notes: "Generated sample student for portfolio preview.",
      loginEnabled: false
    },
    {
      key: "student-e",
      displayName: "Preview Student E",
      notes: "Generated sample student for portfolio preview.",
      loginEnabled: false
    },
    {
      key: "student-f",
      displayName: "Preview Student F",
      notes: "Generated sample student for portfolio preview.",
      loginEnabled: false
    }
  ],
  schedules: [
    {
      key: "schedule-reported-a",
      teacherKey: "teacher-default",
      studentKeys: ["student-default"],
      dayOffset: -2,
      timeslot: "09:00 - 09:30",
      note: "Generated completed class for report preview."
    },
    {
      key: "schedule-reported-b",
      teacherKey: "teacher-b",
      studentKeys: ["student-b", "student-c"],
      dayOffset: -1,
      timeslot: "14:00 - 14:45",
      note: "Generated group class for report preview."
    },
    {
      key: "schedule-today-a",
      teacherKey: "teacher-default",
      studentKeys: ["student-b"],
      dayOffset: 0,
      timeslot: "10:00 - 10:30",
      note: "Generated class scheduled for today."
    },
    {
      key: "schedule-today-b",
      teacherKey: "teacher-c",
      studentKeys: ["student-d"],
      dayOffset: 0,
      timeslot: "16:00 - 16:30",
      note: "Generated class scheduled for today."
    },
    {
      key: "schedule-next-a",
      teacherKey: "teacher-b",
      studentKeys: ["student-e"],
      dayOffset: 1,
      timeslot: "11:00 - 11:30",
      note: "Generated upcoming class."
    },
    {
      key: "schedule-next-b",
      teacherKey: "teacher-default",
      studentKeys: ["student-c"],
      dayOffset: 2,
      timeslot: "13:00 - 13:30",
      note: "Generated upcoming class."
    },
    {
      key: "schedule-next-c",
      teacherKey: "teacher-c",
      studentKeys: ["student-f"],
      dayOffset: 3,
      timeslot: "15:00 - 15:45",
      note: "Generated upcoming class."
    }
  ],
  reports: [
    {
      key: "report-a",
      scheduleKey: "schedule-reported-a",
      teacherKey: "teacher-default",
      content: "Generated preview report: lesson goals were completed and the student participated well.",
      book: "Preview Workbook 1",
      pages: "12-15",
      classDuration: "30 minutes",
      trackerRemarks: "Fictional progress entry for preview only."
    },
    {
      key: "report-b",
      scheduleKey: "schedule-reported-b",
      teacherKey: "teacher-b",
      content: "Generated preview report: the class practiced vocabulary and short conversations.",
      book: "Preview Conversation Guide",
      pages: "8-10",
      classDuration: "45 minutes",
      trackerRemarks: "Fictional group-class entry for preview only."
    }
  ],
  remainingClasses: {
    transactions: [
      {
        key: "transaction-a",
        studentKey: "student-default",
        teacherKey: "teacher-default",
        receiptNumber: "DEMO-RC-001",
        transactionNumber: "DEMO-TXN-001",
        type: "purchase",
        totalClasses: 12,
        remainingClasses: 8,
        dayOffset: -10,
        status: ""
      },
      {
        key: "transaction-b",
        studentKey: "student-b",
        teacherKey: "teacher-b",
        receiptNumber: "DEMO-RC-002",
        transactionNumber: "DEMO-TXN-002",
        type: "purchase",
        totalClasses: 10,
        remainingClasses: 6,
        dayOffset: -8,
        status: ""
      },
      {
        key: "transaction-c",
        studentKey: "student-c",
        teacherKey: "teacher-default",
        receiptNumber: "DEMO-RC-003",
        transactionNumber: "DEMO-TXN-003",
        type: "purchase",
        totalClasses: 8,
        remainingClasses: 5,
        dayOffset: -6,
        status: ""
      },
      {
        key: "transaction-d",
        studentKey: "student-d",
        teacherKey: "teacher-c",
        receiptNumber: "DEMO-RC-004",
        transactionNumber: "DEMO-TXN-004",
        type: "monthly-fee",
        totalClasses: 0,
        remainingClasses: 0,
        dayOffset: -4,
        status: "active"
      }
    ],
    usage: [
      {
        key: "usage-a",
        transactionKey: "transaction-a",
        scheduleKey: "schedule-reported-a",
        charged: true,
        materials: "Preview Workbook 1",
        pages: "12-15"
      },
      {
        key: "usage-b",
        transactionKey: "transaction-b",
        scheduleKey: "schedule-reported-b",
        charged: true,
        materials: "Preview Conversation Guide",
        pages: "8-10"
      }
    ]
  }
};

const rcmiBaseline = {
  projectId: "rcmi",
  timezone: "Asia/Manila",
  dateStrategy: "relative-to-logical-reset-date",
  resetPolicy: "restore-protected-baseline-after-visitor-data-purge",
  generated: true,
  roleHistoryStrategy: "one-relative-baseline-row-per-member",
  members: [
    {
      key: "leader-a",
      displayName: "Preview Leader A",
      role: "leader",
      districtLeaderId: "pastor-sherwin"
    },
    {
      key: "leader-b",
      displayName: "Preview Leader B",
      role: "leader",
      districtLeaderId: "ate-anj"
    },
    {
      key: "member-a",
      displayName: "Preview Member A",
      role: "member",
      leaderKey: "leader-a"
    },
    {
      key: "member-b",
      displayName: "Preview Member B",
      role: "member",
      leaderKey: "leader-a"
    },
    {
      key: "member-c",
      displayName: "Preview Member C",
      role: "member",
      leaderKey: "leader-b"
    },
    {
      key: "member-d",
      displayName: "Preview Member D",
      role: "member",
      leaderKey: "leader-b"
    },
    {
      key: "guest-a",
      displayName: "Preview Guest A",
      role: "guest",
      leaderKey: "leader-a"
    },
    {
      key: "guest-b",
      displayName: "Preview Guest B",
      role: "guest",
      leaderKey: "leader-b"
    }
  ],
  attendance: [
    { memberKey: "leader-a", dayOffset: 0 },
    { memberKey: "leader-b", dayOffset: 0 },
    { memberKey: "member-a", dayOffset: 0 },
    { memberKey: "member-c", dayOffset: 0 },
    { memberKey: "guest-a", dayOffset: 0 },
    { memberKey: "leader-a", dayOffset: -1 },
    { memberKey: "member-a", dayOffset: -1 },
    { memberKey: "member-b", dayOffset: -1 },
    { memberKey: "leader-b", dayOffset: -2 },
    { memberKey: "member-d", dayOffset: -2 }
  ]
};

export const PAYROLL_HOURS_BEHAVIOR = Object.freeze({
  synchronizationEvent: "blur",
  typingBehavior: "update-active-draft-only",
  derivedFieldRule: "derive-only-when-exactly-one-hours-field-is-empty",
  activeFieldProtection: "never-overwrite-focused-field",
  invalidInputBehavior: "do-not-derive-and-show-validation",
  appliesTo: Object.freeze(["total-hours", "every-person-hours-field"]),
  monetaryInputBehavior: "unchanged"
});

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nestedValue of Object.values(value)) {
      deepFreeze(nestedValue);
    }
  }
  return value;
}

function keySet(records, label) {
  const keys = new Set(records.map((record) => record.key));
  if (keys.size !== records.length || keys.has(undefined)) {
    throw new TypeError(label + " must use unique stable keys.");
  }
  return keys;
}

function requireReferences(records, field, allowedKeys, label) {
  for (const record of records) {
    const references = Array.isArray(record[field]) ? record[field] : [record[field]];
    if (references.some((reference) => !allowedKeys.has(reference))) {
      throw new TypeError(label + " contains an unknown reference.");
    }
  }
}

function validateCnBaseline() {
  if (
    cnBaseline.accounts.administrator.username !== "admin" ||
    cnBaseline.accounts.administrator.password !== "password" ||
    cnBaseline.accounts.administrator.master !== false ||
    cnBaseline.noMasterAccountSeeded !== true ||
    !cnBaseline.reservedMasterUsernames.includes("devpau")
  ) {
    throw new TypeError("CN administrator baseline is invalid.");
  }

  const requiredHiddenRoutes = new Set([
    "/remaining-classes/permissions",
    "/remaining-classes/devtools",
    "/security"
  ]);
  if (
    requiredHiddenRoutes.size !== cnBaseline.accounts.administrator.hiddenRoutes.length ||
    cnBaseline.accounts.administrator.hiddenRoutes.some(
      (route) => !requiredHiddenRoutes.has(route)
    )
  ) {
    throw new TypeError("CN restricted-route baseline is invalid.");
  }

  const teacherKeys = keySet(cnBaseline.teachers, "CN teachers");
  const studentKeys = keySet(cnBaseline.students, "CN students");
  const scheduleKeys = keySet(cnBaseline.schedules, "CN schedules");
  const transactionKeys = keySet(
    cnBaseline.remainingClasses.transactions,
    "CN remaining-class transactions"
  );

  requireReferences(cnBaseline.schedules, "teacherKey", teacherKeys, "CN schedules");
  requireReferences(cnBaseline.schedules, "studentKeys", studentKeys, "CN schedules");
  requireReferences(cnBaseline.reports, "scheduleKey", scheduleKeys, "CN reports");
  requireReferences(cnBaseline.reports, "teacherKey", teacherKeys, "CN reports");
  requireReferences(
    cnBaseline.remainingClasses.transactions,
    "teacherKey",
    teacherKeys,
    "CN remaining-class transactions"
  );
  requireReferences(
    cnBaseline.remainingClasses.transactions,
    "studentKey",
    studentKeys,
    "CN remaining-class transactions"
  );
  requireReferences(
    cnBaseline.remainingClasses.usage,
    "transactionKey",
    transactionKeys,
    "CN remaining-class usage"
  );
  requireReferences(
    cnBaseline.remainingClasses.usage,
    "scheduleKey",
    scheduleKeys,
    "CN remaining-class usage"
  );
  if (
    cnBaseline.remainingClasses.transactions.some(
      (transaction) => !["purchase", "monthly-fee"].includes(transaction.type)
    )
  ) {
    throw new TypeError("CN remaining-class transaction type is invalid.");
  }
}

function validateRcmiBaseline() {
  const memberKeys = keySet(rcmiBaseline.members, "RCMI members");
  const leaderKeys = new Set(
    rcmiBaseline.members
      .filter((member) => member.role === "leader")
      .map((member) => member.key)
  );

  for (const member of rcmiBaseline.members) {
    if (!member.displayName.startsWith("Preview ")) {
      throw new TypeError("RCMI member names must be visibly fictional.");
    }
    if (member.leaderKey && !leaderKeys.has(member.leaderKey)) {
      throw new TypeError("RCMI member has an invalid leader reference.");
    }
  }
  requireReferences(rcmiBaseline.attendance, "memberKey", memberKeys, "RCMI attendance");
  if (rcmiBaseline.attendance.some((entry) => !Number.isInteger(entry.dayOffset))) {
    throw new TypeError("RCMI attendance offsets must be integers.");
  }
}

export function validatePersistentDemoBaselines() {
  validateCnBaseline();
  validateRcmiBaseline();
  return Object.freeze({ valid: true, projects: 2 });
}

validatePersistentDemoBaselines();

export const PERSISTENT_DEMO_BASELINES = deepFreeze({
  cn: cnBaseline,
  rcmi: rcmiBaseline
});

export function getPersistentDemoBaseline(projectId) {
  const baseline = PERSISTENT_DEMO_BASELINES[projectId];
  if (!baseline) {
    throw new RangeError("Unknown persistent demo baseline.");
  }
  return baseline;
}
