import { openDB, IDBPDatabase } from "idb";

const config = {
    name: "test_database",
    version: 1,
    stores: ["metadata", "markdown", "images"], //...
};

const _makePrefixedKey = (repo: string, key: IDBValidKey): IDBValidKey => {
    return `${repo}::${key}`;
};

const _stripPrefix = (repo: string, fullKey: IDBValidKey): IDBValidKey => {
    if (typeof fullKey === "string" && fullKey.startsWith(`${repo}::`)) {
        return fullKey.slice(repo.length + 2); // +2 for '::'
    }
    return fullKey;
};

const _validateStore = (store: string): void => {
    if (!config.stores.includes(store)) {
        throw new Error(
            `Invalid store "${store}". Must be one of: ${config.stores.join(", ")}`,
        );
    }
};

export const database = {
    dbPromise: null as Promise<IDBPDatabase> | null,
    activeRepo: "" as string, // MUST be set on startup
    getActiveRepo(): string {
        return this.activeRepo;
    },
    setActiveRepo(repo: string) {
        if (this.isInitialised()) {
            throw new Error(
                "Attempting to change active repo after repo was already set. This is not supported!",
            );
        }
        this.activeRepo = repo;
    },

    isInitialised() {
        return this.activeRepo != "";
    },

    async getDB(): Promise<IDBPDatabase> {
        if (!this.isInitialised()) {
            throw new Error(
                "Attempting to access database before setting the active repo. Make sure the repo is set before any database interactions take place!",
            );
        }
        if (!this.dbPromise) {
            this.dbPromise = openDB(config.name, config.version, {
                upgrade(db) {
                    for (const store of config.stores) {
                        if (!db.objectStoreNames.contains(store)) {
                            db.createObjectStore(store);
                        }
                    }
                },
            });
        }
        return this.dbPromise;
    },

    async save<T>(store: string, key: IDBValidKey, value: T): Promise<void> {
        _validateStore(store);
        const db = await this.getDB();
        const fullKey = _makePrefixedKey(this.activeRepo, key);
        await db.put(store, value, fullKey);
    },

    async load<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
        _validateStore(store);
        const db = await this.getDB();
        const fullKey = _makePrefixedKey(this.activeRepo, key);
        return db.get(store, fullKey);
    },

    async loadAll<T>(store: string): Promise<[IDBValidKey, T][]> {
        _validateStore(store);
        const db = await this.getDB();
        const allKeys = await this.keys(store);
        const results: [IDBValidKey, T][] = [];
        for (const key of allKeys) {
            const value = await db.get(
                store,
                _makePrefixedKey(this.activeRepo, key),
            );
            if (value !== undefined) {
                results.push([key, value]);
            }
        }
        return results;
    },

    async delete(store: string, key: IDBValidKey): Promise<void> {
        _validateStore(store);
        const db = await this.getDB();
        const fullKey = _makePrefixedKey(this.activeRepo, key);
        await db.delete(store, fullKey);
    },

    async keys(store: string): Promise<IDBValidKey[]> {
        _validateStore(store);
        const db = await this.getDB();
        const allKeys = await db.getAllKeys(store);
        return allKeys
            .filter(
                (k) =>
                    typeof k === "string" &&
                    k.startsWith(`${this.activeRepo}::`),
            )
            .map((k) => _stripPrefix(this.activeRepo, k));
    },

    async clear(store: string): Promise<void> {
        _validateStore(store);
        const db = await this.getDB();
        const allKeys = await this.keys(store);
        for (const key of allKeys) {
            await db.delete(store, _makePrefixedKey(this.activeRepo, key));
        }
    },

    async has(store: string, key: IDBValidKey): Promise<boolean> {
        _validateStore(store);
        const db = await this.getDB();
        const fullKey = _makePrefixedKey(this.activeRepo, key);
        return (await db.getKey(store, fullKey)) !== undefined;
    },

    async destroy({ preserveRepo = false } = {}): Promise<void> {
        if (this.dbPromise) {
            (await this.dbPromise).close();
            this.dbPromise = null;
        }
        if (!preserveRepo) this.activeRepo = "";
        await indexedDB.deleteDatabase(config.name);
    },
};
