(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const all = (selector) => [...document.querySelectorAll(selector)];
  const form = $('#estimate-form');
  const filters = all('[data-work]');

  if (filters.length) {
    const gallery = all('[data-gallery]');
    const status = $('#gallery-status');
    filters.forEach((button) => button.addEventListener('click', () => {
      const key = button.dataset.work;
      let count = 0;
      for (const card of gallery) {
        card.hidden = key !== 'all' && card.dataset.gallery !== key;
        if (!card.hidden) count++;
      }
      for (const filter of filters) filter.setAttribute('aria-pressed', String(filter === button));
      status.textContent = count === 1 ? 'Showing one example.' : 'Showing ' + count + ' examples.';
    }));
  }

  if (form) {
    const type = $('#project-type');
    const result = $('#result');
    const summary = $('#result-summary');
    const resultPhotos = $('#result-previews');
    const photoInput = $('#project-photos');
    const photoArea = $('#photo-previews');
    const status = $('#photo-status');
    const error = $('#form-error');
    const blanks = {
      project: 'Choose a project type.',
      name: 'Enter a sample name.',
      email: 'Enter a valid sample email address, such as morgan@example.com.',
      details: 'Describe what needs work.'
    };
    const blankPhotoNotice = 'No photos selected. JPG, PNG or WebP. Up to 10 MB per photo.';
    const required = [type, ...['name', 'email', 'details'].map((name) => form.elements.namedItem(name))];
    function clearError() {
      required.forEach((field) => {
        field.removeAttribute('aria-invalid');
        field.removeAttribute('aria-errormessage');
      });
      error.hidden = true;
      error.textContent = '';
    }
    form.addEventListener('input', (event) => {
      if (event.target.getAttribute('aria-invalid')) clearError();
    });
    $('#choose-photos').addEventListener('click', () => photoInput.click());
    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    let urls = [];

    const prefill = new URLSearchParams(window.location.search).get('project');
    if (prefill && [...type.options].some((opt) => opt.value === prefill)) type.value = prefill;

    function releasePhotos() {
      for (const url of urls) URL.revokeObjectURL(url);
      urls = [];
      photoArea.replaceChildren();
      resultPhotos.replaceChildren();
    }
    function resetForm() {
      form.reset();
      clearError();
      releasePhotos();
      status.textContent = blankPhotoNotice;
      summary.textContent = '';
      form.hidden = false;
      result.hidden = true;
    }

    $('#done').addEventListener('click', () => {
      resetForm();
      type.focus();
    });
    photoInput.addEventListener('change', () => {
      releasePhotos();
      const files = [...photoInput.files];
      if (files.length > 3 || files.some((file) => !supportedTypes.includes(file.type) || file.size > 10 * 1024 * 1024)) {
        photoInput.value = '';
        status.textContent = 'Those photos were not added. Choose up to 3 JPG, PNG or WebP files up to 10 MB each.';
        return;
      }
      status.textContent = files.length ? files.length + (files.length === 1 ? ' photo ready.' : ' photos ready.') + ' Preview only.' : blankPhotoNotice;
      for (const [i, file] of files.entries()) {
        const preview = document.createElement('img');
        const url = URL.createObjectURL(file);
        urls.push(url);
        preview.src = url;
        preview.alt = 'Attached photo preview ' + (i + 1);
        photoArea.append(preview);
      }
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      clearError();
      for (const field of required) {
        if (!field.value.trim() || !field.validity.valid) {
          field.setAttribute('aria-invalid', 'true');
          field.setAttribute('aria-errormessage', 'form-error');
          error.hidden = false;
          error.textContent = blanks[field.name];
          field.focus();
          return;
        }
      }
      const name = form.elements.namedItem('name').value.trim();
      const email = form.elements.namedItem('email').value.trim();
      const details = form.elements.namedItem('details').value.trim();
      resultPhotos.replaceChildren(...[...photoArea.children].map((preview) => preview.cloneNode(true)));
      summary.textContent = type.selectedOptions[0].textContent + '\n' + name + ' · ' + email + '\n' + details + (urls.length ? '\n' + urls.length + (urls.length === 1 ? ' photo attached in demo.' : ' photos attached in demo.') : '');
      form.hidden = true;
      result.hidden = false;
      result.focus();
    });
  }
})();
