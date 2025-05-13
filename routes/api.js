const express = require('express');
const router = express.Router();
const hostController = require('../controllers/hostController');
const monitorController = require('../controllers/monitorController');

// Host routes
router.get('/hosts', hostController.getAllHosts);
router.get('/hosts/:id', hostController.getHostById);
router.post('/hosts', hostController.createHost);
router.put('/hosts/:id', hostController.updateHost);
router.delete('/hosts/:id', hostController.deleteHost);
router.get('/hosts/:id/status', hostController.getHostStatus);
router.post('/hosts/:id/check', hostController.checkHostStatus);
router.get('/hosts/:id/downtime', hostController.getHostDowntime);
router.get('/groups/:group/hosts', hostController.getHostsByGroup);
router.get('/groups', hostController.getAllGroups);

// Monitor routes
router.get('/system/status', monitorController.getSystemStatus);
router.post('/system/monitor/start', monitorController.initializeMonitoring);
router.post('/system/monitor/stop', monitorController.stopAllMonitoring);
router.get('/hosts/:id/history', monitorController.getStatusHistory);
router.get('/downtime', monitorController.getDowntimeEvents);
router.post('/system/cleanup', monitorController.runCleanup);

module.exports = router;