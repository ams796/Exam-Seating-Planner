// Seat Allocation & Lookup Service (owner: Mohamed Attallah): routes and who may call them.
// Every route needs a valid session (requireAuth) and the right role (requireRole).
const express = require('express');
const controller = require('../controllers/allocationController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const admin = requireRole('admin');

// Admin: run, view/search, move, publish, clear, overview
router.get('/allocations/overview', admin, controller.overview);
router.post('/exams/:examId/allocation', admin, controller.run);
router.get('/exams/:examId/allocation', admin, controller.view);
router.post('/exams/:examId/allocation/publish', admin, controller.publish);
router.delete('/exams/:examId/allocation', admin, controller.clear);
router.patch('/allocations/:assignmentId', admin, controller.move);

// Student and proctor lookups (own data only)
router.get('/me/seats', requireRole('student'), controller.mySeats);
router.get('/me/proctor-halls', requireRole('proctor'), controller.myProctorHalls);

// Seat map: admin any hall; proctor only an assigned hall of a published plan (checked in the service)
router.get('/exams/:examId/halls/:hallId/seat-map', requireRole('admin', 'proctor'), controller.seatMap);

module.exports = router;
