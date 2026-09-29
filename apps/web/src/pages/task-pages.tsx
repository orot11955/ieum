import type { ReactNode } from "react";
import {
  Link,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  Cluster,
  Empty,
  Notice,
  Page,
  Select,
  Status,
} from "@ieum/ui";
import type { ShellContext } from "../app/shell";
import { useAllContexts } from "../entities/contexts/api";
import {
  createTask,
  editTask,
  invalidateTasks,
  stateLabel,
  stateTone,
  useTask,
  useTaskList,
  type TaskDetail,
  type TaskDue,
  type TaskState,
  type TaskSummary,
} from "../entities/tasks/api";
import { ApiError } from "../shared/api/http";
import {
  formatDateOnly,
  formatInstant,
  instantToLocalInput,
} from "../shared/time";
import { formatDateTime } from "../shared/format";
import { TaskForm, type TaskFormValues } from "../features/tasks/task-form";
import {
  ResultForm,
  TransitionButtons,
  useTransition,
} from "../features/tasks/task-actions";
import { ForbiddenPage, NotFoundPage } from "./app-pages";

const STATES: TaskState[] = [
  "TODO",
  "IN_PROGRESS",
  "ON_HOLD",
  "DONE",
  "CANCELED",
];

export function dueLabel(due: TaskDue): string {
  if (due.kind === "NONE") return "기한 없음";
  if (due.kind === "DATE") return formatDateOnly(due.date);
  return `${formatInstant(due.at, due.timeZone)} (${due.timeZone})`;
}

function TaskRow({
  task,
  userId,
  workspaceId,
}: {
  task: TaskSummary;
  userId: string;
  workspaceId: string;
}) {
  const { run, busy, failure } = useTransition(userId, workspaceId);
  const open = task.state !== "DONE" && task.state !== "CANCELED";
  return (
    <li className="ieum-list-item">
      <div>
        <Link to={`/tasks/${task.id}`} className="ieum-break">
          {task.title}
        </Link>
        <p className="ieum-help">{dueLabel(task.due)}</p>
        {failure && <Notice tone="warning">{failure}</Notice>}
      </div>
      <Cluster>
        <Status tone={stateTone[task.state]}>{stateLabel[task.state]}</Status>
        {open && (
          <Button
            busy={busy === `${task.id}:DONE`}
            aria-label={`${task.title} 완료`}
            onClick={() => void run(task, "DONE")}
          >
            완료
          </Button>
        )}
      </Cluster>
    </li>
  );
}

export function TaskListPage() {
  const { me } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const raw = params.get("state") ?? "";
  const state = (STATES as string[]).includes(raw) ? (raw as TaskState) : "";
  const list = useTaskList(me.user.id, me.workspace.id, state);
  const tasks = list.data?.pages.flatMap((page) => page.tasks) ?? [];
  return (
    <Page
      eyebrow="할일"
      title="할일"
      actions={
        <Button intent="primary" onClick={() => navigate("/tasks/new")}>
          새 할일
        </Button>
      }
    >
      <Select
        label="상태"
        value={state}
        onChange={(event) =>
          setParams(event.target.value ? { state: event.target.value } : {}, {
            replace: true,
          })
        }
      >
        <option value="">모든 상태</option>
        {STATES.map((value) => (
          <option key={value} value={value}>
            {stateLabel[value]}
          </option>
        ))}
      </Select>
      {list.isPending ? (
        <p role="status">할일을 불러오는 중…</p>
      ) : list.isError ? (
        <Notice tone="danger">
          할일을 불러오지 못했습니다.{" "}
          <Button intent="ghost" onClick={() => void list.refetch()}>
            다시 시도
          </Button>
        </Notice>
      ) : tasks.length === 0 ? (
        <Empty>
          {state ? "이 상태의 할일이 없습니다." : "아직 할일이 없습니다."}
        </Empty>
      ) : (
        <ul className="ieum-list" aria-label="할일 목록">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              userId={me.user.id}
              workspaceId={me.workspace.id}
            />
          ))}
        </ul>
      )}
      {list.hasNextPage && (
        <Button
          busy={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          더 보기
        </Button>
      )}
    </Page>
  );
}

function emptyForm(zone: string): TaskFormValues {
  return {
    title: "",
    description: "",
    dueKind: "NONE",
    dueDate: "",
    dueLocal: "",
    dueOffset: "",
    dueZone: zone,
    contextId: "",
  };
}

function formFromTask(task: TaskDetail, zone: string): TaskFormValues {
  const base = {
    ...emptyForm(zone),
    title: task.title,
    description: task.description,
    contextId: task.contextId ?? "",
  };
  if (task.due.kind === "DATE")
    return { ...base, dueKind: "DATE", dueDate: task.due.date };
  if (task.due.kind === "INSTANT")
    return {
      ...base,
      dueKind: "INSTANT",
      dueZone: task.due.timeZone,
      dueLocal: instantToLocalInput(task.due.at, task.due.timeZone),
    };
  return base;
}

export function NewTaskPage() {
  const { me } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const contexts = useAllContexts(me.user.id, me.workspace.id);
  let createdId = "";
  return (
    <Page eyebrow="할일" title="새 할일">
      <Card>
        {contexts.isPending ? (
          <p role="status">불러오는 중…</p>
        ) : (
          <TaskForm
            initial={emptyForm(me.preferences.timeZone)}
            contexts={contexts.data?.contexts ?? []}
            submitLabel="할일 만들기"
            save={async (fields, key) => {
              createdId = (await createTask(me.workspace.id, fields, key)).id;
              await invalidateTasks(queryClient, me.user.id);
            }}
            onSaved={() => navigate(`/tasks/${createdId}`, { replace: true })}
            onCancel={() => navigate("/tasks")}
          />
        )}
      </Card>
    </Page>
  );
}

function TaskLoader({
  children,
}: {
  children: (
    task: TaskDetail,
    refetch: () => Promise<TaskDetail | undefined>,
  ) => ReactNode;
}) {
  const { me } = useOutletContext<ShellContext>();
  const { id = "" } = useParams();
  const query = useTask(me.user.id, me.workspace.id, id);
  if (query.isPending) return <p role="status">할일을 불러오는 중…</p>;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404)
      return <NotFoundPage />;
    if (query.error instanceof ApiError && query.error.status === 403)
      return <ForbiddenPage />;
    return (
      <Notice tone="danger">
        할일을 불러오지 못했습니다.{" "}
        <Button intent="ghost" onClick={() => void query.refetch()}>
          다시 시도
        </Button>
      </Notice>
    );
  }
  return <>{children(query.data, async () => (await query.refetch()).data)}</>;
}

export function TaskDetailPage() {
  const { me } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const contexts = useAllContexts(me.user.id, me.workspace.id);
  return (
    <TaskLoader>
      {(task) => {
        const contextName = contexts.data?.contexts.find(
          (context) => context.id === task.contextId,
        )?.name;
        const zone = me.preferences.timeZone;
        const thisCompletion = task.results.filter(
          (result) => result.completionVersion === task.completionVersion,
        );
        return (
          <Page
            eyebrow="할일"
            title={task.title}
            actions={
              <Button onClick={() => navigate(`/tasks/${task.id}/edit`)}>
                수정
              </Button>
            }
          >
            <Cluster>
              <Status tone={stateTone[task.state]}>
                {stateLabel[task.state]}
              </Status>
              <span className="ieum-help" data-testid="task-due">
                {dueLabel(task.due)}
              </span>
              {task.completedAt && (
                <span className="ieum-help">
                  완료 {formatDateTime(task.completedAt, zone)}
                </span>
              )}
            </Cluster>
            <TransitionButtons
              userId={me.user.id}
              workspaceId={me.workspace.id}
              task={task}
            />
            {task.description && (
              <Card title="설명">
                <p className="ieum-break">{task.description}</p>
              </Card>
            )}
            {task.contextId && (
              <p>
                맥락:{" "}
                <Link to={`/contexts/${task.contextId}`}>
                  {contextName ?? "맥락"}
                </Link>
              </p>
            )}
            {task.state === "DONE" && (
              <Card title="결과 기록">
                {thisCompletion.length > 0 ? (
                  <ul className="ieum-list" aria-label="이번 완료의 결과">
                    {thisCompletion.map((result) => (
                      <li key={result.id} className="ieum-list-item">
                        <Link to={`/captures/${result.captureId}`}>
                          결과 기록 열기
                        </Link>
                        <span className="ieum-help">
                          {formatDateTime(result.recordedAt, zone)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ResultForm
                    userId={me.user.id}
                    workspaceId={me.workspace.id}
                    task={task}
                  />
                )}
              </Card>
            )}
            {task.results.length > thisCompletion.length && (
              <Card title="이전 완료의 결과">
                <ul className="ieum-list" aria-label="이전 완료의 결과">
                  {task.results
                    .filter(
                      (result) =>
                        result.completionVersion !== task.completionVersion,
                    )
                    .map((result) => (
                      <li key={result.id} className="ieum-list-item">
                        <Link to={`/captures/${result.captureId}`}>
                          결과 기록 열기
                        </Link>
                      </li>
                    ))}
                </ul>
              </Card>
            )}
            <Card title="상태 이력">
              <ul className="ieum-list" aria-label="상태 이력">
                {task.history.map((entry) => (
                  <li key={entry.version} className="ieum-list-item">
                    <span>
                      {stateLabel[entry.fromState]} →{" "}
                      {stateLabel[entry.toState]}
                    </span>
                    <span className="ieum-help">
                      {formatDateTime(entry.recordedAt, zone)}
                    </span>
                  </li>
                ))}
                {task.history.length === 0 && (
                  <li className="ieum-help">아직 상태 변경이 없습니다.</li>
                )}
              </ul>
            </Card>
          </Page>
        );
      }}
    </TaskLoader>
  );
}

export function TaskEditPage() {
  const { me } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const contexts = useAllContexts(me.user.id, me.workspace.id);
  return (
    <TaskLoader>
      {(task, refetch) => (
        <Page eyebrow="할일" title="할일 수정">
          <Card>
            {contexts.isPending ? (
              <p role="status">불러오는 중…</p>
            ) : (
              <TaskForm
                initial={formFromTask(task, me.preferences.timeZone)}
                contexts={contexts.data?.contexts ?? []}
                submitLabel="저장"
                requireChange
                refetchLatest={refetch}
                save={async (fields, key) => {
                  await editTask(
                    me.workspace.id,
                    task.id,
                    { baseVersion: task.version, ...fields },
                    key,
                  );
                  await invalidateTasks(queryClient, me.user.id);
                }}
                onSaved={() => navigate(`/tasks/${task.id}`, { replace: true })}
                onCancel={() => navigate(`/tasks/${task.id}`)}
              />
            )}
          </Card>
        </Page>
      )}
    </TaskLoader>
  );
}
