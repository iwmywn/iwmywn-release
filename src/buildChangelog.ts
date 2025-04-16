import { exec } from "child_process";
import { getOwnerAndRepo } from "./main";

const lineDelimiter =
  "thisismylinedelimiterthatwilldefinitelynotappearintheactualcommitmessage";
const logDelimiter =
  "thisismylogdelimiterthatwilldefinitelynotappearintheactualcommitmessage";

async function getLog() {
  function execPromise(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(cmd, (err, stdout, _stderr) => {
        if (err) reject(err);
        resolve(stdout);
      });
    });
  }

  return execPromise(`git describe --tags --abbrev=0 HEAD^`).then((lastTag) =>
    execPromise(
      `git log --oneline ${lastTag.trim()}..HEAD --pretty="format:${lineDelimiter}%H${logDelimiter}%h${logDelimiter}%s${logDelimiter}%b"`
    )
  );
}

const titles = {
  feat: "Features",
  impr: "Improvements",
  fix: "Fixes",
};

function getPrLink(pr: string) {
  const { owner, repo } = getOwnerAndRepo();
  const prNum = pr.replace("#", "");
  return `[#${prNum}](https://github.com/${owner}/${repo}/pull/${prNum})`;
}

function getCommitLink(hash: string, longHash: string) {
  const { owner, repo } = getOwnerAndRepo();
  return `[${hash}](https://github.com/${owner}/${repo}/commit/${longHash})`;
}

function buildItems(items, mergeTypeAndScope: boolean = false) {
  let ret = "";
  for (let item of items) {
    let scope = item.scope ? `**${item.scope}:** ` : "";

    if (mergeTypeAndScope) {
      scope = `**${item.type}${item.scope ? `(${item.scope})` : ""}:** `;
    }

    const usernames =
      item.usernames.length > 0 ? ` (${item.usernames.join(", ")})` : "";
    const pr =
      item.prs.length > 0
        ? ` (${item.prs.map((p) => getPrLink(p)).join(", ")})`
        : "";
    const hash = ` (${item.hashes
      .map((h) => getCommitLink(h.short, h.full))
      .join(", ")})`;

    ret += `- ${scope}${item.message}${usernames}${pr}${hash}\n`;
  }
  return ret;
}

function buildSection(type, allItems) {
  let ret = `### ${titles[type]}\n\n`;

  const items = allItems.filter(
    (item) => item.type === type && !item.body.includes("!nuf")
  );

  if (items.length === 0) {
    return "";
  }

  return (ret += buildItems(items));
}

function buildFooter(logs) {
  let out =
    "\n### Nerd stuff\n\nThese changes will not be visible to users, but are included for completeness and to credit contributors.\n\n";

  const featLogs = logs.filter(
    (item) => item.type === "feat" && item.body.includes("!nuf")
  );
  const imprLogs = logs.filter(
    (item) => item.type === "impr" && item.body.includes("!nuf")
  );
  const fixLogs = logs.filter(
    (item) => item.type === "fix" && item.body.includes("!nuf")
  );
  const styleLogs = logs.filter((item) => item.type === "style");
  const docLogs = logs.filter((item) => item.type === "docs");
  const refactorLogs = logs.filter((item) => item.type === "refactor");
  const perfLogs = logs.filter((item) => item.type === "perf");
  const ciLogs = logs.filter((item) => item.type === "ci");
  const testLogs = logs.filter((item) => item.type === "test");
  const buildLogs = logs.filter((item) => item.type === "build");
  const choreLogs = logs.filter((item) => item.type === "chore");

  const allOtherLogs = [
    ...featLogs,
    ...imprLogs,
    ...fixLogs,
    ...styleLogs,
    ...docLogs,
    ...refactorLogs,
    ...perfLogs,
    ...ciLogs,
    ...testLogs,
    ...buildLogs,
    ...choreLogs,
  ];

  const uniqueOtherLogs = allOtherLogs.filter(
    (item, index, self) =>
      index === self.findIndex((t) => t.hashes[0].full === item.hashes[0].full)
  );

  out += buildItems(uniqueOtherLogs, true);

  return out;
}

function convertStringToLog(logString) {
  let log = [];
  for (let line of logString) {
    if (line === "" || line === "\r" || line === "\n") continue;

    const [hash, shortHash, title, body] = line
      .split(logDelimiter)
      .map((s) => s.trim());

    const [_, type, scope, message, username, pr] = title.split(
      /^(\w+)(?:\(([^)]+)\))?:\s+(.+?)(?:\s*\((@[^)]+)\))?(?:\s+\((#[^)]+)\))?$/
    );

    const usernames = username ? username.split(", ") : [];
    const prs = pr ? pr.split(", ") : [];

    if (type && message) {
      log.push({
        hashes: [
          {
            short: shortHash,
            full: hash,
          },
        ],
        type,
        scope,
        message,
        usernames: usernames || [],
        prs: prs || [],
        body: body || "",
      });
    } else {
      // console.log({ hash, shortHash, title, body });
      // console.warn("skipping line due to invalid format: " + line);
    }
  }
  return log;
}

const header =
  "Thank you to all the contributors who made this release possible!";

async function main() {
  let logString = await getLog();
  logString = logString.split(lineDelimiter);

  let log = convertStringToLog(logString);

  const contributorCount = log
    .map((l) => {
      const filtered = l.usernames.filter((u) => {
        const lowerCased = u.toLowerCase();
        return (
          lowerCased !== "monkeytype-bot" &&
          lowerCased !== "dependabot" &&
          lowerCased !== "miodec"
        );
      });
      return filtered;
    })
    .flat().length;

  let final = "";

  if (contributorCount > 0) {
    final += header + "\n\n\n";
  }

  const sections: string[] = [];
  for (const type of Object.keys(titles)) {
    const section = buildSection(type, log);
    if (section) {
      sections.push(section);
    }
  }

  final += sections.join("\n\n");

  const footer = buildFooter(log);
  if (footer) {
    final += "\n" + footer;
  }

  console.log(final);
}

main();
