"use client";

import { useState } from "react";

interface ProjectDirectionFormProps {
  defaultTitle?: string;
  canWrite: boolean;
}

export function ProjectDirectionForm({ defaultTitle = "プロジェクト方針", canWrite }: ProjectDirectionFormProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [status, setStatus] = useState("進行中");
  const [summary, setSummary] = useState("");
  const [relatedNumbers, setRelatedNumbers] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [submitStatus, setSubmitStatus] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function clearFeedback() {
    setSubmitStatus("");
    setError("");
  }

  async function submitDirection() {
    if (isSubmitting || !canWrite) return;

    const payload = {
      title: title.trim(),
      status: status.trim(),
      summary: summary.trim(),
      relatedNumbers: relatedNumbers.trim(),
      nextAction: nextAction.trim(),
    };

    if (!payload.summary) {
      setSubmitStatus("");
      setError("方針内容を入力してください。");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSubmitStatus("保存中です...");

    try {
      const response = await fetch("/api/project-direction", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !result.ok) {
        throw new Error(result.message || "プロジェクト方針の保存に失敗しました。");
      }

      setSubmitStatus("保存しました。ページを再読み込みします...");
      setSummary("");
      setRelatedNumbers("");
      setNextAction("");
      setTimeout(() => {
        window.location.reload();
      }, 700);
    } catch (submitError) {
      setSubmitStatus("");
      setError(
        submitError instanceof Error ? submitError.message : "プロジェクト方針の保存に失敗しました。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submitDirection();
      }}
      className="grid gap-3 rounded-[24px] border border-stone-900/10 bg-white px-4 py-4"
    >
      <p className="text-sm font-semibold text-stone-900">プロジェクト方針をここで更新</p>
      <p className="text-xs leading-6 text-stone-500">
        この画面から方針を保存し、下の履歴で振り返れます（NotionメモDBへ保存）。
      </p>
      {!canWrite ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          このアカウントは書き込み権限がないため保存できません。`editor` / `admin` / `owner` でログインしてください。
        </div>
      ) : null}

      <label className="grid gap-2 text-sm text-stone-700">
        タイトル
        <input
          type="text"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            clearFeedback();
          }}
          disabled={isSubmitting || !canWrite}
          className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-3 outline-none"
        />
      </label>

      <label className="grid gap-2 text-sm text-stone-700">
        ステータス
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            clearFeedback();
          }}
          disabled={isSubmitting || !canWrite}
          className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-3 outline-none"
        >
          <option value="進行中">進行中</option>
          <option value="検討中">検討中</option>
          <option value="完了">完了</option>
        </select>
      </label>

      <label className="grid gap-2 text-sm text-stone-700">
        どう進めるか（方針）
        <textarea
          rows={4}
          value={summary}
          onChange={(event) => {
            setSummary(event.target.value);
            clearFeedback();
          }}
          disabled={isSubmitting || !canWrite}
          placeholder="例: 客単価を上げるために、平日限定セットをテスト導入する。"
          className="rounded-[20px] border border-stone-900/10 bg-stone-50 px-4 py-3 leading-7 outline-none"
        />
      </label>

      <label className="grid gap-2 text-sm text-stone-700">
        目標/KPIメモ
        <textarea
          rows={3}
          value={relatedNumbers}
          onChange={(event) => {
            setRelatedNumbers(event.target.value);
            clearFeedback();
          }}
          disabled={isSubmitting || !canWrite}
          placeholder="例: 客単価 +5%、粗利率 +2pt"
          className="rounded-[20px] border border-stone-900/10 bg-stone-50 px-4 py-3 leading-7 outline-none"
        />
      </label>

      <label className="grid gap-2 text-sm text-stone-700">
        次の具体アクション
        <textarea
          rows={3}
          value={nextAction}
          onChange={(event) => {
            setNextAction(event.target.value);
            clearFeedback();
          }}
          disabled={isSubmitting || !canWrite}
          placeholder="例: 来週月曜までにセット内容を確定してPOP作成"
          className="rounded-[20px] border border-stone-900/10 bg-stone-50 px-4 py-3 leading-7 outline-none"
        />
      </label>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {submitStatus ? (
        <div className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-4 text-sm text-stone-700">
          {submitStatus}
        </div>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={isSubmitting || !canWrite}
          className="inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "保存中..." : "プロジェクト方針を保存"}
        </button>
      </div>
    </form>
  );
}
