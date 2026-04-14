// Mobile nav toggle
function toggleNav() {
  const nav = document.getElementById('mobileNav');
  if (nav) nav.classList.toggle('open');
}

// Auto-close mobile nav on outside click
document.addEventListener('click', (e) => {
  const nav = document.getElementById('mobileNav');
  const toggle = document.querySelector('.nav-mobile-toggle');
  if (nav && nav.classList.contains('open') && !nav.contains(e.target) && e.target !== toggle) {
    nav.classList.remove('open');
  }
});

// Fade in on scroll
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.style.opacity = '1';
      e.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.05 });

document.querySelectorAll('.match-card, .result-card, .rank-row').forEach(el => {
  el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
  el.style.opacity = '0';
  el.style.transform = 'translateY(10px)';
  observer.observe(el);
});
