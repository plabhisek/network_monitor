// Statistics functionality for IP Status Tracker
(function() {
  // Configuration
  const config = {
    refreshInterval: 60000, // 1 minute
    retryInterval: 1000,    // 1 second
    maxRetries: 5,
    elementCheckInterval: 100, // Check for elements every 100ms
    maxDowntimeRecords: 100,   // Maximum number of downtime records to load
    chartUpdateInterval: 5000  // Update charts every 5 seconds
  };

  // State
  let retryCount = 0;
  let refreshTimer = null;
  let elementCheckTimer = null;
  let uptimeByGroupChart = null;
  let downtimeEventsChart = null;
  let responseTimeChart = null;
  let isLoading = false;

  // Wait for jQuery to be available
  function waitForJQuery(callback) {
    if (window.jQuery) {
      callback(window.jQuery);
    } else {
      setTimeout(function() {
        waitForJQuery(callback);
      }, 100);
    }
  }

  // Check if required elements exist
  function checkElements() {
    const elements = {
      total: document.getElementById('total-hosts'),
      up: document.getElementById('hosts-up'),
      down: document.getElementById('hosts-down'),
      unreachable: document.getElementById('hosts-unreachable')
    };

    const missingElements = Object.entries(elements)
      .filter(([key, element]) => !element)
      .map(([key]) => key);

    if (missingElements.length === 0) {
      console.log('All required elements found');
      clearInterval(elementCheckTimer);
      setup();
    } else {
      console.log('Waiting for elements:', missingElements);
    }
  }

  // Initialize when jQuery is available
  waitForJQuery(function($) {
    console.log('jQuery found, initializing statistics...');
    
    // Initialize date filters with default range (last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    $('#stats-from').val(thirtyDaysAgo.toISOString().split('T')[0]);
    $('#stats-to').val(today.toISOString().split('T')[0]);
    
    // Initialize charts and load data
    initCharts();
    loadAllData();
    
    // Setup date filter handler with debounce
    let filterTimeout;
    $('#apply-stats-filter').on('click', function() {
      clearTimeout(filterTimeout);
      filterTimeout = setTimeout(loadAllData, 300);
    });

    // Setup host selection handler for response time
    $('#response-host-select').on('change', function() {
      const hostId = $(this).val();
      if (hostId) {
        loadResponseTimeData(hostId);
      } else {
        $('#response-time-chart-container').html('<p class="text-center text-muted">Select a host to view response time data</p>');
      }
    });
  });

  // Initialize all charts
  function initCharts() {
    // Uptime by Group Chart
    const uptimeCtx = document.getElementById('uptimeByGroupChart');
    if (uptimeCtx) {
      uptimeByGroupChart = new Chart(uptimeCtx, {
        type: 'bar',
        data: {
          labels: [],
          datasets: [{
            label: 'Uptime %',
            data: [],
            backgroundColor: '#28a745'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              title: {
                display: true,
                text: 'Uptime Percentage'
              }
            },
            x: {
              ticks: {
                maxRotation: 45,
                minRotation: 45
              }
            }
          }
        }
      });
    }
    
    // Downtime Events Chart
    const downtimeCtx = document.getElementById('downtimeEventsChart');
    if (downtimeCtx) {
      downtimeEventsChart = new Chart(downtimeCtx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Downtime Events',
            data: [],
            borderColor: '#dc3545',
            tension: 0.1,
            fill: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Number of Events'
              }
            },
            x: {
              ticks: {
                maxRotation: 45,
                minRotation: 45
              }
            }
          }
        }
      });
    }
  }

  // Load all data with optimized loading
  function loadAllData() {
    if (isLoading) return;
    isLoading = true;

    const fromDate = $('#stats-from').val();
    const toDate = $('#stats-to').val();
    
    // Show loading state
    $('.card-body').append('<div class="loading-overlay"><div class="spinner-border text-primary" role="status"></div></div>');
    
    // Load data in parallel with Promise.all
    Promise.all([
      // Load system status and group data
      $.get('/api/system/status'),
      // Load downtime events with limit
      $.get('/api/downtime', { 
        from: fromDate, 
        to: toDate,
        limit: config.maxDowntimeRecords 
      }),
      // Load hosts for response time dropdown
      $.get('/api/hosts')
    ])
    .then(([statusData, downtimeData, hosts]) => {
      // Update uptime chart
      if (statusData && statusData.byGroup) {
        updateUptimeByGroupChart(statusData.byGroup);
      }

      // Update downtime events and report
      if (downtimeData) {
        updateDowntimeEventsChart(downtimeData);
        updateDowntimeReport(downtimeData);
      }

      // Update host dropdown
      const select = $('#response-host-select');
      select.empty().append('<option value="">Select a host</option>');
      hosts.forEach(host => {
        select.append(`<option value="${host._id}">${host.name} (${host.ipAddress})</option>`);
      });
    })
    .catch(err => {
      console.error('Failed to load data:', err);
      showToast('Failed to load data', 'error');
    })
    .finally(() => {
      // Remove loading state
      $('.loading-overlay').remove();
      isLoading = false;
    });
  }

  // Update uptime by group chart with optimized rendering
  function updateUptimeByGroupChart(groupData) {
    if (!uptimeByGroupChart) return;
    
    const labels = [];
    const data = [];
    
    Object.entries(groupData).forEach(([group, stats]) => {
      labels.push(group);
      const uptimePercentage = stats.total > 0 ? 
        ((stats.up / stats.total) * 100).toFixed(1) : 0;
      data.push(uptimePercentage);
    });
    
    // Batch update to prevent multiple redraws
    uptimeByGroupChart.data.labels = labels;
    uptimeByGroupChart.data.datasets[0].data = data;
    uptimeByGroupChart.update('none'); // Use 'none' mode for better performance
  }
  
  // Update downtime events chart with optimized rendering
  function updateDowntimeEventsChart(downtimeData) {
    if (!downtimeEventsChart) return;
    
    // Group downtime events by date with optimized data structure
    const eventsByDate = new Map();
    const fromDate = new Date($('#stats-from').val());
    const toDate = new Date($('#stats-to').val());
    
    // Initialize all dates in range with 0
    for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
      eventsByDate.set(d.toLocaleDateString(), 0);
    }
    
    // Count events for each date
    downtimeData.forEach(event => {
      const date = new Date(event.startTime).toLocaleDateString();
      if (eventsByDate.has(date)) {
        eventsByDate.set(date, eventsByDate.get(date) + 1);
      }
    });
    
    // Batch update to prevent multiple redraws
    downtimeEventsChart.data.labels = Array.from(eventsByDate.keys());
    downtimeEventsChart.data.datasets[0].data = Array.from(eventsByDate.values());
    downtimeEventsChart.update('none');
  }

  // Update downtime report table with optimized rendering
  function updateDowntimeReport(downtimeData) {
    const tableBody = $('#downtime-report-table');
    tableBody.empty();

    if (!downtimeData || downtimeData.length === 0) {
      tableBody.html('<tr><td colspan="6" class="text-center">No downtime events found</td></tr>');
      return;
    }

    // Group downtime events by host with optimized data structure
    const hostStats = new Map();
    const fromDate = new Date($('#stats-from').val());
    const toDate = new Date($('#stats-to').val());
    const totalTime = toDate - fromDate; // Actual time range in milliseconds

    downtimeData.forEach(event => {
      const hostId = event.hostId._id;
      if (!hostStats.has(hostId)) {
        hostStats.set(hostId, {
          host: event.hostId.name,
          group: event.hostId.group,
          count: 0,
          totalDowntime: 0
        });
      }
      const stats = hostStats.get(hostId);
      stats.count++;
      stats.totalDowntime += event.duration || 0;
    });

    // Build table HTML in memory before updating DOM
    const rows = [];
    hostStats.forEach((stats, hostId) => {
      const availability = ((totalTime - stats.totalDowntime) / totalTime * 100).toFixed(2);
      const formattedDowntime = formatDuration(stats.totalDowntime);

      rows.push(`
        <tr>
          <td>${stats.host}</td>
          <td>${stats.group}</td>
          <td>${stats.count}</td>
          <td>${formattedDowntime}</td>
          <td>${availability}%</td>
          <td>
            <button class="btn btn-sm btn-outline-primary view-details" data-host-id="${hostId}">
              <i class="fas fa-chart-line"></i> Details
            </button>
          </td>
        </tr>
      `);
    });

    // Single DOM update
    tableBody.html(rows.join(''));

    // Add click handler for details buttons
    $('.view-details').on('click', function() {
      const hostId = $(this).data('host-id');
      const fromDate = $('#stats-from').val();
      const toDate = $('#stats-to').val();
      
      // Load host-specific downtime data
      $.get(`/api/hosts/${hostId}/downtime`, { start: fromDate, end: toDate })
        .done(function(data) {
          if (!data || !data.longestDowntime) {
            showToast('No detailed downtime data available', 'warning');
            return;
          }

          // Show downtime details in a modal
          const modalHtml = `
            <div class="modal fade" id="downtimeDetailsModal" tabindex="-1">
              <div class="modal-dialog modal-lg">
                <div class="modal-content">
                  <div class="modal-header">
                    <h5 class="modal-title">Downtime Details</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                  </div>
                  <div class="modal-body">
                    <div class="row mb-3">
                      <div class="col-md-3">
                        <div class="card">
                          <div class="card-body">
                            <h6 class="card-title">Total Downtimes</h6>
                            <h3>${data.count}</h3>
                          </div>
                        </div>
                      </div>
                      <div class="col-md-3">
                        <div class="card">
                          <div class="card-body">
                            <h6 class="card-title">Total Duration</h6>
                            <h3>${formatDuration(data.totalDowntime)}</h3>
                          </div>
                        </div>
                      </div>
                      <div class="col-md-3">
                        <div class="card">
                          <div class="card-body">
                            <h6 class="card-title">Average Duration</h6>
                            <h3>${formatDuration(data.averageDowntime)}</h3>
                          </div>
                        </div>
                      </div>
                      <div class="col-md-3">
                        <div class="card">
                          <div class="card-body">
                            <h6 class="card-title">Longest Duration</h6>
                            <h3>${formatDuration(data.longestDowntime.duration)}</h3>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="table-responsive">
                      <table class="table table-striped">
                        <thead>
                          <tr>
                            <th>Start Time</th>
                            <th>End Time</th>
                            <th>Duration</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${data.longestDowntime ? `
                            <tr>
                              <td>${new Date(data.longestDowntime.startTime).toLocaleString()}</td>
                              <td>${data.longestDowntime.endTime ? new Date(data.longestDowntime.endTime).toLocaleString() : 'Ongoing'}</td>
                              <td>${formatDuration(data.longestDowntime.duration)}</td>
                              <td><span class="badge bg-${data.longestDowntime.resolved ? 'success' : 'danger'}">${data.longestDowntime.resolved ? 'Resolved' : 'Active'}</span></td>
                            </tr>
                          ` : ''}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `;

          // Remove existing modal if any
          $('#downtimeDetailsModal').remove();
          
          // Add new modal to body and show it
          $('body').append(modalHtml);
          const modal = new bootstrap.Modal(document.getElementById('downtimeDetailsModal'));
          modal.show();
        })
        .fail(function() {
          showToast('Failed to load downtime details', 'error');
        });
    });
  }

  // Load response time data with optimized loading
  function loadResponseTimeData(hostId) {
    if (isLoading) return;
    isLoading = true;

    const fromDate = $('#stats-from').val();
    const toDate = $('#stats-to').val();

    $.get(`/api/hosts/${hostId}/history`, { 
      from: fromDate, 
      to: toDate,
      limit: config.maxDowntimeRecords 
    })
    .done(function(data) {
      if (!data || data.length === 0) {
        $('#response-time-chart-container').html('<p class="text-center text-muted">No response time data available</p>');
        return;
      }

      // Create or update response time chart
      const container = $('#response-time-chart-container');
      container.empty().append('<div class="chart-container" style="position: relative; height: 300px;"><canvas id="responseTimeChart"></canvas></div>');

      const ctx = document.getElementById('responseTimeChart');
      if (responseTimeChart) {
        responseTimeChart.destroy();
      }

      // Sample data points if there are too many
      const sampledData = sampleData(data, 50);

      responseTimeChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: sampledData.map(d => new Date(d.timestamp).toLocaleString()),
          datasets: [{
            label: 'Response Time (ms)',
            data: sampledData.map(d => d.responseTime),
            borderColor: '#007bff',
            tension: 0.1,
            fill: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Response Time (ms)'
              }
            },
            x: {
              ticks: {
                maxRotation: 45,
                minRotation: 45
              }
            }
          }
        }
      });
    })
    .fail(function(err) {
      console.error('Failed to load response time data:', err);
      showToast('Failed to load response time data', 'error');
      $('#response-time-chart-container').html('<p class="text-center text-muted">Failed to load response time data</p>');
    })
    .always(function() {
      isLoading = false;
    });
  }

  // Helper function to sample data points
  function sampleData(data, maxPoints) {
    if (data.length <= maxPoints) return data;
    
    const step = Math.ceil(data.length / maxPoints);
    return data.filter((_, index) => index % step === 0);
  }

  // Helper function to format duration
  function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
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

  // Setup statistics functionality
  function setup() {
    console.log('Setting up statistics...');
    
    // Initial load
    loadStats();
    
    // Setup periodic refresh
    refreshTimer = setInterval(loadStats, config.refreshInterval);
    
    // Cleanup on page unload
    $(window).on('unload', function() {
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
      if (elementCheckTimer) {
        clearInterval(elementCheckTimer);
      }
    });
  }

  // Load statistics from API
  function loadStats() {
    console.log('Loading statistics...');
    
    $.get('/api/system/status')
      .done(function(data) {
        console.log('Received statistics data:', data);
        if (data && data.stats) {
          updateStats(data.stats);
          retryCount = 0; // Reset retry count on success
        } else {
          console.error('Invalid statistics data received:', data);
          retry();
        }
      })
      .fail(function(err) {
        console.error('Failed to load statistics:', err);
        retry();
      });
  }

  // Update statistics display
  function updateStats(stats) {
    if (!stats) {
      console.error('No statistics data received');
      retry();
      return;
    }
    
    console.log('Updating statistics display with:', stats);
    
    try {
      // Get all elements first
      const elements = {
        total: document.getElementById('total-hosts'),
        up: document.getElementById('hosts-up'),
        down: document.getElementById('hosts-down'),
        unreachable: document.getElementById('hosts-unreachable')
      };

      // Check if all elements exist
      const missingElements = Object.entries(elements)
        .filter(([key, element]) => !element)
        .map(([key]) => key);

      if (missingElements.length > 0) {
        console.error('Missing DOM elements:', missingElements);
        retry();
        return;
      }

      // Update the statistics display
      elements.total.textContent = stats.total || 0;
      elements.up.textContent = stats.up || 0;
      elements.down.textContent = stats.down || 0;
      elements.unreachable.textContent = stats.unreachable || 0;
      
      // Update page title with alert count if there are issues
      const alertCount = (stats.down || 0) + (stats.unreachable || 0);
      if (alertCount > 0) {
        document.title = `(${alertCount}) IP Status Tracker - Dashboard`;
      } else {
        document.title = 'IP Status Tracker - Dashboard';
      }
      
      // Log the final state
      console.log('Statistics display updated:', {
        total: elements.total.textContent,
        up: elements.up.textContent,
        down: elements.down.textContent,
        unreachable: elements.unreachable.textContent
      });
    } catch (err) {
      console.error('Error updating statistics display:', err);
      retry();
    }
  }

  // Retry loading statistics
  function retry() {
    if (retryCount < config.maxRetries) {
      retryCount++;
      console.log(`Retrying statistics load (${retryCount}/${config.maxRetries})...`);
      setTimeout(loadStats, config.retryInterval);
    } else {
      console.error('Max retries reached, giving up');
      retryCount = 0;
    }
  }
})(); 