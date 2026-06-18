(function () {
  const openBtn  = document.getElementById('openAdminPanel');
  const modal    = document.getElementById('adminModal');
  const iframe   = document.getElementById('adminIframe');
  const closeBtn = document.getElementById('closeAdminModal');

  if (!openBtn || !modal) return;

  let loaded = false;

  function openModal() {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    if (!loaded) {
      iframe.src = '/admin/';
      loaded = true;
    }
  }

  function closeModal() {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);

  // Click on the dark backdrop closes the modal
  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeModal();
  });

  // ESC closes it
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.style.display === 'flex') closeModal();
  });
}());
