/* Demo player behaviour (scripts/build-demo.ts writes the markup). Without this script every scene is shown stacked and the
   page reads fine; with it the scenes become tabs with prev/next, a replay, and the question-to-answer highlight.
   No external requests; reduced motion turns the replay off. */
(function () {
  var root = document.querySelector('[data-player]');
  if (!root) return;
  var scenes = Array.prototype.slice.call(root.querySelectorAll('[data-scene]'));
  var nav = root.querySelector('.ptabs');
  var ctl = root.querySelector('.pctl');
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var current = 0, timers = [];
  root.classList.add('js');

  nav.setAttribute('role', 'tablist');
  var tabs = scenes.map(function (sc, i) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'ptab'; b.setAttribute('role', 'tab');
    b.id = 'tab-' + sc.dataset.scene; b.setAttribute('aria-controls', sc.id);
    b.textContent = sc.dataset.verb;
    b.addEventListener('click', function () { select(i, true); });
    b.addEventListener('keydown', function (e) {
      var n = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: scenes.length - 1 }[e.key];
      if (n === undefined) return;
      e.preventDefault(); select((n + scenes.length) % scenes.length, true); tabs[current].focus();
    });
    sc.setAttribute('role', 'tabpanel'); sc.setAttribute('aria-labelledby', b.id);
    return b;
  });
  nav.textContent = '';
  tabs.forEach(function (b) { nav.appendChild(b); });

  function clear() { timers.forEach(clearTimeout); timers = []; }
  function select(i, focusless) {
    clear();
    current = i;
    scenes.forEach(function (sc, j) {
      sc.hidden = j !== i; sc.removeAttribute('data-phase');
      tabs[j].setAttribute('aria-selected', j === i ? 'true' : 'false');
      tabs[j].tabIndex = j === i ? 0 : -1;
    });
    if (ctl) { ctl.querySelector('[data-prev]').disabled = i === 0; ctl.querySelector('[data-next]').disabled = i === scenes.length - 1; }
    if (focusless && history.replaceState) history.replaceState(null, '', '#' + scenes[i].id);
  }

  /* Replay: type the prompt, then reveal the command and request, the verdict, and next, one step at a time. */
  function replay() {
    clear();
    var sc = scenes[current], tc = sc.querySelector('.tc'), full = tc.getAttribute('data-full');
    sc.setAttribute('data-phase', '0');
    tc.textContent = '# ';
    var i = 0;
    (function type() {
      i += 2; tc.textContent = '# ' + full.slice(0, i);
      if (i < full.length) { timers.push(setTimeout(type, 22)); return; }
      tc.textContent = '# ' + full;
      [1, 2, 3].forEach(function (p, k) { timers.push(setTimeout(function () { sc.setAttribute('data-phase', String(p)); }, 700 + k * 1400)); });
      timers.push(setTimeout(function () { sc.removeAttribute('data-phase'); }, 700 + 3 * 1400));
    })();
  }

  if (ctl) {
    ctl.hidden = false;
    ctl.querySelector('[data-prev]').addEventListener('click', function () { if (current > 0) select(current - 1, true); });
    ctl.querySelector('[data-next]').addEventListener('click', function () { if (current < scenes.length - 1) select(current + 1, true); });
    var rb = ctl.querySelector('[data-replay]');
    if (still) rb.hidden = true; else rb.addEventListener('click', replay);
  }

  /* Question N in the request lights up answer N in the verdict (and back), within one scene. */
  function mark(el, on) {
    var q = el.closest('[data-q]');
    if (!q) return;
    var sc = q.closest('[data-scene]');
    if (!sc) return;
    sc.querySelectorAll('[data-q="' + q.getAttribute('data-q') + '"]').forEach(function (n) { n.classList.toggle('hl', on); });
  }
  root.addEventListener('mouseover', function (e) { mark(e.target, true); });
  root.addEventListener('mouseout', function (e) { mark(e.target, false); });
  root.addEventListener('focusin', function (e) { mark(e.target, true); });
  root.addEventListener('focusout', function (e) { mark(e.target, false); });

  var start = 0;
  scenes.forEach(function (sc, i) { if (location.hash === '#' + sc.id) start = i; });
  select(start, false);
})();
