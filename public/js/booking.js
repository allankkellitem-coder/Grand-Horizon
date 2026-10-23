document.addEventListener('DOMContentLoaded', () => {
  const serviceCheckboxes = document.querySelectorAll('.service-checkbox');
  const serviceQtyInputs = document.querySelectorAll('.service-qty-input');
  const summaryServicesTotal = document.getElementById('summary-services-total');
  const summaryRoomTotalElement = document.getElementById('summary-room-total');
  const liveTotalKes = document.getElementById('live-total-kes');

  if (!liveTotalKes) return;

  const roomTotal = parseFloat(summaryRoomTotalElement.getAttribute('data-base') || 0);

  function recalculatePricing() {
    let servicesSum = 0;

    serviceCheckboxes.forEach(checkbox => {
      const row = checkbox.closest('.service-check-row');
      const serviceId = row.getAttribute('data-id');
      const qtyInput = document.getElementById('qty_service_' + serviceId);
      const price = parseFloat(row.getAttribute('data-price') || 0);

      if (checkbox.checked) {
        qtyInput.removeAttribute('disabled');
        const qty = parseInt(qtyInput.value || 1);
        servicesSum += price * qty;
      } else {
        qtyInput.setAttribute('disabled', 'true');
      }
    });

    summaryServicesTotal.textContent = 'KES ' + servicesSum.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    const finalTotal = roomTotal + servicesSum;
    liveTotalKes.textContent = 'KES ' + finalTotal.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Bind event listeners
  serviceCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', recalculatePricing);
  });

  serviceQtyInputs.forEach(input => {
    input.addEventListener('input', () => {
      if (input.value < 1) {
        input.value = 1;
      }
      recalculatePricing();
    });
  });

  // Initial calculation on load
  recalculatePricing();
});
