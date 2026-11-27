// Demo data for the whole app: accounts, halls with seat grids, exams, student lists, proctors.
// Run from backend/:   SEED_PASSWORD='choose-a-demo-password' npm run seed
// It WIPES the existing data, so run it with the Neon OWNER connection string (not app_user),
// and only on the demo database. The password is read from the environment, never stored in the repo.
require('dotenv').config({ quiet: true });
const { sql } = require('../services/db');
const { hashPassword } = require('../services/passwords');

const password = process.env.SEED_PASSWORD;
if (!password || password.length < 8) {
  console.error('Set SEED_PASSWORD (at least 8 characters) before running the seed.');
  process.exit(1);
}

const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

async function addHall(name, building, rowCount, colCount, blocked = []) {
  const [hall] = await sql.query(
    'INSERT INTO halls (name, building, row_count, col_count) VALUES ($1, $2, $3, $4) RETURNING id',
    [name, building, rowCount, colCount]
  );
  const rows = [];
  const cols = [];
  const labels = [];
  const statuses = [];
  for (let r = 1; r <= rowCount; r += 1) {
    for (let c = 1; c <= colCount; c += 1) {
      const label = `${ROW_LETTERS[r - 1]}${c}`;
      rows.push(r);
      cols.push(c);
      labels.push(label);
      statuses.push(blocked.includes(label) ? 'blocked' : 'available');
    }
  }
  await sql.query(
    `INSERT INTO seats (hall_id, row_no, col_no, label, status)
     SELECT $1, r, c, l, s FROM unnest($2::int[], $3::int[], $4::text[], $5::text[]) AS t(r, c, l, s)`,
    [hall.id, rows, cols, labels, statuses]
  );
  return hall.id;
}

async function addExam(courseCode, title, daysFromToday, startTime, durationMin) {
  const [exam] = await sql.query(
    `INSERT INTO exams (course_code, title, exam_date, start_time, duration_min)
     VALUES ($1, $2, current_date + $3::int, $4, $5) RETURNING id`,
    [courseCode, title, daysFromToday, startTime, durationMin]
  );
  return exam.id;
}

async function main() {
  console.log('Clearing old data...');
  await sql.query(`TRUNCATE audit_logs, seat_assignments, proctor_assignments, enrollments, exam_halls,
                   exams, seats, halls, sessions, users RESTART IDENTITY CASCADE`);

  const hash = hashPassword(password);
  const [admin] = await sql.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin') RETURNING id`,
    ['Exam Office Admin', 'admin@seatplanner.test', hash]
  );
  const [proctor1] = await sql.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'proctor') RETURNING id`,
    ['Dr. Proctor One', 'proctor1@seatplanner.test', hash]
  );
  const [proctor2] = await sql.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'proctor') RETURNING id`,
    ['Dr. Proctor Two', 'proctor2@seatplanner.test', hash]
  );

  const codes = [];
  const names = [];
  for (let i = 1; i <= 60; i += 1) {
    codes.push(`S2026${String(i).padStart(3, '0')}`);
    names.push(`Student ${String(i).padStart(2, '0')}`);
  }
  const students = await sql.query(
    `INSERT INTO users (name, student_code, password_hash, role)
     SELECT n, c, $3, 'student' FROM unnest($1::text[], $2::text[]) AS t(n, c)
     RETURNING id, student_code AS "code"`,
    [names, codes, hash]
  );
  const studentId = new Map(students.map((s) => [s.code, s.id]));
  const range = (from, to) => codes.slice(from - 1, to).map((code) => studentId.get(code));

  console.log('Creating halls and seats...');
  const hallA = await addHall('Hall A1', 'Building A', 5, 8, ['B4', 'C4']); // 40 seats, 2 blocked
  const hallB = await addHall('Hall B2', 'Building B', 4, 6);               // 24 seats

  console.log('Creating exams...');
  const cloud = await addExam('CS301', 'Cloud Computing', 7, '09:00', 120);   // 50 students, 2 halls
  const mining = await addExam('CS205', 'Data Mining', 9, '13:00', 90);      // 20 students, 1 hall
  const ml = await addExam('CS410', 'Machine Learning', 11, '09:00', 120);   // 30 students, only 24 seats

  const link = (examId, hallId, position) => sql.query(
    'INSERT INTO exam_halls (exam_id, hall_id, position) VALUES ($1, $2, $3)', [examId, hallId, position]);
  await link(cloud, hallA, 1);
  await link(cloud, hallB, 2);
  await link(mining, hallB, 1);
  await link(ml, hallB, 1);

  const enrol = (examId, ids) => sql.query(
    'INSERT INTO enrollments (exam_id, student_id) SELECT $1, unnest($2::int[])', [examId, ids]);
  await enrol(cloud, range(1, 50));
  await enrol(mining, range(41, 60));
  await enrol(ml, range(1, 30));

  const assign = (examId, hallId, proctorId) => sql.query(
    'INSERT INTO proctor_assignments (exam_id, hall_id, proctor_id) VALUES ($1, $2, $3)', [examId, hallId, proctorId]);
  await assign(cloud, hallA, proctor1.id);
  await assign(cloud, hallB, proctor2.id);
  await assign(mining, hallB, proctor2.id);

  console.log('Done. Accounts (all use SEED_PASSWORD):');
  console.log('  admin@seatplanner.test (admin, id ' + admin.id + ')');
  console.log('  proctor1@seatplanner.test (Hall A1, CS301), proctor2@seatplanner.test (Hall B2)');
  console.log('  students S2026001 ... S2026060');
  console.log(`Exams: CS301 id ${cloud} (50 students, A1 then B2), CS205 id ${mining}, CS410 id ${ml} (not enough seats)`);
}

main().catch((error) => {
  console.error('Seed failed:', error.message);
  process.exit(1);
});
