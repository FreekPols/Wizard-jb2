import { Database } from "../localStorage/database";

interface RepoInfo {
  default_branch: string;
}

interface BranchInfo {
  commit: { sha: string };
}

/**
 * Transactional functions for interacting with IndexedDB.
 * Uses the {@link https://www.npmjs.com/package/idb | idb} library.
 * TODO store variables in database.
 *
 * @property {string} activeRepo - The currently active GitHub repo.
 * @property {string} activeOwner - The owner of activeRepo.
 * @property {string} activeAuth - The PAT.
 * @property {string} activeBranch - The currently active branch in the repo, used to namespace keys.
 */
export const github = {
    /**
     * The currently active GitHub repo.
     */
    activeRepo: "" as string,

    /**
     * The owner of activeRepo.
     */
    activeOwner: "" as string,

    /**
     * The PAT.
     */
    activeAuth: "" as string,

    /**
     * The currently active branch.
     */
    activeBranch: "" as string,

    getActiveRepo(): string {
        return this.activeRepo;
    },

    setActiveRepo(repo: string): void {
        this.activeRepo = repo;
    },

    getActiveOwner(): string {
        return this.activeOwner;
    },

    setActiveAuth(auth: string): void {
        this.activeAuth = auth;
    },

    getActiveAuth(): string {
        return this.activeAuth;
    },

    setActiveOwner(owner: string): void {
        this.activeOwner = owner;
    },

    getActiveBranch(): string {
        return this.activeBranch;
    },

    setActiveBranch(branch: string): void {
        this.activeBranch = branch;
    },

  isInitialised(): boolean {
    return !!(this.activeOwner && this.activeRepo && this.activeBranch && this.activeAuth);
  },

    async commitFromDatabase<T>(message: string, key: IDBValidKey, store: string, database: Database): Promise<void> {
        const file = await database.load<T>(store, key);
        if (file === undefined) {
        throw new Error(`No file found under key "${key}" in store "${store}"`);
        }
        if(file != undefined) await this.commitFiles<T>(message, [[key.toString(), file]]);
    },

    async commitMultipleFromDatabase<T>(message: string, keys: IDBValidKey[], store: string, database: Database): Promise<void> {
        const files = await database.loadMultiple<T>(store, keys);
        const foundKeys = new Set(files.map(([k]) => k.toString()));
        const missing = keys.map(k => k.toString()).filter(k => !foundKeys.has(k));
        if (missing.length) {
        throw new Error(`Missing files for keys: ${missing.join(", ")}`);
        }
        await this.commitFiles<T>(message, files.map((a: [IDBValidKey, T]) => [a[0].toString(), a[1]]));
    },

    async commitAllFromDatabase<T>(message: string, store: string, database: Database): Promise<void> {
        const files = await database.loadAll<T>(store);
        if (!files.length) {
        throw new Error(`No files found in store "${store}"`);
        }
        await this.commitFiles<T>(message, files.map((a: [IDBValidKey, T]) => [a[0].toString(), a[1]]));
    },


    get headers(): Record<string,string> {
        return {
        Authorization: `token ${this.activeAuth}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        };
    },

    async commitFiles<T>(message: string, files: [string, T][]): Promise<void> {
        if (!this.isInitialised()) {
            throw new Error("GitHub module not initialised: owner, repo, branch, or auth missing.");
        }
        const owner = this.activeOwner;
        const repo = this.activeRepo;
        const branch = this.activeBranch;

        // 1. Get repo and branch info, create the branch if it does not yet exist
        const repoInfo = await this.loadRepoInfo(owner, repo);
        let branchInfo = await this.loadBranchInfo(owner, repo, branch);
        if(branchInfo === undefined) {
            await this.createBranch(owner, repo, branch, repoInfo.default_branch);
            branchInfo = await this.loadBranchInfo(owner, repo, branch);
            if(branchInfo === undefined) {
                throw new Error("404 after creating branch."); // Not sure if this is even reachable, but better safe than sorry
            }
        }

        // 3. Get base tree SHA
        const baseTreeSha = await this.getTreeShaFromCommit(owner, repo, repoInfo.default_branch);

        // 4. Prepare blobs
        const blobInputs = files.map(([path, content]) => ({
        path,
        content: typeof content === "string" ? content : JSON.stringify(content),
        }));
        const blobs = await this.createBlobsForFiles(owner, repo, blobInputs);

        // 5. Create new tree
        const treeSha = await this.createTreeWithBlobs(owner, repo, baseTreeSha, blobs);

        // 6. Create commit
        const commitSha = await this.createCommitWithTree(owner, repo, message, treeSha, repoInfo.default_branch);

        // 7. Update branch ref
        await this.updateBranchRefToCommit(owner, repo, branch, commitSha);
    },

    load(): void {

    },

    async loadRepoInfo(owner: string, repo: string): Promise<RepoInfo> {
    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: this.headers,
    });
    if (!resp.ok) {
      throw new Error(`Failed to load repo info: ${resp.status} ${await resp.text()}`);
    }
    return resp.json();
  },

    async loadBranchInfo(owner: string, repo: string, branch: string): Promise<BranchInfo | undefined> {
    const resp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
      { headers: this.headers }
    );
    if (!resp.ok) {
        if(resp.status == 404) {
            return undefined;
        }
      throw new Error(`Failed to load branch info for "${branch}": ${resp.status}`);
    }
    return resp.json();
  },

  async createBranch(owner: string, repo: string, newBranch: string, baseSha: string): Promise<void> {
    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: baseSha }),
    });
    if (!resp.ok) {
      throw new Error(`Failed to create branch "${newBranch}": ${resp.status} ${await resp.text()}`);
    }
  },

  async getTreeShaFromCommit(owner: string, repo: string, commitSha: string): Promise<string> {
    const resp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/commits/${commitSha}`,
      { headers: this.headers }
    );
    if (!resp.ok) throw new Error(`Failed to get commit ${commitSha}`);
    const { tree } = await resp.json();
    return tree.sha;
  },

  async createBlobsForFiles(
    owner: string,
    repo: string,
    files: { path: string; content: string }[]
  ): Promise<{ path: string; sha: string }[]> {
    const results: { path: string; sha: string }[] = [];
    for (const file of files) {
      const resp = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
        {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
        }
      );
      if (!resp.ok) {
        throw new Error(`Failed to create blob for ${file.path}`);
      }
      const data = await resp.json();
      results.push({ path: file.path, sha: data.sha });
    }
    return results;
  },

  async createTreeWithBlobs(
    owner: string,
    repo: string,
    baseTreeSha: string,
    blobs: { path: string; sha: string }[]
  ): Promise<string> {
    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: blobs.map(b => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
      }),
    });
    if (!resp.ok) throw new Error(`Failed to create tree`);
    const data = await resp.json();
    return data.sha;
  },

  async createCommitWithTree(
    owner: string,
    repo: string,
    message: string,
    treeSha: string,
    parentSha: string
  ): Promise<string> {
    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ message, tree: treeSha, parents: [parentSha] }),
    });
    if (!resp.ok) throw new Error(`Failed to create commit`);
    const data = await resp.json();
    return data.sha;
  },

  async updateBranchRefToCommit(owner: string, repo: string, branch: string, commitSha: string): Promise<void> {
    const resp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
      {
        method: "PATCH",
        headers: this.headers,
        body: JSON.stringify({ sha: commitSha }),
      }
    );
    if (!resp.ok) throw new Error(`Failed to update branch ref: ${resp.status}`);
  }
    
}