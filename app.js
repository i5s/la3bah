/* ===========================================================
    بطولة الشرقية — روميكوب
    النسخة المتصلة بقاعدة بيانات Supabase (لكل الأجهزة)
    البيانات SB_URL و SB_KEY في ملف config.js
   =========================================================== */

var GROUPS = ['A','B','C','D'];
var GROUP_NAMES = {A:'المجموعة A',B:'المجموعة B',C:'المجموعة C',D:'المجموعة D'};
var STATUS_LABELS = {
  REGISTRATION_OPEN:'التسجيل مفتوح',REGISTRATION_FULL:'اكتملت المقاعد',
  GROUPS_ACTIVE:'بدأت المنافسات',FINAL_READY:'النهائي جاهز',
  FINAL_ACTIVE:'النهائي جارٍ',COMPLETED:'انتهت البطولة'
};
var STATUS_COLORS = {
  REGISTRATION_OPEN:'chip-green',REGISTRATION_FULL:'chip-red',
  GROUPS_ACTIVE:'chip-blue',FINAL_READY:'chip-purple',
  FINAL_ACTIVE:'chip-purple',COMPLETED:'chip-red'
};

var sb = null;
var tournament = null;
var counters = {A:0,B:0,C:0,D:0};

function el(id) { return document.getElementById(id); }
function show(id) { el(id).style.display = 'block'; }
function hide(id) { el(id).style.display = 'none'; }

/* ── Phone normalization ── */
function normalizePhone(raw) {
  if (!raw) return null;
  var d = raw.replace(/[^\d+]/g,'').replace(/(?!^)\+/g,'').replace(/^\+/,'');
  if (d.indexOf('00971') === 0) d = d.slice(5);
  else if (d.indexOf('971') === 0) d = d.slice(3);
  if (d.charAt(0) === '0') d = d.slice(1);
  if (!/^5\d{8}$/.test(d)) return null;
  return '+971' + d;
}

/* ── Fetch tournament + counters ── */
async function loadTournament() {
  if (tournament) return;
  var { data } = await sb.from('tournaments').select('*').order('created_at').limit(1).maybeSingle();
  if (data) tournament = data;
}

async function loadCounters() {
  if (!tournament) return;
  var { data } = await sb.from('groups').select('group_name, player_count').eq('tournament_id', tournament.id);
  if (data) {
    counters = {A:0,B:0,C:0,D:0};
    data.forEach(function(g) { counters[g.group_name] = g.player_count || 0; });
  }
}

/* ── Render ── */
function renderAll() {
  if (!tournament) return;
  var total = GROUPS.reduce(function(s,g) { return s + counters[g]; }, 0);
  var st = tournament.status;

  // Chip
  var chip = el('statusChip');
  chip.style.display = 'inline-flex';
  chip.className = 'chip ' + (STATUS_COLORS[st] || 'chip-green');
  el('statusText').textContent = STATUS_LABELS[st] || st;

  // Banners
  hide('bannerFull'); hide('bannerActive'); hide('bannerFinal'); hide('bannerDone');
  if (st === 'REGISTRATION_FULL' && total >= 16) show('bannerFull');
  else if (st === 'GROUPS_ACTIVE') show('bannerActive');
  else if (st === 'FINAL_READY' || st === 'FINAL_ACTIVE') show('bannerFinal');
  else if (st === 'COMPLETED') show('bannerDone');

  // Form
  var canBook = (st === 'REGISTRATION_OPEN' || st === 'REGISTRATION_FULL') && total < 16;
  el('formSection').style.display = canBook ? 'block' : 'none';

  if (total >= 16) {
    el('totalLabel').innerHTML = '<span style="color:var(--red);font-weight:900">العدد مكتمل 🔴 16 / 16</span>';
  } else {
    el('totalLabel').innerHTML = '<span class="ltr" style="color:var(--ink-m)">'+total+' / 16 مسجل</span>';
  }

  renderGroups();
  renderBracket();
}

function renderGroups() {
  var grid = el('groupsGrid');
  grid.innerHTML = GROUPS.map(function(g) {
    var c = counters[g] || 0;
    var full = c >= 4;
    var pct = Math.min((c/4)*100, 100);
    return '<div class="gcard '+(full?'b'+g+' glow-'+g:'')+'" style="padding:16px;transition:all .3s">'
      + '<div style="display:flex;align-items:center;justify-content:space-between">'
      + '<span class="ltr g'+g+'" style="font-size:26px;font-weight:900">'+g+'</span>'
      + (full ? '<span class="lock-badge">🔒 مكتملة</span>' : '')
      + '</div>'
      + '<div style="font-size:11px;font-weight:700;color:var(--ink-m);margin-top:4px">'+GROUP_NAMES[g]+'</div>'
      + '<div style="display:flex;align-items:baseline;gap:4px;margin-top:6px">'
      + '<span class="ltr" style="font-size:32px;font-weight:900;color:var(--ink);line-height:1">'+c+'</span>'
      + '<span style="font-size:12px;font-weight:700;color:var(--ink-m)">لاعبين / 4</span>'
      + '</div>'
      + '<div class="pbar" style="margin-top:8px"><div class="pbar-fill f'+g+'" style="width:'+pct+'%"></div></div>'
      + '</div>';
  }).join('');
}

function renderBracket() {
  el('bracketGroups').innerHTML = GROUPS.map(function(g) {
    return '<div class="bracket-group">'
      + '<span style="font-size:13px;font-weight:700">'+GROUP_NAMES[g]+'</span>'
      + '<span class="ltr g'+g+'" style="font-size:18px;font-weight:900">'+g+'</span></div>';
  }).join('');
}

/* ── Tabs ── */
function switchTab(mode) {
  el('tabBook').className = 'tab' + (mode==='book'?' active':'');
  el('tabCheck').className = 'tab' + (mode==='check'?' active':'');
  el('bookPanel').style.display = mode==='book' ? 'block' : 'none';
  el('checkPanel').style.display = mode==='check' ? 'block' : 'none';
}

/* ── Toast ── */
function toast(msg, ms) {
  ms = ms || 2500;
  var t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function() { t.classList.add('out'); setTimeout(function(){ t.remove(); }, 400); }, ms);
}

/* ── Book ── */
async function handleBook(e) {
  e.preventDefault();
  var errEl = el('bookError');
  var name = (el('bName').value || '').trim();
  var phone = el('bPhone').value;

  errEl.style.display = 'none';

  if (name.length < 2) { errEl.textContent = 'الرجاء إدخال الاسم الكامل'; errEl.style.display='block'; return; }
  if (!phone) { errEl.textContent = 'رقم الجوال مطلوب'; errEl.style.display='block'; return; }

  var normPhone = normalizePhone(phone);
  if (!normPhone) { errEl.textContent = 'رقم الجوال غير صحيح. مثال: 5XXXXXXXX'; errEl.style.display='block'; return; }

  var btn = el('bookBtn');
  btn.disabled = true;
  btn.textContent = '⏳ جاري الحجز...';

  try {
    var { data, error } = await sb.rpc('book_player', {
      p_tournament_id: tournament.id,
      p_full_name: name,
      p_phone: normPhone
    });
    if (error) throw error;

    if (data && data.ok) {
      showSuccess(data);
      await loadCounters();
      renderAll();
    } else {
      var errors = {
        INVALID_NAME:'الرجاء إدخال الاسم الكامل',
        INVALID_PHONE:'رقم الجوال غير صحيح',
        PHONE_EXISTS:'هذا الرقم مسجل مسبقاً.',
        TOURNAMENT_FULL:'اكتملت جميع المقاعد',
        REGISTRATION_CLOSED:'التسجيل مغلق حالياً',
        TOURNAMENT_NOT_FOUND:'حدث خطأ، حاول مرة أخرى',
        NO_GROUP_AVAILABLE:'لا توجد مجموعة متاحة'
      };
      errEl.textContent = errors[data.error] || 'حدث خطأ غير متوقع';
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'احجز مكاني الآن';
    }
  } catch(err) {
    console.error(err);
    errEl.textContent = 'تعذر الاتصال بالخادم، حاول مجدداً';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'احجز مكاني الآن';
  }
}

/* ── Check ── */
async function handleCheck(e) {
  e.preventDefault();
  var errEl = el('checkError');
  var resEl = el('checkResult');
  var phone = el('cPhone').value;

  errEl.style.display = 'none';
  resEl.style.display = 'none';

  var normPhone = normalizePhone(phone);
  if (!normPhone) { errEl.textContent = 'رقم الجوال غير صحيح'; errEl.style.display='block'; return; }

  var btn = el('checkBtn');
  btn.disabled = true;
  btn.textContent = 'جاري البحث...';

  try {
    var { data, error } = await sb.rpc('get_booking_by_phone', {
      p_tournament_id: tournament.id,
      p_phone: normPhone
    });
    btn.disabled = false;
    btn.textContent = 'تحقق من حجزي';

    if (data && data.ok) {
      var colorClass = 'g' + data.group_name;
      resEl.innerHTML = '<div class="gcard anim-pop" style="margin-top:14px;padding:20px;text-align:center">'
        + '<p style="font-size:13px;color:var(--ink-s)">أهلاً بك يا</p>'
        + '<p style="font-size:17px;font-weight:900;margin-top:2px">'+data.full_name+'</p>'
        + '<div style="display:flex;align-items:center;justify-content:center;gap:24px;margin-top:16px">'
        + '<div><div style="font-size:10px;font-weight:700;color:var(--ink-m)">المجموعة</div>'
        + '<div class="ltr '+colorClass+'" style="font-size:32px;font-weight:900;margin-top:2px">'+data.group_name+'</div></div>'
        + '<div style="width:1px;height:36px;background:var(--border)"></div>'
        + '<div><div style="font-size:10px;font-weight:700;color:var(--ink-m)">رقم اللاعب</div>'
        + '<div class="ltr" style="font-size:32px;font-weight:900;margin-top:2px">#'+String(data.player_number).padStart(2,'0')+'</div></div>'
        + '</div></div>';
      resEl.style.display = 'block';
    } else {
      errEl.textContent = 'لا يوجد حجز مسجل بهذا الرقم';
      errEl.style.display = 'block';
    }
  } catch(err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = 'تحقق من حجزي';
    errEl.textContent = 'تعذر الاتصال بالخادم';
    errEl.style.display = 'block';
  }
}

/* ── Success ── */
function showSuccess(data) {
  hide('formSection');
  var scr = el('successScreen');
  scr.style.display = 'block';
  scr.className = 'gcard';
  scr.style.cssText = 'display:block;overflow:hidden;padding:48px 24px;text-align:center';

  scr.innerHTML = '<div class="anim-dice" style="font-size:56px">🎲</div>'
    + '<p style="font-size:18px;font-weight:900;margin-top:16px">جاري توزيعك عشوائياً...</p>'
    + '<div class="pbar" style="width:160px;margin:20px auto 0"><div class="pbar-fill fA" style="width:50%"></div></div>';

  setTimeout(function() {
    var g = data.group_name;
    var num = String(data.player_number).padStart(2,'0');
    var colorClass = 'g'+g;
    var borderClass = 'b'+g;
    var glowClass = 'glow-'+g;

    scr.innerHTML = '<div class="anim-pop" style="font-size:44px">🎉</div>'
      + '<h2 style="font-size:22px;font-weight:900;margin-top:10px">تم حجز مكانك بنجاح!</h2>'
      + '<p style="font-size:14px;color:var(--ink-s);margin-top:4px">أهلاً بك يا <strong style="color:var(--ink)">'+data.full_name+'</strong></p>'
      + '<p style="font-size:11px;font-weight:700;color:var(--ink-m);margin-top:28px">تم توزيعك عشوائياً على</p>'
      + '<div class="anim-pop '+borderClass+' '+glowClass+'" style="width:120px;height:120px;margin:12px auto;border-radius:28px;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;background:rgba(17,29,50,.7)">'
      + '<span class="ltr '+colorClass+'" style="font-size:64px;font-weight:900">'+g+'</span></div>'
      + '<p class="'+colorClass+'" style="font-size:16px;font-weight:900">'+GROUP_NAMES[g]+'</p>'
      + '<div style="display:inline-flex;align-items:center;gap:10px;margin-top:20px;padding:10px 20px;border-radius:20px;border:1px solid var(--border);background:rgba(24,38,64,.5)">'
      + '<span style="font-size:11px;font-weight:700;color:var(--ink-m)">رقم اللاعب</span>'
      + '<span class="ltr" style="font-size:18px;font-weight:900">#'+num+'</span></div>'
      + '<div style="margin-top:24px;border-radius:12px;border:1px solid var(--border);background:rgba(17,29,50,.4);padding:14px 16px">'
      + '<p style="font-size:12px;color:var(--ink-s);line-height:1.8">احتفظ بهذه المعلومات، وسيتم التواصل معك بخصوص موعد المنافسة.</p></div>'
      + '<button class="btn btn-s" style="margin-top:16px" onclick="resetForm()">حجز لاعب آخر</button>';
  }, 1800);
}

function resetForm() {
  show('formSection');
  hide('successScreen');
  el('bookBtn').disabled = false;
  el('bookBtn').textContent = 'احجز مكاني الآن';
  el('bName').value = '';
  el('bPhone').value = '';
  hide('bookError');
}

/* ── Realtime ── */
function subscribe() {
  if (!sb || !tournament) return;

  sb.channel('public-rt')
    .on('postgres_changes', {event:'*', schema:'public', table:'groups', filter:'tournament_id=eq.'+tournament.id}, function(p) {
      var r = p.new;
      if (r && r.group_name && typeof r.player_count === 'number') {
        counters[r.group_name] = r.player_count;
        renderGroups();
        var total = GROUPS.reduce(function(s,g){ return s + counters[g]; }, 0);
        el('totalLabel').textContent = total + ' / 16 مسجل';
      }
    })
    .on('postgres_changes', {event:'UPDATE', schema:'public', table:'tournaments', filter:'id=eq.'+tournament.id}, function(p) {
      var r = p.new;
      if (r && r.status) { tournament.status = r.status; renderAll(); }
    })
    .subscribe();
}

/* ── Init ── */
async function init() {
  if (SB_URL.indexOf('YOUR_') === 0 || SB_KEY.indexOf('YOUR_') === 0) {
    hideLoader();
    el('app').innerHTML += '<div class="gcard" style="margin-top:40px;padding:40px 24px;text-align:center">'
      + '<div style="font-size:40px">⚠️</div>'
      + '<h2 style="font-size:16px;font-weight:900;margin-top:10px">تهيئة Supabase ناقصة</h2>'
      + '<p style="font-size:13px;color:var(--ink-s);margin-top:6px">أضف SB_URL و SB_KEY في ملف app.js</p></div>';
    return;
  }

  try {
    sb = window.supabase.createClient(SB_URL, SB_KEY);
  } catch(e) { console.error(e); hideLoader(); return; }

  try {
    await loadTournament();
    if (!tournament) {
      hideLoader();
      el('app').innerHTML += '<div class="gcard" style="margin-top:40px;padding:40px 24px;text-align:center">'
        + '<div style="font-size:40px">⚠️</div>'
        + '<h2 style="font-size:16px;font-weight:900;margin-top:10px">البطولة غير مهيأة</h2></div>';
      return;
    }

    await loadCounters();
    renderAll();
    subscribe();
  } catch(e) {
    console.error(e);
  }
  hideLoader();
}

function hideLoader() {
  var l = document.getElementById('loader');
  if (!l) return;
  l.style.transition = 'opacity .6s ease';
  l.style.opacity = '0';
  setTimeout(function(){ l.style.display = 'none'; }, 650);
}

function runLoaderCounter() {
  var pct = 0;
  var iv = setInterval(function() {
    var elPct = document.getElementById('loadPct');
    if (!elPct) { clearInterval(iv); return; }
    pct = Math.min(pct + (Math.random()*12 + 6), 99);
    elPct.textContent = Math.floor(pct) + '%';
    if (pct >= 99) { clearInterval(iv); setTimeout(function(){ if (elPct) elPct.textContent = '100%'; }, 300); }
  }, 240);
}

document.addEventListener('DOMContentLoaded', function(){ runLoaderCounter(); });
document.addEventListener('DOMContentLoaded', init);
