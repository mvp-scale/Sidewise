#!/bin/sh
# A repeatable, offline tour of every Sidewise verb and flow: fake + chaos providers, no network, no key.
# Proves the six verbs, template, outcome, budget and doctor end to end before turning on the live TypeSafe
# classifier. Builds nothing itself (run "npm run build" first) — creates a throwaway git repo under a mktemp
# dir, points SIDEWISE_HOME at it, and runs each flow in order, printing one line per step:
#   ✔ <flow>: <step> (ok)      a step passed
#   ✖ <flow>: <step> ...       a step failed → the script exits non-zero right there
#   ⚠ <flow>: <step> ...       a real product bug (not a script bug): noted, the tour keeps going
# The flows share one ledger, so their SW-#### ids and the fake provider's deterministic answers are fixed
# by the order below — reordering flows changes the ids and gate values later flows assert on.
#   npm run test:flows
set -u
cd "$(git rev-parse --show-toplevel)"
CLI="$(pwd)/dist/cli.js"

if [ ! -f "$CLI" ]; then
  echo "✖ flows: dist/cli.js is missing → run \"npm run build\" first"
  exit 1
fi

KNOWN_BUGS=""

now_ms() { date +%s%3N; }
TOTAL_START=$(now_ms)

# run <sidewise args...>: node "$CLI" "$@" under the current env, stdout+stderr merged into $OUT, code into $CODE.
run() {
  OUT=$(node "$CLI" "$@" 2>&1)
  CODE=$?
}

# runenv "<VAR=val VAR2=val2>" <sidewise args...>: same, with extra env vars for just this call.
runenv() {
  envstr=$1
  shift
  OUT=$(env $envstr node "$CLI" "$@" 2>&1)
  CODE=$?
}

pass() { echo "✔ $1: $2"; }

fail() {
  echo "✖ $1: $2"
  echo "$3" | sed 's/^/    | /'
  echo "flows.sh: stopping at the first failure ($1: $2)"
  exit 1
}

# A real product bug, not a script mistake: note it and keep the tour going (per the brief: don't fix the
# product here, don't let one bad step hide the rest of the tour).
known_bug() {
  echo "⚠ $1: $2 (known failure, not fixed here — see report)"
  echo "$3" | sed 's/^/    | /'
  KNOWN_BUGS="$KNOWN_BUGS\n- $1: $2"
}

need_exit() {
  # need_exit <flow> <step> <expected-code>
  [ "$CODE" = "$3" ] || fail "$1" "$2 (expected exit $3, got $CODE)" "$OUT"
}

need_has() {
  # need_has <flow> <step> <needle>
  case "$OUT" in
    *"$3"*) : ;;
    *) fail "$1" "$2 (missing \"$3\")" "$OUT" ;;
  esac
}

flow_start() { FLOW_T0=$(now_ms); }
flow_done() {
  ms=$(($(now_ms) - FLOW_T0))
  echo "== $1 done (${ms}ms) =="
}

# ---- throwaway project: a couple of small source files, two commits -------------------------------------
D=$(mktemp -d)
trap 'rm -rf "$D"' EXIT
cd "$D"
git init -q
git config user.email "flows@sidewise.local"
git config user.name "sidewise-flows"
mkdir -p src/handlers
cat > src/user.ts <<'EOF'
export function findUser(id: string) {
  const q = "SELECT * FROM users WHERE id = " + id;
  return db.query(q);
}
EOF
cp src/user.ts src/handlers/user.ts
git add -A && git commit -q -m "first: findUser reads request text straight into a query"
C1=$(git rev-parse HEAD)
echo "// reviewed" >> src/user.ts
git add -A && git commit -q -m "second: a reviewer comment"
C2=$(git rev-parse HEAD)

export SIDEWISE_HOME="$D"
export XDG_CONFIG_HOME="$D/.config"   # never the developer's own key file
export SIDEWISE_PROVIDER=fake

echo "flows.sh: project=$D  cli=$CLI"

# ---- 1. doctor (no key) -----------------------------------------------------------------------------------
flow_start
run doctor
need_exit "01-doctor" "no key" 0
need_has "01-doctor" "no key" 'key: no  → run "sidewise init" to add one'
pass "01-doctor" "no key -> exit 0, no key reported"
flow_done "01-doctor"

# ---- 2. view (place, before any run) ---------------------------------------------------------------------
flow_start
run view src
need_exit "02-view-empty" "place before any run" 0
need_has "02-view-empty" "place before any run" "no runs yet"
pass "02-view-empty" "free view of an empty place"
flow_done "02-view-empty"

# ---- 3. template class -> class --dry-run -> class (paid) -------------------------------------------------
flow_start
run template class
need_exit "03-class" "template class" 0
need_has "03-class" "template class" "goal:"
printf '%s\n' "$OUT" > req-class.yaml

run class req-class.yaml --dry-run
need_exit "03-class" "class --dry-run" 0
need_has "03-class" "class --dry-run" "dry run: no call, no spend"
pass "03-class" "template -> dry-run plan"

run class req-class.yaml
need_exit "03-class" "class (paid)" 0
need_has "03-class" "class (paid)" "id: SW-0001"
need_has "03-class" "class (paid)" "gate: fail"
need_has "03-class" "class (paid)" "budget file created"
need_has "03-class" "class (paid)" "not evidence"
FIRST_NEXT=$(printf '%s\n' "$OUT" | command -p grep '^next:' | sed 's/^next: //')
pass "03-class" "first paid call: SW-0001, budget file created, fake labeled not evidence"
flow_done "03-class"

# ---- 4. class again, identical -> exact reuse ---------------------------------------------------------------
flow_start
RUNS_BEFORE=$(node "$CLI" budget | sed -E 's/.*\· ([0-9]+) of [0-9]+ runs.*/\1/')
run class req-class.yaml
need_exit "04-reuse" "identical class again" 0
need_has "04-reuse" "identical class again" "id: SW-0002"
case "$OUT" in
  *"budget file created"*) fail "04-reuse" "identical class again" "$OUT (budget file created again — should only happen once)" ;;
esac
RUNS_AFTER=$(node "$CLI" budget | sed -E 's/.*\· ([0-9]+) of [0-9]+ runs.*/\1/')
[ "$RUNS_BEFORE" = "$RUNS_AFTER" ] || fail "04-reuse" "budget run count unchanged" "before=$RUNS_BEFORE after=$RUNS_AFTER"
pass "04-reuse" "new id SW-0002, budget run count unchanged ($RUNS_AFTER)"
flow_done "04-reuse"

# ---- 5. view <request> -> reuse: <id>; view <id> -> lineage ------------------------------------------------
flow_start
run view req-class.yaml
need_exit "05-view-lookup" "view <request>" 0
need_has "05-view-lookup" "view <request>" "reuse: SW-0002"
pass "05-view-lookup" "view <request> shows reuse: SW-0002"

run view SW-0001
need_exit "05-view-lookup" "view <id>" 0
need_has "05-view-lookup" "view <id>" "lineage"
need_has "05-view-lookup" "view <id>" "SW-0001"
pass "05-view-lookup" "view <id> shows lineage"
flow_done "05-view-lookup"

# ---- 6. class fail -> next: -> template drill --parent --from -> drill (one-subject parent) ---------------
flow_start
case "$FIRST_NEXT" in
  "sidewise template drill --parent"*) : ;;
  *) fail "06-drill-subject" "next: names a template drill command" "$FIRST_NEXT" ;;
esac
NEXT_ARGS=${FIRST_NEXT#sidewise }
# shellcheck disable=SC2086
run $NEXT_ARGS
need_exit "06-drill-subject" "next: -> template drill --parent --from" 0
need_has "06-drill-subject" "next: -> template drill --parent --from" "parent: SW-0001"
printf '%s\n' "$OUT" > req-drill.yaml

run drill req-drill.yaml
need_exit "06-drill-subject" "drill (one-subject parent)" 0
need_has "06-drill-subject" "drill (one-subject parent)" "gate:"
pass "06-drill-subject" "followed next: through template to a one-subject drill"
flow_done "06-drill-subject"

# ---- 7. class -> change --parent <id> --compare <c1>..<c2> -------------------------------------------------
flow_start
run change --parent SW-0001 --compare "$C1..$C2" --expect injection
need_exit "07-change" "change --parent --compare" 0
need_has "07-change" "change --parent --compare" "regressed:"
need_has "07-change" "change --parent --compare" "fixed:"
pass "07-change" "change replays SW-0001 across the two commits: fixed/still/regressed shape"
flow_done "07-change"

# ---- 8. template scan -> scan -> template drill --parent <scan id> --from <item> -> drill (sweep parent) --
flow_start
run template scan
need_exit "08-scan-drill" "template scan" 0
printf '%s\n' "$OUT" > req-scan.yaml

run scan req-scan.yaml
need_exit "08-scan-drill" "scan" 0
need_has "08-scan-drill" "scan" "scanned:"
need_has "08-scan-drill" "scan" "src/handlers/user.ts/findUser"
SCAN_ID=$(printf '%s\n' "$OUT" | command -p grep '^  id:' | sed 's/^  id: //')
pass "08-scan-drill" "scan found src/handlers/user.ts/findUser ($SCAN_ID)"

run template drill --parent "$SCAN_ID" --from src/handlers/user.ts/findUser
need_exit "08-scan-drill" "template drill --parent <scan id> --from <item>" 0
need_has "08-scan-drill" "template drill --parent <scan id> --from <item>" "over:"
printf '%s\n' "$OUT" > req-drill-sweep.yaml

run drill req-drill-sweep.yaml
need_exit "08-scan-drill" "drill (sweep parent)" 0
need_has "08-scan-drill" "drill (sweep parent)" "failing:"
pass "08-scan-drill" "drill went one layer down from the scan's own item"
flow_done "08-scan-drill"

# ---- 9. template loop -> loop -> drill from a loop item (list works, each stops) ---------------------------
flow_start
run template loop
need_exit "09-loop-drill" "template loop" 0
printf '%s\n' "$OUT" > req-loop.yaml

run loop req-loop.yaml
need_exit "09-loop-drill" "loop" 0
need_has "09-loop-drill" "loop" "gateway"
LOOP_ID=$(printf '%s\n' "$OUT" | command -p grep '^  id:' | sed 's/^  id: //')
pass "09-loop-drill" "loop swept ideas ($LOOP_ID)"

cat > req-drill-loop-ok.yaml <<EOF
side:
  goal: Are the sub-parts sound?
  parent: $LOOP_ID
  from: gateway
  over:
    sub: [guest, saved]
  ask:
    sub:
      concerns:
        quality:
          pass: yes
          1: Is {sub} well defined?
          2: Is {sub} independently testable?
          3: Is {sub} owned by one clear team?
        risk:
          pass: no
          4: Does {sub} depend on data it doesn't own?
          5: Could {sub} fail silently?
          6: Does {sub} skip error handling?
        fit:
          pass: yes
          7: Does {sub} match how the gateway is meant to work?
          8: Would {sub} survive a redesign of the gateway?
          9: Is {sub} covered by an existing test?
      decisions:
        severity:
          pass: [none, low]
          10:
            scale: How risky is {sub}?
            levels: [none, low, medium, high, critical]
        route:
          pass: [build-now]
          11:
            choice: What should happen to {sub} next?
            options: [build-now, rework, redesign]
wise:
  why: debug
  area: api
EOF
run drill req-drill-loop-ok.yaml
need_exit "09-loop-drill" "drill from a loop item, list-valued over" 0
pass "09-loop-drill" "drill with a list-valued over: works on an idea item"

cat > req-drill-loop-bad.yaml <<EOF
side:
  goal: Are the sub-parts sound?
  parent: $LOOP_ID
  from: gateway
  over:
    sub: each
  ask:
    sub:
      concerns:
        quality:
          pass: yes
          1: Is {sub} well defined?
          2: Is {sub} independently testable?
          3: Is {sub} owned by one clear team?
        risk:
          pass: no
          4: Does {sub} depend on data it doesn't own?
          5: Could {sub} fail silently?
          6: Does {sub} skip error handling?
        fit:
          pass: yes
          7: Does {sub} match how the gateway is meant to work?
          8: Would {sub} survive a redesign of the gateway?
          9: Is {sub} covered by an existing test?
      decisions:
        severity:
          pass: [none, low]
          10:
            scale: How risky is {sub}?
            levels: [none, low, medium, high, critical]
        route:
          pass: [build-now]
          11:
            choice: What should happen to {sub} next?
            options: [build-now, rework, redesign]
wise:
  why: debug
  area: api
EOF
run drill req-drill-loop-bad.yaml
need_exit "09-loop-drill" "drill from a loop item, each" 2
need_has "09-loop-drill" "drill from a loop item, each" "is an idea, not code"
pass "09-loop-drill" "drill with each on an idea item stops cleanly, exit 2, no crash"
flow_done "09-loop-drill"

# ---- 10. outcome: self-held refused, held by another actor, repeat is a no-op ------------------------------
flow_start
run outcome SW-0001 held --by agent
need_exit "10-outcome" "self-held refused" 1
need_has "10-outcome" "self-held refused" "can't mark it held"
pass "10-outcome" "the run's own actor can't hold it (exit 1)"

run outcome SW-0001 held --by qa-reviewer
need_exit "10-outcome" "held by another actor" 0
need_has "10-outcome" "held by another actor" "held · by qa-reviewer"
pass "10-outcome" "another actor's held is recorded"

run outcome SW-0001 held --by qa-reviewer
need_exit "10-outcome" "repeat is a no-op" 0
need_has "10-outcome" "repeat is a no-op" "already recorded"
pass "10-outcome" "repeating the same outcome is a no-op"
flow_done "10-outcome"

# ---- 11. budget: set tiny -> a reused run ignores it -> next PAID verb exits 3 -> reset -> paid verb works again
flow_start
RUNS_NOW=$(node "$CLI" budget | sed -E 's/.*\· ([0-9]+) of [0-9]+ runs.*/\1/')
run budget set --usd 0.01 --runs "$RUNS_NOW"
need_exit "11-budget" "budget set --usd 0.01 --runs $RUNS_NOW" 0
pass "11-budget" "cap set at the current run count ($RUNS_NOW)"

# fix #5a: the exact same request as 03-class/04-reuse asks nothing new (every answer is already on the
# ledger), so it must succeed even though the run cap is already at its limit — a fully-reused run is free,
# and the cap only ever gates an actual call.
run class req-class.yaml
need_exit "11-budget" "a fully-reused run ignores the cap" 0
need_has "11-budget" "a fully-reused run ignores the cap" "reused:"
pass "11-budget" "a fully-reused run is never blocked by the cap"

# A distinct goal (not asked before): a genuinely fresh, paid call, which the cap DOES block.
sed 's/This login handler is safe to merge/This login handler is safe to merge (budget check)/' req-class.yaml > req-class-budget.yaml
run class req-class-budget.yaml
need_exit "11-budget" "next paid verb over cap" 3
# fix #5c: only the run cap tripped here (spend is still $0.00 of the $0.01 cap) — the hint says "set --runs",
# not "reset" (which fits when the dollar cap is the one involved).
need_has "11-budget" "next paid verb over cap" "sidewise budget set --runs"
pass "11-budget" "the next paid verb is blocked with the right hint (exit 3)"

run budget reset
need_exit "11-budget" "budget reset" 0
pass "11-budget" "budget reset"

# The same fresh goal, now askable for real (the blocked attempt above was never logged) — proves spend resumes.
run class req-class-budget.yaml
need_exit "11-budget" "paid verb works again" 0
RUNS_AFTER_RESET=$(node "$CLI" budget | sed -E 's/.*\· ([0-9]+) of [0-9]+ runs.*/\1/')
[ "$RUNS_AFTER_RESET" = "1" ] || fail "11-budget" "paid verb works again" "expected run count 1 after reset, got $RUNS_AFTER_RESET"
pass "11-budget" "a fresh paid call works again after reset"

# Headroom for the flows still to come.
run budget set --usd 5 --runs 500
need_exit "11-budget" "restore headroom for later flows" 0
flow_done "11-budget"

# ---- 12. invalid request -----------------------------------------------------------------------------------
flow_start
printf 'side:\n  goal: x\n' > req-bad.yaml
run class req-bad.yaml
need_exit "12-invalid" "invalid request" 2
need_has "12-invalid" "invalid request" "✖ side.goal:"
need_has "12-invalid" "invalid request" "→"
pass "12-invalid" "✖ field: problem -> fix, exit 2"
flow_done "12-invalid"

# ---- 13. chaos provider -------------------------------------------------------------------------------------
flow_start
runenv "SIDEWISE_PROVIDER=chaos SIDEWISE_CHAOS=503" class req-class.yaml
need_exit "13-chaos" "chaos 503 (no retry in the chaos adapter itself)" 1
need_has "13-chaos" "chaos 503 (no retry in the chaos adapter itself)" "HTTP 503"
pass "13-chaos" "a scheduled 503 fails the call with a one-line reason, exit 1"

runenv "SIDEWISE_PROVIDER=chaos" class req-class.yaml
need_exit "13-chaos" "chaos default schedule (ok)" 0
pass "13-chaos" "an empty SIDEWISE_CHAOS schedule always answers ok"
flow_done "13-chaos"

# ---- 14. SIDEWISE_BASE_URL ----------------------------------------------------------------------------------
flow_start
runenv "SIDEWISE_PROVIDER= TYPESAFE_API_KEY=dummy SIDEWISE_BASE_URL=http://example.com" doctor
need_exit "14-base-url" "bad base URL -> doctor exit 2" 2
need_has "14-base-url" "bad base URL -> doctor exit 2" "SIDEWISE_BASE_URL"
pass "14-base-url" "a non-https SIDEWISE_BASE_URL stops doctor at exit 2"

runenv "SIDEWISE_PROVIDER= TYPESAFE_API_KEY=dummy" class req-class.yaml --dry-run
need_exit "14-base-url" "dummy key, class --dry-run -> route direct, no network" 0
need_has "14-base-url" "dummy key, class --dry-run -> route direct, no network" "route: direct"
pass "14-base-url" "dry-run only: shows route direct with a dummy key, never calls out"
flow_done "14-base-url"

TOTAL_MS=$(($(now_ms) - TOTAL_START))
echo "flows.sh: all flows passed (${TOTAL_MS}ms)"
if [ -n "$KNOWN_BUGS" ]; then
  printf 'flows.sh: known product bugs found along the way:%b\n' "$KNOWN_BUGS"
fi
exit 0
