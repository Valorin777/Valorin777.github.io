'use strict';
const qs = (selector, scope = document) => scope.querySelector(selector);
const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const form = qs('#quote-form');

if (form){
  const preview=qs('#quote-preview'), choice=form.elements.namedItem('service'), notes=form.elements.namedItem('notes'), photo=form.elements.namedItem('photo'), fileStatus=qs('#file-feedback'), previewPhoto=qs('#preview-photo');
  const serviceStatus=qs('#service-feedback'), fileName=qs('#file-name');
  const newRequest=qs('#new-request'), edit=qs('#edit-request'), next=qs('[type=submit]',form);
  let previewUrl=null;
  function clearPhoto(){
    previewPhoto.hidden=true;
    previewPhoto.removeAttribute('src');
    if(previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl=null;
  }
  function setStep(previewing){
    form.hidden=previewing;
    preview.hidden=!previewing;
    if(!previewing) clearPhoto();
  }
  function validateFile(){
    const file=photo.files[0];
    const error=file ? (file.size>8*1024*1024 ? 'That photo is larger than 8 MB.' : !['image/jpeg','image/png','image/webp'].includes(file.type) ? 'Choose a JPG, PNG or WebP sample image.' : '') : '';
    photo.setAttribute('aria-invalid',String(Boolean(error)));
    fileName.textContent=file?.name || 'No photo selected';
    fileStatus.textContent=error;
    return !error;
  }
  const proposed= params.get('service');
  if (proposed && [...choice.options].some(option=>option.value===proposed)) choice.value=proposed;
  function validateService(showError=true){
    const valid=Boolean(choice.value);
    choice.setAttribute('aria-invalid',String(showError&&!valid));
    serviceStatus.textContent=showError&&!valid?'Choose a service to continue.':'';
    return valid;
  }
  choice.addEventListener('change',()=>validateService(false));
  photo.addEventListener('change',validateFile);
  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(!validateService()){choice.focus();return;}
    if(!validateFile()){photo.focus();return;}
    const file=photo.files[0];
    qs('#preview-service').textContent=choice.value;
    qs('#preview-notes').textContent=notes.value.trim() || 'No sample notes';
    qs('#preview-file').textContent=file?.name || 'No sample photo';
    clearPhoto();
    if(file){
      previewUrl=URL.createObjectURL(file);
      previewPhoto.src=previewUrl;
      previewPhoto.hidden=false;
    }
    setStep(true);
    qs('#preview-heading').focus();
  });
  next.disabled=false;
  edit.addEventListener('click',()=>{setStep(false);choice.focus()});
  newRequest.addEventListener('click',()=>{
    form.reset();
    validateService(false);
    validateFile();
    setStep(false);
    choice.focus();
  });
  addEventListener('pagehide',clearPhoto);
}

const filters=qsa('[data-filter]'), projects=qsa('[data-category]'), report=qs('#filter-report');
if(filters.length && projects.length && report){
  const filter=(target,animated)=>{
    filters.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.filter===target)));
    let count=0;
    projects.forEach(project=>{
      const match=target==='all'||project.dataset.category===target;
      project.hidden=!match;
      if(!match) return;
      count++;
      if(animated && !reduced.matches && project.animate) project.animate([{opacity:.38,transform:'translateY(.35rem)'},{opacity:1,transform:'translateY(0)'}],{duration:280,easing:'ease-out'});
    });
    report.textContent=count===1?'1 example shown.':count+' examples shown.';
  };
  filters.forEach(button=>button.addEventListener('click',()=>filter(button.dataset.filter,true)));
  const category=params.get('category');
  if(filters.some(button=>button.dataset.filter===category)) filter(category,false);
}
const gallery=qs('#gallery-dialog');
if(gallery && typeof gallery.showModal==='function'){
  const image=qs('#gallery-image'), title=qs('#gallery-title'), caption=qs('#gallery-caption'), close=qs('.close',gallery);
  let active=null;
  qsa('.gallery-open').forEach(trigger=>trigger.addEventListener('click',()=>{
    active=trigger;
    title.textContent=trigger.dataset.title;
    image.src=trigger.dataset.image;
    image.alt=trigger.dataset.title+' illustrative concept image';
    caption.textContent=trigger.dataset.caption;
    gallery.showModal();
    document.documentElement.classList.add('locking');
    close.focus();
  }));
  close.addEventListener('click',()=>gallery.close());
  gallery.addEventListener('click',event=>{
    if(event.target!==gallery) return;
    const r=gallery.getBoundingClientRect();
    if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) gallery.close();
  });
  gallery.addEventListener('close',()=>{
    document.documentElement.classList.remove('locking');
    image.removeAttribute('src');
    if(active?.isConnected) active.focus({preventScroll:true});
    active=null;
  });
}
if(!reduced.matches && 'IntersectionObserver' in window){
  const observer=new IntersectionObserver(entries=>entries.forEach(({isIntersecting,target})=>{
    if(!isIntersecting) return;
    target.classList.add('viewed');
    observer.unobserve(target);
  }),{threshold:.08});
  document.documentElement.classList.add('can-reveal');
  qsa('[data-reveal]').forEach(target=>observer.observe(target));
}
