document.addEventListener('DOMContentLoaded', function() {
    const body = document.body;
    const sidebar = document.querySelector('.sidebar');
    
    const menuBtn = document.createElement('button');
    menuBtn.className = 'mobile-menu-btn';
    menuBtn.innerHTML = '☰';
    menuBtn.setAttribute('aria-label', 'Toggle menu');
    
    const overlay = document.createElement('div');
    overlay.className = 'mobile-overlay';
    
    body.insertBefore(menuBtn, body.firstChild);
    body.insertBefore(overlay, body.firstChild);
    
    function toggleMenu() {
        sidebar.classList.toggle('mobile-open');
        overlay.classList.toggle('active');
        menuBtn.classList.toggle('menu-open');
        menuBtn.innerHTML = sidebar.classList.contains('mobile-open') ? '✕' : '☰';
    }
    
    menuBtn.addEventListener('click', toggleMenu);
    overlay.addEventListener('click', toggleMenu);
    
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            if (window.innerWidth <= 968) {
                toggleMenu();
            }
        });
    });
});
