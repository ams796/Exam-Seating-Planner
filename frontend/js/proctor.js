// Seat Allocation & Lookup Service (owner: Mohamed Attallah): proctor's list of assigned halls.
const session = requirePage('proctor');
const rows = document.querySelector('#hall-rows');
const message = document.querySelector('#proctor-message');

async function loadHalls() {
  try {
    const halls = await api('/api/me/proctor-halls');
    rows.replaceChildren();
    if (halls.length === 0) {
      showMessage(message, 'You have no upcoming hall assignments.', true);
      return;
    }
    halls.forEach((item) => {
      const row = el('tr');
      const mapCell = el('td');
      if (item.seatMapReady) {
        const link = el('a', 'Open / print seat map');
        link.href = `seat-map.html?exam=${item.examId}&hall=${item.hallId}`;
        mapCell.append(link);
      } else {
        mapCell.append(el('span', 'Not published yet', 'muted'));
      }
      row.append(
        el('td', `${item.courseCode} – ${item.title}`),
        el('td', `${formatDate(item.examDate)} ${item.startTime}`),
        el('td', `${item.hall} (${item.building})`),
        mapCell
      );
      rows.append(row);
    });
  } catch (error) {
    showMessage(message, error.message);
  }
}

if (session) loadHalls();
