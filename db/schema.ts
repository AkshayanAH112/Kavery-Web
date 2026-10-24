import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Kavery Sports Club (KSC, est. 1981) and its education wing, the Kavery
 * Education Development Association (KEDA, since 2023) — one database, D1.
 *
 * Three domains that do not reference each other:
 *  - KEDA tuition  (students, batches, classSessions, attendance, exams, marks) — FREE. No fee field, ever.
 *  - Club membership (members) — has an annual fee, paid by bank transfer + slip.
 *  - Cricket scoring (cricketTeams/Players/Tournaments/Matches).
 *
 * Conventions: ids are random UUID strings; every timestamp is epoch milliseconds
 * (UTC) and "today" is always computed in Sri Lanka time by lib/dates.ts.
 */

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date());
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const bool = (name: string) => integer(name, { mode: "boolean" });
const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();

/* ------------------------------------------------------------------ staff */

/** Role names live in lib/auth/roles.ts, which is also what the API enforces. */
export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("attendance"),
  isActive: bool("is_active").notNull().default(true),
  lastLoginAt: ts("last_login_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------ KEDA tuition */

export const batches = sqliteTable("batches", {
  id: id(),
  name: text("name").notNull(),
  /** The scholarship-exam year the batch is working towards: "2026/27" is 2027. */
  year: integer("year").notNull(),
  grades: json<number[]>("grades").notNull().default(sql`'[]'`),
  /** Opt-in for the January grade rollover. Listing two grades does not imply it. */
  autoPromote: bool("auto_promote").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const students = sqliteTable(
  "students",
  {
    id: id(),
    name: text("name").notNull(),
    school: text("school"),
    address: text("address"),
    /**
     * Required when a student is registered by hand. A student brought in by the
     * Excel import has only a name and an index number, so both hold "" until
     * staff complete the profile; the API reports an empty value as missing.
     */
    guardianName: text("guardian_name").notNull(),
    guardianPhone: text("guardian_phone").notNull(),
    /** The paper application form asks for this separately from the phone number. */
    whatsapp: text("whatsapp"),
    notes: text("notes"),
    grade: integer("grade").notNull(),
    photoUrl: text("photo_url"),
    photoKey: text("photo_key"),
    /** Physical scan id printed on the card. Never changes once issued. */
    qrCode: text("qr_code").notNull().unique(),
    /** "KEDA/27/1000" — exam year, then a sequence starting at 1000. */
    registrationNumber: text("registration_number").unique(),
    /** A student is only on the roster of classes dated on or after this. */
    registrationDate: ts("registration_date"),
    batchId: text("batch_id").references(() => batches.id, { onDelete: "set null" }),
    isActive: bool("is_active").notNull().default(true),
    /** Lifetime counter. Never resets. */
    totalLeaves: integer("total_leaves").notNull().default(0),
    /** Resets on reactivation and on yearly promotion. Drives the 2/3-leave alerts. */
    currentLeaveCycle: integer("current_leave_cycle").notNull().default(0),
    cycleGeneration: integer("cycle_generation").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("students_batch_idx").on(t.batchId, t.grade), index("students_active_idx").on(t.isActive)],
);

/** Sequence generator, e.g. id "regno-2027" or "member-2026". */
export const counters = sqliteTable("counters", {
  id: text("id").primaryKey(),
  seq: integer("seq").notNull().default(0),
});

export const classSessions = sqliteTable(
  "class_sessions",
  {
    id: id(),
    batchId: text("batch_id").notNull().references(() => batches.id, { onDelete: "cascade" }),
    grade: integer("grade").notNull(),
    date: ts("date").notNull(),
    time: text("time"),
    subject: text("subject"),
    /** Set when the register is closed and no-shows become real leaves. */
    endedAt: ts("ended_at"),
    endedBy: text("ended_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("class_sessions_date_idx").on(t.date), index("class_sessions_batch_idx").on(t.batchId, t.grade)],
);

/** No row = "not marked". present=false = "marked absent". They are different states. */
export const attendance = sqliteTable(
  "attendance",
  {
    id: id(),
    studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    classId: text("class_id").notNull().references(() => classSessions.id, { onDelete: "cascade" }),
    present: bool("present").notNull().default(false),
    date: ts("date").notNull(),
    /** Whether this row has already been added to the student's leave counters. */
    countedAsLeave: bool("counted_as_leave").notNull().default(false),
    leaveCycleAtRecord: integer("leave_cycle_at_record"),
    remarks: text("remarks"),
    markedBy: text("marked_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("attendance_student_class_uq").on(t.studentId, t.classId), index("attendance_class_idx").on(t.classId)],
);

/** Leave alerts: 2 leaves warns the parent, 3 escalates to an admin. */
export const leaveAlerts = sqliteTable(
  "leave_alerts",
  {
    id: id(),
    studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    registrationNumber: text("registration_number"),
    studentName: text("student_name"),
    type: text("type").notNull(), // parent_warning | admin_critical
    cycleGeneration: integer("cycle_generation").notNull(),
    leaveCount: integer("leave_count").notNull(),
    leaveDates: json<number[]>("leave_dates").notNull().default(sql`'[]'`),
    status: text("status").notNull().default("pending"), // pending | acknowledged | resolved
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("leave_alerts_uq").on(t.studentId, t.type, t.cycleGeneration)],
);

/**
 * What a parent gets one result for. A Grade 4/5 test is two papers, Part 1 and Part 2 (the
 * scholarship exam's Paper I and Paper II), sat on one day or on different days, and its result is
 * their total. A model exam is a full mock: both parts on one day. A test with a single paper (a
 * class quiz) has one paper and no part number. Published as a whole, never one part at a time.
 */
export const tests = sqliteTable(
  "tests",
  {
    id: id(),
    name: text("name").notNull(),
    /** "test" | "model" */
    kind: text("kind").notNull().default("test"),
    grade: integer("grade").notNull(),
    batchId: text("batch_id").notNull().references(() => batches.id, { onDelete: "cascade" }),
    /** Gate for the parent page. Default false. */
    isPublished: bool("is_published").notNull().default(false),
    publishedAt: ts("published_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("tests_batch_idx").on(t.batchId, t.grade)],
);

/** One paper of a test. Marks are entered per paper; grade and batch are copied from the test. */
export const exams = sqliteTable(
  "exams",
  {
    id: id(),
    /**
     * Always set. Nullable only because SQLite cannot add a NOT NULL foreign key to a table that
     * already has rows, and rebuilding `exams` instead would cascade-delete every mark.
     */
    testId: text("test_id").references(() => tests.id, { onDelete: "cascade" }),
    /** 1 or 2 on a two-part test; null on a single-paper test. */
    part: integer("part"),
    /** "Part 1" / "Part 2", or what a single paper is in ("Mathematics"). */
    subject: text("subject").notNull(),
    grade: integer("grade").notNull(),
    batchId: text("batch_id").notNull().references(() => batches.id, { onDelete: "cascade" }),
    examDate: ts("exam_date").notNull(),
    maxMarks: real("max_marks").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("exams_batch_idx").on(t.batchId, t.grade), uniqueIndex("exams_test_part_uq").on(t.testId, t.part)],
);

/** marks is stored as 0 for an absent student — always check isAbsent first. */
export const marks = sqliteTable(
  "marks",
  {
    id: id(),
    examId: text("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
    studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    marks: real("marks").notNull().default(0),
    isAbsent: bool("is_absent").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("marks_exam_student_uq").on(t.examId, t.studentId), index("marks_student_idx").on(t.studentId)],
);

/**
 * A paper students sit online, on the parent page. "practice" stands alone and its score is the
 * student's own; "exam" is set for one paper of a test (`examId`), and its scores are copied into
 * that paper's marks by staff — from there it is ranked and published like any other test.
 */
export const onlinePapers = sqliteTable(
  "online_papers",
  {
    id: id(),
    title: text("title").notNull(),
    /** "practice" | "exam" */
    mode: text("mode").notNull().default("practice"),
    batchId: text("batch_id").notNull().references(() => batches.id, { onDelete: "cascade" }),
    grade: integer("grade").notNull(),
    examId: text("exam_id").references(() => exams.id, { onDelete: "cascade" }),
    instructions: text("instructions"),
    opensAt: ts("opens_at"),
    closesAt: ts("closes_at"),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    /** Questions, and the options of each, in a different order for every student. */
    shuffle: bool("shuffle").notNull().default(true),
    /** Students see the paper only once staff mark it ready. Default false. */
    isReady: bool("is_ready").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("online_papers_exam_uq").on(t.examId), index("online_papers_batch_idx").on(t.batchId, t.grade)],
);

export type OnlineOption = { id: string; text: string; image: string | null };

/** Images are private R2 keys (`papers/…`), served only through the online-paper routes. */
export const onlineQuestions = sqliteTable(
  "online_questions",
  {
    id: id(),
    paperId: text("paper_id").notNull().references(() => onlinePapers.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    /** "choice" | "short" */
    kind: text("kind").notNull().default("choice"),
    prompt: text("prompt").notNull().default(""),
    image: text("image"),
    options: json<OnlineOption[]>("options").notNull().default(sql`'[]'`),
    /** A choice question's correct option id. */
    answer: text("answer"),
    /** A short answer that matches one of these gets full marks without waiting for staff. */
    accepted: json<string[]>("accepted").notNull().default(sql`'[]'`),
    marks: real("marks").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("online_questions_paper_idx").on(t.paperId, t.position)],
);

/** One student's sitting. Finished once submitted or once the deadline has passed — nothing has to close it. */
export const onlineAttempts = sqliteTable(
  "online_attempts",
  {
    id: id(),
    paperId: text("paper_id").notNull().references(() => onlinePapers.id, { onDelete: "cascade" }),
    studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    startedAt: ts("started_at").notNull(),
    deadline: ts("deadline").notNull(),
    submittedAt: ts("submitted_at"),
    /** The order this student sees: question ids, and each question's option ids. */
    order: json<{ questions: string[]; options: Record<string, string[]> }>("order").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("online_attempts_paper_student_uq").on(t.paperId, t.studentId), index("online_attempts_student_idx").on(t.studentId)],
);

/**
 * A choice answer is scored from the question's key when it is read, so correcting the key re-marks
 * everyone. `awarded` is only ever a staff mark on a short answer; null means not marked by hand.
 */
export const onlineAnswers = sqliteTable(
  "online_answers",
  {
    id: id(),
    attemptId: text("attempt_id").notNull().references(() => onlineAttempts.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull().references(() => onlineQuestions.id, { onDelete: "cascade" }),
    choice: text("choice"),
    response: text("response"),
    awarded: real("awarded"),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("online_answers_attempt_question_uq").on(t.attemptId, t.questionId)],
);

/* --------------------------------------------------------- club membership */

export const members = sqliteTable(
  "members",
  {
    id: id(),
    fullName: text("full_name").notNull(),
    dateOfBirth: ts("date_of_birth"),
    gender: text("gender"),
    phone: text("phone").notNull(),
    whatsapp: text("whatsapp"),
    email: text("email"),
    address: text("address"),
    nic: text("nic"),
    guardianName: text("guardian_name"),
    guardianPhone: text("guardian_phone"),
    photoUrl: text("photo_url"),
    photoKey: text("photo_key"),
    memberType: text("member_type"),
    job: text("job"),
    /** The fee is always resolved server-side from this, never trusted from the client. */
    jobCategory: text("job_category"),
    annualFee: integer("annual_fee"),
    paymentSlipUrl: text("payment_slip_url"),
    paymentSlipKey: text("payment_slip_key"),
    validFrom: ts("valid_from"),
    validUntil: ts("valid_until"),
    /** A pending renewal sits in its own fields so the live membership is untouched. */
    renewalStatus: text("renewal_status").notNull().default("none"),
    renewal: json<{ job?: string; jobCategory?: string; annualFee?: number; slipUrl?: string; slipKey?: string; submittedAt?: number }>("renewal"),
    /** The card's member id, issued once on first approval. */
    memberCode: text("member_code").unique(),
    interest: text("interest"),
    previousClub: text("previous_club"),
    message: text("message"),
    status: text("status").notNull().default("pending"), // pending | approved | rejected
    reviewNotes: text("review_notes"),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: ts("reviewed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("members_status_idx").on(t.status)],
);

/* ------------------------------------------------------------------ content */

export type Org = "ksc" | "keda";
export type ContentImage = { url: string; key?: string; caption?: string };

export const posts = sqliteTable(
  "posts",
  {
    id: id(),
    /** Which organisation the story belongs to — drives the accent on the public site. */
    org: text("org").$type<Org>().notNull().default("ksc"),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    excerpt: text("excerpt"),
    content: text("content").notNull(),
    coverUrl: text("cover_url"),
    coverKey: text("cover_key"),
    images: json<ContentImage[]>("images").notNull().default(sql`'[]'`),
    category: text("category").notNull().default("news"),
    tags: json<string[]>("tags").notNull().default(sql`'[]'`),
    status: text("status").notNull().default("draft"), // draft | published
    author: text("author").notNull().default("Kavery Sports Club"),
    publishedAt: ts("published_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("posts_feed_idx").on(t.status, t.publishedAt)],
);

export const galleryFolders = sqliteTable("gallery_folders", {
  id: id(),
  org: text("org").$type<Org>().notNull().default("ksc"),
  name: text("name").notNull().unique(),
  coverUrl: text("cover_url"),
  coverKey: text("cover_key"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** One row per image, so parallel uploads into an album cannot overwrite each other. */
export const galleryImages = sqliteTable(
  "gallery_images",
  {
    id: id(),
    folderId: text("folder_id").notNull().references(() => galleryFolders.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    key: text("key"),
    caption: text("caption"),
    width: integer("width"),
    height: integer("height"),
    createdAt: createdAt(),
  },
  (t) => [index("gallery_images_folder_idx").on(t.folderId, t.createdAt)],
);

/** Editable public-site content (hero copy, contact details, bank details…). */
export const siteSettings = sqliteTable("site_settings", {
  key: text("key").primaryKey(),
  value: json<unknown>("value").notNull(),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------------ cricket */

export const cricketTeams = sqliteTable("cricket_teams", {
  id: id(),
  name: text("name").notNull().unique(),
  shortName: text("short_name"),
  color: text("color"),
  logoUrl: text("logo_url"),
  logoKey: text("logo_key"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A ball refers to players by this id, so a player in any squad is renamed, never removed. */
export const cricketPlayers = sqliteTable(
  "cricket_players",
  {
    id: id(),
    teamId: text("team_id").notNull().references(() => cricketTeams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role").notNull().default("batter"),
    isCaptain: bool("is_captain").notNull().default(false),
    isKeeper: bool("is_keeper").notNull().default(false),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("cricket_players_team_idx").on(t.teamId, t.sort)],
);

export const cricketTournaments = sqliteTable("cricket_tournaments", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  season: text("season"),
  venue: text("venue"),
  oversPerInnings: integer("overs_per_innings").notNull().default(20),
  teamIds: json<string[]>("team_ids").notNull().default(sql`'[]'`),
  status: text("status").notNull().default("upcoming"),
  pointsWin: integer("points_win").notNull().default(2),
  pointsTie: integer("points_tie").notNull().default(1),
  pointsNoResult: integer("points_no_result").notNull().default(1),
  /** Hidden from the public site until an admin publishes it. */
  isPublished: bool("is_published").notNull().default(false),
  startDate: ts("start_date"),
  endDate: ts("end_date"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * A match stores its deliveries (`innings`) and nothing derived from them except
 * `scores`, kept so list views never parse the ball log. Every scoring write is
 * conditional on `rev`, which is what stops a double tap recording a ball twice.
 */
export const cricketMatches = sqliteTable(
  "cricket_matches",
  {
    id: id(),
    tournamentId: text("tournament_id").references(() => cricketTournaments.id, { onDelete: "set null" }),
    title: text("title"),
    teamA: text("team_a").notNull().references(() => cricketTeams.id),
    teamB: text("team_b").notNull().references(() => cricketTeams.id),
    squadA: json<string[]>("squad_a").notNull().default(sql`'[]'`),
    squadB: json<string[]>("squad_b").notNull().default(sql`'[]'`),
    oversPerInnings: integer("overs_per_innings").notNull().default(20),
    venue: text("venue"),
    startAt: ts("start_at"),
    status: text("status").notNull().default("upcoming"),
    toss: json<{ wonBy: string; decision: "bat" | "bowl" } | null>("toss"),
    innings: json<unknown[]>("innings").notNull().default(sql`'[]'`),
    scores: json<{ team: string; runs: number; wickets: number; balls: number; allOut: boolean }[]>("scores")
      .notNull()
      .default(sql`'[]'`),
    result: json<{ outcome: string; winner?: string | null; by?: "runs" | "wickets" | null; margin?: number | null; manual?: boolean } | null>("result"),
    playerOfMatch: text("player_of_match"),
    isPublished: bool("is_published").notNull().default(true),
    rev: integer("rev").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("cricket_matches_status_idx").on(t.status, t.startAt), index("cricket_matches_tournament_idx").on(t.tournamentId)],
);

/* --------------------------------------------------------------------- push */

/**
 * One row per installed browser/PWA. `userId` is set when a signed-in staff
 * member subscribes; public visitors subscribe anonymously and pick topics.
 */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: id(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    topics: json<string[]>("topics").notNull().default(sql`'[]'`),
    locale: text("locale").notNull().default("en"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    lastSuccessAt: ts("last_success_at"),
  },
  (t) => [index("push_user_idx").on(t.userId)],
);

export const pushLog = sqliteTable("push_log", {
  id: id(),
  topic: text("topic").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  url: text("url"),
  sentBy: text("sent_by").references(() => users.id, { onDelete: "set null" }),
  delivered: integer("delivered").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  createdAt: createdAt(),
});
