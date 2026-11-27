-- Monitoring queries for the report (section 11: logs and monitoring evidence).
-- Run in the Neon SQL Editor. They read audit_logs, which never contains passwords or tokens.

-- Q1. Repeated failed logins in the last 15 minutes (possible password guessing).
SELECT target AS login_tried, ip, count(*) AS failures, min(at) AS first_try, max(at) AS last_try
FROM audit_logs
WHERE action = 'LOGIN_FAILED' AND at > now() - interval '15 minutes'
GROUP BY target, ip
HAVING count(*) >= 3
ORDER BY failures DESC;

-- Q2. Blocked requests (403 access denied and 429 rate limited) per user and IP in the last hour.
SELECT action, user_id, role, ip, count(*) AS times, max(at) AS last_seen
FROM audit_logs
WHERE action IN ('ACCESS_DENIED', 'RATE_LIMITED') AND at > now() - interval '1 hour'
GROUP BY action, user_id, role, ip
ORDER BY times DESC;

-- Q3. Seating plan changes (who ran, moved, published or cleared, and when).
SELECT at, user_id, action, target, outcome
FROM audit_logs
WHERE action IN ('ALLOCATION_RUN', 'STUDENT_MOVED', 'ALLOCATION_PUBLISHED', 'ALLOCATION_CLEARED')
ORDER BY at DESC
LIMIT 50;

-- Q4. Metric: security events per hour over the last 24 hours.
SELECT date_trunc('hour', at) AS hour, action, count(*) AS events
FROM audit_logs
WHERE at > now() - interval '24 hours'
GROUP BY hour, action
ORDER BY hour DESC, events DESC;
