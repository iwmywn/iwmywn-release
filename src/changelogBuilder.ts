import { execSync } from "child_process";
import { getOwnerAndRepo } from "./release";
import ora from "ora";

const lineDelimiter =
  "thisismylinedelimiterthatwilldefinitelynotappearintheactualcommitmessage";
const logDelimiter =
  "thisismylogdelimiterthatwilldefinitelynotappearintheactualcommitmessage";

interface CommitHash {
  short: string;
  full: string;
}

interface LogItem {
  hashes: CommitHash[];
  type: string;
  scope?: string;
  message: string;
  usernames: string[];
  prs: string[];
  body: string;
}

// type CommitTypes =
//   | "feat"
//   | "impr"
//   | "fix"
//   | "docs"
//   | "refactor"
//   | "perf"
//   | "test"
//   | "build"
//   | "ci"
//   | "style"
//   | "chore"
//   | "revert";

const titles: { feat: string; impr: string; fix: string } = {
  feat: "Features",
  impr: "Improvements",
  fix: "Bug Fixes",
};

export let lastTag: string | undefined;

function getLog(): string {
  const spinner = ora("Fetching Git log...").start();
  let range = "";

  let remoteTagsRaw: string[];
  try {
    remoteTagsRaw = execSync(
      `git ls-remote --tags --refs --sort="v:refname" origin`
    )
      .toString()
      .trim()
      .split("\n");
  } catch (error) {
    spinner.fail("Failed to fetch remote tags.");
    console.error(error);
    process.exit(1);
  }

  const lastLine = remoteTagsRaw.at(-1);
  if (lastLine) {
    lastTag = lastLine.split("refs/tags/")[1].trim();
    range = `${lastTag}..HEAD`;
  } else {
    range = "--root";
  }

  try {
    const log = execSync(
      `git log --oneline ${range} --pretty="format:${lineDelimiter}%H${logDelimiter}%h${logDelimiter}%s${logDelimiter}%b${logDelimiter}%cn"`
    ).toString();

    spinner.succeed("Git log fetched.");
    return log;
  } catch (error) {
    spinner.fail("Failed to get Git log.");
    console.error(error);
    process.exit(1);
  }
}

function convertStringToLog(logString: string[]): {
  log: LogItem[];
  committers: string[];
} {
  const log: LogItem[] = [];
  const committers: string[] = [];

  for (const line of logString) {
    if (line === "" || line === "\r" || line === "\n") continue;

    const [hash, shortHash, title, body, committer] = line
      .split(logDelimiter)
      .map((s) => s.trim());

    const match = title.match(
      /^(\w+)(?:\(([^)]+)\))?:\s+(.+?)(?:\s*\((@[^)]+)\))?(?:\s+\((#[^)]+)\))?$/
    );

    if (!match) continue;

    const [, type, scope, message, username, pr] = match;

    const usernames = username ? username.split(", ") : [];
    const prs = pr ? pr.split(", ") : [];

    if (
      committer &&
      !committers.includes(committer) &&
      !committer.toLowerCase().includes("github")
    ) {
      committers.push(committer);
    }

    if (type && message) {
      log.push({
        hashes: [{ short: shortHash, full: hash }],
        type,
        scope,
        message,
        usernames,
        prs,
        body: body || "",
      });
    }
  }
  return { log, committers };
}

function getPrLink(pr: string): string {
  const { owner, repo } = getOwnerAndRepo();
  const prNum = pr.replace("#", "");
  return `[#${prNum}](https://github.com/${owner}/${repo}/pull/${prNum})`;
}

function getCommitLink(hash: string, longHash: string): string {
  const { owner, repo } = getOwnerAndRepo();
  return `[${hash}](https://github.com/${owner}/${repo}/commit/${longHash})`;
}

function buildSection(type: keyof typeof titles, allItems: LogItem[]): string {
  let ret = `### ${titles[type]}\n\n`;

  const items = allItems.filter(
    (item) => item.type === type && !item.body.includes("!nuf")
  );

  if (items.length === 0) {
    return "";
  }

  return (ret += buildItems(items));
}

function buildItems(
  items: LogItem[],
  mergeTypeAndScope: boolean = false
): string {
  let ret = "";
  for (const item of items) {
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

function buildFooter(logs: LogItem[]): string {
  const featLogs = logs.filter(
    (item) => item.type === "feat" && item.body.includes("!nuf")
  );
  const imprLogs = logs.filter(
    (item) => item.type === "impr" && item.body.includes("!nuf")
  );
  const fixLogs = logs.filter(
    (item) => item.type === "fix" && item.body.includes("!nuf")
  );
  const docLogs = logs.filter((item) => item.type === "docs");
  const refactorLogs = logs.filter((item) => item.type === "refactor");
  const perfLogs = logs.filter((item) => item.type === "perf");
  const testLogs = logs.filter((item) => item.type === "test");
  const buildLogs = logs.filter((item) => item.type === "build");
  const ciLogs = logs.filter((item) => item.type === "ci");
  const styleLogs = logs.filter((item) => item.type === "style");
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

  return uniqueOtherLogs.length > 0
    ? "### Nerd stuff\n\nThese changes will not be visible to users, but are included for completeness and to credit contributors.\n\n" +
        buildItems(uniqueOtherLogs, true)
    : "";
}

const header =
  "Thank you to all the contributors who made this release possible!";

function buildChangelog(): string {
  const logString = getLog();
  const splitLog = logString.split(lineDelimiter);

  const { log, committers } = convertStringToLog(splitLog);

  const contributorCount = log
    .map((l) =>
      l.usernames.filter((u) => {
        const lower = u.toLowerCase();
        return lower !== "dependabot";
      })
    )
    .flat().length;

  let final = "";

  if (contributorCount > 1 || committers.length > 1) {
    final += header + "\n\n";
  }

  const sections: string[] = [];
  for (const type of Object.keys(titles) as (keyof typeof titles)[]) {
    const section = buildSection(type, log);
    if (section) {
      sections.push(section);
    }
  }

  final += sections.join("\n");

  const footer = buildFooter(log);
  if (footer) {
    final += "\n" + footer;
  }

  // console.log(final);
  return final;
}

export { buildChangelog };
