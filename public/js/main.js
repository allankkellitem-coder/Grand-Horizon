document.addEventListener('DOMContentLoaded', () => {
  // --- Mobile Hamburger Menu Toggle ---
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      navToggle.classList.toggle('active');
      navMenu.classList.toggle('active');
    });

    // Close menu when a link is clicked
    const navLinks = navMenu.querySelectorAll('a');
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        navToggle.classList.remove('active');
        navMenu.classList.remove('active');
      });
    });
  }

  // --- Dynamic Search Date Constraints ---
  const checkInInput = document.getElementById('checkIn');
  const checkOutInput = document.getElementById('checkOut');

  if (checkInInput && checkOutInput) {
    const today = new Date().toISOString().split('T')[0];
    checkInInput.setAttribute('min', today);

    // Initial check out minimum
    if (checkInInput.value) {
      updateCheckOutMin(checkInInput.value);
    } else {
      // If no check-in is set, check-out cannot be in the past
      const nextDay = new Date();
      nextDay.setDate(nextDay.getDate() + 1);
      checkOutInput.setAttribute('min', nextDay.toISOString().split('T')[0]);
    }

    checkInInput.addEventListener('change', (e) => {
      updateCheckOutMin(e.target.value);
    });
  }

  function updateCheckOutMin(checkInDateStr) {
    if (!checkInDateStr) return;
    const checkInDate = new Date(checkInDateStr);
    checkInDate.setDate(checkInDate.getDate() + 1);
    const tomorrowStr = checkInDate.toISOString().split('T')[0];
    
    checkOutInput.setAttribute('min', tomorrowStr);

    // Reset check out value if it violates the new minimum
    if (checkOutInput.value && checkOutInput.value < tomorrowStr) {
      checkOutInput.value = tomorrowStr;
    }
  }

  // --- Collapsible Dashboard Sidebar Active Triggers ---
  const currentPath = window.location.pathname;
  const sidebarLinks = document.querySelectorAll('.sidebar-link');
  sidebarLinks.forEach(link => {
    if (link.getAttribute('href') === currentPath) {
      link.classList.add('active');
    }
  });
});
