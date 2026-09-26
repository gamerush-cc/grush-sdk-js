function clamp(value, fallback, max) {
  return typeof value === "number" && value > 0 ? Math.min(Math.floor(value), max) : fallback;
}

export function createMockLeaderboards(selfIdentity) {
  const boards = new Map();
  let rivalCount = 0;

  function define(key, options = {}) {
    boards.set(key, {
      key,
      title: options.title || key,
      sort: options.sort === "asc" ? "asc" : "desc",
      valueType: options.valueType ?? "int",
      aggregation: options.aggregation ?? "best",
      period: "all_time",
      minValue: options.minValue ?? null,
      maxValue: options.maxValue ?? null,
      entries: [],
    });
  }

  function ensure(key) {
    if (!boards.has(key)) define(key);
    return boards.get(key);
  }

  function addRival(key, displayName, value, options = {}) {
    const isGuest = options.isGuest === true;
    rivalCount += 1;
    ensure(key).entries.push({
      pseudoId: `mock-rival-${rivalCount}`,
      displayName: isGuest ? null : displayName,
      avatarUrl: isGuest ? null : (options.avatarUrl ?? null),
      isGuest,
      value,
      metadata: null,
      isSelf: false,
    });
  }

  function ranked(board) {
    const direction = board.sort === "asc" ? 1 : -1;
    return [...board.entries].sort((a, b) => (a.value - b.value) * direction);
  }

  function list() {
    return [...boards.values()].map(({ entries: _entries, ...definition }) => definition);
  }

  function unknown(key) {
    return {
      error: `No mock leaderboard named ${key}. Declare it with GRush.mock.defineLeaderboard.`,
    };
  }

  function nextValue(board, current, value) {
    if (board.aggregation === "sum") return current + value;
    if (board.aggregation === "last") return value;
    const better = board.sort === "asc" ? value < current : value > current;
    return better ? value : current;
  }

  function submit(key, value, metadata) {
    const board = boards.get(key);
    if (!board) return unknown(key);
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { error: "Score must be a finite number." };
    }
    if (board.valueType !== "float" && !Number.isInteger(value)) {
      return { error: "Score must be an integer for this leaderboard." };
    }
    if (board.valueType === "duration_ms" && value < 0) {
      return { error: "Duration must not be negative." };
    }
    const belowMin = board.minValue !== null && value < board.minValue;
    const aboveMax = board.maxValue !== null && value > board.maxValue;
    if (belowMin || aboveMax) {
      return { error: "Score is outside the declared range." };
    }
    let self = board.entries.find((entry) => entry.isSelf);
    let updated = true;
    if (!self) {
      self = { isSelf: true, value, metadata: null };
      board.entries.push(self);
    } else {
      const next = nextValue(board, self.value, value);
      updated = next !== self.value;
      self.value = next;
    }
    Object.assign(self, selfIdentity());
    if (metadata !== undefined && metadata !== null) self.metadata = metadata;
    const rank = ranked(board).indexOf(self) + 1;
    return { result: { accepted: true, updated, value: self.value, rank, verified: false } };
  }

  function pageWire(board, entries, start, total) {
    return {
      key: board.key,
      title: board.title,
      sort: board.sort,
      valueType: board.valueType,
      period: board.period,
      periodKey: "",
      verified: false,
      total,
      entries: entries.map((stored, index) => {
        const entry = stored.isSelf ? { ...stored, ...selfIdentity() } : stored;
        return {
          rank: start + index + 1,
          pseudoId: entry.pseudoId,
          displayName: entry.displayName,
          avatarUrl: entry.avatarUrl,
          isGuest: entry.isGuest,
          value: entry.value,
          metadata: entry.metadata ?? null,
          submittedAt: "",
          isSelf: entry.isSelf,
        };
      }),
    };
  }

  function page(key, options = {}, aroundMe = false) {
    const board = boards.get(key);
    if (!board) return unknown(key);
    const rows = ranked(board);
    if (!aroundMe) {
      const start = Math.max(0, options.offset ?? 0);
      const count = clamp(options.limit, 20, 100);
      return { page: pageWire(board, rows.slice(start, start + count), start, rows.length) };
    }
    const selfIndex = rows.findIndex((entry) => entry.isSelf);
    if (selfIndex < 0) return { page: pageWire(board, [], 0, rows.length) };
    const range = clamp(options.range, 5, 25);
    const start = Math.max(0, selfIndex - range);
    return {
      page: pageWire(board, rows.slice(start, selfIndex + range + 1), start, rows.length),
    };
  }

  return { define, addRival, list, submit, page, reset: () => boards.clear() };
}
