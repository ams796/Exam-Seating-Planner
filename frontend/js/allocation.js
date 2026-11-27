// Seat Allocation & Lookup Service (owner: Mohamed Attallah): admin allocation page.
// Run, view/search, move, publish and clear the seating plan of an exam.
const session = requirePage('admin');

const examRows = document.querySelector('#exam-rows');
const overviewMessage = document.querySelector('#overview-message');
const panel = document.querySelector('#exam-panel');
const examTitle = document.querySelector('#exam-title');
const spacingBox = document.querySelector('#spacing');
const runButton = document.querySelector('#run');
const publishButton = document.querySelector('#publish');
const clearButton = document.querySelector('#clear');
const actionMessage = document.querySelector('#action-message');
const summaryLine = document.querySelector('#summary-line');
const hallRows = document.querySelector('#hall-rows');
const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#search');
const hallFilter = document.querySelector('#hall-filter');
const assignmentRows = document.querySelector('#assignment-rows');
const moveMessage = document.querySelector('#move-message');

let currentExamId = null;
let currentHalls = [];

function badge(status) {
  return el('span', status, `badge ${status}`);
}

async function loadOverview() {
  try {
    const exams = await api('/api/allocations/overview');
    examRows.replaceChildren();
    if (exams.length === 0) {
      const row = el('tr');
      const cell = el('td', 'No exams yet.');
      cell.colSpan = 7;
      row.append(cell);
      examRows.append(row);
    }
    exams.forEach((exam) => {
      const row = el('tr');
      const open = el('button', 'Open', 'secondary');
      open.type = 'button';
      open.addEventListener('click', () => openExam(exam.id));
      const status = el('td');
      status.append(badge(exam.allocationStatus));
      const action = el('td');
      action.append(open);
      row.append(
        el('td', `${exam.courseCode} – ${exam.title}`),
        el('td', `${formatDate(exam.examDate)} ${exam.startTime}`),
        el('td', exam.halls),
        el('td', exam.enrolled),
        el('td', exam.seated),
        status,
        action
      );
      examRows.append(row);
    });
  } catch (error) {
    showMessage(overviewMessage, error.message);
  }
}

async function openExam(examId) {
  currentExamId = examId;
  actionMessage.textContent = '';
  moveMessage.textContent = '';
  searchInput.value = '';
  hallFilter.value = '';
  panel.classList.remove('hidden');
  await loadAllocation();
  panel.scrollIntoView({ behavior: 'smooth' });
}

async function loadAllocation() {
  const params = new URLSearchParams();
  if (searchInput.value.trim()) params.set('student', searchInput.value.trim());
  if (hallFilter.value) params.set('hallId', hallFilter.value);
  const query = params.toString() ? `?${params}` : '';

  const data = await api(`/api/exams/${currentExamId}/allocation${query}`);
  const { exam, summary, assignments } = data;
  currentHalls = summary.halls;

  examTitle.replaceChildren(el('span', `${exam.courseCode} – ${exam.title}  `), badge(exam.allocationStatus));
  spacingBox.checked = exam.spacing;
  const published = exam.allocationStatus === 'published';
  runButton.disabled = published;
  clearButton.disabled = exam.allocationStatus !== 'draft';
  publishButton.disabled = exam.allocationStatus !== 'draft';
  spacingBox.disabled = published;

  summaryLine.textContent = `${summary.enrolled} enrolled · ${summary.seated} seated · ${summary.unseated} without a seat`;

  hallRows.replaceChildren();
  summary.halls.forEach((hall) => {
    const row = el('tr');
    const link = el('a', 'Open seat map');
    link.href = `seat-map.html?exam=${currentExamId}&hall=${hall.hallId}`;
    const linkCell = el('td');
    linkCell.append(link);
    row.append(el('td', hall.position), el('td', hall.hall), el('td', hall.seatsUsed), linkCell);
    hallRows.append(row);
  });

  if (hallFilter.options.length === 1) {
    summary.halls.forEach((hall) => {
      const option = el('option', hall.hall);
      option.value = hall.hallId;
      hallFilter.append(option);
    });
  }

  renderAssignments(assignments);
}

function renderAssignments(assignments) {
  assignmentRows.replaceChildren();
  if (assignments.length === 0) {
    const row = el('tr');
    const cell = el('td', 'No students to show. Run the allocation or change the search.');
    cell.colSpan = 5;
    row.append(cell);
    assignmentRows.append(row);
    return;
  }
  assignments.forEach((item) => {
    const row = el('tr');
    const hallSelect = el('select');
    currentHalls.forEach((hall) => {
      const option = el('option', hall.hall);
      option.value = hall.hallId;
      if (hall.hallId === item.hallId) option.selected = true;
      hallSelect.append(option);
    });
    const seatInput = el('input');
    seatInput.placeholder = 'e.g. C7';
    seatInput.maxLength = 4;
    const moveButton = el('button', 'Move');
    moveButton.type = 'button';
    moveButton.addEventListener('click', () => moveStudent(item, hallSelect.value, seatInput.value));
    const wrap = el('div', null, 'inline');
    wrap.append(hallSelect, seatInput, moveButton);
    const moveCell = el('td');
    moveCell.append(wrap);
    row.append(el('td', item.studentCode), el('td', item.studentName), el('td', item.hall), el('td', item.seat), moveCell);
    assignmentRows.append(row);
  });
}

async function moveStudent(item, hallId, seatLabel) {
  const label = seatLabel.trim().toUpperCase();
  if (!/^[A-Z]{1,2}[0-9]{1,2}$/.test(label)) {
    showMessage(moveMessage, 'Enter a seat like C7 (row letter + seat number).');
    return;
  }
  try {
    const result = await api(`/api/allocations/${item.assignmentId}`, {
      method: 'PATCH',
      body: { hallId: Number(hallId), seatLabel: label }
    });
    showMessage(moveMessage, `${result.studentCode} moved to seat ${result.seat}.`, true);
    await loadAllocation();
  } catch (error) {
    showMessage(moveMessage, error.message);
  }
}

async function doAction(button, request, successText) {
  button.disabled = true;
  try {
    const result = await request();
    showMessage(actionMessage, successText(result), true);
  } catch (error) {
    showMessage(actionMessage, error.message);
  }
  await loadAllocation().catch(() => {});
  await loadOverview();
}

runButton.addEventListener('click', () => doAction(runButton,
  () => api(`/api/exams/${currentExamId}/allocation`, { method: 'POST', body: { spacing: spacingBox.checked } }),
  (result) => `Draft ready: ${result.studentsSeated} students seated. Check it, then publish.`));

publishButton.addEventListener('click', () => doAction(publishButton,
  () => api(`/api/exams/${currentExamId}/allocation/publish`, { method: 'POST' }),
  () => 'Published. Students and proctors can now see the seating plan.'));

clearButton.addEventListener('click', () => doAction(clearButton,
  () => api(`/api/exams/${currentExamId}/allocation`, { method: 'DELETE' }),
  () => 'Draft cleared.'));

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  loadAllocation().catch((error) => showMessage(moveMessage, error.message));
});

if (session) loadOverview();
