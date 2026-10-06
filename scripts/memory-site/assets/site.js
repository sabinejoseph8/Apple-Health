(function () {
  'use strict';
  var TABS = ['product', 'design', 'tech', 'plan', 'mvp'];
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  };
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  /* ---------- tabs and deep links ---------- */
  var current = null;
  function barHeight() { var b = $('.tabbar'); return b ? b.offsetHeight : 0; }
  function activate(key, scrollTop) {
    if (TABS.indexOf(key) < 0) key = 'product';
    if (key !== current) {
      TABS.forEach(function (k) {
        var p = document.getElementById(k), t = document.getElementById('tab-' + k), on = k === key;
        p.classList.toggle('on', on);
        if (on) { p.removeAttribute('aria-hidden'); p.removeAttribute('inert'); }
        else { p.setAttribute('aria-hidden', 'true'); p.setAttribute('inert', ''); }
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
      });
      current = key;
      store.set('pm-tab', key);
      watchToc();
    }
    if (scrollTop) {
      var top = $('#panels').getBoundingClientRect().top + window.scrollY - barHeight();
      if (window.scrollY > top) window.scrollTo({ top: top, behavior: 'auto' });
    }
  }
  function go(id, fromClick) {
    if (!id) return false;
    if (TABS.indexOf(id) >= 0) { activate(id, true); return true; }
    var el = document.getElementById(id);
    if (!el) return false;
    var panel = el.closest('.panel');
    if (!panel) return false;
    activate(panel.id, false);
    var det = el.closest('details');
    while (det) { det.open = true; det = det.parentElement && det.parentElement.closest('details'); }
    var er = el.closest('.er-panel');
    if (er && !er.classList.contains('on')) showEr(er.id);
    requestAnimationFrame(function () {
      el.scrollIntoView({ block: 'start', behavior: (reduce || !fromClick) ? 'auto' : 'smooth' });
      if (['req', 'task', 'comp', 'drow', 'arow', 'risk'].some(function (c) { return el.classList.contains(c); })) {
        el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
      }
    });
    return true;
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    if (go(id, true)) {
      e.preventDefault();
      try { history.replaceState(null, '', '#' + id); } catch (err) { /* frame may refuse */ }
    }
  });
  window.addEventListener('hashchange', function () { go(location.hash.slice(1), false); });
  $('.tabs').addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    var i = TABS.indexOf(current) + (e.key === 'ArrowRight' ? 1 : -1);
    i = (i + TABS.length) % TABS.length;
    activate(TABS[i], true);
    document.getElementById('tab-' + TABS[i]).focus();
    e.preventDefault();
  });

  /* ---------- on-this-page highlighting ---------- */
  var io = null;
  function watchToc() {
    if (!('IntersectionObserver' in window)) return;
    if (io) io.disconnect();
    var panel = document.getElementById(current);
    var links = {};
    $$('.toc a[data-toc]', panel).forEach(function (a) { links[a.dataset.toc] = a; });
    var targets = Object.keys(links).map(function (id) { return document.getElementById(id); }).filter(Boolean);
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        $$('.toc a.active', panel).forEach(function (a) { a.classList.remove('active'); });
        var a = links[en.target.id];
        if (a) {
          a.classList.add('active');
          var toc = a.closest('.toc');
          if (toc && toc.scrollWidth > toc.clientWidth + 4) {
            var x = a.offsetLeft - 16;
            toc.scrollTo({ left: x, behavior: 'auto' });
          }
        }
      });
    }, { rootMargin: '-' + (barHeight() + 20) + 'px 0px -65% 0px' });
    targets.forEach(function (t) { io.observe(t); });
  }

  /* ---------- requirement filter ---------- */
  var rf = $('#req-filter');
  if (rf) {
    var reqs = $$('.req'), count = $('#req-count'), empty = $('#req-empty');
    rf.addEventListener('input', function () {
      var q = rf.value.trim().toLowerCase(), shown = 0;
      reqs.forEach(function (r) {
        var hit = !q || r.textContent.toLowerCase().indexOf(q) >= 0 || r.id.toLowerCase() === q;
        r.hidden = !hit; if (hit) shown++;
      });
      $$('.req-area').forEach(function (a) { a.hidden = !$$('.req', a).some(function (r) { return !r.hidden; }); });
      count.textContent = q ? 'Showing ' + shown + ' of ' + reqs.length : reqs.length + ' requirements';
      empty.hidden = shown > 0;
    });
  }

  /* ---------- decision filter ---------- */
  var dfl = $('#dec-filter');
  if (dfl) {
    var drows = $$('.drow'), dcount = $('#dec-count'), dempty = $('#dec-empty');
    dfl.addEventListener('input', function () {
      var q = dfl.value.trim().toLowerCase(), shown = 0;
      drows.forEach(function (r) {
        var hit = !q || r.textContent.toLowerCase().indexOf(q) >= 0 || r.id.toLowerCase() === q;
        r.hidden = !hit; if (hit) shown++;
      });
      dcount.textContent = q ? 'Showing ' + shown + ' of ' + drows.length : drows.length + ' decisions';
      dempty.hidden = shown > 0;
    });
  }

  /* ---------- risk filter ---------- */
  $$('.seg-filter').forEach(function (g) {
    g.addEventListener('click', function (e) {
      var b = e.target.closest('.fchip'); if (!b) return;
      $$('.fchip', g).forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      var ph = b.dataset.phase;
      $$('.risk[data-phase]').forEach(function (r) { r.hidden = !(ph === 'all' || r.dataset.phase === ph); });
    });
  });

  /* ---------- data model diagram switcher ---------- */
  function showEr(id) {
    $$('.er-panel').forEach(function (p) { p.classList.toggle('on', p.id === id); });
    $$('.er-tab').forEach(function (t) { var on = t.dataset.er === id; t.classList.toggle('on', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
  }
  $$('.er-tab').forEach(function (t) { t.addEventListener('click', function () { showEr(t.dataset.er); }); });

  /* ---------- copy hex ---------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.hex-btn');
    if (!b) return;
    var hex = b.dataset.hex;
    function done() { b.classList.add('copied'); b.textContent = 'Copied'; setTimeout(function () { b.classList.remove('copied'); b.textContent = hex; }, 1200); }
    function fallback() { try { var r = document.createRange(); r.selectNodeContents(b); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (err) { /* ignore */ } }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(hex).then(done, fallback);
      else fallback();
    } catch (err) { fallback(); }
  });

  /* ---------- plan ticks (shared, stored with the page) ---------- */
  var tasks = $$('.task'), byId = {};
  tasks.forEach(function (t) { byId[t.dataset.task] = t; });
  var ticks = {}, db = null, canTick = false;
  var phaseNames = {};
  $$('.phase-card').forEach(function (c) { phaseNames[c.dataset.phase] = $('.pc-name', c).textContent; });
  function isDone(id) {
    var t = ticks[id];
    if (t && typeof t.done === 'boolean') return t.done;
    return byId[id].dataset.mdDone === '1';
  }
  function fmtDate(s) {
    var d = new Date(s); if (isNaN(d)) return '';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  var mdStatus = {};
  $$('.phase-card').forEach(function (c) { mdStatus[c.dataset.phase] = (c.dataset.mdStatus || '').toLowerCase(); });
  function setStatus(el, p, key) {
    var started = key && mdStatus[key] && mdStatus[key].indexOf('in progress') === 0;
    var label = !p ? 'Not started' : (p.d === p.t ? 'Done' : (p.d > 0 || started ? 'In progress' : 'Not started'));
    el.textContent = label;
    el.classList.toggle('prog', label === 'In progress');
    el.classList.toggle('done', label === 'Done');
    return label;
  }
  function render() {
    var total = 0, done = 0, phase = {}, next = null;
    tasks.forEach(function (el) {
      var id = el.dataset.task, p = el.dataset.phase, d = isDone(id), t = ticks[id];
      total++; if (d) done++;
      if (!phase[p]) phase[p] = { t: 0, d: 0 };
      phase[p].t++; if (d) phase[p].d++;
      if (!d && !next) next = el;
      el.classList.toggle('done', d);
      var cb = $('input.tick', el); cb.checked = d;
      $('.done-when', el).textContent = d && t && t.done_at ? 'Done ' + fmtDate(t.done_at) : (d ? 'Done' : '');
      var note = $('.task-note', el), n = t && typeof t.note === 'string' ? t.note.trim() : '';
      note.hidden = !n; note.textContent = n;
    });
    $$('[data-phase-status]').forEach(function (c) { setStatus(c, phase[c.dataset.phaseStatus], c.dataset.phaseStatus); });
    $$('[data-phase-count]').forEach(function (c) { var p = phase[c.dataset.phaseCount]; c.textContent = p ? p.d + ' of ' + p.t + ' tasks' : ''; });
    $$('[data-phase-bar]').forEach(function (b) { var p = phase[b.dataset.phaseBar]; b.style.width = p ? Math.round(100 * p.d / p.t) + '%' : '0%'; });
    var pct = total ? Math.round(100 * done / total) : 0;
    $('#all-bar').style.width = pct + '%';
    $('#all-count').textContent = done + ' of ' + total + ' tasks done';
    $('#ring-pct').textContent = pct + '%';
    $('#ring-fg').setAttribute('stroke-dasharray', pct + ' 100');
    var cur = null;
    Object.keys(phase).sort(function (a, b) { return a - b; }).some(function (k) { if (phase[k].d < phase[k].t) { cur = k; return true; } return false; });
    var curEl = $('#cur-phase');
    if (cur) {
      var label = setStatus(document.createElement('span'), phase[cur], cur);
      curEl.textContent = 'Phase ' + cur + ', ' + (phaseNames[cur] || '') + ' (' + label + ')';
    } else { curEl.textContent = 'All phases complete'; }
    $$('.phase-card').forEach(function (c) { c.classList.toggle('current', c.dataset.phase === cur); });
    var nt = $('#next-task');
    nt.textContent = '';
    if (next) {
      var a = document.createElement('a');
      a.href = '#' + next.dataset.task;
      a.textContent = next.dataset.text;
      var tag = document.createElement('span'); tag.className = 'tid mono'; tag.textContent = ' ' + next.dataset.task;
      nt.appendChild(a); nt.appendChild(tag);
    } else { nt.textContent = 'None. Every task is done.'; }
  }
  function sync(state, text) {
    var s = $('#tick-sync'); s.dataset.state = state; $('span', s).textContent = text;
  }
  async function toggle(e) {
    var cb = e.target, id = cb.dataset.task, want = cb.checked, el = byId[id];
    cb.disabled = true;
    var body = { done: want, done_at: want ? new Date().toISOString() : null, text: el.dataset.text, by: 'page' };
    try {
      if (ticks[id]) await db.doc('tasks/' + id).update(body);
      else await db.doc('tasks/' + id).set(body);
      ticks[id] = Object.assign({}, ticks[id] || {}, body);
      render();
    } catch (err) {
      cb.checked = !want;
      if (err && err.code === 'invalid_argument') { canTick = false; lockAll(); sync('live', 'Ticks are live. Only Sabine or Claude can change them.'); }
      else sync('error', 'That tick did not save. Check your connection and try again.');
    } finally { if (canTick) cb.disabled = false; }
  }
  function lockAll() { tasks.forEach(function (el) { $('input.tick', el).disabled = true; }); }
  function unlockAll() { tasks.forEach(function (el) { var cb = $('input.tick', el); cb.disabled = false; cb.addEventListener('change', toggle); }); }
  render();
  async function startTicks() {
    var use = window.claude && typeof window.claude.use === 'function' ? window.claude.use : null;
    if (!use) { sync('static', 'Showing the plan as written. Live ticks appear when this page is open on claude.ai.'); return; }
    var user = null;
    try { db = await use('db'); } catch (e) { db = null; }
    try { user = await use('user'); } catch (e) { user = null; }
    if (!db) { sync('static', 'Showing the plan as written. Sign in on claude.ai to see live ticks.'); return; }
    try { canTick = user ? !!(await user.canEdit()) : false; } catch (e) { canTick = false; }
    var first = true;
    db.collection('tasks').limit(500).onSnapshot(function (snap) {
      var next = {};
      snap.docs.forEach(function (d) { if (d.exists && byId[d.id]) next[d.id] = d.data(); });
      ticks = next;
      render();
      if (first) {
        first = false;
        if (canTick) unlockAll();
        sync('live', canTick ? 'Ticks are live. Tick a task when it is done; Claude can tick them too.' : 'Ticks are live. Sabine or Claude marks tasks done.');
      }
    }, function () { sync('error', 'Ticks could not load, so the plan shows as written. Reload to try again.'); });
  }
  startTicks();

  /* ---------- first view ---------- */
  var h = location.hash.slice(1);
  if (!go(h, false)) activate(store.get('pm-tab') || 'product', false);
})();
