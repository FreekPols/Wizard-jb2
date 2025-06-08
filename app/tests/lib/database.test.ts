import 'fake-indexeddb/auto'; // requried to use the database in tests
import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { database } from '../../src/lib/localStorage/database';

const repoA = 'octocat/hello-world';
const repoB = 'octocat/other-repo';

const store = 'markdown';
const key = 'README.md';
const value = '# Hello World';

describe('database module', () => {
  beforeEach(async () => {
    await database.destroy();
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('should throw if used before repo is set', async () => {
    await expect(database.getDB()).rejects.toThrow(/active repo/);
  });

  it('should save and load data', async () => {
    database.setActiveRepo(repoA);
    await database.save(store, key, value);
    const result = await database.load<string>(store, key);
    expect(result).toBe(value);
  });

  it('should list keys only for the active repo', async () => {
    database.setActiveRepo(repoA);
    await database.save(store, 'a.md', 'A');
    await database.save(store, 'b.md', 'B');
    const keys = await database.keys(store);
    expect(keys.sort()).toEqual(['a.md', 'b.md']);
  });

  it('should delete specific keys', async () => {
    database.setActiveRepo(repoA);
    await database.save(store, 'file1.md', 'data');
    await database.save(store, 'file2.md', 'data');
    await database.delete(store, 'file1.md');
    const keys = await database.keys(store);
    expect(keys).toEqual(['file2.md']);
  });

  it('should clear all keys for current repo in store', async () => {
    database.setActiveRepo(repoA);
    await database.save(store, '1.md', 'one');
    await database.save(store, '2.md', 'two');
    await database.clear(store);
    const keys = await database.keys(store);
    expect(keys).toEqual([]);
  });

  it('should return true/false for has()', async () => {
    database.setActiveRepo(repoA);
    await database.save(store, 'exists.md', 'yes');
    const hasIt = await database.has(store, 'exists.md');
    const missing = await database.has(store, 'missing.md');
    expect(hasIt).toBe(true);
    expect(missing).toBe(false);
  });

  it('should loadAll() key-value pairs for current repo only', async () => {
    database.setActiveRepo(repoA);
    await database.save(store, 'one.md', '1');
    await database.save(store, 'two.md', '2');
    const all = await database.loadAll(store);
    expect(all).toEqual([
      ['one.md', '1'],
      ['two.md', '2'],
    ]);
  });

  it('should reject invalid store usage', async () => {
    database.setActiveRepo(repoA);
    await expect(database.save('notastore', 'x', 'y')).rejects.toThrow(
      /Invalid store/,
    );
  });

  it('should not allow changing active repo after initialization', async () => {
    database.setActiveRepo(repoA);
    expect(() => database.setActiveRepo(repoB)).toThrow(
      /change active repo/,
    );
  });

  it('should reset active repo on destroy unless preserved', async () => {
    database.setActiveRepo(repoA);
    await database.destroy();
    expect(database.isInitialised()).toBe(false);

    database.setActiveRepo(repoA);
    await database.destroy({ preserveRepo: true });
    expect(database.isInitialised()).toBe(true);
  });
});