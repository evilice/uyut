const workshops = window.WORKSHOPS || [];
const regularPaintingImage = (workshops.find(w => w.title === 'Регулярные занятия по живописи') || workshops.find(w => w.category === 'painting') || {}).image || '';
// Адаптивные картинки из assets/img/* (генерит tools/build-adapted-images.py).
// Если пути нет в карте IMG_VARIANTS — отдаём исходник: деградация до «как было», а не битая картинка.
const IMG_SIZES_DETAIL = "(min-width:701px) 820px, calc(100vw - 40px)";
function adaptedPicture(src, alt, sizes, eager){
 const v=(window.IMG_VARIANTS||{})[src];
 if(!v) return `<img src="${src}" alt="${alt}"${eager?'':' loading="lazy"'} decoding="async">`;
 const ss=(arr)=>v.widths.map((w,i)=>`${arr[i]} ${w}w`).join(', ');
 const load = eager ? '' : ' loading="lazy"';
 return `<picture><source type="image/avif" srcset="${ss(v.avif)}" sizes="${sizes}">`+
  `<img src="${v.webp[0]}" alt="${alt}" srcset="${ss(v.webp)}" sizes="${sizes}" width="${v.ratio[0]}" height="${v.ratio[1]}"${load} decoding="async"></picture>`;
}
const filters=document.getElementById('filters');
filters?.addEventListener('click',e=>{
 const btn=e.target.closest('button[data-filter]');if(!btn)return;
 filters.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===btn));
 document.querySelectorAll('#cards .work-card').forEach(card=>{
  card.classList.toggle('hidden',btn.dataset.filter!=='all'&&card.dataset.category!==btn.dataset.filter);
 });
});
const modal=document.getElementById('modal'), form=document.getElementById('modalForm');
function openForm(type,workshop=''){document.body.classList.add('lock');if(!modal.open)modal.showModal();focusDialog(modal);document.getElementById('formType').value=type;document.getElementById('workshopInput').value=workshop||'Помогите выбрать мастер-класс';const event=type==='event',cert=type==='certificate';document.getElementById('modalKicker').textContent=event?'Мероприятие':cert?'Подарочный сертификат':'Запись';document.getElementById('modalTitle').textContent=event?'Обсудить мероприятие':cert?'Купить сертификат':'Записаться';document.getElementById('modalDesc').textContent=event?'Расскажите, какой повод планируете, сколько будет гостей и где хотите провести мероприятие. Мы предложим подходящие мастер-классы и согласуем детали.':cert?'Мы свяжемся с вами, чтобы оформить сертификат и согласовать способ оплаты.':'Выбранное занятие уже указано в форме. Оставьте контакты — мы свяжемся с вами.';document.getElementById('bookingFields').classList.toggle('hidden',event||cert);document.getElementById('eventFields').classList.toggle('hidden',!event);document.getElementById('certFields').classList.toggle('hidden',!cert);document.getElementById('workshopField').classList.toggle('hidden',event||cert);form.classList.remove('hidden');document.getElementById('success').classList.add('hidden')}
function closeModal(){if(modal.open)modal.close()}
const detail=document.getElementById('detailModal');
function openDetail(i){const w=workshops[i];if(!w)return;document.body.classList.add('lock');if(!detail.open)detail.showModal();focusDialog(detail);document.getElementById('detailTitle').textContent=w.title;document.getElementById('detailMeta').innerHTML=`${w.age} &nbsp;·&nbsp; ${w.duration} &nbsp;·&nbsp; <strong>${w.price.toLocaleString('ru-RU')} ₽</strong>`;document.getElementById('detailShort').textContent=w.description;document.getElementById('detailSteps').replaceChildren(...w.steps.map(x=>{const li=document.createElement('li');li.textContent=x;return li}));document.getElementById('detailResult').textContent=w.result;document.getElementById('detailVisual').innerHTML=adaptedPicture(w.image,w.title,IMG_SIZES_DETAIL,true);document.getElementById('detailBook').onclick=()=>{closeDetail();openForm('booking',w.title)}}
function closeDetail(){if(detail.open)detail.close()}
// Esc и showModal закрывают диалог сами, минуя наши функции. Блокировку прокрутки
// пересчитываем по факту «открыт ли хоть один диалог», иначе переход
// «описание -> запись» снимал бы lock, когда вторая модалка уже открыта.
function syncScrollLock(){document.body.classList.toggle('lock',modal.open||detail.open)}
// Браузер при showModal() ставит фокус на первый скроллируемый внутренний блок
// (.modal-card), из-за чего скринридер не объявляет заголовок диалога.
function focusDialog(d){(d.querySelector('[autofocus]')||d).focus({preventScroll:true})}
[modal,detail].forEach(d=>d.addEventListener('close',syncScrollLock));
document.addEventListener('click',e=>{
 if(e.target.matches('[data-form]'))openForm(e.target.dataset.form);
 if(e.target.matches('[data-close]'))closeModal();
 if(e.target.matches('.book')){const w=workshops[+e.target.dataset.i];if(w)openForm('booking',w.title);}
 if(e.target.matches('.detail'))openDetail(+e.target.dataset.i);
 if(e.target.matches('[data-detail-close]'))closeDetail();
});
// Отправка заявок через почтовый шлюз. Успех показывается только после ответа сервиса.
const bookingRequired = [...document.querySelectorAll('#bookingFields [required]')];
const eventRequired = [...document.querySelectorAll('#eventFields input[name="eventName"], #eventFields input[name="eventPhone"]')];
const certRequired = [...document.querySelectorAll('#certFields input[name="certName"], #certFields input[name="certPhone"]')];
function setModeRequired(mode){bookingRequired.forEach(el => el.required = mode === 'booking');eventRequired.forEach(el => el.required = mode === 'event');certRequired.forEach(el => el.required = mode === 'certificate');}
const originalOpenForm = openForm;
openForm = function(type, workshop=''){originalOpenForm(type, workshop);setModeRequired(type);form.classList.remove('hidden');document.getElementById('success').classList.add('hidden');const submit=document.getElementById('submitRequest');submit.disabled=false;submit.innerHTML='Отправить заявку <b>↗</b>';const warning=form.querySelector('.send-error');if(warning)warning.remove();};
form.addEventListener('submit', async e=>{
 e.preventDefault();if(!form.reportValidity())return;
 const submit=document.getElementById('submitRequest'), success=document.getElementById('success');
 const type=document.getElementById('formType').value||'Заявка с сайта', data=new FormData(form);
 data.set('Тип заявки',type);data.set('Согласие на обработку персональных данных','Получено; обязательный чекбокс отмечен');
 submit.disabled=true;submit.textContent='Отправляем…';
 try{
  const response=await fetch(form.action,{method:'POST',body:JSON.stringify(Object.fromEntries(data.entries())),headers:{'Content-Type':'application/json','Accept':'application/json'}});
  let result={};try{result=await response.json();}catch(_){}
  if(!response.ok||result.success!==true)throw new Error('Сервис не подтвердил отправку');
  form.classList.add('hidden');
  if(result.stored){success.querySelector('h3').textContent='Заявка сохранена';success.querySelector('p').textContent='Почтовый сервис сейчас недоступен. Заявка сохранена на сервере, но письмо не отправлено. Пожалуйста, свяжитесь с мастерской по телефону.';success.querySelector('span').textContent='!';}
  else{success.querySelector('h3').textContent='Заявка отправлена';success.querySelector('p').textContent='Сайт передал вашу заявку почтовой системе. Мы свяжемся с вами по указанным контактам.';success.querySelector('span').textContent='✓';}
  success.classList.remove('hidden');
 }catch(err){submit.disabled=false;submit.innerHTML='Повторить отправку <b>↻</b>';let warning=form.querySelector('.send-error');if(!warning){warning=document.createElement('p');warning.className='send-error';warning.setAttribute('role','alert');warning.style.cssText='color:#9b3e2b;font-size:12px;line-height:1.5;margin:8px 0';submit.insertAdjacentElement('beforebegin',warning);}warning.textContent='Заявка не отправлена. Проверьте подключение и попробуйте ещё раз. Если ошибка повторится, свяжитесь с мастерской по телефону.';}
});

// Единая навигация по разделам: учитываем фиксированную шапку и стабильную позицию цели.
document.querySelectorAll('a[href="#workshops"]').forEach(link => {
 link.addEventListener('click', event => {
  event.preventDefault();
  const target = document.getElementById('workshops');
  if (!target) return;
  if (document.getElementById('mobileMenu')) setMenu(false);
  const offset = document.querySelector('.site-header')?.getBoundingClientRect().height || 0;
  const y = target.getBoundingClientRect().top + window.scrollY - offset - 10;
  window.scrollTo({top:Math.max(0,y),behavior:'smooth'});
  if (history.replaceState) history.replaceState(null,'','#workshops');
 });
});
const burger=document.getElementById('burger'),mobile=document.getElementById('mobileMenu');
function setMenu(open){mobile.classList.toggle('open',open);burger.setAttribute('aria-expanded',open?'true':'false')}
burger.addEventListener('click',()=>setMenu(!mobile.classList.contains('open')));
document.querySelectorAll('.mobile-menu a').forEach(a=>a.addEventListener('click',()=>setMenu(false)));
window.addEventListener('scroll',()=>{const h=document.documentElement.scrollHeight-window.innerHeight;document.getElementById('progress').style.width=(h?window.scrollY/h*100:0)+'%'});
document.documentElement.classList.add('js');
const lateReveal=document.documentElement.classList.contains('reveal-fallback');
try{
 if(lateReveal){document.querySelectorAll('.reveal').forEach(el=>el.classList.add('visible'));}
 else{
  const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');observer.unobserve(e.target)}}),{threshold:.12});
  document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
 }
 window.__uyutReady=true;
 document.documentElement.classList.remove('reveal-fallback');
}catch(err){
 document.documentElement.classList.remove('js');
 console.error('reveal init failed',err);
}finally{
 clearTimeout(window.__revealFallback);
}


// Полноэкранный просмотр фотографий гостей.
(() => {
 const gallery = document.querySelector('.guest-gallery');
 const lightbox = document.getElementById('guestLightbox');
 if (!gallery || !lightbox || typeof lightbox.showModal !== 'function') return;
 const photos = [...gallery.querySelectorAll('.guest-photo')];
 const largeImage = document.getElementById('guestLightboxImage');
 const caption = document.getElementById('guestLightboxCaption');
 const counter = document.getElementById('guestLightboxCounter');
 let selected = 0;
 let lastTrigger = null;
 function show(index) {
  selected = (index + photos.length) % photos.length;
  const button = photos[selected];
  const img = button.querySelector('img');
  // Полноэкранный кадр: сразу ставим уже декодированную картинку сетки (box корректный,
  // сдвига нет), затем подменяем на full-вариант, когда он готов. Соотношение сторон у
  // mini и full одинаковое, поэтому подмена не двигает layout.
  // CSS задаёт width/height:auto, поэтому атрибуты width/height тут не работают как
  // резерв размера — их перебивает presentational hint.
  largeImage.src = img.currentSrc || img.src;
  const full = img.dataset.full;
  if (full) {
    largeImage.dataset.pending = full;
    const pre = new Image();
    pre.onload = () => { if (largeImage.dataset.pending === full) largeImage.src = full; };
    pre.src = full;
  } else {
    delete largeImage.dataset.pending;
  }
  largeImage.alt = img.alt;
  caption.textContent = button.querySelector('.guest-photo-caption').textContent;
  counter.textContent = String(selected + 1).padStart(2, '0') + ' / ' + String(photos.length).padStart(2, '0');
 }
 gallery.addEventListener('click', e => {
  const button = e.target.closest('.guest-photo');
  if (!button) return;
  lastTrigger = button;
  show(Number(button.dataset.guestIndex));
  lightbox.showModal();
  document.getElementById('guestLightboxClose').focus();
 });
 document.getElementById('guestPrev').addEventListener('click', () => show(selected - 1));
 document.getElementById('guestNext').addEventListener('click', () => show(selected + 1));
 document.getElementById('guestLightboxClose').addEventListener('click', () => lightbox.close());
 lightbox.addEventListener('click', e => { if (e.target === lightbox) lightbox.close(); });
 lightbox.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') { e.preventDefault(); show(selected - 1); }
  if (e.key === 'ArrowRight') { e.preventDefault(); show(selected + 1); }
 });
 lightbox.addEventListener('close', () => { if (lastTrigger) lastTrigger.focus(); });
})();
