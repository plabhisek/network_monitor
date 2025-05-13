// Hosts page functionality
$(document).ready(function() {
  // DOM elements
  const hostsTable = $('#hosts-table-body');
  const hostForm = $('#host-form');
  const searchInput = $('#search-hosts');
  const groupFilter = $('#group-filter');
  const addHostBtn = $('#add-host-btn');
  const hostModal = $('#hostModal');
  const saveHostBtn = $('#save-host');
  
  // Initialize hosts page
  loadHosts();
  setupEventListeners();
  
  // Load hosts from API
  function loadHosts() {
    $.get('/api/hosts')
      .done(function(data) {
        updateHostsTable(data);
        updateGroupFilter(data);
      })
      .fail(function(err) {
        console.error('Failed to load hosts:', err);
        showAlert('danger', 'Failed to load hosts');
      });
  }
  
  // Update group filter options
  function updateGroupFilter(hosts) {
    const groups = new Set(hosts.map(host => host.group || 'default'));
    groupFilter.empty().append('<option value="all">All Groups</option>');
    groups.forEach(group => {
      groupFilter.append(`<option value="${group}">${group}</option>`);
    });
  }
  
  // Update hosts table with data
  function updateHostsTable(hosts) {
    hostsTable.empty();
    
    if (!hosts || hosts.length === 0) {
      hostsTable.html('<tr><td colspan="6" class="text-center">No hosts found</td></tr>');
      return;
    }
    
    hosts.forEach(host => {
      const statusClass = host.status === 'up' ? 'success' : 
                         host.status === 'down' ? 'danger' : 
                         host.status === 'unreachable' ? 'warning' : 'secondary';
      
      const lastCheck = host.lastCheck ? moment(host.lastCheck).fromNow() : 'Never';
      
      hostsTable.append(`
        <tr>
          <td>${host.name}</td>
          <td>${host.ipAddress}</td>
          <td>${host.group || 'Default'}</td>
          <td><span class="badge bg-${statusClass}">${host.status}</span></td>
          <td>${lastCheck}</td>
          <td>
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-primary check-host" data-id="${host._id}">
                <i class="fas fa-sync-alt"></i>
              </button>
              <button class="btn btn-outline-secondary edit-host" data-id="${host._id}">
                <i class="fas fa-edit"></i>
              </button>
              <button class="btn btn-outline-danger delete-host" data-id="${host._id}">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `);
    });
  }
  
  // Setup event listeners
  function setupEventListeners() {
    // Remove any existing event listeners
    addHostBtn.off('click');
    saveHostBtn.off('click');
    $('#monitoring-method').off('change');
    searchInput.off('input');
    groupFilter.off('change');
    hostsTable.off('click');
    
    // Add Host button
    addHostBtn.on('click', function(e) {
      e.preventDefault();
      resetHostForm();
      $('#hostModalLabel').text('Add New Host');
      hostModal.modal('show');
    });
    
    // Save Host button
    saveHostBtn.on('click', function(e) {
      e.preventDefault();
      saveHost();
    });
    
    // Monitoring method change
    $('#monitoring-method').on('change', function() {
      const method = $(this).val();
      $('#snmp-settings, #tcp-settings').addClass('d-none');
      if (method === 'snmp') {
        $('#snmp-settings').removeClass('d-none');
      } else if (method === 'tcp') {
        $('#tcp-settings').removeClass('d-none');
      }
    });
    
    // Search functionality
    searchInput.on('input', function() {
      const searchTerm = $(this).val().toLowerCase();
      filterHosts(searchTerm);
    });
    
    // Group filter
    groupFilter.on('change', function() {
      const group = $(this).val();
      filterHosts(searchInput.val(), group);
    });
    
    // Table action buttons
    hostsTable.on('click', '.check-host', function(e) {
      e.preventDefault();
      const hostId = $(this).data('id');
      checkHostStatus(hostId);
    });
    
    hostsTable.on('click', '.edit-host', function(e) {
      e.preventDefault();
      const hostId = $(this).data('id');
      editHost(hostId);
    });
    
    hostsTable.on('click', '.delete-host', function(e) {
      e.preventDefault();
      const hostId = $(this).data('id');
      deleteHost(hostId);
    });
    
    // Prevent form submission on enter key
    hostForm.on('submit', function(e) {
      e.preventDefault();
    });
  }
  
  // Reset host form
  function resetHostForm() {
    hostForm[0].reset();
    $('#host-id').val('');
    $('#monitoring-method').trigger('change');
  }
  
  // Filter hosts based on search term and group
  function filterHosts(searchTerm, group) {
    const rows = hostsTable.find('tr');
    
    rows.each(function() {
      const row = $(this);
      const name = row.find('td:first').text().toLowerCase();
      const ip = row.find('td:eq(1)').text().toLowerCase();
      const hostGroup = row.find('td:eq(2)').text();
      
      const matchesSearch = name.includes(searchTerm) || ip.includes(searchTerm);
      const matchesGroup = !group || group === 'all' || hostGroup === group;
      
      row.toggle(matchesSearch && matchesGroup);
    });
  }
  
  // Check host status
  function checkHostStatus(hostId) {
    $.post(`/api/hosts/${hostId}/check`)
      .done(function() {
        showAlert('success', 'Host check initiated');
        setTimeout(loadHosts, 2000); // Reload after check completes
      })
      .fail(function() {
        showAlert('danger', 'Failed to check host status');
      });
  }
  
  // Edit host
  function editHost(hostId) {
    $.get(`/api/hosts/${hostId}`)
      .done(function(host) {
        // Populate form with host data
        $('#host-id').val(host._id);
        $('#host-name').val(host.name);
        $('#host-ip').val(host.ipAddress);
        $('#host-group').val(host.group);
        $('#monitoring-method').val(host.monitoringMethod);
        $('#check-interval').val(host.checkInterval);
        $('#monitoring-enabled').prop('checked', host.monitoringEnabled);
        
        // Set SNMP settings if applicable
        if (host.monitoringMethod === 'snmp') {
          $('#snmp-port').val(host.snmpPort || 161);
          $('#snmp-community').val(host.snmpCommunity || 'public');
          $('#snmp-version').val(host.snmpVersion || '2c');
        }
        
        // Set TCP settings if applicable
        if (host.monitoringMethod === 'tcp') {
          $('#tcp-port').val(host.tcpPort || 80);
        }
        
        // Show appropriate settings
        $('#monitoring-method').trigger('change');
        
        // Update modal title
        $('#hostModalLabel').text('Edit Host');
        
        // Show form modal
        hostModal.modal('show');
      })
      .fail(function() {
        showAlert('danger', 'Failed to load host details');
      });
  }
  
  // Delete host
  function deleteHost(hostId) {
    if (confirm('Are you sure you want to delete this host?')) {
      $.ajax({
        url: `/api/hosts/${hostId}`,
        method: 'DELETE'
      })
        .done(function() {
          showAlert('success', 'Host deleted successfully');
          loadHosts();
        })
        .fail(function() {
          showAlert('danger', 'Failed to delete host');
        });
    }
  }
  
  // Save host
  function saveHost() {
    const hostId = $('#host-id').val();
    const monitoringMethod = $('#monitoring-method').val();
    
    const hostData = {
      name: $('#host-name').val(),
      ipAddress: $('#host-ip').val(),
      group: $('#host-group').val(),
      monitoringMethod: monitoringMethod,
      checkInterval: parseInt($('#check-interval').val()),
      monitoringEnabled: $('#monitoring-enabled').is(':checked')
    };
    
    // Add method-specific settings
    if (monitoringMethod === 'snmp') {
      hostData.snmpPort = parseInt($('#snmp-port').val());
      hostData.snmpCommunity = $('#snmp-community').val();
      hostData.snmpVersion = $('#snmp-version').val();
    } else if (monitoringMethod === 'tcp') {
      hostData.tcpPort = parseInt($('#tcp-port').val());
    }
    
    const method = hostId ? 'PUT' : 'POST';
    const url = hostId ? `/api/hosts/${hostId}` : '/api/hosts';
    
    $.ajax({
      url: url,
      method: method,
      data: hostData
    })
      .done(function() {
        hostModal.modal('hide');
        showAlert('success', `Host ${hostId ? 'updated' : 'added'} successfully`);
        loadHosts();
      })
      .fail(function() {
        showAlert('danger', `Failed to ${hostId ? 'update' : 'add'} host`);
      });
  }
  
  // Alert helper function
  function showAlert(type, message, timeout = 3000) {
    const alertHtml = `
      <div class="alert alert-${type} alert-dismissible fade show" role="alert">
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    `;
    
    const alertElement = $(alertHtml);
    $('main').prepend(alertElement);
    
    setTimeout(() => {
      alertElement.alert('close');
    }, timeout);
  }
}); 