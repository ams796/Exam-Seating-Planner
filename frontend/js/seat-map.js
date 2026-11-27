// Seat Allocation & Lookup Service (owner: Mohamed Attallah): printable seat map of one hall.
// Admin: any hall of the exam. Proctor: only an assigned hall of a published plan (enforced by the API).
const session = requirePage('admin', 'proctor');

const grid = document.querySelector('#seat-grid');
const title = document.querySelector('#map-title');
const details = document.querySelector('#map-details');
const message = document.querySelector('#map-message');
const listRows = document.querySelector('#list-rows');

document.querySelector('#print').addEventListener('click', () => window.print());
if (session) document.querySelector('#back').href = HOME_BY_ROLE[session.user.role];

async function loadMap() {
  const params = new URLSearchParams(window.location.search);
  const examId = params.get('exam');
  const hallId = params.get('hall');
  if (!/^[0-9]+$/.test(examId || '') || !/^[0-9]+$/.test(hallId || '')) {
    showMessage(message, 'This link is missing the exam or hall.');
    return;
  }

  try {
    const data = await api(`/api/exams/${examId}/halls/${hallId}/seat-map`);
    const { exam, hall, seats, seatsUsed } = data;
    title.textContent = `${exam.courseCode} – ${exam.title}: ${hall.name}`;
    details.textContent = `${formatDate(exam.examDate)} at ${exam.startTime} · ${hall.building} · ` +
      `${seatsUsed} students · plan status: ${exam.allocationStatus}`;

    // One grid column per seat column (set through the style object, allowed by our CSP)
    grid.style.gridTemplateColumns = `repeat(${hall.colCount}, minmax(4.2rem, 1fr))`;
    grid.replaceChildren();
    seats.forEach((seat) => {
      const cell = el('div', null, 'seat-cell');
      cell.append(el('span', seat.label, 'label'));
      if (seat.status === 'blocked') {
        cell.classList.add('blocked');
        cell.append(el('span', 'blocked'));
      } else if (seat.studentCode) {
        cell.classList.add('taken');
        cell.append(el('span', seat.studentCode));
      }
      grid.append(cell);
    });

    listRows.replaceChildren();
    seats
      .filter((seat) => seat.studentCode)
      .sort((a, b) => a.studentCode.localeCompare(b.studentCode))
      .forEach((seat) => {
        const row = el('tr');
        row.append(el('td', seat.studentCode), el('td', seat.studentName), el('td', seat.label), el('td', ''));
        listRows.append(row);
      });
  } catch (error) {
    showMessage(message, error.message);
  }
}

if (session) loadMap();
