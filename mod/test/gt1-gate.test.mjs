// node --test — GT1: the command gate catches reworded irreversible commands (P7, operator decision A).
// gateFor reads a command line as the shell would: it splits it into simple commands, strips
// wrappers and global options, and matches subcommand + flag sets. Each case names the gate id it
// must map to. The false-positive guards at the end pass before and after GT1, except the one
// GT1's before.md records as a false positive at the start commit (a made-up word after `git push`).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GATES, gateFor } from '../lib/approve.mjs'

const id = (c) => {
  const g = gateFor(c)
  return g ? g.id : null
}
const expect = (cases) => {
  for (const [c, want] of cases) assert.equal(id(c), want, JSON.stringify(c))
}

// ---------------------------------------------------------------- the ten reported forms

test('GT1 reported 1: git -C <dir> before push is a push', () => expect([['git -C /tmp/repo push origin main', 'push']]))
test('GT1 reported 2: git -c <key=value> before push is a push', () => expect([['git -c http.x=y push', 'push']]))
test('GT1 reported 3: rm with -f and -r given apart deletes recursively', () => expect([['rm -f -r build', 'rm']]))
test('GT1 reported 4: gh -R <repo> before pr merge is a PR change', () => expect([['gh -R o/r pr merge 1', 'pr']]))
test('GT1 reported 5: git -C <dir> before reset --hard discards work', () => expect([['git -C r reset --hard', 'reset']]))
test('GT1 reported 6: git clean with -d and -f given apart discards work', () => expect([['git clean -d -f', 'reset']]))
test('GT1 reported 7: gh api -X POST writes through the GitHub API', () => expect([['gh api -X POST repos/o/r/pulls', 'api']]))
test('GT1 reported 8: find -delete deletes recursively', () => expect([['find . -type f -delete', 'rm']]))
test('GT1 reported 9: git restore of a path discards work', () => expect([['git restore .', 'reset']]))
test('GT1 reported 10: git branch -D discards work', () => expect([['git branch -D x', 'reset']]))

// ---------------------------------------------------------------- variant classes

test('GT1 variant: git global options before the subcommand, in every spelling', () =>
  expect([
    ['git --git-dir=/r/.git --work-tree=/r push', 'push'],
    ['git --work-tree /r push', 'push'],
    ['git --no-pager push', 'push'],
    ['git -P push', 'push'],
    ['git -p push', 'push'],
    ['git --exec-path=/x push', 'push'],
    ['git --namespace n push', 'push'],
    ['git --bare push', 'push'],
    ['git --no-optional-locks push', 'push'],
    ['git --literal-pathspecs push', 'push'],
    ['git -C a -C b -c x=y --no-pager push', 'push'],
    ['git -c core.x=1 -C r reset --hard HEAD', 'reset'],
    ['git --git-dir=/r/.git clean -f', 'reset'],
  ]))

test('GT1 variant: gh global options before or between the words', () =>
  expect([
    ['gh --repo o/r pr merge 1', 'pr'],
    ['gh --repo=o/r pr create', 'pr'],
    ['gh pr -R o/r close 3', 'pr'],
    ['gh pr merge -R o/r 1', 'pr'],
    ['gh --hostname h.example pr merge 1', 'pr'],
    ['gh -R o/r release create v1', 'release'],
    ['gh -R o/r api -X POST repos/o/r/pulls', 'api'],
  ]))

test('GT1 variant: rm flags split, combined, long and reordered', () =>
  expect([
    ['rm -r -f build', 'rm'],
    ['rm -rf build', 'rm'],
    ['rm -fr build', 'rm'],
    ['rm -fR build', 'rm'],
    ['rm -v -R build', 'rm'],
    ['rm --recursive --force build', 'rm'],
    ['rm --force --recursive build', 'rm'],
    ['rm -f --recursive build', 'rm'],
    ['rm build -rf', 'rm'],
    ['rm build -f -r', 'rm'],
    ['rm -dr build', 'rm'],
  ]))

test('GT1 variant: git clean and reset flags split, combined, long and reordered', () =>
  expect([
    ['git clean -f -d', 'reset'],
    ['git clean -fd', 'reset'],
    ['git clean -xdf', 'reset'],
    ['git clean --force', 'reset'],
    ['git clean -d --force -x', 'reset'],
    ['git clean -f -f -d', 'reset'],
    ['git reset -q --hard HEAD~1', 'reset'],
    ['git reset HEAD~1 --hard', 'reset'],
    ['git reset --hard', 'reset'],
  ]))

test('GT1 variant: checkout, restore and branch forms that throw work away', () =>
  expect([
    ['git checkout -- .', 'reset'],
    ['git checkout .', 'reset'],
    ['git checkout -- src/a.js', 'reset'],
    ['git checkout -f main', 'reset'],
    ['git checkout --force main', 'reset'],
    ['git restore src/a.js', 'reset'],
    ['git restore --worktree file', 'reset'],
    ['git restore -W file', 'reset'],
    ['git restore --staged --worktree file', 'reset'],
    ['git restore -SW file', 'reset'],
    ['git restore --source=HEAD~2 .', 'reset'],
    ['git branch --delete --force x', 'reset'],
    ['git branch -d -f x', 'reset'],
    ['git branch -df x', 'reset'],
    ['git branch -D x y', 'reset'],
    ['git branch x -D', 'reset'],
  ]))

test('GT1 variant: gh api with a writing method, any spelling', () =>
  expect([
    ['gh api --method PUT repos/o/r/pulls/1/merge', 'api'],
    ['gh api -X PATCH repos/o/r', 'api'],
    ['gh api -XPATCH repos/o/r', 'api'],
    ['gh api --method=DELETE repos/o/r/git/refs/heads/x', 'api'],
    ['gh api -X post repos/o/r/issues', 'api'],
    ['gh api repos/o/r/issues -X POST', 'api'],
  ]))

test('GT1 variant: gh api with fields or an input file, where gh then sends POST', () =>
  expect([
    ['gh api repos/o/r/issues -f title=x', 'api'],
    ['gh api repos/o/r/issues -F n=1', 'api'],
    ['gh api repos/o/r/issues --field title=x', 'api'],
    ['gh api repos/o/r/issues --raw-field title=x', 'api'],
    ['gh api repos/o/r/issues --raw-field=title=x', 'api'],
    ['gh api repos/o/r/issues --input body.json', 'api'],
    ['gh api graphql -f query=mutation{x}', 'api'],
    ['gh api graphql -F query=@m.graphql', 'api'],
    ['gh api graphql --input q.json', 'api'],
  ]))

test('GT1 variant: find deleting, directly or through -exec', () =>
  expect([
    ['find build -delete', 'rm'],
    ['find . -name "*.tmp" -delete -print', 'rm'],
    ['find . -name x -exec rm -rf {} +', 'rm'],
    ['find . -name x -exec rm -f -r {} ;', 'rm'],
    ['find . -type f -exec rm {} +', 'rm'],
    ['find . -type f -execdir rm -- {} +', 'rm'],
    ['find . -name x -exec git -C {} push ;', 'push'],
  ]))

test('GT1 variant: git push --dry-run stays a push', () => expect([['git push --dry-run', 'push'], ['git push -n origin x', 'push']]))

test('GT1 variant: env, assignments, command, sudo and other wrappers', () =>
  expect([
    ['env X=1 git push', 'push'],
    ['env -i PATH=/bin git push', 'push'],
    ['env -u HOME git -C r push', 'push'],
    ['X=1 git -C r push', 'push'],
    ['X=1 Y=2 rm -f -r build', 'rm'],
    ['command git -C r push', 'push'],
    ['command -p git -C r push', 'push'],
    ['builtin command git -C r push', 'push'],
    ['sudo git -C r push', 'push'],
    ['sudo -u bob rm -f -r /srv/x', 'rm'],
    ['sudo -E -H git -C r push', 'push'],
    ['nohup git -C r push', 'push'],
    ['time git -C r push', 'push'],
    ['time -p git -C r push', 'push'],
    ['exec git -C r push', 'push'],
    ['nice -n 10 git -C r push', 'push'],
    ['timeout 30 git -C r push', 'push'],
    ['timeout -s KILL 30 git -C r push', 'push'],
    ['env X=1 sudo command git -C r push', 'push'],
  ]))

test('GT1 variant: xargs runs the command it is given', () =>
  expect([
    ['echo x | xargs rm -f -r', 'rm'],
    ['ls | xargs -I{} git -C {} push', 'push'],
    ['ls | xargs -I {} git -C {} push', 'push'],
    ['ls | xargs -n 1 -P 4 rm -r', 'rm'],
    ['ls | xargs -0 gh -R o/r pr close', 'pr'],
  ]))

test('GT1 variant: a full or relative path to the program', () =>
  expect([
    ['/usr/bin/git push', 'push'],
    ['/usr/bin/git -C r push', 'push'],
    ['/opt/homebrew/bin/gh -R o/r pr merge 1', 'pr'],
    ['/bin/rm -f -r build', 'rm'],
    ['./node_modules/.bin/npm publish', 'release'],
  ]))

test('GT1 variant: quoting or escaping the program name', () =>
  expect([
    ['\\git -C r push', 'push'],
    ['"git" -C r push', 'push'],
    ["'git' -C r 'push'", 'push'],
    ['g"i"t -C r push', 'push'],
  ]))

test('GT1 variant: inside $( ), backticks and process substitution', () =>
  expect([
    ['echo $(git -C r push)', 'push'],
    ['x=`git -C r push`', 'push'],
    ['echo "$(git -C r push)"', 'push'],
    ['echo "`git -C r push`"', 'push'],
    ['cat <(git -C r push)', 'push'],
    ['echo $(echo $(rm -f -r build))', 'rm'],
  ]))

test('GT1 variant: after &&, ||, ;, |, & and a newline', () =>
  expect([
    ['make && git -C r push', 'push'],
    ['make || git -C r push', 'push'],
    ['make; git -C r push', 'push'],
    ['make | git -C r push', 'push'],
    ['make & git -C r push', 'push'],
    ['make\ngit -C r push', 'push'],
    ['make &&\n  rm -f -r build', 'rm'],
    ['make |& gh -R o/r pr merge 1', 'pr'],
    ['make;rm -f -r build', 'rm'],
    ['make&&git -C r push', 'push'],
  ]))

test('GT1 variant: in a subshell, a group and shell keywords', () =>
  expect([
    ['(cd r && git -C . push)', 'push'],
    ['{ git -C r push; }', 'push'],
    ['if true; then git -C r push; fi', 'push'],
    ['for r in a b; do git -C $r push; done', 'push'],
    ['while false; do rm -f -r x; done', 'rm'],
    ['! git -C r push', 'push'],
  ]))

test('GT1 variant: a shell given the command as a string, and eval', () =>
  expect([
    ['bash -c "git -C r push"', 'push'],
    ["sh -c 'rm -f -r build'", 'rm'],
    ['bash -lc "gh -R o/r pr merge 1"', 'pr'],
    ['zsh -c "git clean -d -f"', 'reset'],
    ['eval git -C r push', 'push'],
    ['eval "git -C r push"', 'push'],
  ]))

test('GT1 variant: redirections around the command', () =>
  expect([
    ['git -C r push >/dev/null', 'push'],
    ['git -C r push 2>&1 | tee log', 'push'],
    ['>log git -C r push', 'push'],
    ['git -C r push &> log', 'push'],
  ]))

test('GT1 variant: package publishing with options first', () =>
  expect([
    ['npm --prefix x publish', 'release'],
    ['npm publish --access public', 'release'],
    ['pnpm -r publish', 'release'],
    ['yarn publish', 'release'],
    ['cargo +nightly publish', 'release'],
    ['cargo -q publish', 'release'],
  ]))

test('GT1 variant: a command line the tokenizer cannot finish still asks', () =>
  expect([
    ['git -C r push "unterminated', 'push'],
    ["rm -f -r 'unterminated", 'rm'],
    ['echo $(git -C r push', 'push'],
  ]))

test('GT1: a new gate for writing through the GitHub API, with a plain label', () => {
  const g = GATES.find((x) => x.id === 'api')
  assert.ok(g, 'an api gate')
  assert.equal(g.label, 'write through the GitHub API')
  assert.equal(gateFor('gh api -X POST repos/o/r/pulls'), g)
  for (const old of ['push', 'pr', 'release', 'reset', 'rm']) assert.ok(GATES.find((x) => x.id === old), old)
})

// ---------------------------------------------------------------- false-positive guards (pass before and after GT1)

test('GT1 guard: git words that are not a push', () =>
  expect([
    ['git stash push', null],
    ['git stash push -m wip', null],
    ['git log --grep push', null],
    ['git status', null],
    ['git commit -m push', null],
    ['grep -r push .', null],
  ]))

test('GT1 guard: a made-up word that starts with push is not a push (a false positive at the start commit)', () =>
  expect([
    ['git push-hook-helper', null],
    ['git pushx', null],
  ]))

test('GT1 guard: gh reads', () =>
  expect([
    ['gh pr view 1', null],
    ['gh pr list', null],
    ['gh -R o/r pr view 1', null],
    ['gh api repos/o/r/pulls', null],
    ['gh api -X GET repos/o/r/pulls', null],
    ['gh api repos/o/r/pulls -X GET -f state=open', null],
    ['gh api graphql -f query=query{viewer{login}}', null],
  ]))

test('GT1 guard: rm without recursion, git branch -d, restore --staged, clean -n, find -print', () =>
  expect([
    ['rm -f file.txt', null],
    ['rm file', null],
    ['rm file.txt', null],
    ['rm -- -r', null],
    ['git branch -d merged', null],
    ['git branch --delete merged', null],
    ['git restore --staged file', null],
    ['git restore -S file', null],
    ['git clean -n', null],
    ['git clean -nd', null],
    ['git clean --dry-run', null],
    ['find . -name x -print', null],
    ['find . -name delete', null],
    ['git checkout -b new', null],
    ['git checkout main', null],
    ['npm test', null],
    ['npm run build', null],
  ]))

test('GT1 guard: a quoted mention in an echo or heredoc stays exactly as the v7.7 gate treats it (D-P3-6 b kept)', () =>
  expect([
    ['echo "git push"', 'push'],
    ["echo 'rm -rf build'", 'rm'],
    ['echo git push', 'push'],
    ['echo "git -C r push"', null],
    ['echo "rm -f -r build"', null],
    ['cat > f.txt <<EOF\ngit push origin main\nEOF', 'push'],
    ["python3 - <<'PY'\nprint('npm publish')\nPY", 'release'],
    ['cat > f.txt <<EOF\ngit -C r push\nEOF', null],
    ['git commit -m "do not git push yet"', 'push'],
    ['echo "git push-hook-helper"', 'push'],
  ]))
