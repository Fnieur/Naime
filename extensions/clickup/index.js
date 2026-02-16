const BASE_URL = "https://api.clickup.com/api/v2";
const DEFAULT_TIMEOUT_MS = 15000;

// ── Helpers ──────────────────────────────────────────────────────

function resolveConfig(api) {
  const cfg = api?.pluginConfig && typeof api.pluginConfig === "object" ? api.pluginConfig : {};
  return {
    accessToken: typeof cfg.accessToken === "string" ? cfg.accessToken.trim() : "",
    defaultTeamId: typeof cfg.defaultTeamId === "string" ? cfg.defaultTeamId.trim() : "",
    timeoutMs:
      typeof cfg.timeoutMs === "number" && cfg.timeoutMs > 0 ? cfg.timeoutMs : DEFAULT_TIMEOUT_MS,
  };
}

function str(params, keys) {
  for (const k of keys) {
    const v = params?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function num(params, keys) {
  for (const k of keys) {
    const v = params?.[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const n = Number.parseFloat(v.trim());
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function bool(params, keys) {
  for (const k of keys) {
    const v = params?.[k];
    if (typeof v === "boolean") return v;
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return undefined;
}

async function clickupFetch({ api, method = "GET", path, query, body }) {
  const cfg = resolveConfig(api);
  if (!cfg.accessToken) throw new Error("ClickUp plugin: accessToken not configured");

  const url = new URL(BASE_URL + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item === undefined || item === null || item === "") continue;
          url.searchParams.append(k, String(item));
        }
        continue;
      }
      url.searchParams.set(k, String(v));
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const headers = {
      Authorization: cfg.accessToken,
      "Content-Type": "application/json",
    };
    const opts = { method, headers, signal: controller.signal };
    if (body !== undefined) opts.body = JSON.stringify(body);

    const res = await fetch(url.toString(), opts);
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      const msg = data?.err || data?.error || data?.ENAME || res.statusText;
      throw new Error(`ClickUp API ${res.status}: ${msg}`);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function result(data, summary) {
  const s = summary || "OK";
  return {
    content: [{ type: "text", text: `${s}\n\n${JSON.stringify(data, null, 2)}` }],
    details: data,
  };
}

// ── Tools ────────────────────────────────────────────────────────

function createTeamsTool(api) {
  return {
    name: "clickup_teams",
    description: "List ClickUp workspaces/teams. Returns team IDs needed for other tools.",
    parameters: { type: "object", additionalProperties: false, properties: {} },
    async execute(_id) {
      const data = await clickupFetch({ api, path: "/team" });
      const teams = (data.teams || []).map((t) => ({
        id: t.id,
        name: t.name,
        members: t.members?.length,
      }));
      return result(teams, `${teams.length} team(s) found`);
    },
  };
}

function createSpacesTool(api) {
  return {
    name: "clickup_spaces",
    description: "List spaces in a ClickUp team/workspace.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        team_id: { type: "string", description: "Team ID (uses default if omitted)." },
        archived: {
          type: "string",
          description: "Include archived spaces (true/false, default false).",
        },
      },
    },
    async execute(_id, params) {
      const cfg = resolveConfig(api);
      const teamId = str(params, ["team_id"]) || cfg.defaultTeamId;
      if (!teamId) throw new Error("team_id required (or set defaultTeamId in plugin config)");
      const data = await clickupFetch({
        api,
        path: `/team/${teamId}/space`,
        query: { archived: bool(params, ["archived"]) || false },
      });
      const spaces = (data.spaces || []).map((s) => ({
        id: s.id,
        name: s.name,
        private: s.private,
        statuses: s.statuses?.map((st) => st.status),
      }));
      return result(spaces, `${spaces.length} space(s)`);
    },
  };
}

function createFoldersTool(api) {
  return {
    name: "clickup_folders",
    description: "List folders in a ClickUp space.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["space_id"],
      properties: {
        space_id: { type: "string", description: "Space ID." },
        archived: { type: "string", description: "Include archived (true/false)." },
      },
    },
    async execute(_id, params) {
      const spaceId = str(params, ["space_id"]);
      if (!spaceId) throw new Error("space_id required");
      const data = await clickupFetch({
        api,
        path: `/space/${spaceId}/folder`,
        query: { archived: bool(params, ["archived"]) || false },
      });
      const folders = (data.folders || []).map((f) => ({
        id: f.id,
        name: f.name,
        lists: f.lists?.map((l) => ({ id: l.id, name: l.name })),
      }));
      return result(folders, `${folders.length} folder(s)`);
    },
  };
}

function createListsTool(api) {
  return {
    name: "clickup_lists",
    description:
      "List task lists in a ClickUp folder or space (folderless). Provide folder_id OR space_id.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        folder_id: { type: "string", description: "Folder ID (lists inside a folder)." },
        space_id: { type: "string", description: "Space ID (folderless lists)." },
        archived: { type: "string", description: "Include archived (true/false)." },
      },
    },
    async execute(_id, params) {
      const folderId = str(params, ["folder_id"]);
      const spaceId = str(params, ["space_id"]);
      if (!folderId && !spaceId) throw new Error("Provide folder_id or space_id");
      const path = folderId ? `/folder/${folderId}/list` : `/space/${spaceId}/list`;
      const data = await clickupFetch({
        api,
        path,
        query: { archived: bool(params, ["archived"]) || false },
      });
      const lists = (data.lists || []).map((l) => ({
        id: l.id,
        name: l.name,
        task_count: l.task_count,
        status: l.status?.status,
      }));
      return result(lists, `${lists.length} list(s)`);
    },
  };
}

function createTasksTool(api) {
  return {
    name: "clickup_tasks",
    description: "Get tasks from a ClickUp list. Supports filtering by status, assignee, dates.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["list_id"],
      properties: {
        list_id: { type: "string", description: "List ID." },
        archived: { type: "string", description: "Include archived (true/false)." },
        page: { type: "number", description: "Page number (0-indexed)." },
        order_by: { type: "string", description: "Order by: id, created, updated, due_date." },
        reverse: { type: "string", description: "Reverse order (true/false)." },
        subtasks: { type: "string", description: "Include subtasks (true/false)." },
        statuses: { type: "string", description: "Comma-separated statuses to filter." },
        include_closed: { type: "string", description: "Include closed tasks (true/false)." },
        assignees: { type: "string", description: "Comma-separated assignee user IDs." },
        due_date_gt: { type: "number", description: "Due date greater than (Unix ms)." },
        due_date_lt: { type: "number", description: "Due date less than (Unix ms)." },
      },
    },
    async execute(_id, params) {
      const listId = str(params, ["list_id"]);
      if (!listId) throw new Error("list_id required");
      const query = {};
      if (bool(params, ["archived"])) query.archived = "true";
      const page = num(params, ["page"]);
      if (page !== undefined) query.page = page;
      if (str(params, ["order_by"])) query.order_by = str(params, ["order_by"]);
      if (bool(params, ["reverse"])) query.reverse = "true";
      if (bool(params, ["subtasks"])) query.subtasks = "true";
      if (bool(params, ["include_closed"])) query.include_closed = "true";
      const statuses = str(params, ["statuses"]);
      if (statuses)
        query["statuses[]"] = statuses
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      const assignees = str(params, ["assignees"]);
      if (assignees)
        query["assignees[]"] = assignees
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean);
      if (num(params, ["due_date_gt"])) query.due_date_gt = num(params, ["due_date_gt"]);
      if (num(params, ["due_date_lt"])) query.due_date_lt = num(params, ["due_date_lt"]);

      const data = await clickupFetch({ api, path: `/list/${listId}/task`, query });
      const tasks = (data.tasks || []).map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status?.status,
        priority: t.priority?.priority,
        assignees: t.assignees?.map((a) => a.username),
        due_date: t.due_date,
        date_created: t.date_created,
        url: t.url,
      }));
      return result(tasks, `${tasks.length} task(s) in list ${listId}`);
    },
  };
}

function createGetTaskTool(api) {
  return {
    name: "clickup_get_task",
    description: "Get full details of a single ClickUp task by ID.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["task_id"],
      properties: {
        task_id: { type: "string", description: "Task ID (e.g. abc123)." },
        include_subtasks: { type: "string", description: "Include subtasks (true/false)." },
      },
    },
    async execute(_id, params) {
      const taskId = str(params, ["task_id"]);
      if (!taskId) throw new Error("task_id required");
      const query = {};
      if (bool(params, ["include_subtasks"])) query.include_subtasks = "true";
      const t = await clickupFetch({ api, path: `/task/${taskId}`, query });
      return result(
        {
          id: t.id,
          name: t.name,
          description: t.description,
          status: t.status?.status,
          priority: t.priority?.priority,
          assignees: t.assignees?.map((a) => ({ id: a.id, username: a.username })),
          tags: t.tags?.map((tg) => tg.name),
          due_date: t.due_date,
          start_date: t.start_date,
          time_estimate: t.time_estimate,
          date_created: t.date_created,
          date_updated: t.date_updated,
          creator: t.creator?.username,
          url: t.url,
          parent: t.parent,
          list: { id: t.list?.id, name: t.list?.name },
          folder: { id: t.folder?.id, name: t.folder?.name },
          space: { id: t.space?.id },
          custom_fields: t.custom_fields?.map((cf) => ({ name: cf.name, value: cf.value })),
        },
        `Task: ${t.name} [${t.status?.status}]`,
      );
    },
  };
}

function createCreateTaskTool(api) {
  return {
    name: "clickup_create_task",
    description: "Create a new task in a ClickUp list.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["list_id", "name"],
      properties: {
        list_id: { type: "string", description: "List ID to create task in." },
        name: { type: "string", description: "Task name/title." },
        description: { type: "string", description: "Task description (supports markdown)." },
        status: { type: "string", description: "Status name (must match list statuses)." },
        priority: { type: "number", description: "Priority: 1=urgent, 2=high, 3=normal, 4=low." },
        assignees: { type: "string", description: "Comma-separated user IDs to assign." },
        tags: { type: "string", description: "Comma-separated tag names." },
        due_date: { type: "number", description: "Due date (Unix ms)." },
        due_date_time: { type: "string", description: "Include time in due date (true/false)." },
        start_date: { type: "number", description: "Start date (Unix ms)." },
        time_estimate: { type: "number", description: "Time estimate in milliseconds." },
        parent: { type: "string", description: "Parent task ID (for subtask)." },
        notify_all: { type: "string", description: "Notify assignees (true/false, default true)." },
      },
    },
    async execute(_id, params) {
      const listId = str(params, ["list_id"]);
      if (!listId) throw new Error("list_id required");
      const name = str(params, ["name"]);
      if (!name) throw new Error("name required");

      const body = { name };
      if (str(params, ["description"])) body.description = str(params, ["description"]);
      if (str(params, ["status"])) body.status = str(params, ["status"]);
      const priority = num(params, ["priority"]);
      if (priority) body.priority = priority;
      const assignees = str(params, ["assignees"]);
      if (assignees)
        body.assignees = assignees
          .split(",")
          .map((a) => Number(a.trim()))
          .filter((n) => n);
      const tags = str(params, ["tags"]);
      if (tags)
        body.tags = tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      if (num(params, ["due_date"])) body.due_date = num(params, ["due_date"]);
      if (bool(params, ["due_date_time"]) !== undefined)
        body.due_date_time = bool(params, ["due_date_time"]);
      if (num(params, ["start_date"])) body.start_date = num(params, ["start_date"]);
      if (num(params, ["time_estimate"])) body.time_estimate = num(params, ["time_estimate"]);
      if (str(params, ["parent"])) body.parent = str(params, ["parent"]);
      if (bool(params, ["notify_all"]) !== undefined)
        body.notify_all = bool(params, ["notify_all"]);

      const t = await clickupFetch({ api, method: "POST", path: `/list/${listId}/task`, body });
      return result(
        { id: t.id, name: t.name, status: t.status?.status, url: t.url },
        `Task created: ${t.name} (${t.id})`,
      );
    },
  };
}

function createUpdateTaskTool(api) {
  return {
    name: "clickup_update_task",
    description:
      "Update an existing ClickUp task (name, status, priority, assignees, dates, etc.).",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["task_id"],
      properties: {
        task_id: { type: "string", description: "Task ID to update." },
        name: { type: "string", description: "New task name." },
        description: { type: "string", description: "New description." },
        status: { type: "string", description: "New status." },
        priority: {
          type: "number",
          description: "Priority: 1=urgent, 2=high, 3=normal, 4=low, null=none.",
        },
        assignees_add: { type: "string", description: "Comma-separated user IDs to add." },
        assignees_rem: { type: "string", description: "Comma-separated user IDs to remove." },
        due_date: { type: "number", description: "Due date (Unix ms). Use 0 to clear." },
        start_date: { type: "number", description: "Start date (Unix ms). Use 0 to clear." },
        time_estimate: { type: "number", description: "Time estimate (ms)." },
        archived: { type: "string", description: "Archive task (true/false)." },
        parent: {
          type: "string",
          description: "Parent task ID (move as subtask). Use null to un-nest.",
        },
      },
    },
    async execute(_id, params) {
      const taskId = str(params, ["task_id"]);
      if (!taskId) throw new Error("task_id required");
      const body = {};
      if (str(params, ["name"])) body.name = str(params, ["name"]);
      if (str(params, ["description"]) !== undefined)
        body.description = str(params, ["description"]);
      if (str(params, ["status"])) body.status = str(params, ["status"]);
      const priority = num(params, ["priority"]);
      if (priority !== undefined) body.priority = priority;
      const addIds = str(params, ["assignees_add"]);
      const remIds = str(params, ["assignees_rem"]);
      if (addIds || remIds) {
        body.assignees = {};
        if (addIds)
          body.assignees.add = addIds
            .split(",")
            .map((a) => Number(a.trim()))
            .filter((n) => n);
        if (remIds)
          body.assignees.rem = remIds
            .split(",")
            .map((a) => Number(a.trim()))
            .filter((n) => n);
      }
      const due = num(params, ["due_date"]);
      if (due !== undefined) body.due_date = due === 0 ? null : due;
      const start = num(params, ["start_date"]);
      if (start !== undefined) body.start_date = start === 0 ? null : start;
      if (num(params, ["time_estimate"]) !== undefined)
        body.time_estimate = num(params, ["time_estimate"]);
      if (bool(params, ["archived"]) !== undefined) body.archived = bool(params, ["archived"]);
      if (str(params, ["parent"]) !== undefined)
        body.parent = str(params, ["parent"]) === "null" ? null : str(params, ["parent"]);

      if (Object.keys(body).length === 0)
        throw new Error("Nothing to update - provide at least one field");
      const t = await clickupFetch({ api, method: "PUT", path: `/task/${taskId}`, body });
      return result(
        { id: t.id, name: t.name, status: t.status?.status, url: t.url },
        `Task updated: ${t.name}`,
      );
    },
  };
}

function createDeleteTaskTool(api) {
  return {
    name: "clickup_delete_task",
    description: "Delete a ClickUp task permanently. Use with caution.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["task_id"],
      properties: {
        task_id: { type: "string", description: "Task ID to delete." },
      },
    },
    async execute(_id, params) {
      const taskId = str(params, ["task_id"]);
      if (!taskId) throw new Error("task_id required");
      await clickupFetch({ api, method: "DELETE", path: `/task/${taskId}` });
      return result({ deleted: taskId }, `Task ${taskId} deleted`);
    },
  };
}

function createCommentsTool(api) {
  return {
    name: "clickup_task_comments",
    description: "Get comments on a ClickUp task.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["task_id"],
      properties: {
        task_id: { type: "string", description: "Task ID." },
        start: { type: "number", description: "Start timestamp (Unix ms) for pagination." },
        start_id: { type: "string", description: "Comment ID to start after." },
      },
    },
    async execute(_id, params) {
      const taskId = str(params, ["task_id"]);
      if (!taskId) throw new Error("task_id required");
      const query = {};
      if (num(params, ["start"])) query.start = num(params, ["start"]);
      if (str(params, ["start_id"])) query.start_id = str(params, ["start_id"]);
      const data = await clickupFetch({ api, path: `/task/${taskId}/comment`, query });
      const comments = (data.comments || []).map((c) => ({
        id: c.id,
        comment_text: c.comment_text,
        user: c.user?.username,
        date: c.date,
      }));
      return result(comments, `${comments.length} comment(s)`);
    },
  };
}

function createAddCommentTool(api) {
  return {
    name: "clickup_add_comment",
    description: "Add a comment to a ClickUp task.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["task_id", "comment_text"],
      properties: {
        task_id: { type: "string", description: "Task ID." },
        comment_text: { type: "string", description: "Comment text." },
        notify_all: {
          type: "string",
          description: "Notify all assignees (true/false, default false).",
        },
        assignee: { type: "number", description: "User ID to assign the comment to." },
      },
    },
    async execute(_id, params) {
      const taskId = str(params, ["task_id"]);
      if (!taskId) throw new Error("task_id required");
      const text = str(params, ["comment_text"]);
      if (!text) throw new Error("comment_text required");
      const body = { comment_text: text };
      if (bool(params, ["notify_all"]) !== undefined)
        body.notify_all = bool(params, ["notify_all"]);
      if (num(params, ["assignee"])) body.assignee = num(params, ["assignee"]);
      const data = await clickupFetch({
        api,
        method: "POST",
        path: `/task/${taskId}/comment`,
        body,
      });
      return result(data, "Comment added");
    },
  };
}

function createSearchTasksTool(api) {
  return {
    name: "clickup_search_tasks",
    description: "Search tasks across a team/workspace by name or custom fields.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        team_id: { type: "string", description: "Team ID (uses default if omitted)." },
        name: { type: "string", description: "Search by task name." },
        statuses: { type: "string", description: "Comma-separated statuses." },
        assignees: { type: "string", description: "Comma-separated user IDs." },
        list_ids: { type: "string", description: "Comma-separated list IDs." },
        space_ids: { type: "string", description: "Comma-separated space IDs." },
        folder_ids: { type: "string", description: "Comma-separated folder IDs." },
        project_ids: { type: "string", description: "Comma-separated project IDs." },
        include_closed: { type: "string", description: "Include closed (true/false)." },
        page: { type: "number", description: "Page number (0-indexed)." },
        order_by: { type: "string", description: "Order by: created, updated, due_date." },
      },
    },
    async execute(_id, params) {
      const cfg = resolveConfig(api);
      const teamId = str(params, ["team_id"]) || cfg.defaultTeamId;
      if (!teamId) throw new Error("team_id required (or set defaultTeamId in plugin config)");

      const query = {};
      if (str(params, ["name"])) query.name = str(params, ["name"]);
      if (bool(params, ["include_closed"])) query.include_closed = "true";
      const page = num(params, ["page"]);
      if (page !== undefined) query.page = page;
      if (str(params, ["order_by"])) query.order_by = str(params, ["order_by"]);
      // Array params
      const arrayFields = [
        ["statuses[]", "statuses"],
        ["assignees[]", "assignees"],
        ["list_ids[]", "list_ids"],
        ["space_ids[]", "space_ids"],
        ["folder_ids[]", "folder_ids"],
        ["project_ids[]", "project_ids"],
      ];
      for (const [key, pKey] of arrayFields) {
        const val = str(params, [pKey]);
        if (!val) continue;
        const parsed = val
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
        if (parsed.length) query[key] = parsed;
      }

      const data = await clickupFetch({ api, path: `/team/${teamId}/task`, query });
      const tasks = (data.tasks || []).map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status?.status,
        priority: t.priority?.priority,
        list: t.list?.name,
        url: t.url,
      }));
      return result(tasks, `${tasks.length} task(s) found`);
    },
  };
}

function createMembersTool(api) {
  return {
    name: "clickup_members",
    description:
      "List members of a ClickUp workspace/team. Useful to get user IDs for assignments.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        team_id: { type: "string", description: "Team ID (uses default if omitted)." },
      },
    },
    async execute(_id, params) {
      const cfg = resolveConfig(api);
      const teamId = str(params, ["team_id"]) || cfg.defaultTeamId;
      if (!teamId) throw new Error("team_id required");
      const data = await clickupFetch({ api, path: "/team" });
      const team = (data.teams || []).find((t) => t.id === teamId || String(t.id) === teamId);
      if (!team) throw new Error(`Team ${teamId} not found`);
      const members = (team.members || []).map((m) => ({
        id: m.user?.id,
        username: m.user?.username,
        email: m.user?.email,
        role: m.user?.role,
      }));
      return result(members, `${members.length} member(s) in ${team.name}`);
    },
  };
}

// ── Register ─────────────────────────────────────────────────────

export default function register(api) {
  const tools = [
    createTeamsTool,
    createSpacesTool,
    createFoldersTool,
    createListsTool,
    createTasksTool,
    createGetTaskTool,
    createCreateTaskTool,
    createUpdateTaskTool,
    createDeleteTaskTool,
    createCommentsTool,
    createAddCommentTool,
    createSearchTasksTool,
    createMembersTool,
  ];

  for (const factory of tools) {
    api.registerTool(
      (ctx) => {
        if (ctx?.sandboxed) return null;
        return factory(api);
      },
      { optional: true },
    );
  }

  console.log(`[clickup] Registered ${tools.length} ClickUp tools`);
}
