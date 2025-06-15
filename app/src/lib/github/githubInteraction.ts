import { database } from "../localStorage/database";
import { createSignal } from "solid-js";

/**
 * Interface to simplify handling data from GitHub API calls.
 */
interface RepoInfo {
    /** Owner of the repo. */
    owner: string;

    /** Default branch of the repo. */
    default_branch: string;
}


/**
 * Interface to simplify handling data from GitHub API calls.
 */
interface BranchCommitInfo {
    /** The commit SHA for this branch tip. */
    sha: string;

    /** The SHA of the Git tree at this commit. */
    treeSha: string;

    /** The list of parent commits (usually one, but can be two for merges). */
    parents: { sha: string }[];
}

/**
 * Encapsulates interactions with the GitHub API, including fetching file
 * contents, listing branches, and creating commits/trees.
 */
class GitHubInteraction {
    /** The current repository name. */
    private repo = "";

    /** The current repository owner. */
    private owner = "";

    /** Personal access token or OAuth token for authentication. */
    private auth = "";

    /** The branch to target for fetches and commits. */
    private branch = "";

    /** Signal getter for the repository name. */
    public getRepo: () => string;

    /** Signal setter for the repository name. */
    public setRepo: (v: string) => void;

    /** Signal getter for the repo owner. */
    public getOwner: () => string;

    /** Signal setter for the repo owner. */
    public setOwner: (v: string) => void;

    /** Signal getter for the auth token. */
    public getAuth: () => string;

    /** Signal setter for the auth token. */
    public setAuth: (v: string) => void;

    /** Signal getter for the branch name. */
    public getBranch: () => string;

    /** Signal setter for the branch name. */
    public setBranch: (v: string) => void;

    /**
     * Create a new GitHubInteraction.
     * @param repo - Initial repository name.
     * @param owner - Initial repository owner.
     * @param auth - Initial authentication token.
     * @param branch - Initial branch name.
     */
    constructor(repo: string, owner: string, auth: string, branch: string) {
        // Assign variables.
        this.repo = repo;
        this.owner = owner;
        this.auth = auth;
        this.branch = branch;

        // Create reactive signals for each piece of state.
        const [getRepoSignal, setRepoSignal] = createSignal(this.repo);
        this.getRepo = getRepoSignal;
        this.setRepo = setRepoSignal;

        const [getOwnerSignal, setOwnerSignal] = createSignal(this.owner);
        this.getOwner = getOwnerSignal;
        this.setOwner = setOwnerSignal;

        const [getAuthSignal, setAuthSignal] = createSignal(this.auth);
        this.getAuth = getAuthSignal;
        this.setAuth = setAuthSignal;

        const [getBranchSignal, setBranchSignal] = createSignal(this.branch);
        this.getBranch = getBranchSignal;
        this.setBranch = setBranchSignal;
    }

    /**
     * HTTP headers including authentication for GitHub API calls.
     */
    private get headers(): Record<string, string> {
        return {
            Authorization: `token ${this.auth}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
        };
    }


    /**
     * Fetches raw file contents for the given file paths, trying the current
     * branch first and falling back to the repository's default branch.
     * @param filePaths - Array of file paths within the repo.
     * @returns Array of file contents as strings, in the same order.
     * @throws If files cannot be retrieved from either branch.
     */
    public async fetchFiles(filePaths: string[]): Promise<string[]> { //TODO why is this not called anywhere? Did I remove something accidentally?
        try {
            return await this.fetchFilesFromBranch(filePaths, this.getBranch());
        } catch (e) {
            console.log(
                "unable to fetch file contents from current branch. " + e,
            );
        }
        try {
            const repoInfo = await this.fetchRepoInfo(
                this.getOwner(),
                this.getRepo(),
            );
            return await this.fetchFilesFromBranch(
                filePaths,
                repoInfo.default_branch,
            );
        } catch (e) {
            console.log(
                "unable to fetch file contents from default branch. " + e,
            );
        }
        throw new Error("Unable to fetch file contents.");
    }

    /**
     * Fetches raw file contents from a single named branch.
     * @param filePaths - Array of file paths.
     * @param branchName - Branch name to fetch from.
     * @returns Array of file contents as strings.
     */
    public async fetchFilesFromBranch(
        filePaths: string[],
        branchName: string,
    ): Promise<string[]> {
        const files: string[] = [];

        filePaths.forEach(async (filePath) => {
            files.push(await this.fetchFileFromBranch(filePath, branchName));
        });

        return files;
    }

    /**
     * Fetches the raw contents of a single file via GitHub's "raw" media type.
     * @param filePath - Path to the file in the repo.
     * @param branchName - Branch from which to fetch.
     * @returns File content as a string.
     * @throws If the HTTP response is not OK.
     */
    public async fetchFileFromBranch(
        filePath: string,
        branchName: string,
    ): Promise<string> {
        const url = `https://api.github.com/repos/${this.getOwner()}/${this.getRepo()}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branchName)}`;
        const header = this.headers;
        header.Accept = "application/vnd.github.v3.raw"; //why is this needed?
        const resp = await fetch(url, { headers: header });
        if (!resp.ok) {
            throw new Error(`Error getting file from "${filePath}"! \n`);
        }
        return await resp.text();
    }

    /**
     * Creates a Git commit on the configured branch by uploading blobs,
     * creating a tree and commit, then updating the branch ref.
     * @template T type of file contents.
     * @param message - Commit message.
     * @param files - Array of [filePath, content] tuples.
     */
    public async commitFiles<T>(
        message: string,
        files: [string, T][],
    ): Promise<void> {
        const { owner: owner, repo: repo, branch: branch } = this;

        const baseCommit = await this.ensureBranchCommit(owner, repo, branch);

        const treeCommit = await this.createTreeWithFiles(
            owner,
            repo,
            files,
            baseCommit,
        );

        const newCommit = await this.createCommitFromTree(
            owner,
            repo,
            message,
            treeCommit,
        );

        await this.updateBranchRef(owner, repo, branch, newCommit.sha);
    }

    /**
     * Commits a single file from the local database to GitHub.
     * @template T type of file contents.
     * @param message - Commit message.
     * @param key - Key of the file in the database.
     * @param store - Name of the object store.
     * @throws If no file is found under the given key.
     */
    public async commitFromDatabase<T>(
        message: string,
        key: IDBValidKey,
        store: string,
    ): Promise<void> {
        const file = await database.load<T>(store, key);
        if (file === undefined) {
            throw new Error(
                `No file found under key "${key}" in store "${store}"`,
            );
        }
        if (file != undefined)
            await this.commitFiles<T>(message, [[key.toString(), file]]);
    }

    /**
     * Commits multiple files from the local database to GitHub.
     * @template T type of file contents.
     * @param message - Commit message.
     * @param keys - Array of keys in the database.
     * @param store - Name of the object store.
     * @throws If any file keys are missing in the database.
     */
    public async commitMultipleFromDatabase<T>(
        message: string,
        keys: IDBValidKey[],
        store: string,
    ): Promise<void> {
        const files = await database.loadMultiple<T>(store, keys);
        const foundKeys = new Set(files.map(([k]) => k.toString()));
        const missing = keys
            .map((k) => k.toString())
            .filter((k) => !foundKeys.has(k));
        if (missing.length) {
            throw new Error(`Missing files for keys: ${missing.join(", ")}`);
        }
        await this.commitFiles<T>(
            message,
            files.map((a: [IDBValidKey, T]) => [a[0].toString(), a[1]]),
        );
    }

    /**
     * Commits all files from the local IndexedDB database to GitHub.
     * @template T type of file contents.
     * @param message - Commit message.
     * @param store - Name of the object store.
     * @throws If no files are found in the object store.
     */
    public async commitAllFromDatabase<T>(
        message: string,
        store: string,
    ): Promise<void> {
        const files = await database.loadAll<T>(store);
        if (!files.length) {
            throw new Error(`No files found in store "${store}"`);
        }
        await this.commitFiles<T>(
            message,
            files.map((a: [IDBValidKey, T]) => [a[0].toString(), a[1]]),
        );
    }
    
    public async fetchRemoteBranches(): Promise<string[]> {
        const owner = this.getOwner();
        const repo  = this.getRepo();
        // GitHub paginates at 30 per page by default; up to 100 works for most repos
        const url = `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`;
        const resp = await fetch(url, { headers: this.headers });
        if (!resp.ok) {
        throw new Error(
            `Failed to list branches: ${resp.status} ${await resp.text()}`
        );
        }
        // Each item looks like { name: string, commit: { sha: string }, protected: boolean, … }
        const data: { name: string }[] = await resp.json();
        return data.map((b) => b.name);
    }

    /**
     * Ensures the target branch exists by reading its current commit or
     * creating it off the default branch if missing.
     * @param owner - Repo owner.
     * @param repo - Repo name.
     * @param branch - Branch name to ensure.
     * @returns Commit info for the branch tip.
     * @throws If creation or fetch fails.
     */
    private async ensureBranchCommit(
        owner: string,
        repo: string,
        branch: string,
    ): Promise<BranchCommitInfo> {
        const repoInfo = await this.fetchRepoInfo(owner, repo);
        let commit = await this.fetchBranchCommitInfo(owner, repo, branch);
        if (!commit) {
            await this.createBranch(
                owner,
                repo,
                branch,
                repoInfo.default_branch,
            );
            commit = await this.fetchBranchCommitInfo(owner, repo, branch);
            if (!commit) {
                throw new Error(
                    "Branch creation failed; could not load commit info.",
                );
            }
        }
        return commit;
    }

    /**
     * Builds a new tree on top of a base commit by adding or updating blobs.
     * @param base - The base commit info.
     * @param newTreeSha - SHA of the newly created tree.
     * @returns A BranchCommitInfo struct pointing to the new tree.
     */
    private updateTreeInfo(
        base: BranchCommitInfo,
        newTreeSha: string,
    ): BranchCommitInfo {
        return {
            sha: base.sha,
            treeSha: newTreeSha,
            parents: [{ sha: base.sha }],
        };
    }

    /**
     * Converts a raw GitHub commit response into BranchCommitInfo.
     * @param response - JSON response from POST /git/commits.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private updateCommitInfo(response: any): BranchCommitInfo {
        return {
            sha: response.sha,
            treeSha: response.tree.sha,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            parents: response.parents.map((p: any) => ({ sha: p.sha })),
        };
    }

    /**
     * Fetches repository metadata (including default branch).
     * @param owner - Repo owner.
     * @param repo - Repo name.
     * @returns RepoInfo JSON.
     * @throws On HTTP errors.
     */
    public async fetchRepoInfo(
        owner: string = this.getOwner(),
        repo: string = this.getRepo(),
    ): Promise<RepoInfo> {
        const resp = await fetch(
            `https://api.github.com/repos/${owner}/${repo}`,
            { headers: this.headers },
        );
        if (!resp.ok) {
            throw new Error(
                `Failed to load repo info: ${resp.status} ${await resp.text()}`,
            );
        }
        return resp.json();
    }

    /**
     * Reads the current commit info for a branch.
     * @param owner - Repo owner.
     * @param repo - Repo name.
     * @param branch - Branch name.
     * @returns BranchCommitInfo or undefined if 404.
     * @throws On non-404 HTTP errors.
     */
    private async fetchBranchCommitInfo(
        owner: string,
        repo: string,
        branch: string,
    ): Promise<BranchCommitInfo | undefined> {
        const resp = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
            { headers: this.headers },
        );
        if (resp.status === 404) return undefined;
        if (!resp.ok) {
            throw new Error(`Error loading branch: ${resp.status}`);
        }
        const data = await resp.json();
        return {
            sha: data.commit.sha,
            treeSha: data.commit.commit.tree.sha,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            parents: data.commit.parents.map((p: any) => ({ sha: p.sha })),
        };
    }

    /**
     * Creates a new branch reference in the repository.
     * @param owner - Repo owner.
     * @param repo - Repo name.
     * @param branch - New branch name.
     * @param base - SHA of the base commit (usually default branch tip).
     */
    private async createBranch(
        owner: string,
        repo: string,
        branch: string,
        base: string,
    ): Promise<void> {
        const resp = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/git/refs`,
            {
                method: "POST",
                headers: this.headers,
                body: JSON.stringify({
                    ref: `refs/heads/${branch}`,
                    sha: base,
                }),
            },
        );
        if (!resp.ok) {
            throw new Error(
                `Create branch failed: ${resp.status} ${await resp.text()}`,
            );
        }
    }

    /**
     * Creates a Git tree with the provided files on top of a base commit.
     * @param owner - Repo owner.
     * @param repo - Repo name.
     * @param files - Array of [path, content] tuples.
     * @param base - Base commit info.
     * @returns Updated BranchCommitInfo pointing to new tree.
     */
    private async createTreeWithFiles<T>(
        owner: string,
        repo: string,
        files: [string, T][],
        base: BranchCommitInfo,
    ): Promise<BranchCommitInfo> {
        const entries = files.map(([path, content]) => ({
            path,
            mode: "100644",
            type: "blob",
            content:
                typeof content === "string" ? content : JSON.stringify(content),
        }));
        const resp = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/git/trees`,
            {
                method: "POST",
                headers: this.headers,
                body: JSON.stringify({
                    base_tree: base.treeSha,
                    tree: entries,
                }),
            },
        );
        if (!resp.ok) {
            throw new Error(
                `Tree creation failed: ${resp.status} ${await resp.text()}`,
            );
        }
        const data = await resp.json();
        return this.updateTreeInfo(base, data.tree.sha);
    }

    /**
     * Creates a Git commit from a tree.
     * @param owner - Repo owner.
     * @param repo - Repo name.
     * @param message - Commit message.
     * @param base - Info about the tree/parents.
     * @returns BranchCommitInfo for the new commit.
     */
    private async createCommitFromTree(
        owner: string,
        repo: string,
        message: string,
        base: BranchCommitInfo,
    ): Promise<BranchCommitInfo> {
        const resp = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/git/commits`,
            {
                method: "POST",
                headers: this.headers,
                body: JSON.stringify({
                    message,
                    tree: base.treeSha,
                    parents: base.parents.map((p) => p.sha),
                }),
            },
        );
        if (!resp.ok) {
            throw new Error(
                `Commit creation failed: ${resp.status} ${await resp.text()}`,
            );
        }
        const data = await resp.json();
        return this.updateCommitInfo(data);
    }

    /**
     * Updates a branch reference to point to a new commit SHA.
     * @param owner - Repo owner.
     * @param repo - Repo name.
     * @param branch - Branch name to update.
     * @param sha - New commit SHA.
     */
    private async updateBranchRef(
        owner: string,
        repo: string,
        branch: string,
        sha: string,
    ): Promise<void> {
        const resp = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
            {
                method: "PATCH",
                headers: this.headers,
                body: JSON.stringify({ sha }),
            },
        );
        if (!resp.ok) {
            throw new Error(
                `Update ref failed: ${resp.status} ${await resp.text()}`,
            );
        }
    }
}

/**
 * Singleton instance of GitHubInteraction.
 */
export const github = new GitHubInteraction( "", "", "", "" ); //TODO needs to be initialised at some point, probably after logging in.
