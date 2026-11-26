// The feature catalog for PM View › Feature usage: one read-only query per feature.
// Each query returns one row per institute: institute_id, started, completed, d30, last_at
// (see FeatureDef in pm-features.ts). Tables and status values were checked against the platform's
// entity classes and migrations (vacademy_edtech_platform). ai_service writes to admin_core_service,
// so AI video and token tables are read there.
//
// ISOLATION: SELECT only; tests/pm-features.test.ts checks every query with isReadOnlySql.
import type { FeatureDef } from "./pm-features.ts";

const D30 = (col: string) => `${col} > now() - interval '30 days'`;
/**
 * Wraps a per-row source (institute_id, is_started, is_completed, at) into the standard row shape.
 * d30 counts the feature's volume rows (started, or completed for completed-volume features) in the last 30 days.
 */
const agg = (from: string, main: "started" | "completed" = "started") => `SELECT institute_id,
       count(*) FILTER (WHERE is_started)::int AS started,
       count(*) FILTER (WHERE is_completed)::int AS completed,
       count(*) FILTER (WHERE is_${main} AND ${D30("at")})::int AS d30,
       max(at) AS last_at
  FROM (${from}) src
 WHERE institute_id IS NOT NULL
 GROUP BY institute_id`;

export const FEATURE_CATALOG: FeatureDef[] = [
  // ------------------------------------------------------------ sign-up & setup
  {
    key: "admin_login",
    group: "SETUP",
    label: "Team logged in",
    started: "Have an admin or teacher account",
    completed: "an admin or teacher signed in",
    unit: "team members",
    secondary: "signed in",
    db: "auth_service",
    sql: agg(`SELECT ur.institute_id, true AS is_started, u.last_login_time IS NOT NULL AS is_completed, u.last_login_time AS at
                FROM user_role ur JOIN users u ON u.id = ur.user_id LEFT JOIN roles r ON r.id = ur.role_id
               WHERE coalesce(r.role_name, '') <> 'STUDENT' AND coalesce(ur.status, 'ACTIVE') <> 'DELETED'`),
  },
  {
    key: "website",
    group: "SETUP",
    label: "Website / course catalogue",
    started: "Started a catalogue page, product page or custom domain",
    completed: "published a page or verified a domain",
    unit: "pages / domains started",
    secondary: "published",
    db: "admin_core_service",
    sql: agg(`SELECT cim.institute_id, true AS is_started, cr.status = 'PUBLISHED' AS is_completed, cr.created_at AS at
                FROM catalogue_revision cr JOIN catalogue_institute_mapping cim ON cim.course_catalogue = cr.catalogue_id
               WHERE cr.status IN ('DRAFT', 'PUBLISHED')
              UNION ALL
              SELECT institute_id, true, status = 'ACTIVE', created_at FROM product_page WHERE coalesce(status, '') <> 'DELETED'
              UNION ALL
              SELECT institute_id, true, status = 'VERIFIED', created_at FROM institute_website WHERE coalesce(status, '') <> 'REVOKED'`),
  },
  {
    key: "payments",
    group: "SETUP",
    label: "Collecting payments",
    started: "Connected a payment gateway",
    completed: "received a paid payment from a learner",
    unit: "payments received",
    secondary: "gateways connected",
    main: "completed",
    db: "admin_core_service",
    sql: agg(`SELECT institute_id, true AS is_started, false AS is_completed, created_at AS at
                FROM institute_payment_gateway_mapping WHERE coalesce(status, 'ACTIVE') = 'ACTIVE'
              UNION ALL
              SELECT ei.institute_id, false, true, pl.created_at
                FROM payment_log pl JOIN user_plan up ON up.id = pl.user_plan_id JOIN enroll_invite ei ON ei.id = up.enroll_invite_id
               WHERE pl.payment_status = 'PAID'`, "completed"),
  },

  // ------------------------------------------------------------ LMS
  {
    key: "courses",
    group: "LMS",
    label: "Courses",
    started: "Created a course",
    completed: "made a course active",
    unit: "courses created",
    secondary: "active",
    db: "admin_core_service",
    sql: agg(`SELECT pi.institute_id, true AS is_started, p.status = 'ACTIVE' AS is_completed, p.created_at AS at
                FROM package_institute pi JOIN package p ON p.id = pi.package_id
               WHERE coalesce(p.status, '') <> 'DELETED'`),
  },
  {
    key: "course_content",
    group: "LMS",
    label: "Course content",
    started: "Added a chapter to a course",
    completed: "published a lesson (slide)",
    unit: "lessons added",
    secondary: "published",
    db: "admin_core_service",
    sql: agg(`SELECT pi.institute_id, true AS is_started, s.status = 'PUBLISHED' AS is_completed, coalesce(s.created_at, cpsm.created_at) AS at
                FROM package_institute pi
                JOIN package_session ps ON ps.package_id = pi.package_id AND coalesce(ps.status, '') <> 'DELETED'
                JOIN chapter_package_session_mapping cpsm ON cpsm.package_session_id = ps.id AND coalesce(cpsm.status, '') <> 'DELETED'
                LEFT JOIN chapter_to_slides cts ON cts.chapter_id = cpsm.chapter_id AND coalesce(cts.status, '') <> 'DELETED'
                LEFT JOIN slide s ON s.id = cts.slide_id`),
  },
  {
    key: "students",
    group: "LMS",
    label: "Students enrolled",
    started: "Added or invited a student",
    completed: "has an active student",
    unit: "enrolments",
    secondary: "active",
    db: "admin_core_service",
    sql: agg(`SELECT institute_id, true AS is_started, status = 'ACTIVE' AS is_completed, created_at AS at
                FROM student_session_institute_group_mapping WHERE coalesce(status, '') <> 'DELETED'`),
  },
  {
    key: "live_classes",
    group: "LMS",
    label: "Live classes",
    started: "Scheduled a live class",
    completed: "held a class with attendance recorded",
    unit: "live classes scheduled",
    secondary: "held with attendance",
    db: "admin_core_service",
    sql: `SELECT ls.institute_id,
                 count(DISTINCT ls.id)::int AS started,
                 count(DISTINCT ls.id) FILTER (WHERE EXISTS (
                   SELECT 1 FROM live_session_logs l WHERE l.session_id = ls.id AND l.log_type = 'ATTENDANCE_RECORDED' AND l.status = 'PRESENT'))::int AS completed,
                 count(DISTINCT ls.id) FILTER (WHERE ${D30("ls.created_at")})::int AS d30,
                 max(ls.created_at) AS last_at
            FROM live_session ls
           WHERE ls.institute_id IS NOT NULL AND ls.status IN ('DRAFT', 'LIVE')
           GROUP BY ls.institute_id`,
  },
  {
    key: "assessments",
    group: "LMS",
    label: "Assessments",
    started: "Created an assessment",
    completed: "published an assessment",
    unit: "assessments created",
    secondary: "published",
    db: "assessment_service",
    sql: agg(`SELECT m.institute_id, true AS is_started, a.status = 'PUBLISHED' AS is_completed, a.created_at AS at
                FROM assessment_institute_mapping m JOIN assessment a ON a.id = m.assessment_id
               WHERE a.status IN ('DRAFT', 'PUBLISHED')`),
  },
  {
    key: "attempts",
    group: "LMS",
    label: "Students taking assessments",
    started: "A student started an assessment",
    completed: "a student submitted one",
    unit: "assessment attempts",
    secondary: "submitted",
    db: "assessment_service",
    sql: agg(`SELECT r.institute_id, true AS is_started, sa.status = 'ENDED' AS is_completed, sa.start_time AS at
                FROM student_attempt sa JOIN assessment_user_registration r ON r.id = sa.registration_id
               WHERE sa.status IN ('LIVE', 'ENDED') AND coalesce(r.source, '') <> 'COPY_CHECK_ONLY'`),
  },
  {
    key: "certificates",
    group: "LMS",
    label: "Certificates",
    started: "Issued a certificate",
    completed: "issued a certificate",
    unit: "certificates issued",
    secondary: "issued",
    db: "admin_core_service",
    sql: agg(`SELECT institute_id, true AS is_started, true AS is_completed, coalesce(issued_at, created_at) AS at FROM issued_certificate`),
  },

  // ------------------------------------------------------------ CRM
  {
    key: "leads",
    group: "CRM",
    label: "Leads",
    started: "Added a lead",
    completed: "converted a lead",
    unit: "leads added",
    secondary: "converted",
    db: "admin_core_service",
    sql: agg(`SELECT institute_id, true AS is_started, (conversion_status = 'CONVERTED' OR converted_at IS NOT NULL) AS is_completed, created_at AS at
                FROM user_lead_profile WHERE merged_into_user_id IS NULL`),
  },
  {
    key: "forms",
    group: "CRM",
    label: "Enquiry forms & campaigns",
    started: "Created a form or campaign",
    completed: "got a response",
    unit: "forms & campaigns created",
    secondary: "with responses",
    db: "admin_core_service",
    sql: `SELECT a.institute_id,
                 count(*)::int AS started,
                 count(*) FILTER (WHERE EXISTS (SELECT 1 FROM audience_response r WHERE r.audience_id = a.id))::int AS completed,
                 count(*) FILTER (WHERE ${D30("a.created_at")})::int AS d30,
                 max(a.created_at) AS last_at
            FROM audience a
           WHERE a.institute_id IS NOT NULL AND coalesce(a.status, '') <> 'ARCHIVED'
           GROUP BY a.institute_id`,
  },
  {
    key: "followups",
    group: "CRM",
    label: "Follow-ups",
    started: "Scheduled a follow-up",
    completed: "closed a follow-up",
    unit: "follow-ups scheduled",
    secondary: "closed",
    db: "admin_core_service",
    sql: agg(`SELECT institute_id, true AS is_started, coalesce(is_closed, false) AS is_completed, created_at AS at FROM lead_followup`),
  },
  {
    key: "counsellors",
    group: "CRM",
    label: "Counsellor assignment",
    started: "Set up a counsellor pool",
    completed: "assigned a lead to a counsellor",
    unit: "leads assigned to counsellors",
    secondary: "counsellor pools",
    main: "completed",
    db: "admin_core_service",
    sql: agg(`SELECT institute_id, true AS is_started, false AS is_completed, created_at AS at FROM counselor_pool
              UNION ALL
              SELECT institute_id, false, true, created_at FROM user_lead_profile WHERE assigned_counselor_id IS NOT NULL`, "completed"),
  },
  {
    key: "workflows",
    group: "CRM",
    label: "Workflows / automations",
    started: "Created a workflow",
    completed: "a workflow ran successfully",
    unit: "workflows created",
    secondary: "ran successfully",
    db: "admin_core_service",
    sql: `SELECT w.institute_id,
                 count(*)::int AS started,
                 count(*) FILTER (WHERE EXISTS (SELECT 1 FROM workflow_execution e WHERE e.workflow_id = w.id AND e.status = 'COMPLETED'))::int AS completed,
                 count(*) FILTER (WHERE ${D30("w.created_at")})::int AS d30,
                 max(w.created_at) AS last_at
            FROM workflow w
           WHERE w.institute_id IS NOT NULL
           GROUP BY w.institute_id`,
  },
  {
    key: "messaging",
    group: "CRM",
    label: "WhatsApp & email",
    started: "Connected a WhatsApp or email channel",
    completed: "sent messages",
    unit: "messages sent (6 months)",
    secondary: "channels connected",
    main: "completed",
    db: "notification_service",
    sql: agg(
      `SELECT institute_id, true AS is_started, false AS is_completed, created_at AS at FROM channel_to_institute_mapping WHERE coalesce(is_active, true)
       UNION ALL
       SELECT institute_id, false, true, notification_date FROM notification_log
        WHERE institute_id IS NOT NULL AND notification_type IN ('WHATSAPP_MESSAGE_OUTGOING', 'EMAIL') AND notification_date > now() - interval '180 days'`,
      "completed"
    ),
  },
  {
    key: "bookings",
    group: "CRM",
    label: "Meetings & bookings",
    started: "Created a booking page",
    completed: "got a confirmed booking",
    unit: "bookings confirmed",
    secondary: "booking pages",
    main: "completed",
    db: "admin_core_service",
    sql: agg(`SELECT institute_id, true AS is_started, false AS is_completed, created_at AS at FROM booking_page WHERE coalesce(status, '') <> 'DELETED'
              UNION ALL
              SELECT institute_id, false, true, created_at FROM booking_instance WHERE status IN ('CONFIRMED', 'COMPLETED')`, "completed"),
  },

  // ------------------------------------------------------------ AI calling (Telleo)
  {
    key: "telleo_setup",
    group: "AI_CALLING",
    label: "Telleo self set-up",
    started: "Started Telleo set-up",
    completed: "set-up finished (line, settings and agent ready)",
    unit: "set-ups started",
    secondary: "ready",
    db: "admin_core_service",
    sql: agg(`SELECT institute_id, true AS is_started, status = 'READY' AS is_completed, created_at AS at FROM telleo_onboarding`),
  },
  {
    key: "phone_numbers",
    group: "AI_CALLING",
    label: "Phone line connected",
    started: "Added a calling provider",
    completed: "has an enabled phone number",
    unit: "lines / numbers added",
    secondary: "enabled numbers",
    db: "admin_core_service",
    sql: agg(`SELECT institute_id, true AS is_started, false AS is_completed, created_at AS at FROM institute_telephony_config
              UNION ALL
              SELECT institute_id, true, coalesce(enabled, false), created_at FROM telephony_provider_number`),
  },
  {
    key: "ai_agents",
    group: "AI_CALLING",
    label: "AI agents",
    started: "Created an AI agent",
    completed: "has an enabled agent",
    unit: "AI agents created",
    secondary: "enabled",
    db: "admin_core_service",
    sql: agg(`SELECT institute_id, true AS is_started, coalesce(enabled, false) AS is_completed, created_at AS at FROM ai_agent`),
  },
  {
    key: "ai_calls",
    group: "AI_CALLING",
    label: "AI calls",
    started: "Placed an AI call",
    completed: "had an AI call answered and completed",
    unit: "AI calls made",
    secondary: "answered & completed",
    db: "admin_core_service",
    sql: agg(`SELECT institute_id, true AS is_started, (status = 'COMPLETED' AND coalesce(duration_seconds, 0) > 0) AS is_completed, created_at AS at
                FROM telephony_call_log WHERE provider_type IN ('VACADEMY_AI', 'AAVTAAR')`),
  },
  {
    key: "bulk_calls",
    group: "AI_CALLING",
    label: "Bulk / automated calling",
    started: "Queued calls in bulk or from a workflow",
    completed: "queued calls were dialled",
    unit: "calls queued in bulk",
    secondary: "dialled",
    db: "admin_core_service",
    sql: agg(`SELECT institute_id, true AS is_started, status = 'DIALED' AS is_completed, created_at AS at
                FROM ai_call_queue WHERE source IN ('BULK', 'WORKFLOW')`),
  },

  // ------------------------------------------------------------ Evalezy
  {
    key: "answer_sheets",
    group: "EVALEZY",
    label: "Answer-sheet upload",
    started: "Uploaded answer sheets",
    completed: "a batch finished checking",
    unit: "answer-sheet batches",
    secondary: "checked",
    db: "assessment_service",
    sql: agg(`SELECT institute_id, true AS is_started, status = 'COMPLETED' AS is_completed, created_at AS at FROM ai_copy_intake_batch`),
  },
  {
    key: "ai_evaluation",
    group: "EVALEZY",
    label: "AI evaluation",
    started: "Started an AI evaluation",
    completed: "an evaluation completed",
    unit: "AI evaluations run",
    secondary: "completed",
    db: "assessment_service",
    sql: agg(`SELECT institute_id, true AS is_started, status = 'COMPLETED' AS is_completed, created_at AS at FROM ai_evaluation_process`),
  },
  {
    key: "omr",
    group: "EVALEZY",
    label: "OMR scanning",
    started: "Started an OMR scan",
    completed: "an OMR batch completed",
    unit: "OMR batches",
    secondary: "completed",
    db: "assessment_service",
    sql: agg(`SELECT institute_id, true AS is_started, status = 'COMPLETED' AS is_completed, created_at AS at FROM omr_scan_batch`),
  },

  // ------------------------------------------------------------ Vimotion
  {
    key: "ai_videos",
    group: "VIMOTION",
    label: "AI videos",
    started: "Started generating a video",
    completed: "a video finished",
    unit: "AI videos started",
    secondary: "finished",
    db: "admin_core_service",
    sql: agg(`SELECT metadata->>'institute_id' AS institute_id, true AS is_started, status = 'COMPLETED' AS is_completed, created_at AS at FROM ai_gen_video`),
  },
  {
    key: "ai_tools",
    group: "VIMOTION",
    label: "Other AI tools",
    started: "Used any AI tool (last 6 months)",
    completed: "used an AI tool",
    unit: "AI tool uses (6 months)",
    secondary: "uses",
    db: "admin_core_service",
    sql: agg(`SELECT institute_id, true AS is_started, true AS is_completed, created_at AS at
                FROM ai_token_usage WHERE created_at > now() - interval '180 days'`),
  },
];
