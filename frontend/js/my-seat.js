// Seat Allocation & Lookup Service (owner: Mohamed Attallah): student "My seat" page.
// The API decides whose seats to return from the session, so this page never sends a student id.
const session = requirePage('student');
const cards = document.querySelector('#seat-cards');
const message = document.querySelector('#seat-message');

async function loadSeats() {
  try {
    const seats = await api('/api/me/seats');
    cards.replaceChildren();
    if (seats.length === 0) {
      showMessage(message, 'No seats published yet. Check again closer to your exams.', true);
      return;
    }
    seats.forEach((item) => {
      const card = el('article', null, 'card');
      card.append(
        el('h3', item.courseCode),
        el('p', item.title, 'muted'),
        el('p', `${formatDate(item.examDate)} at ${item.startTime} (${item.durationMin} min)`),
        el('p', `${item.hall}, ${item.building}`),
        el('p', `Seat ${item.seat}`, 'seat'),
        el('p', `Row ${item.seat.replace(/[0-9]+$/, '')}, seat number ${item.colNo}`, 'muted')
      );
      cards.append(card);
    });
  } catch (error) {
    showMessage(message, error.message);
  }
}

if (session) loadSeats();
