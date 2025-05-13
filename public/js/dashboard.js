// Dashboard functionality for IP Status Tracker
$(document).ready(function() {
  // DOM elements
  const statusSummary = $('#status-summary');
  const hostsByGroup = $('#hosts-by-group');
  const downHostsList = $('#down-hosts-list');
  const latestEvents = $('#latest-events');
  const refreshInterval = 60000; // Refresh every minute
  const activeDowntimeRefreshInterval = 10000; // Refresh every 10 seconds if there are active downtimes
  let statusChart = null;
  let isInitialized = false;
  let lastRefresh = 0;
  let hasActiveDowntimes = false;
  let activeDowntimeTimer = null;
  
  // Initialize dashboard
  initDashboard();
  
  // Set periodic refresh
  setInterval(function() {
    refreshDashboard();
  }, refreshInterval);
  
  // Initialize the dashboard components
  function initDashboard() {
    if (isInitialized) return;
    
    // Start monitoring if not already running
    $.post('/api/system/monitor/start')
      .done(function() {
        $('#monitoringStatus').removeClass('bg-danger').addClass('bg-success')
          .html('<i class="fas fa-circle-notch fa-spin"></i> Monitoring Active');
        loadSystemStatus();
        loadLatestEvents();
        initStatusChart();
        setupRefreshButton();
        isInitialized = true;
      })
      .fail(function(err) {
        console.error('Failed to start monitoring:', err);
        showToast('Failed to start monitoring', 'error');
      });
  }
  
  // Refresh all dashboard components
  function refreshDashboard() {
    const now = Date.now();
    if (now - lastRefresh < 5000) {
      return; // Skip if last refresh was too recent
    }
    lastRefresh = now;
    
    loadSystemStatus();
    loadLatestEvents();
    updateStatusChart();
  }
  
  // Setup manual refresh button
  function setupRefreshButton() {
    $('#refresh-dashboard').on('click', function(e) {
      e.preventDefault();
      refreshDashboard();
      showToast('Dashboard refreshed');
    });
  }
  
  // Load system status from API
  function loadSystemStatus() {
    $.get('/api/system/status')
      .done(function(data) {
        updateHostsByGroup(data.byGroup);
        updateDownHostsList(data.byStatus.down);
      })
      .fail(function(err) {
        console.error('Failed to load system status:', err);
        showToast('Failed to load system status', 'error');
      });
  }
  
  // Load latest downtime events
  function loadLatestEvents() {
    $.get('/api/downtime')
      .done(function(data) {
        updateLatestEvents(data);
      })
      .fail(function(err) {
        console.error('Failed to load downtime events:', err);
      });
  }
  
  // Update status summary section
  function updateStatusSummary(stats) {
    if (!stats) {
      console.error('No statistics data received');
      return;
    }

    // Update the statistics display
    $('#total-hosts').text(stats.total || 0);
    $('#hosts-up').text(stats.up || 0);
    $('#hosts-down').text(stats.down || 0);
    $('#hosts-unreachable').text(stats.unreachable || 0);
    
    // Update page title with alert count if there are issues
    const alertCount = (stats.down || 0) + (stats.unreachable || 0);
    if (alertCount > 0) {
      document.title = `(${alertCount}) IP Status Tracker - Dashboard`;
    } else {
      document.title = 'IP Status Tracker - Dashboard';
    }

    // Log the statistics for debugging
    console.debug('Updated statistics:', stats);
  }
  
  // Update hosts by group section
  function updateHostsByGroup(groups) {
    hostsByGroup.empty();
    
    // Sort groups by name
    const sortedGroups = Object.keys(groups).sort();
    
    sortedGroups.forEach(groupName => {
      const group = groups[groupName];
      const total = group.total;
      const upPercentage = total > 0 ? Math.round((group.up / total) * 100) : 100;
      
      const statusClass = group.down > 0 ? 'danger' : 
                          group.unreachable > 0 ? 'warning' : 'success';
      
      hostsByGroup.append(`
        <div class="col-md-4 mb-3">
          <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span>${groupName}</span>
              <span class="badge bg-${statusClass}">${upPercentage}% Up</span>
            </div>
            <div class="card-body">
              <div class="progress mb-2" style="height: 10px;">
                <div class="progress-bar bg-success" role="progressbar" style="width: ${group.up / total * 100}%" aria-valuenow="${group.up}" aria-valuemin="0" aria-valuemax="${total}"></div>
                <div class="progress-bar bg-danger" role="progressbar" style="width: ${group.down / total * 100}%" aria-valuenow="${group.down}" aria-valuemin="0" aria-valuemax="${total}"></div>
                <div class="progress-bar bg-warning" role="progressbar" style="width: ${group.unreachable / total * 100}%" aria-valuenow="${group.unreachable}" aria-valuemin="0" aria-valuemax="${total}"></div>
                <div class="progress-bar bg-secondary" role="progressbar" style="width: ${group.unknown / total * 100}%" aria-valuenow="${group.unknown}" aria-valuemin="0" aria-valuemax="${total}"></div>
              </div>
              <div class="small">
                <span class="text-success">${group.up} Up</span> |
                <span class="text-danger">${group.down} Down</span> |
                <span class="text-warning">${group.unreachable} Unreachable</span> |
                <span class="text-secondary">${group.unknown} Unknown</span>
              </div>
              <div class="mt-2">
                <a href="/hosts?group=${groupName}" class="btn btn-sm btn-outline-primary">View Hosts</a>
              </div>
            </div>
          </div>
        </div>
      `);
    });
    
    // If no groups, show a message
    if (sortedGroups.length === 0) {
      hostsByGroup.html('<div class="col-12 text-center p-4">No host groups found.</div>');
    }
  }
  
  // Update down hosts list section
  function updateDownHostsList(downHosts) {
    downHostsList.empty();
    
    if (!downHosts || downHosts.length === 0) {
      downHostsList.html('<div class="text-center p-4"><i class="fas fa-check-circle text-success fa-2x mb-3"></i><p>All hosts are up!</p></div>');
      return;
    }
    
    downHosts.forEach(host => {
      const lastCheckTime = host.lastCheck ? moment(host.lastCheck).fromNow() : 'Never';
      const lastChangeTime = host.lastStatusChange ? moment(host.lastStatusChange).fromNow() : 'Never';
      
      downHostsList.append(`
        <div class="list-group-item list-group-item-action">
          <div class="d-flex w-100 justify-content-between">
            <h6 class="mb-1">${host.name}</h6>
            <span class="badge bg-danger">Down</span>
          </div>
          <p class="mb-1">${host.ipAddress}</p>
          <small class="text-muted">
            Last check: ${lastCheckTime} • Down since: ${lastChangeTime}
          </small>
          <div class="mt-2">
            <button class="btn btn-sm btn-outline-secondary check-host-status" data-id="${host._id}">
              <i class="fas fa-sync-alt"></i> Check Now
            </button>
            <a href="/hosts?id=${host._id}" class="btn btn-sm btn-outline-primary">Details</a>
          </div>
        </div>
      `);
    });
    
    // Attach event listener to check host status buttons
    $('.check-host-status').on('click', function() {
      const hostId = $(this).data('id');
      checkHostStatus(hostId);
    });
  }
  
  // Update latest events section
  function updateLatestEvents(events) {
    latestEvents.empty();
    
    if (!events || events.length === 0) {
      latestEvents.html('<div class="text-center p-4">No downtime events</div>');
      hasActiveDowntimes = false;
      stopActiveDowntimeRefresh();
      return;
    }
    
    // Create a map to track the latest downtime for each host
    const hostDowntimes = new Map();
    
    // Process events to get the latest downtime for each host
    events.forEach(event => {
      const host = event.hostId;
      if (!host) return;
      
      // If we haven't seen this host yet, or if this event is more recent
      if (!hostDowntimes.has(host._id) || 
          new Date(event.startTime) > new Date(hostDowntimes.get(host._id).startTime)) {
        hostDowntimes.set(host._id, { ...event, host });
      }
    });
    
    // Convert map to array and sort by start time (most recent first)
    const latestDowntimes = Array.from(hostDowntimes.values())
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    
    // Check if there are any active downtimes
    hasActiveDowntimes = latestDowntimes.some(event => !event.resolved);
    
    // Start or stop active downtime refresh based on status
    if (hasActiveDowntimes) {
      startActiveDowntimeRefresh();
    } else {
      stopActiveDowntimeRefresh();
    }
    
    // Display the latest downtime for each host
    latestDowntimes.forEach(event => {
      const host = event.host;
      const startTime = moment(event.startTime).format('YYYY-MM-DD HH:mm:ss');
      
      // Calculate duration based on status
      let duration;
      if (event.resolved) {
        // For resolved downtimes, use the stored duration
        duration = moment.duration(event.duration).humanize();
      } else {
        // For active downtimes, calculate current duration
        duration = moment.duration(moment().diff(moment(event.startTime))).humanize();
      }
      
      const statusClass = event.resolved ? 'success' : 'danger';
      const statusText = event.resolved ? 'Resolved' : 'Active';
      
      latestEvents.append(`
        <div class="list-group-item list-group-item-${statusClass}">
          <div class="d-flex w-100 justify-content-between">
            <h6 class="mb-1">${host.name}</h6>
            <span class="badge bg-${statusClass}">${statusText}</span>
          </div>
          <p class="mb-1">
            IP: ${host.ipAddress}
          </p>
          <div class="small text-muted">
            <div>Started: ${startTime}</div>
            <div>Duration: ${duration}</div>
            ${event.resolved ? `<div>Resolved: ${moment(event.endTime).format('YYYY-MM-DD HH:mm:ss')}</div>` : ''}
          </div>
        </div>
      `);
    });
  }
  
  // Start active downtime refresh timer
  function startActiveDowntimeRefresh() {
    if (!activeDowntimeTimer) {
      activeDowntimeTimer = setInterval(function() {
        loadLatestEvents();
      }, activeDowntimeRefreshInterval);
    }
  }
  
  // Stop active downtime refresh timer
  function stopActiveDowntimeRefresh() {
    if (activeDowntimeTimer) {
      clearInterval(activeDowntimeTimer);
      activeDowntimeTimer = null;
    }
  }
  
  // Initialize status chart
  function initStatusChart() {
    const ctx = document.getElementById('statusChart');
    if (!ctx) {
      console.error('Chart canvas not found');
      return;
    }
    
    // Remove existing chart if it exists
    if (statusChart) {
      statusChart.destroy();
      statusChart = null;
    }
    
    // Create new chart instance
    statusChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Up', 'Down', 'Unreachable', 'Unknown'],
        datasets: [{
          data: [0, 0, 0, 0], // Initial empty data, will be updated
          backgroundColor: [
            '#28a745', // success
            '#dc3545', // danger
            '#ffc107', // warning
            '#6c757d'  // secondary
          ]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: {
            position: 'right'
          }
        }
      }
    });

    // Immediately update the chart with current data
    updateStatusChart();
  }
  
  // Update status chart with new data
  function updateStatusChart() {
    if (!statusChart) {
      console.error('Chart not initialized');
      return;
    }
    
    $.get('/api/system/status')
      .done(function(data) {
        if (!data || !data.stats) {
          console.error('Invalid data received for chart update');
          return;
        }
        
        statusChart.data.datasets[0].data = [
          data.stats.up || 0,
          data.stats.down || 0,
          data.stats.unreachable || 0,
          data.stats.unknown || 0
        ];
        statusChart.update();
      })
      .fail(function(err) {
        console.error('Failed to update chart:', err);
      });
  }
  
  // Check a specific host status
  function checkHostStatus(hostId) {
    $.post(`/api/hosts/${hostId}/check`)
      .done(function() {
        showToast('Status check initiated');
        // Refresh after a short delay to give time for status to update
        setTimeout(function() {
          loadSystemStatus();
          loadLatestEvents();
        }, 3000);
      })
      .fail(function() {
        showToast('Failed to check host status', 'error');
      });
  }
  
  // Show toast notification
  function showToast(message, type = 'info') {
    const toastClass = type === 'error' ? 'bg-danger text-white' : 
                        type === 'success' ? 'bg-success text-white' : 
                        'bg-light';
    
    const toast = $(`
      <div class="toast ${toastClass}" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="toast-header">
          <strong class="me-auto">IP Status Tracker</strong>
          <small>Just now</small>
          <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body">
          ${message}
        </div>
      </div>
    `);
    
    $('#toast-container').append(toast);
    const toastElement = new bootstrap.Toast(toast[0], { delay: 3000 });
    toastElement.show();
    
    // Remove toast after it's hidden
    toast.on('hidden.bs.toast', function() {
      $(this).remove();
    });
  }
});