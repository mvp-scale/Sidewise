/* Demo player behaviour (scripts/build-demo.ts writes the markup). Without this script every story and step is shown stacked,
   request above response, and the page reads fine; with it the stories become tabs, the steps a step-through with
   previous/next and a replay, the request and response a tab pair, and question N in the request lights up answer N.
   No external requests; reduced motion turns the replay off. */
(function () {
  var root = document.querySelector('[data-player]');
  if (!root) return;
  var stories = Array.prototype.slice.call(root.querySelectorAll('[data-story]'));
  var scenes = Array.prototype.slice.call(root.querySelectorAll('[data-scene]'));
  var ctl = root.querySelector('.pctl');
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var current = 0, timers = [];
  root.classList.add('js', 'tabbed');

  /* Anchors become buttons in a tab list with arrow-key movement. */
  function tablist(nav, label, onPick) {
    var items = Array.prototype.slice.call(nav.children).map(function (a, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = a.className; b.innerHTML = a.innerHTML; b.title = a.title || '';
      b.setAttribute('role', 'tab'); b.dataset.href = a.getAttribute('href');
      b.addEventListener('click', function () { onPick(i); });
      b.addEventListener('keydown', function (e) {
        var n = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
        if (n === undefined) return;
        e.preventDefault(); n = (n + items.length) % items.length; onPick(n); items[n].focus();
      });
      return b;
    });
    nav.textContent = ''; nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', label);
    items.forEach(function (b) { nav.appendChild(b); });
    return items;
  }
  function mark(items, on) { items.forEach(function (b, j) { b.setAttribute('aria-selected', j === on ? 'true' : 'false'); b.tabIndex = j === on ? 0 : -1; }); }

  var storyOf = scenes.map(function (sc) { return stories.indexOf(sc.closest('[data-story]')); });
  var firstOf = stories.map(function (_st, k) { return storyOf.indexOf(k); });
  var storyTabs = tablist(root.querySelector('.pstabs'), 'Stories', function (k) { select(firstOf[k], true); });
  var stepTabs = stories.map(function (st, k) {
    return tablist(st.querySelector('.psteps'), 'Steps', function (i) { select(firstOf[k] + i, true); });
  });

  function clear() { timers.forEach(clearTimeout); timers = []; }
  function show(sc, which) {
    sc.dataset.show = which;
    Array.prototype.forEach.call(sc.querySelectorAll('[data-tab]'), function (t) { t.setAttribute('aria-selected', t.dataset.tab === which ? 'true' : 'false'); t.tabIndex = t.dataset.tab === which ? 0 : -1; });
  }
  function select(i, push) {
    clear();
    current = i;
    scenes.forEach(function (sc, j) { sc.hidden = j !== i; sc.removeAttribute('data-phase'); });
    var k = storyOf[i];
    stories.forEach(function (st, j) { st.hidden = j !== k; });
    mark(storyTabs, k);
    stepTabs.forEach(function (tabs, j) { mark(tabs, j === k ? i - firstOf[k] : -1); });
    if (ctl) { ctl.querySelector('[data-prev]').disabled = i === 0; ctl.querySelector('[data-next]').disabled = i === scenes.length - 1; }
    if (push && history.replaceState) history.replaceState(null, '', '#' + scenes[i].id);
  }

  /* Request/response tabs inside each step. */
  scenes.forEach(function (sc) {
    var tabs = Array.prototype.slice.call(sc.querySelectorAll('[data-tab]'));
    tabs.forEach(function (t, n) {
      t.addEventListener('click', function () { show(sc, t.dataset.tab); });
      t.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault(); var o = tabs[(n + 1) % tabs.length]; show(sc, o.dataset.tab); o.focus();
      });
    });
    show(sc, 'request');
  });

  /* Replay: the request, then the response with its quick read, then the decision, then the ledger. */
  function replay() {
    clear();
    var sc = scenes[current];
    show(sc, 'request'); sc.setAttribute('data-phase', '0');
    var t = 1600;
    [1, 2, 3].forEach(function (p) {
      timers.push(setTimeout(function () { sc.setAttribute('data-phase', String(p)); if (p === 1) show(sc, 'response'); }, t));
      t += p === 1 ? 2200 : 1800;
    });
    timers.push(setTimeout(function () { sc.removeAttribute('data-phase'); }, t + 600));
  }

  if (ctl) {
    ctl.hidden = false;
    ctl.querySelector('[data-prev]').addEventListener('click', function () { if (current > 0) select(current - 1, true); });
    ctl.querySelector('[data-next]').addEventListener('click', function () { if (current < scenes.length - 1) select(current + 1, true); });
    var rb = ctl.querySelector('[data-replay]');
    if (still) rb.hidden = true; else rb.addEventListener('click', replay);
  }

  /* Question N in the request lights up answer N in the quick read and the response (and back), within one step. */
  function light(el, on) {
    var q = el.closest && el.closest('[data-q]');
    var sc = q && q.closest('[data-scene]');
    if (!sc) return;
    sc.querySelectorAll('[data-q="' + q.getAttribute('data-q') + '"]').forEach(function (n) { n.classList.toggle('hl', on); });
  }
  root.addEventListener('mouseover', function (e) { light(e.target, true); });
  root.addEventListener('mouseout', function (e) { light(e.target, false); });
  root.addEventListener('focusin', function (e) { light(e.target, true); });
  root.addEventListener('focusout', function (e) { light(e.target, false); });

  function fromHash() {
    var h = location.hash.slice(1), i = 0;
    scenes.forEach(function (sc, j) { if (h === sc.id) i = j; });
    stories.forEach(function (st, k) { if (h === st.id) i = firstOf[k]; });
    return i;
  }
  window.addEventListener('hashchange', function () { select(fromHash(), false); });
  select(fromHash(), false);
})();
