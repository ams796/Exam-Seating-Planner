// Seat Allocation & Lookup Service (owner: Mohamed Attallah)
// Data and business rules. The controller (controllers/allocationController.js) handles HTTP.
//
// ALLOCATION RULES (stated so admins, students and markers know exactly what happens)
//   1. Halls are filled one at a time, in the order the admin chose for the exam
//      (exam_halls.position). A hall is filled completely before the next one is used.
//      Why: fewer halls and fewer proctors are needed; unused halls stay free.
//   2. Inside a hall, seats are taken row by row (A, B, C...) and left to right (1, 2, 3...).
//   3. Blocked seats are always skipped.
//   4. Spacing option: only every other seat in a row is used (columns 1, 3, 5...),
//      so no two students sit side by side.
//   5. Students are seated in student-code order, so the result is predictable and repeatable.
//   6. If there are not enough usable seats, nothing is saved (409 NOT_ENOUGH_SEATS).
//   7. The whole result is saved in ONE transaction: either every student gets a seat or nothing changes.
//
// LIFECYCLE: none -> draft (run) -> published (publish). Students and proctors only see "published".
// CHANGES FROM OTHER SERVICES (see the "Cross-service" section at the bottom):
//   - Seat blocked        -> students on it are moved to the next free seat in the same hall,
//                            or the block is refused if the hall has no free seat.
//   - Hall resized        -> refused while a published plan uses the hall; draft plans are cleared.
//   - Exam rescheduled or
//     student list changed -> a published plan goes back to draft and must be re-published.
const { sql } = require('./db');

class ServiceError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function getExam(examId) {
  const rows = await sql.query(
    `SELECT id, course_code AS "courseCode", title, exam_date::text AS "examDate",
            to_char(start_time, 'HH24:MI') AS "startTime", duration_min AS "durationMin",
            allocation_status AS "allocationStatus", spacing
     FROM exams WHERE id = $1`,
    [examId]
  );
  if (rows.length === 0) throw new ServiceError(404, 'EXAM_NOT_FOUND', 'Exam not found.');
  return rows[0];
}

async function getExamHalls(examId) {
  return sql.query(
    `SELECT h.id, h.name, h.building, h.row_count AS "rowCount", h.col_count AS "colCount", eh.position
     FROM exam_halls eh JOIN halls h ON h.id = eh.hall_id
     WHERE eh.exam_id = $1
     ORDER BY eh.position, h.id`,
    [examId]
  );
}

// The seats the rules allow, already in filling order (rules 1-4).
async function usableSeats(halls, spacing) {
  if (halls.length === 0) return [];
  const seats = await sql.query(
    `SELECT id, hall_id AS "hallId", row_no AS "rowNo", col_no AS "colNo", label
     FROM seats
     WHERE hall_id = ANY($1::int[]) AND status = 'available'`,
    [halls.map((hall) => hall.id)]
  );
  const order = new Map(halls.map((hall, index) => [hall.id, index]));
  return seats
    .filter((seat) => !spacing || seat.colNo % 2 === 1)
    .sort((a, b) => order.get(a.hallId) - order.get(b.hallId) || a.rowNo - b.rowNo || a.colNo - b.colNo);
}

function summarise(halls, assignedSeats, usable) {
  return halls.map((hall) => ({
    hallId: hall.id,
    hall: hall.name,
    position: hall.position,
    usableSeats: usable.filter((seat) => seat.hallId === hall.id).length,
    seatsUsed: assignedSeats.filter((seat) => seat.hallId === hall.id).length
  }));
}

// ---------- Function 1: run the automatic allocation ----------
async function runAllocation(examId, { spacing }) {
  const exam = await getExam(examId);
  if (exam.allocationStatus === 'published') {
    throw new ServiceError(409, 'ALREADY_PUBLISHED',
      'This allocation is published. Changes are only allowed by moving single students.');
  }

  const halls = await getExamHalls(examId);
  if (halls.length === 0) {
    throw new ServiceError(409, 'NO_HALLS', 'This exam has no halls yet. Add halls to the exam first.');
  }

  const students = await sql.query(
    `SELECT u.id, u.student_code AS "studentCode"
     FROM enrollments e JOIN users u ON u.id = e.student_id
     WHERE e.exam_id = $1
     ORDER BY u.student_code`,
    [examId]
  );
  if (students.length === 0) {
    throw new ServiceError(409, 'NO_STUDENTS', 'No students are enrolled in this exam yet.');
  }

  const seats = await usableSeats(halls, spacing);
  if (seats.length < students.length) {
    throw new ServiceError(409, 'NOT_ENOUGH_SEATS',
      `Not enough seats: ${students.length} students but only ${seats.length} usable seats. ` +
      'Add a hall, unblock seats or turn spacing off.',
      { students: students.length, usableSeats: seats.length });
  }

  const chosen = seats.slice(0, students.length);
  await sql.transaction([
    sql.query('DELETE FROM seat_assignments WHERE exam_id = $1', [examId]),
    sql.query(
      `INSERT INTO seat_assignments (exam_id, seat_id, student_id)
       SELECT $1, seat_id, student_id
       FROM unnest($2::int[], $3::int[]) AS t(seat_id, student_id)`,
      [examId, chosen.map((seat) => seat.id), students.map((student) => student.id)]
    ),
    sql.query(
      `UPDATE exams SET allocation_status = 'draft', spacing = $2 WHERE id = $1`,
      [examId, spacing]
    )
  ]);

  return {
    examId,
    status: 'draft',
    spacing,
    studentsSeated: students.length,
    halls: summarise(halls, chosen, seats)
  };
}

// ---------- Function 2: view and search the allocation ----------
async function getAllocation(examId, { hallId, student }) {
  const exam = await getExam(examId);
  const halls = await getExamHalls(examId);

  const conditions = ['a.exam_id = $1'];
  const params = [examId];
  if (hallId) {
    params.push(hallId);
    conditions.push(`s.hall_id = $${params.length}`);
  }
  if (student) {
    params.push(`%${student}%`);
    conditions.push(`(u.student_code ILIKE $${params.length} OR u.name ILIKE $${params.length})`);
  }

  const assignments = await sql.query(
    `SELECT a.id AS "assignmentId", u.student_code AS "studentCode", u.name AS "studentName",
            h.id AS "hallId", h.name AS hall, s.label AS seat, s.row_no AS "rowNo", s.col_no AS "colNo"
     FROM seat_assignments a
     JOIN users u ON u.id = a.student_id
     JOIN seats s ON s.id = a.seat_id
     JOIN halls h ON h.id = s.hall_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY u.student_code`,
    params
  );

  const counts = await sql.query(
    `SELECT
       (SELECT count(*)::int FROM enrollments WHERE exam_id = $1) AS enrolled,
       (SELECT count(*)::int FROM seat_assignments WHERE exam_id = $1) AS seated`,
    [examId]
  );
  const perHall = await sql.query(
    `SELECT s.hall_id AS "hallId", count(*)::int AS used
     FROM seat_assignments a JOIN seats s ON s.id = a.seat_id
     WHERE a.exam_id = $1 GROUP BY s.hall_id`,
    [examId]
  );
  const usedByHall = new Map(perHall.map((row) => [row.hallId, row.used]));

  return {
    exam,
    summary: {
      enrolled: counts[0].enrolled,
      seated: counts[0].seated,
      unseated: Math.max(counts[0].enrolled - counts[0].seated, 0),
      halls: halls.map((hall) => ({
        hallId: hall.id, hall: hall.name, position: hall.position, seatsUsed: usedByHall.get(hall.id) || 0
      }))
    },
    assignments
  };
}

// ---------- Function 3: move one student to another free seat ----------
async function moveStudent(assignmentId, { hallId, seatLabel }) {
  const found = await sql.query(
    `SELECT a.id, a.exam_id AS "examId", a.seat_id AS "seatId", u.student_code AS "studentCode"
     FROM seat_assignments a JOIN users u ON u.id = a.student_id WHERE a.id = $1`,
    [assignmentId]
  );
  if (found.length === 0) throw new ServiceError(404, 'ASSIGNMENT_NOT_FOUND', 'Seat assignment not found.');
  const assignment = found[0];

  const inExam = await sql.query(
    'SELECT 1 FROM exam_halls WHERE exam_id = $1 AND hall_id = $2',
    [assignment.examId, hallId]
  );
  if (inExam.length === 0) {
    throw new ServiceError(400, 'HALL_NOT_IN_EXAM', 'That hall is not used by this exam.');
  }

  const seats = await sql.query(
    'SELECT id, status, label FROM seats WHERE hall_id = $1 AND upper(label) = upper($2)',
    [hallId, seatLabel]
  );
  if (seats.length === 0) throw new ServiceError(404, 'SEAT_NOT_FOUND', `Seat ${seatLabel} does not exist in that hall.`);
  const seat = seats[0];
  if (seat.status === 'blocked') throw new ServiceError(409, 'SEAT_BLOCKED', `Seat ${seat.label} is blocked.`);
  if (seat.id === assignment.seatId) throw new ServiceError(409, 'SAME_SEAT', 'The student is already in that seat.');

  const taken = await sql.query(
    'SELECT 1 FROM seat_assignments WHERE exam_id = $1 AND seat_id = $2',
    [assignment.examId, seat.id]
  );
  if (taken.length > 0) throw new ServiceError(409, 'SEAT_TAKEN', `Seat ${seat.label} is already taken.`);

  try {
    await sql.query('UPDATE seat_assignments SET seat_id = $2 WHERE id = $1', [assignmentId, seat.id]);
  } catch (error) {
    // Two admins moving students at the same moment: the UNIQUE rule in the database wins.
    if (error.code === '23505') throw new ServiceError(409, 'SEAT_TAKEN', `Seat ${seat.label} is already taken.`);
    throw error;
  }
  return { assignmentId, examId: assignment.examId, studentCode: assignment.studentCode, hallId, seat: seat.label };
}

// ---------- Function 4: publish (students and proctors can now see it) ----------
async function publishAllocation(examId) {
  const exam = await getExam(examId);
  if (exam.allocationStatus === 'published') throw new ServiceError(409, 'ALREADY_PUBLISHED', 'Already published.');
  if (exam.allocationStatus === 'none') throw new ServiceError(409, 'NO_ALLOCATION', 'Run the allocation first.');

  // The student list may have changed after the allocation was run.
  const check = await sql.query(
    `SELECT
       (SELECT count(*)::int FROM enrollments e
         WHERE e.exam_id = $1
           AND NOT EXISTS (SELECT 1 FROM seat_assignments a WHERE a.exam_id = $1 AND a.student_id = e.student_id)
       ) AS unseated,
       (SELECT count(*)::int FROM seat_assignments a
         WHERE a.exam_id = $1
           AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.exam_id = $1 AND e.student_id = a.student_id)
       ) AS "notEnrolled"`,
    [examId]
  );
  const { unseated, notEnrolled } = check[0];
  if (unseated > 0 || notEnrolled > 0) {
    throw new ServiceError(409, 'ALLOCATION_OUTDATED',
      'The student list changed after the allocation was run. Run the allocation again before publishing.',
      { unseated, notEnrolled });
  }

  await sql.query(`UPDATE exams SET allocation_status = 'published' WHERE id = $1`, [examId]);
  return { examId, status: 'published' };
}

// ---------- Function 5: clear a draft (to run again) ----------
async function clearAllocation(examId) {
  const exam = await getExam(examId);
  if (exam.allocationStatus === 'published') {
    throw new ServiceError(409, 'ALREADY_PUBLISHED', 'A published allocation cannot be cleared.');
  }
  await sql.transaction([
    sql.query('DELETE FROM seat_assignments WHERE exam_id = $1', [examId]),
    sql.query(`UPDATE exams SET allocation_status = 'none' WHERE id = $1`, [examId])
  ]);
}

// ---------- Function 6: overview of all exams for the admin page ----------
async function listOverview() {
  return sql.query(
    `SELECT e.id, e.course_code AS "courseCode", e.title, e.exam_date::text AS "examDate",
            to_char(e.start_time, 'HH24:MI') AS "startTime", e.allocation_status AS "allocationStatus",
            (SELECT count(*)::int FROM enrollments n WHERE n.exam_id = e.id) AS enrolled,
            (SELECT count(*)::int FROM seat_assignments a WHERE a.exam_id = e.id) AS seated,
            (SELECT count(*)::int FROM exam_halls h WHERE h.exam_id = e.id) AS halls
     FROM exams e
     ORDER BY e.exam_date, e.start_time`
  );
}

// ---------- Function 7: student lookup ("My seat") ----------
// studentId always comes from the session, never from the request, so nobody can read another student's seat.
async function getMySeats(studentId) {
  return sql.query(
    `SELECT e.course_code AS "courseCode", e.title, e.exam_date::text AS "examDate",
            to_char(e.start_time, 'HH24:MI') AS "startTime", e.duration_min AS "durationMin",
            h.name AS hall, h.building, s.label AS seat, s.row_no AS "rowNo", s.col_no AS "colNo"
     FROM seat_assignments a
     JOIN exams e ON e.id = a.exam_id
     JOIN seats s ON s.id = a.seat_id
     JOIN halls h ON h.id = s.hall_id
     WHERE a.student_id = $1 AND e.allocation_status = 'published' AND e.exam_date >= current_date
     ORDER BY e.exam_date, e.start_time`,
    [studentId]
  );
}

// ---------- Function 8: proctor lookup (which halls do I supervise?) ----------
async function getMyProctorHalls(proctorId) {
  return sql.query(
    `SELECT e.id AS "examId", e.course_code AS "courseCode", e.title, e.exam_date::text AS "examDate",
            to_char(e.start_time, 'HH24:MI') AS "startTime", h.id AS "hallId", h.name AS hall, h.building,
            e.allocation_status = 'published' AS "seatMapReady"
     FROM proctor_assignments p
     JOIN exams e ON e.id = p.exam_id
     JOIN halls h ON h.id = p.hall_id
     WHERE p.proctor_id = $1 AND e.exam_date >= current_date
     ORDER BY e.exam_date, e.start_time, h.name`,
    [proctorId]
  );
}

// ---------- Function 9: seat map of one hall (printable) ----------
async function getSeatMap(examId, hallId, user) {
  const exam = await getExam(examId);
  const halls = await getExamHalls(examId);
  const hall = halls.find((item) => item.id === hallId);
  if (!hall) throw new ServiceError(404, 'HALL_NOT_IN_EXAM', 'That hall is not used by this exam.');

  if (user.role === 'proctor') {
    const assigned = await sql.query(
      'SELECT 1 FROM proctor_assignments WHERE exam_id = $1 AND hall_id = $2 AND proctor_id = $3',
      [examId, hallId, user.id]
    );
    if (assigned.length === 0) {
      throw new ServiceError(403, 'NOT_YOUR_HALL', 'You are not assigned to this hall for this exam.');
    }
    if (exam.allocationStatus !== 'published') {
      throw new ServiceError(409, 'NOT_PUBLISHED', 'The seating plan for this exam is not published yet.');
    }
  }

  const seats = await sql.query(
    `SELECT s.id, s.row_no AS "rowNo", s.col_no AS "colNo", s.label, s.status,
            u.student_code AS "studentCode", u.name AS "studentName"
     FROM seats s
     LEFT JOIN seat_assignments a ON a.seat_id = s.id AND a.exam_id = $1
     LEFT JOIN users u ON u.id = a.student_id
     WHERE s.hall_id = $2
     ORDER BY s.row_no, s.col_no`,
    [examId, hallId]
  );

  return {
    exam,
    hall: { id: hall.id, name: hall.name, building: hall.building, rowCount: hall.rowCount, colCount: hall.colCount },
    seatsUsed: seats.filter((seat) => seat.studentCode).length,
    seats
  };
}

// =====================================================================
// Cross-service functions: called by the Hall and Exam services so that
// their changes flow back into the seating plan (Phase 1 feedback).
// =====================================================================

// Hall service calls this BEFORE blocking a seat.
// Every student on that seat (in exams not yet held) is moved to the next free seat in the same
// hall, using the same row-by-row order and the exam's spacing rule.
// If any student cannot be moved, nothing changes and { ok: false } is returned,
// so the Hall service answers 409 and the seat is not blocked.
async function relocateFromSeat(seatId) {
  const affected = await sql.query(
    `SELECT a.id AS "assignmentId", a.exam_id AS "examId", s.hall_id AS "hallId", e.spacing,
            u.student_code AS "studentCode"
     FROM seat_assignments a
     JOIN seats s ON s.id = a.seat_id
     JOIN exams e ON e.id = a.exam_id
     JOIN users u ON u.id = a.student_id
     WHERE a.seat_id = $1 AND e.exam_date >= current_date`,
    [seatId]
  );

  const moves = [];
  const unplaced = [];
  for (const item of affected) {
    const free = await sql.query(
      `SELECT s.id, s.label, s.col_no AS "colNo" FROM seats s
       WHERE s.hall_id = $1 AND s.status = 'available' AND s.id <> $2
         AND NOT EXISTS (SELECT 1 FROM seat_assignments a WHERE a.exam_id = $3 AND a.seat_id = s.id)
       ORDER BY s.row_no, s.col_no`,
      [item.hallId, seatId, item.examId]
    );
    const target = free.find((seat) => !item.spacing || seat.colNo % 2 === 1);
    if (target) moves.push({ ...item, toSeatId: target.id, toSeat: target.label });
    else unplaced.push({ examId: item.examId, studentCode: item.studentCode });
  }

  if (unplaced.length > 0) return { ok: false, moved: [], unplaced };

  if (moves.length > 0) {
    await sql.transaction(moves.map((move) =>
      sql.query('UPDATE seat_assignments SET seat_id = $2 WHERE id = $1', [move.assignmentId, move.toSeatId])));
  }
  return {
    ok: true,
    moved: moves.map((move) => ({ examId: move.examId, studentCode: move.studentCode, toSeat: move.toSeat })),
    unplaced: []
  };
}

// Hall service calls this BEFORE changing a hall's rows/columns (which deletes or adds seats).
// Published plans that use the hall make the resize impossible (students already know their seats).
// Draft plans that use the hall are cleared, because their seats may no longer exist.
async function prepareHallResize(hallId) {
  const exams = await sql.query(
    `SELECT e.id, e.course_code AS "courseCode", e.allocation_status AS "allocationStatus"
     FROM exam_halls eh JOIN exams e ON e.id = eh.exam_id
     WHERE eh.hall_id = $1 AND e.allocation_status <> 'none'`,
    [hallId]
  );
  const published = exams.filter((exam) => exam.allocationStatus === 'published');
  if (published.length > 0) {
    return { ok: false, publishedExams: published.map((exam) => exam.courseCode), clearedDrafts: [] };
  }
  const drafts = exams.map((exam) => exam.id);
  if (drafts.length > 0) {
    await sql.transaction([
      sql.query('DELETE FROM seat_assignments WHERE exam_id = ANY($1::int[])', [drafts]),
      sql.query(`UPDATE exams SET allocation_status = 'none' WHERE id = ANY($1::int[])`, [drafts])
    ]);
  }
  return { ok: true, publishedExams: [], clearedDrafts: exams.map((exam) => exam.courseCode) };
}

// Exam service calls this AFTER rescheduling an exam or changing its student list or halls.
// A published plan goes back to draft: students stop seeing an out-of-date seat and the admin
// must check it (and re-run it if the student list changed) before publishing again.
async function markAllocationOutdated(examId) {
  const rows = await sql.query(
    `UPDATE exams SET allocation_status = 'draft'
     WHERE id = $1 AND allocation_status = 'published'
     RETURNING id`,
    [examId]
  );
  return { examId, backToDraft: rows.length > 0 };
}

module.exports = {
  ServiceError,
  runAllocation,
  getAllocation,
  moveStudent,
  publishAllocation,
  clearAllocation,
  listOverview,
  getMySeats,
  getMyProctorHalls,
  getSeatMap,
  relocateFromSeat,
  prepareHallResize,
  markAllocationOutdated
};
