import { createSignal, onMount, createEffect, For } from "solid-js";
import type { GitHubUser } from "../../lib/github/GithubLogin";
import {
  getFilePathFromHref,
  currentFileHref,
} from "../../lib/github/GithubUtility";
import { database } from "../../lib/localStorage/database";
import { github } from "../../lib/github/githubInteraction";
import { saveEditorContentToDatabase } from "../Editor";

type Props = {
  user: GitHubUser;
  onLogout: () => void;
  token: string;
};

export const [filePath, setFilePath] = createSignal<string | null>(null);
export const GitHubUserPanel = (props: Props) => {
  const [commitMsg, setCommitMsg] = createSignal("");
  const [actionMode, setActionMode] = createSignal<"push" | "pr">("push");
  const [prBranchChoice, setPrBranchChoice] = createSignal<string>("");
  const [newBranchName, setNewBranchName] = createSignal("");
  const [defaultBranch, setDefaultBranch] = createSignal("main");
  const [remoteBranches, setRemoteBranches] = createSignal<string[]>([]);
  const [status, setStatus] = createSignal<string | null>(null);
  const [availableFiles, setAvailableFiles] = createSignal<[string, string][]>(
    [],
  );
  const [selectedFiles, setSelectedFiles] = createSignal<Set<string>>(
    new Set(),
  );

  onMount(async () => {
    const currentPath = getFilePathFromHref(currentFileHref());
    setFilePath(currentPath);

    // Load all markdown files for the active repo
    const files = await database.loadAll<string>("markdown");
    setAvailableFiles(files.map(([key, value]) => [key.toString(), value]));
    setSelectedFiles(new Set<string>()); // <-- Start with no files selected

    try {
      const repoInfo = await github.fetchRepoInfo();
      setDefaultBranch(repoInfo.default_branch);
      const branches = await github.fetchRemoteBranches();
      const nonDefault = branches.filter((b) => b !== repoInfo.default_branch);
      setRemoteBranches(nonDefault);
      if (!prBranchChoice()) {
        setPrBranchChoice(nonDefault[0] ?? "__new__");
      }
    } catch (err) {
      setRemoteBranches([]);
      setPrBranchChoice("__new__");
    }
  });

  // Dynamically update availableFiles when the branch changes
  createEffect(() => {
    github.getBranch();
    database.loadAll<string>("markdown").then((files) => {
      setAvailableFiles(files.map(([key, value]) => [key.toString(), value]));
      setSelectedFiles(new Set<string>());
    });
  });

  // Reactively ensure the current file is always in the selection menu
  createEffect(() => {
    const current = filePath();
    const files = availableFiles();
    if (current && !files.some(([key]) => key === current)) {
      setAvailableFiles([[current, ""], ...files]);
      setSelectedFiles(new Set<string>());
    }
  });

  const handleCommit = async () => {
    setStatus("Committing...");

    // Save the current editor content to the database before committing
    console.log("saving before commiting...");
    await saveEditorContentToDatabase();

    if (selectedFiles().size == 0) {
      setStatus("No files selected.");
      return;
    }

    // Prepare commit info
    const inputCommitMsg = commitMsg().trim();
    if (!inputCommitMsg) {
      setStatus("Please enter a commit message.");
      return;
    }

    console.log(
      selectedFiles()
        .entries()
        .map(([a, _]) => a)
        .toArray(),
    );

    // Commit all files
    try {
      await github.commitMultipleFromDatabase(
        inputCommitMsg,
        selectedFiles()
          .entries()
          .map(([a, _]) => a)
          .toArray() as IDBValidKey[],
        "markdown",
      );
      setStatus(
        `Committed ${selectedFiles().size} file(s) to branch ${github.getBranch()} with message "${inputCommitMsg}". Please wait at least a minute before attempting to commit changes to the same files on the same branch!`,
      );
      setSelectedFiles(new Set<string>());
      setCommitMsg("");
    } catch (err) {
      setStatus(
        "Failed to commit files: " + (err instanceof Error ? err.message : err),
      );
    }
  };

  const handleCreatePullRequest = async () => {
    setStatus("Creating pull request...");

    // Save the current editor content to the database before committing
    await saveEditorContentToDatabase();

    if (selectedFiles().size == 0) {
      setStatus("No files selected.");
      return;
    }

    const inputCommitMsg = commitMsg().trim();
    if (!inputCommitMsg) {
      setStatus("Please enter a commit message.");
      return;
    }

    const inputBranchName =
      prBranchChoice() === "__new__"
        ? newBranchName().trim()
        : prBranchChoice().trim();
    if (!inputBranchName) {
      setStatus("Please enter a branch name.");
      return;
    }
    if (inputBranchName === defaultBranch()) {
      setStatus(`Please choose a branch other than ${defaultBranch()}.`);
      return;
    }

    try {
      const sourceBranch = github.getBranch();
      await github.ensureBranchExists(inputBranchName);

      const keys = selectedFiles()
        .entries()
        .map(([a, _]) => a)
        .toArray() as string[];
      const missing: string[] = [];
      for (const key of keys) {
        let value = await database.loadFrom<string>(
          "markdown",
          github.getRepo(),
          sourceBranch,
          key,
        );
        if (value === undefined) {
          try {
            value = await github.fetchFileFromBranch(key, sourceBranch);
          } catch (err) {
            value = undefined;
          }
        }
        if (value === undefined) {
          missing.push(key);
          continue;
        }
        await database.saveTo(
          "markdown",
          github.getRepo(),
          inputBranchName,
          key,
          value,
        );
      }
      if (missing.length) {
        setStatus(`Missing files for keys: ${missing.join(", ")}`);
        return;
      }

      github.setBranch(inputBranchName);
      await github.commitMultipleFromDatabase(
        inputCommitMsg,
        keys as IDBValidKey[],
        "markdown",
      );

      const repoInfo = await github.fetchRepoInfo();
      const pr = await github.createPullRequest(
        github.getOwner(),
        github.getRepo(),
        inputCommitMsg,
        github.getBranch(),
        repoInfo.default_branch,
      );

      setStatus(
        `Pull request created from ${github.getBranch()} to ${repoInfo.default_branch}.${pr.html_url ? ` ${pr.html_url}` : ""}`,
      );
      setSelectedFiles(new Set<string>());
      setCommitMsg("");
      setNewBranchName("");
    } catch (err) {
      setStatus(
        "Failed to create pull request: " +
          (err instanceof Error ? err.message : err),
      );
    }
  };

  return (
    <div>
      <h2 class="text-xl font-bold mb-2">Logged in as {props.user.login}</h2>
      <div class="mt-3 d-grid gap-4">
        <div>
          <label class="form-label fw-semibold" for="commit-msg">
            Commit message
          </label>
          <textarea
            id="commit-msg"
            class="form-control"
            rows={3}
            placeholder="Describe what you changed..."
            value={commitMsg()}
            onInput={(e) => setCommitMsg(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                if (actionMode() === "pr") {
                  handleCreatePullRequest();
                } else {
                  handleCommit();
                }
              }
            }}
          />
          <div class="form-text">Press Ctrl/Command + Enter to submit.</div>
        </div>

        {/* File selection submenu moved above the commit button */}
        <div>
          <label class="form-label fw-semibold">Files to include</label>
          <div class="border rounded p-3 bg-white overflow-y-auto" style={{ "max-height": "160px" }}>
            {availableFiles().length === 0 && (
              <div class="text-muted">No files in database.</div>
            )}
            {availableFiles().length > 0 && (
              <div class="form-check mb-2">
                <input
                  class="form-check-input"
                    type="checkbox"
                    checked={
                      selectedFiles().size === availableFiles().length &&
                      availableFiles().length > 0
                    }
                    onChange={(e) => {
                      if (e.currentTarget.checked) {
                        setSelectedFiles(
                          new Set(availableFiles().map(([key]) => key)),
                        );
                      } else {
                        setSelectedFiles(new Set<string>());
                      }
                    }}
                />
                <label class="form-check-label fw-semibold">Select all</label>
              </div>
            )}
            <For each={availableFiles()}>
              {([key]) => (
                <div class="form-check mb-1">
                    <input
                      class="form-check-input"
                      type="checkbox"
                      checked={selectedFiles().has(key)}
                      onChange={(e) => {
                        const newSet = new Set(selectedFiles());
                        if (e.currentTarget.checked) {
                          newSet.add(key);
                        } else {
                          newSet.delete(key);
                        }
                        setSelectedFiles(newSet);
                      }}
                    />
                    <label class="form-check-label">{key}</label>
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="row g-3">
          <div class="col-md-5">
            <div class="border rounded p-3 bg-light h-100">
              <div class="fw-semibold mb-2">Action</div>
              <div class="form-check mb-2">
                <input
                  class="form-check-input"
                  type="radio"
                  name="git-action"
                  checked={actionMode() === "push"}
                  onChange={() => setActionMode("push")}
                />
                <label class="form-check-label">
                  Push to current branch ({github.getBranch() || "none"})
                </label>
              </div>
              <div class="form-check">
                <input
                  class="form-check-input"
                  type="radio"
                  name="git-action"
                  checked={actionMode() === "pr"}
                  onChange={() => setActionMode("pr")}
                />
                <label class="form-check-label">
                  Create pull request to {defaultBranch()}
                </label>
              </div>
            </div>
          </div>

          <div class="col-md-7">
            <div
              class={`border rounded p-3 h-100 ${actionMode() === "pr" ? "bg-white" : "bg-light opacity-75"}`}
            >
              <div class="fw-semibold mb-2">Pull request branch</div>
              <div class="text-muted small mb-2">
                Choose a branch to push changes to before opening a pull request.
              </div>
              <div class="d-grid gap-2 mb-2" style={{ "max-height": "160px", "overflow-y": "auto" }}>
                <For each={remoteBranches()}>
                  {(branch) => (
                    <div class="form-check">
                      <input
                        class="form-check-input"
                        type="radio"
                        name="pr-branch"
                        checked={prBranchChoice() === branch}
                        onChange={() => setPrBranchChoice(branch)}
                        disabled={actionMode() !== "pr"}
                      />
                      <label class="form-check-label">{branch}</label>
                    </div>
                  )}
                </For>
                <div class="form-check">
                  <input
                    class="form-check-input"
                    type="radio"
                    name="pr-branch"
                    checked={prBranchChoice() === "__new__"}
                    onChange={() => setPrBranchChoice("__new__")}
                    disabled={actionMode() !== "pr"}
                  />
                  <label class="form-check-label">Create a new branch</label>
                </div>
              </div>
              <input
                id="branch-name"
                type="text"
                class="form-control"
                placeholder="Enter new branch name"
                value={newBranchName()}
                onInput={(e) => setNewBranchName(e.currentTarget.value)}
                disabled={actionMode() !== "pr" || prBranchChoice() !== "__new__"}
              />
            </div>
          </div>
        </div>

        {/* Status directly below the selection menu, no extra margin */}
        {status() && <div class="text-center small">{status()}</div>}

        <div class="d-grid gap-2">
          <button
            class="btn btn-dark"
            onClick={() => {
              if (actionMode() === "pr") {
                handleCreatePullRequest();
              } else {
                handleCommit();
              }
            }}
          >
            {actionMode() === "pr" ? "Create pull request" : "Push to branch"}
          </button>
          <button
            onClick={() => props.onLogout()}
            class="btn btn-outline-secondary"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};
