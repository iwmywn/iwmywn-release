import { execSync } from "child_process";
import { Octokit } from "@octokit/rest";
import dotenv from "dotenv";
import fs from "fs";
import readlineSync from "readline-sync";
import ora from "ora";
import { buildChangelog } from "./changelogBuilder";

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
      spinner.fail(`Failed to validate token: ${error}`);
    }
    process.exit(1);
  }
}

// console.log(await getAuthenticatedUsername());
async function getAuthenticatedUsername(): Promise<string> {
  const spinner = ora("Fetching authenticated GitHub user...").start();

  try {
    const res = await octokit.rest.users.getAuthenticated();
    spinner.succeed(`Authenticated as: ${res.data.login}`);
    return res.data.login;
  } catch (error) {
    spinner.fail("Failed to fetch authenticated user.");
    console.error(error);
    process.exit(1);
  }
}

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
    spinner.fail("Failed to run 'git remote show origin'.");
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
    syncSpinner.fail("Error checking branch sync status.");
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
async function generateChangelog(): Promise<string> {
  const spinner = ora("Generating changelog...").start();

  const changelog = await buildChangelog();

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

// updateChangelog();
function updateChangelog(): void {
  const spinner = ora("Updating CHANGELOG.md...").start();

  try {
    runRoot("npx conventional-changelog -p angular -i CHANGELOG.md -s");
    spinner.succeed("CHANGELOG.md updated.");
  } catch (error) {
    spinner.fail("Failed to update CHANGELOG.md.");
    console.error(error);
    process.exit(1);
  }
}

function createCommitAndTag(newVer: string, default_branch: string): void {
  const spinner = ora("Creating commit and tag...").start();

  try {
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
export function getOwnerAndRepo(): { owner: string; repo: string } {
  const spinner = ora("Getting GitHub owner and repo...").start();

  try {
    const remoteUrl = runRoot("git remote get-url origin").trim();

    const match = remoteUrl.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/);
    if (match) {
      const result = {
        owner: match[1],
        repo: match[2],
      };
      spinner.succeed(`Repo detected: ${result.owner}/${result.repo}`);
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

  try {
    await octokit.repos.createRelease({
      owner,
      repo,
      tag_name: `v${newVer}`,
      name: `v${newVer}`,
      body: changelog,
    });

    spinner.succeed("GitHub release created.");
  } catch (error) {
    console.error(`Failed to create release: ${error}`);
    console.log("Please create the release manually.");
    process.exit(1);
  }
}

async function release() {
  validateEnv();

  console.log("\n\t\t🚀 STARTING RELEASE PROCESS...\n");
  const spinner = ora().start();
  await validateToken();

  const username = await getAuthenticatedUsername();

  if (username !== "iwmywn") {
    spinner.fail("Only Hoàng Anh Tuấn is allowed to perform a release.");
    process.exit(1);
  }

  const default_branch = findOriginDefaultBranch();

  checkBranchSync(default_branch);

  checkUncommittedChanges();

  const changelog = await generateChangelog();

  console.log(changelog);

  if (!readlineSync.keyInYN("Changelog looks good?")) {
    spinner.succeed("Exiting.");
    process.exit(1);
  }

  const currentVer = getCurrentVersion();
  const newVer = incrementVersion(currentVer);

  if (!readlineSync.keyInYN(`Ready to release v${newVer}?`)) {
    spinner.succeed("Exiting.");
    process.exit(1);
  }

  updatePackage(newVer);
  // updateChangelog();
  createCommitAndTag(newVer, default_branch);
  const { owner, repo } = getOwnerAndRepo();
  await createGithubRelease(owner, repo, newVer, changelog);

  spinner.stop();
}

export { release };
