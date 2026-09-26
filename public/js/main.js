const revealElements = document.querySelectorAll(".reveal");

const observer = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("show");
      }
    });
  },
  {
    threshold: 0.12
  }
);

revealElements.forEach(element => observer.observe(element));

const tiltCards = document.querySelectorAll(".tilt-card");

tiltCards.forEach(card => {
  card.addEventListener("mousemove", event => {
    const rect = card.getBoundingClientRect();

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -8;
    const rotateY = ((x - centerX) / centerX) * 8;

    card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  });

  card.addEventListener("mouseleave", () => {
    card.style.transform = "rotateX(0deg) rotateY(0deg)";
  });
});

const requestForm = document.getElementById("requestForm");
const formMessage = document.getElementById("formMessage");

if (requestForm) {
  requestForm.addEventListener("submit", async event => {
    event.preventDefault();

    const formData = new FormData(requestForm);

    const payload = {
      workType: formData.get("workType"),
      deadline: formData.get("deadline"),
      topic: formData.get("topic"),
      pages: formData.get("pages"),
      originality: formData.get("originality"),
      contact: formData.get("contact"),
      referredBy: formData.get("referredBy") || null   // ← новое
};

    formMessage.textContent = "Отправляем заявку...";
    formMessage.style.color = "#b9bfd8";

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.success) {
        formMessage.textContent = "Заявка отправлена. Мы скоро свяжемся с вами.";
        formMessage.style.color = "#4ade80";
        requestForm.reset();
      } else {
        formMessage.textContent = result.message || "Не удалось отправить заявку";
        formMessage.style.color = "#fb7185";
      }
    } catch (error) {
      formMessage.textContent = "Ошибка соединения с сервером";
      formMessage.style.color = "#fb7185";
    }
  });
}

// --- Логотип: на десктопе → главная, на мобиле → меню ---
const logoToggle = document.querySelector('.logo-toggle');
const mobileNav = document.getElementById('mobileNav');

if (logoToggle && mobileNav) {
  logoToggle.addEventListener('click', (e) => {
    const isMobile = window.matchMedia('(max-width: 900px)').matches;

    if (isMobile) {
      // На мобиле — открываем меню, отменяем переход по ссылке
      e.preventDefault();
      e.stopPropagation();
      mobileNav.classList.toggle('is-open');
    }
    // На десктопе — ничего не делаем, ссылка работает как обычно
  });

  // Закрытие при клике вне меню
  document.addEventListener('click', (e) => {
    if (!mobileNav.contains(e.target) && !logoToggle.contains(e.target)) {
      mobileNav.classList.remove('is-open');
    }
  });

  // Закрытие при клике на ссылку меню
  mobileNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mobileNav.classList.remove('is-open');
    });
  });

  // Закрытие при скролле
  window.addEventListener('scroll', () => {
    mobileNav.classList.remove('is-open');
  }, { passive: true });
}

// --- Сворачивающаяся панель цен (только на мобиле) ---
const pricingToggle = document.querySelector('.pricing-toggle');
const pricingPanel = document.getElementById('pricingPanel');

if (pricingToggle && pricingPanel) {
  const isMobile = () => window.matchMedia('(max-width: 900px)').matches;

  const syncPanelState = () => {
    if (isMobile()) {
      // На мобиле панель изначально закрыта
      if (!pricingToggle.hasAttribute('data-touched')) {
        pricingPanel.hidden = true;
        pricingToggle.setAttribute('aria-expanded', 'false');
      }
    } else {
      // На десктопе панель всегда открыта, кнопка скрыта через CSS
      pricingPanel.hidden = false;
      pricingToggle.setAttribute('aria-expanded', 'true');
    }
  };

  syncPanelState();
  window.addEventListener('resize', syncPanelState);

  pricingToggle.addEventListener('click', () => {
    if (!isMobile()) return;

    const isOpen = pricingToggle.getAttribute('aria-expanded') === 'true';
    pricingToggle.setAttribute('data-touched', 'true');

    if (isOpen) {
      pricingPanel.hidden = true;
      pricingToggle.setAttribute('aria-expanded', 'false');
    } else {
      pricingPanel.hidden = false;
      pricingToggle.setAttribute('aria-expanded', 'true');
    }
  });
}