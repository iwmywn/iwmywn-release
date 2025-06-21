import { execSync } from "child_process";
import { Octokit } from "@octokit/rest";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import readlineSync from "readline-sync";
import ora from "ora";
import { lastTag, buildChangelog } from "./changelogBuilder";

dotenv.config();

const PROJECT_ROOT = process.env.PROJECT_ROOT;
const GH_TOKEN = process.env.GH_TOKEN;

const octokit = new Octokit({ auth: GH_TOKEN });

const run = (cmd: string) => execSync(cmd, { stdio: "pipe" }).toString();
const runRoot = (cmd: string) =>
  execSync(`cd ${PROJECT_ROOT} && ${cmd}`, {
    stdio: "pipe",
  }).toString();

function validateEnv(): void {
  // GH_TOKEN
  const spinner = ora("Checking GH_TOKEN variable...").start();

  if (!GH_TOKEN) {
    spinner.fail(
      "GH_TOKEN env variable is not set.\nExample: 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\nSee: https://github.com/settings/tokens/new (scope: repo)"
    );
    process.exit(1);
  }

  // PROJECT_ROOT
  spinner.text = "Checking PROJECT_ROOT variable...";

  if (!PROJECT_ROOT) {
    spinner.fail(
      `PROJECT_ROOT env variable is not set.\nExample:\n\tC:/Users/tuanh/code/iwmywn-release\n   or   C:\\\\Users\\\\tuanh\\\\code\\\\iwmywn-release`
    );
    process.exit(1);
  }

  const invalidChars = /[*?"<>|]/;
  if (invalidChars.test(PROJECT_ROOT)) {
    spinner.fail(
      `PROJECT_ROOT contains invalid characters. The following characters are not allowed: * ? " < > |`
    );
    process.exit(1);
  }

  spinner.stop();
}

// await validateToken();
async function validateToken(): Promise<void> {
  const spinner = ora("Validating GitHub token...").start();

  try {
    await octokit.rest.users.getAuthenticated();
    spinner.succeed("Token is valid.");
  } catch (error) {
    if ((error as any)?.status === 401) {
      spinner.fail("Token is invalid or has expired.");
    } else {
      spinner.fail("Failed to validate token.");
    }
    console.error(error);
    process.exit(1);
  }
}

// console.log(await getAuthenticatedUsername());
// async function getAuthenticatedUsername(): Promise<string> {
//   const spinner = ora("Fetching authenticated GitHub user...").start();

//   try {
//     const res = await octokit.rest.users.getAuthenticated();
//     spinner.succeed(`Authenticated as: ${res.data.login}`);
//     return res.data.login;
//   } catch (error) {
//     spinner.fail("Failed to fetch authenticated user.");
//     console.error(error);
//     process.exit(1);
//   }
// }

// console.log(findOriginDefaultBranch());
function findOriginDefaultBranch(): string {
  const spinner = ora("Checking origin default branch...").start();

  try {
    const remotes = runRoot("git remote").split("\n").filter(Boolean);

    if (!remotes.includes("origin")) {
      spinner.fail("Remote 'origin' does not exist.");
      process.exit(1);
    }

    const output = runRoot("git remote show origin");
    const match = output.match(/HEAD branch: (.+)/);

    if (match) {
      const default_branch = match[1].trim();
      spinner.succeed(`Origin default branch: ${default_branch}`);
      return default_branch;
    } else {
      spinner.fail("Could not determine the HEAD branch of 'origin'.");
      process.exit(1);
    }
  } catch (error) {
    spinner.fail("Failed to run check origin default branch.");
    console.error(error);
    process.exit(1);
  }
}

// checkBranchSync(findOriginDefaultBranch());
function checkBranchSync(default_branch: string): void {
  const spinner = ora(
    `Checking if local branch is ${default_branch}...`
  ).start();

  const currentBranch = runRoot("git branch --show-current").trim();
  if (currentBranch !== default_branch) {
    spinner.fail(
      `Local branch is not ${default_branch}. Please checkout the ${default_branch} branch.`
    );
    process.exit(1);
  }
  spinner.succeed(`Local branch: ${default_branch}.`);

  const syncSpinner = ora(
    `Checking if local ${default_branch} branch is in sync with origin...`
  ).start();

  try {
    runRoot("git fetch origin");

    const local = runRoot(`git rev-parse ${default_branch}`).trim();
    const remote = runRoot(`git rev-parse origin/${default_branch}`).trim();

    if (local !== remote) {
      syncSpinner.fail(
        `Local ${default_branch} branch is not in sync with origin. Please pull the latest changes.`
      );
      process.exit(1);
    }

    syncSpinner.succeed(
      `Local ${default_branch} branch is up to date with origin.`
    );
  } catch (error) {
    syncSpinner.fail("Failed to check branch sync status.");
    console.error(error);
    process.exit(1);
  }
}

// checkUncommittedChanges();
function checkUncommittedChanges(): void {
  const spinner = ora("Checking for uncommitted changes...").start();

  try {
    const status = runRoot("git status --porcelain");

    if (status) {
      spinner.fail(
        "You have uncommitted changes. Please commit or stash them before proceeding."
      );
      process.exit(1);
    }

    spinner.succeed("No uncommitted changes.");
  } catch (error) {
    spinner.fail("Failed to check git status.");
    console.error(error);
    process.exit(1);
  }
}

// console.log(generateChangelog());
function generateChangelog(): string {
  const changelog = buildChangelog();

  const spinner = ora().start();

  if (!changelog.trim()) {
    spinner.warn(
      "No new contributions found since the last release. Consider carefully whether a release is necessary."
    );
  } else {
    spinner.succeed("Changelog generated.");
  }

  return changelog;
}

// getCurrentVersion();
function getCurrentVersion(): string {
  const spinner = ora("Getting current version...").start();

  try {
    const currentVersion = JSON.parse(
      fs.readFileSync("package.json", "utf8")
    ).version;

    spinner.succeed(`Current version: v${currentVersion}`);
    return currentVersion;
  } catch (error) {
    spinner.fail("Failed to read current version from package.json.");
    console.error(error);
    process.exit(1);
  }
}

// incrementVersion(getCurrentVersion());
function incrementVersion(currentVersion: string): string {
  const spinner = ora("Incrementing version...").start();

  try {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const week = Math.ceil(
      ((now.getTime() - startOfYear.getTime()) / 86400000 +
        startOfYear.getDay() +
        1) /
        7
    );

    const [prevYear, prevWeek, minor] = currentVersion.split(".").map(Number);

    let newMinor = minor + 1;
    if (year !== prevYear.toString() || week !== prevWeek) {
      newMinor = 0;
    }

    const v = `${year}.${week}.${newMinor}`;
    spinner.succeed(`New version: v${v}`);
    return v;
  } catch (error) {
    spinner.fail("Failed to increment version.");
    console.error(error);
    process.exit(1);
  }
}

// updatePackage(incrementVersion(getCurrentVersion()));
function updatePackage(newVer: string): void {
  const spinner = ora("Bumping version...").start();

  try {
    const packageData = JSON.parse(fs.readFileSync("package.json", "utf8"));
    packageData.version = newVer;

    fs.writeFileSync("package.json", JSON.stringify(packageData, null, 2));
    spinner.succeed(`package.json updated to v${newVer}`);
  } catch (error) {
    spinner.fail("Failed to update version in package.json.");
    console.error(error);
    process.exit(1);
  }
}

// const newContent: string = `Thank you to all the contributors who made this release possible!

// ### Nerd stuff

// These changes will not be visible to users, but are included for completeness and to credit contributors.

// - **chore:** add message for again branch (@iwmywn-test) ([#22](https://github.com/iwmywn/release-test/pull/22)) ([f36bbad](https://github.com/iwmywn/release-test/commit/f36bbad9f3f86ba1e26a851fbcbe52b0382a009e))
// - **chore:** add message for pr-test branch ([#21](https://github.com/iwmywn/release-test/pull/21)) ([039fc6b](https://github.com/iwmywn/release-test/commit/039fc6be43c2ba164e8264f4d40c109796efe270))
// - **chore:** add message ([029dd57](https://github.com/iwmywn/release-test/commit/029dd575bdb6bc49af8eb58fe17caf75d812556e))`;
// updateChangelog("1.1.2", "1.1.3", newContent);
function updateChangelog(
  currentVer: string,
  newVer: string,
  newContent: string
): void {
  const spinner = ora("Updating CHANGELOG.md...").start();

  try {
    const changelogPath = path.join(PROJECT_ROOT!, "CHANGELOG.md");
    const { owner, repo } = getOwnerAndRepo();
    const versionHeader = lastTag
      ? `## [${newVer}](https://github.com/${owner}/${repo}/compare/v${currentVer}...v${newVer})`
      : `## ${newVer}`;

    const existingContent = fs.existsSync(changelogPath)
      ? fs.readFileSync(changelogPath, "utf-8")
      : "";

    const finalContent =
      `${versionHeader}\n\n${newContent}\n` + existingContent;

    fs.writeFileSync(changelogPath, finalContent, "utf-8");

    spinner.succeed("CHANGELOG.md has been updated.");
  } catch (error) {
    spinner.fail("Failed to update CHANGELOG.md.");
    console.error(error);
    process.exit(1);
  }
}

function createCommitAndTag(newVer: string, default_branch: string): void {
  const spinner = ora("Formatting package.json and CHANGELOG.md...").start();

  try {
    runRoot("npx -y prettier --write package.json CHANGELOG.md");

    spinner.text = "Creating commit and tag...";
    run("git add .");
    run(`git commit -m "chore: release v${newVer}" --no-verify`);
    run(`git tag v${newVer}`);

    spinner.text = "Pushing changes and tag...";
    run(`git push origin ${default_branch} --tags --no-verify`);

    spinner.succeed(`Release v${newVer} committed and tagged.`);
  } catch (error) {
    spinner.fail("Failed to create commit and tag.");
    console.error(error);
    process.exit(1);
  }
}

// const result = getOwnerAndRepo();
// if (result) {
//   console.log(`  Owner: ${result.owner}`);
//   console.log(`  Repo:  ${result.repo}`);
// } else {
//   console.log(`Could not parse owner/repo`);
// }
export function getOwnerAndRepo(silent: boolean = true): {
  owner: string;
  repo: string;
} {
  const spinner = ora("Getting GitHub owner and repo...").start();

  try {
    const remoteUrl = runRoot("git remote get-url origin").trim();

    const match = remoteUrl.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/);
    if (match) {
      const result = {
        owner: match[1],
        repo: match[2],
      };
      if (!silent) {
        spinner.succeed(`Repo detected: ${result.owner}/${result.repo}`);
      } else {
        spinner.stop();
      }
      return result;
    } else {
      spinner.fail("Invalid Git repository URL.");
      process.exit(1);
    }
  } catch (error) {
    spinner.fail("Failed to get repo info.");
    console.error(error);
    process.exit(1);
  }
}

async function createGithubRelease(
  owner: string,
  repo: string,
  newVer: string,
  changelog: string
): Promise<void> {
  const spinner = ora("Creating GitHub release...").start();
  const maxRetries = 5;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await octokit.repos.createRelease({
        owner,
        repo,
        tag_name: `v${newVer}`,
        name: `v${newVer}`,
        body: changelog,
      });

      spinner.succeed("GitHub release created.");
      return;
    } catch (error: any) {
      const isNetworkError =
        error?.code === "ECONNABORTED" ||
        error?.status === 500 ||
        error?.status === 502 ||
        error?.status === 503 ||
        error?.status === 504;

      if (attempt < maxRetries && isNetworkError) {
        spinner.text = `Retrying... (${attempt}/${maxRetries})`;
        await new Promise((res) => setTimeout(res, 1000 * attempt));
        continue;
      }

      spinner.fail(
        `Failed to create release after ${maxRetries} attempts. Please create the release manually.`
      );
      console.error(error);
      process.exit(1);
    }
  }
}

async function release() {
  validateEnv();

  console.log("\n\t\t🚀 STARTING RELEASE PROCESS...\n");
  const spinner = ora().start();
  await validateToken();

  // const username = await getAuthenticatedUsername();

  // if (username !== "iwmywn") {
  //   spinner.fail("Only Hoàng Anh Tuấn is allowed to perform a release.");
  //   process.exit(1);
  // }

  const default_branch = findOriginDefaultBranch();

  checkBranchSync(default_branch);

  checkUncommittedChanges();

  const changelog = generateChangelog();

  console.log(changelog);

  if (!readlineSync.keyInYN("Changelog looks good?")) {
    spinner.succeed("Exiting.");
    process.exit(1);
  }

  const currentVer = getCurrentVersion();
  const newVer = incrementVersion(currentVer);

  if (lastTag) {
    if (lastTag.slice(1) === currentVer) {
      spinner.succeed("The current version matches the last tag.");
    } else {
      spinner.warn(
        `Version mismatch: last tag is ${lastTag}, but package.json has v${currentVer}.`
      );
    }
  } else {
    spinner.info("No last tag found. Skipping version comparison.");
  }

  if (!readlineSync.keyInYN(`Ready to release v${newVer}?`)) {
    spinner.succeed("Exiting.");
    process.exit(1);
  }

  updatePackage(newVer);
  updateChangelog(currentVer, newVer, changelog);
  createCommitAndTag(newVer, default_branch);
  const { owner, repo } = getOwnerAndRepo(false);
  await createGithubRelease(owner, repo, newVer, changelog);

  spinner.stop();
}

export { release };
